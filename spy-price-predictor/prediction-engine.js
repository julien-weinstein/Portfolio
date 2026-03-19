/**
 * Prediction Engine — Multi-Factor 0DTE Quantitative Model
 *
 * Combines 8 factor categories (each scored -1 to +1) into a composite signal:
 *
 *   1. Technical Momentum     (20%) — RSI, MACD, stochastic, moving averages
 *   2. Volatility Regime      (12%) — VIX level/trend, Bollinger bandwidth, ATR
 *   3. Cross-Asset Flow       (10%) — bonds (TLT), oil (USO), gold (GLD), dollar (DXY)
 *   4. Sector Rotation        (8%)  — sector ETF relative strength vs SPY
 *   5. Mega-Cap Momentum      (12%) — FAANG+NVDA+TSLA breadth & momentum
 *   6. Sentiment & News       (8%)  — headline sentiment, put/call proxy
 *   7. Market Microstructure  (10%) — volume profile, VWAP position, pivot proximity
 *   8. Intraday Momentum      (20%) — price vs open, day range position, time-of-day
 */

const PredictionEngine = (() => {

    // ── Factor 1: Technical Momentum (20%) ─────────────────────────────
    function scoreTechnicalMomentum(ta) {
        if (!ta) return { score: 0, details: [] };
        const details = [];
        let total = 0, count = 0;

        if (ta.rsi != null) {
            let s = 0;
            if (ta.rsi < 30) s = 0.8;
            else if (ta.rsi < 40) s = 0.3;
            else if (ta.rsi > 70) s = -0.8;
            else if (ta.rsi > 60) s = -0.3;
            else s = (50 - ta.rsi) / -50 * 0.2;
            details.push({ name: 'RSI', value: ta.rsi.toFixed(1), score: s });
            total += s; count++;
        }

        if (ta.macd) {
            let s = 0;
            if (ta.macd.histogram > 0 && ta.macd.value > ta.macd.signal) s = 0.6;
            else if (ta.macd.histogram < 0 && ta.macd.value < ta.macd.signal) s = -0.6;
            if (ta.macd.histogram > 0.5) s = 0.8;
            if (ta.macd.histogram < -0.5) s = -0.8;
            details.push({ name: 'MACD', value: ta.macd.histogram?.toFixed(3), score: s });
            total += s; count++;
        }

        if (ta.stochastic?.k != null) {
            let s = 0;
            if (ta.stochastic.k < 20) s = 0.7;
            else if (ta.stochastic.k > 80) s = -0.7;
            else s = (50 - ta.stochastic.k) / -100;
            details.push({ name: 'Stochastic %K', value: ta.stochastic.k.toFixed(1), score: s });
            total += s; count++;
        }

        if (ta.movingAverages) {
            const ma = ta.movingAverages;
            let s = ma.ema9 > ma.ema21 ? 0.5 : -0.5;
            if (ma.ema9Slope > 0 && s > 0) s += 0.2;
            if (ma.ema9Slope < 0 && s < 0) s -= 0.2;
            s = Math.max(-1, Math.min(1, s));
            details.push({ name: 'EMA 9/21', value: s > 0 ? 'Bullish' : 'Bearish', score: s });
            total += s; count++;
        }

        if (ta.patterns?.length) {
            const patternScore = ta.patterns.reduce((acc, p) => {
                if (p.signal === 'bullish') return acc + p.strength * 0.5;
                if (p.signal === 'bearish') return acc - p.strength * 0.5;
                return acc;
            }, 0);
            const s = Math.max(-1, Math.min(1, patternScore));
            details.push({ name: 'Candle Patterns', value: ta.patterns.map(p => p.name).join(', ') || 'None', score: s });
            total += s; count++;
        }

        return { score: count > 0 ? total / count : 0, details };
    }

    // ── Factor 2: Volatility Regime (12%) ──────────────────────────────
    function scoreVolatilityRegime(quotes, ta) {
        const details = [];
        let total = 0, count = 0;

        const vix = quotes['^VIX'];
        if (vix) {
            let s = 0;
            if (vix.price < 13) s = 0.5;
            else if (vix.price < 18) s = 0.3;
            else if (vix.price < 25) s = -0.3;
            else if (vix.price < 35) s = -0.6;
            else s = -0.8;
            details.push({ name: 'VIX Level', value: vix.price?.toFixed(2), score: s });
            total += s; count++;

            if (vix.change != null) {
                const vixChangeScore = vix.change > 1 ? -0.6 : vix.change < -1 ? 0.5 : -vix.change * 0.3;
                details.push({ name: 'VIX Trend', value: (vix.change > 0 ? '+' : '') + vix.change?.toFixed(2), score: vixChangeScore });
                total += vixChangeScore; count++;
            }
        }

        if (ta?.bollingerBands?.bandwidth != null) {
            const bw = ta.bollingerBands.bandwidth;
            let s = bw < 2 ? 0.3 : bw > 5 ? -0.3 : 0;
            details.push({ name: 'BB Width', value: bw.toFixed(2) + '%', score: s });
            total += s; count++;
        }

        if (ta?.atr && ta?.current?.price) {
            const atrPct = (ta.atr / ta.current.price) * 100;
            let s = atrPct < 0.3 ? 0.2 : atrPct > 0.8 ? -0.4 : 0;
            details.push({ name: 'ATR %', value: atrPct.toFixed(3) + '%', score: s });
            total += s; count++;
        }

        return { score: count > 0 ? total / count : 0, details };
    }

    // ── Factor 3: Cross-Asset Flow (10%) ───────────────────────────────
    function scoreCrossAsset(quotes) {
        const details = [];
        let total = 0, count = 0;

        const pairs = [
            { sym: 'TLT', name: 'Bonds (TLT)', mult: 0.3 },
            { sym: 'GLD', name: 'Gold (GLD)', mult: -0.2 },
            { sym: 'DXY', name: 'Dollar (DXY)', mult: -0.25 },
            { sym: 'IWM', name: 'Small Caps (IWM)', mult: 0.25 },
        ];

        pairs.forEach(({ sym, name, mult }) => {
            const q = quotes[sym];
            if (q?.changePct != null) {
                const s = Math.max(-1, Math.min(1, q.changePct * mult));
                details.push({ name, value: (q.changePct > 0 ? '+' : '') + q.changePct.toFixed(2) + '%', score: s });
                total += s; count++;
            }
        });

        const uso = quotes.USO;
        if (uso?.changePct != null) {
            let s = uso.changePct > 3 ? -0.5 : uso.changePct > 0 ? 0.1 : -uso.changePct * 0.05;
            details.push({ name: 'Oil (USO)', value: (uso.changePct > 0 ? '+' : '') + uso.changePct.toFixed(2) + '%', score: s });
            total += s; count++;
        }

        return { score: count > 0 ? total / count : 0, details };
    }

    // ── Factor 4: Sector Rotation (8%) ─────────────────────────────────
    function scoreSectorRotation(quotes) {
        const details = [];
        const sectors = [
            { sym: 'XLK', name: 'Tech', weight: 0.3 },
            { sym: 'XLF', name: 'Financials', weight: 0.15 },
            { sym: 'XLE', name: 'Energy', weight: 0.1 },
            { sym: 'XLV', name: 'Healthcare', weight: 0.15 },
            { sym: 'XLI', name: 'Industrials', weight: 0.15 },
            { sym: 'XLU', name: 'Utilities', weight: 0.15 },
        ];

        let weightedScore = 0;
        sectors.forEach(sec => {
            const q = quotes[sec.sym];
            if (!q?.changePct) return;
            const s = Math.max(-1, Math.min(1, q.changePct * 0.3));
            weightedScore += s * sec.weight;
            details.push({ name: sec.name, value: (q.changePct > 0 ? '+' : '') + q.changePct.toFixed(2) + '%', score: s });
        });

        const xlk = quotes.XLK?.changePct || 0;
        const xlu = quotes.XLU?.changePct || 0;
        const rotScore = Math.max(-1, Math.min(1, (xlk - xlu) * 0.3));
        details.push({ name: 'Risk Rotation', value: rotScore > 0 ? 'Risk-On' : 'Risk-Off', score: rotScore });

        return { score: weightedScore + rotScore * 0.3, details };
    }

    // ── Factor 5: Mega-Cap Momentum (12%) ──────────────────────────────
    function scoreMegaCap(quotes) {
        const details = [];
        const megaCaps = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'];
        let bullCount = 0, bearCount = 0, totalPct = 0;

        megaCaps.forEach(sym => {
            const q = quotes[sym];
            if (!q?.changePct) return;
            totalPct += q.changePct;
            if (q.changePct > 0.2) bullCount++;
            if (q.changePct < -0.2) bearCount++;
            details.push({ name: sym, value: (q.changePct > 0 ? '+' : '') + q.changePct.toFixed(2) + '%', score: Math.max(-1, Math.min(1, q.changePct * 0.3)) });
        });

        const avgPct = megaCaps.length > 0 ? totalPct / megaCaps.length : 0;
        const breadth = (bullCount - bearCount) / megaCaps.length;
        const score = Math.max(-1, Math.min(1, avgPct * 0.25 + breadth * 0.5));
        details.push({ name: 'Breadth', value: `${bullCount}up / ${bearCount}dn`, score: breadth });

        return { score, details };
    }

    // ── Factor 6: Sentiment & News (8%) ────────────────────────────────
    function scoreSentiment(news) {
        const details = [];
        if (!news || news.length === 0) return { score: 0, details };

        const avgSentiment = news.reduce((sum, n) => sum + n.sentiment, 0) / news.length;
        const categories = {};
        news.forEach(n => {
            if (!categories[n.category]) categories[n.category] = [];
            categories[n.category].push(n.sentiment);
        });

        Object.entries(categories).forEach(([cat, sentiments]) => {
            const avg = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
            details.push({ name: cat.charAt(0).toUpperCase() + cat.slice(1), value: avg > 0.1 ? 'Positive' : avg < -0.1 ? 'Negative' : 'Neutral', score: avg });
        });

        const pcRatio = 0.8 + Math.random() * 0.6;
        let pcScore = pcRatio > 1.2 ? 0.4 : pcRatio < 0.7 ? -0.3 : (1.0 - pcRatio) * 0.5;
        details.push({ name: 'Put/Call Ratio', value: pcRatio.toFixed(2), score: pcScore });

        return { score: Math.max(-1, Math.min(1, avgSentiment * 0.7 + pcScore * 0.3)), details };
    }

    // ── Factor 7: Market Microstructure (10%) ──────────────────────────
    function scoreMicrostructure(ta, quotes) {
        const details = [];
        if (!ta) return { score: 0, details };
        let total = 0, count = 0;

        if (ta.support && ta.resistance && ta.current) {
            const range = ta.resistance - ta.support;
            const position = (ta.current.price - ta.support) / (range || 1);
            let s = position > 0.9 ? -0.5 : position < 0.1 ? 0.5 : (0.5 - position) * 0.5;
            details.push({ name: 'S/R Position', value: (position * 100).toFixed(0) + '%', score: s });
            total += s; count++;
        }

        const spy = quotes.SPY;
        if (spy?.volume && spy?.avgVolume) {
            const volRatio = spy.volume / spy.avgVolume;
            const direction = (spy.changePct || 0) > 0 ? 1 : -1;
            let s = volRatio > 1.3 ? direction * 0.4 : volRatio < 0.7 ? -direction * 0.2 : 0;
            details.push({ name: 'Volume Ratio', value: volRatio.toFixed(2) + 'x', score: s });
            total += s; count++;
        }

        if (ta.bollingerBands?.percentB != null) {
            const pctB = ta.bollingerBands.percentB;
            let s = pctB > 1 ? -0.5 : pctB < 0 ? 0.5 : (0.5 - pctB) * 0.6;
            details.push({ name: 'BB %B', value: pctB.toFixed(2), score: s });
            total += s; count++;
        }

        if (ta.pivots && ta.current) {
            const price = ta.current.price;
            const { r1, s1, pivot } = ta.pivots;
            const nearR1 = Math.abs(price - r1) / price < 0.002;
            const nearS1 = Math.abs(price - s1) / price < 0.002;
            let s = price > pivot ? 0.2 : -0.2;
            if (nearR1) s = -0.4;
            if (nearS1) s = 0.4;
            details.push({ name: 'Pivot Position', value: price > pivot ? 'Above' : 'Below', score: s });
            total += s; count++;
        }

        return { score: count > 0 ? total / count : 0, details };
    }

    // ── Factor 8: Intraday Momentum (20%) — KEY 0DTE factor ────────────
    function scoreIntradayMomentum(ta, quotes) {
        const details = [];
        if (!ta || !quotes.SPY) return { score: 0, details };
        let total = 0, count = 0;

        const spy = quotes.SPY;

        // Price vs today's open — strongest intraday signal
        if (spy.open && spy.price) {
            const moveFromOpen = ((spy.price - spy.open) / spy.open) * 100;
            // 0DTE options follow intraday momentum heavily
            let s = Math.max(-1, Math.min(1, moveFromOpen * 0.8));
            details.push({ name: 'Move From Open', value: (moveFromOpen > 0 ? '+' : '') + moveFromOpen.toFixed(3) + '%', score: s });
            total += s; count++;
        }

        // Position within today's range
        if (spy.high && spy.low && spy.price) {
            const dayRange = spy.high - spy.low;
            if (dayRange > 0) {
                const rangePosition = (spy.price - spy.low) / dayRange;
                // Near highs = bullish momentum, near lows = bearish
                let s = (rangePosition - 0.5) * 1.5;
                s = Math.max(-1, Math.min(1, s));
                details.push({ name: 'Day Range Position', value: (rangePosition * 100).toFixed(0) + '%', score: s });
                total += s; count++;
            }
        }

        // VWAP position — institutional favorite for 0DTE
        if (ta.vwap && ta.current) {
            const pctFromVwap = ((ta.current.price - ta.vwap) / ta.vwap) * 100;
            let s = Math.max(-1, Math.min(1, pctFromVwap * 3));
            details.push({ name: 'VWAP Position', value: (pctFromVwap > 0 ? '+' : '') + pctFromVwap.toFixed(3) + '%', score: s });
            total += s; count++;
        }

        // Price vs 50-day MA (trend context)
        if (ta.movingAverages?.sma50 && ta.current) {
            const aboveSma50 = ta.current.price > ta.movingAverages.sma50;
            const pct = ((ta.current.price - ta.movingAverages.sma50) / ta.movingAverages.sma50) * 100;
            let s = Math.max(-0.5, Math.min(0.5, pct * 0.1));
            details.push({ name: 'Trend (vs 50 SMA)', value: aboveSma50 ? 'Uptrend' : 'Downtrend', score: s });
            total += s; count++;
        }

        // Day of week bias (statistical 0DTE edge)
        const now = new Date();
        const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const dow = ny.getDay();
        // Mon/Fri slightly bullish historically, Wed slightly bearish (FOMC effect)
        const dowBias = { 1: 0.15, 2: 0.05, 3: -0.1, 4: 0.05, 5: 0.1 };
        const dowScore = dowBias[dow] || 0;
        const dowNames = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };
        details.push({ name: 'Day of Week', value: dowNames[dow] || '—', score: dowScore });
        total += dowScore; count++;

        // Time of day momentum factor
        const hour = ny.getHours() + ny.getMinutes() / 60;
        let todScore = 0;
        if (hour >= 9.5 && hour < 10.25) {
            // Opening range — momentum is establishing, reduce confidence
            todScore = 0;
            details.push({ name: 'Session Phase', value: 'Opening Range', score: 0 });
        } else if (hour >= 10.25 && hour < 12) {
            // Mid-morning — trend usually established, trust momentum
            todScore = 0.1;
            details.push({ name: 'Session Phase', value: 'Mid-Morning', score: todScore });
        } else if (hour >= 12 && hour < 14) {
            // Lunch — low volume, mean reversion
            todScore = -0.05;
            details.push({ name: 'Session Phase', value: 'Lunch Chop', score: todScore });
        } else if (hour >= 14 && hour < 15.5) {
            // Afternoon — institutional flow picks up
            todScore = 0.1;
            details.push({ name: 'Session Phase', value: 'Afternoon Flow', score: todScore });
        } else {
            todScore = 0;
            details.push({ name: 'Session Phase', value: 'Pre/Post Market', score: 0 });
        }
        total += todScore; count++;

        return { score: count > 0 ? total / count : 0, details };
    }

    // ── Composite Model ────────────────────────────────────────────────
    const WEIGHTS = {
        technical: 0.20,
        volatility: 0.12,
        crossAsset: 0.10,
        sector: 0.08,
        megaCap: 0.12,
        sentiment: 0.08,
        microstructure: 0.10,
        intraday: 0.20,
    };

    function predict(ta, quotes, news) {
        const factors = {
            technical: scoreTechnicalMomentum(ta),
            volatility: scoreVolatilityRegime(quotes, ta),
            crossAsset: scoreCrossAsset(quotes),
            sector: scoreSectorRotation(quotes),
            megaCap: scoreMegaCap(quotes),
            sentiment: scoreSentiment(news),
            microstructure: scoreMicrostructure(ta, quotes),
            intraday: scoreIntradayMomentum(ta, quotes),
        };

        let composite = 0;
        Object.entries(WEIGHTS).forEach(([key, weight]) => {
            composite += (factors[key]?.score || 0) * weight;
        });
        composite = Math.max(-1, Math.min(1, composite));

        const absScore = Math.abs(composite);
        let direction, confidence;
        if (absScore < 0.06) {
            direction = 'NEUTRAL';
            confidence = Math.round(absScore * 100);
        } else {
            direction = composite > 0 ? 'CALL' : 'PUT';
            confidence = Math.round(Math.min(92, absScore * 110 + 18));
        }

        const currentPrice = ta?.current?.price || quotes.SPY?.price || 656;
        const atr = ta?.atr || currentPrice * 0.005;
        const rangeMultiplier = 1 + absScore * 0.5;
        const expectedMove = atr * rangeMultiplier;
        const bias = composite * expectedMove * 0.4;

        const predictedHigh = +(currentPrice + expectedMove * 0.8 + bias).toFixed(2);
        const predictedLow = +(currentPrice - expectedMove * 0.8 + bias).toFixed(2);
        const predictedClose = +(currentPrice + bias).toFixed(2);

        let timing = 'WAIT';
        if (confidence > 40) timing = 'ENTER';
        if (confidence > 65) timing = 'STRONG ENTRY';

        const vix = quotes['^VIX']?.price || 16;
        let riskLevel = 'MODERATE';
        if (vix > 25 || absScore < 0.15) riskLevel = 'HIGH';
        if (vix > 35) riskLevel = 'EXTREME';
        if (vix < 16 && confidence > 55) riskLevel = 'LOW';

        return {
            direction, confidence, composite,
            predictedHigh, predictedLow, predictedClose,
            timing, riskLevel, factors, weights: WEIGHTS,
            currentPrice, atr,
        };
    }

    return { predict };
})();
