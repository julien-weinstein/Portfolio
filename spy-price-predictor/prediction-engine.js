/**
 * Prediction Engine — 0DTE Quantitative Model
 *
 * 8 weighted factors scored -1 to +1, combined into a composite signal.
 * Optimized for same-day directional prediction.
 */

const PredictionEngine = (() => {

    function scoreTechnicalMomentum(ta) {
        if (!ta) return { score: 0, details: [] };
        const details = [];
        let total = 0, count = 0;

        if (ta.rsi != null) {
            // Extreme RSI values are strong mean-reversion signals for 0DTE
            let s = 0;
            if (ta.rsi < 25) s = 0.9;
            else if (ta.rsi < 35) s = 0.4;
            else if (ta.rsi > 75) s = -0.9;
            else if (ta.rsi > 65) s = -0.4;
            else s = (50 - ta.rsi) / -60 * 0.2;
            details.push({ name: 'RSI', value: ta.rsi.toFixed(1), score: s });
            total += s; count++;
        }

        if (ta.macd) {
            let s = 0;
            const h = ta.macd.histogram;
            if (h > 0 && ta.macd.value > ta.macd.signal) s = 0.5;
            else if (h < 0 && ta.macd.value < ta.macd.signal) s = -0.5;
            // Histogram magnitude matters
            if (h > 0.5) s = 0.8;
            if (h < -0.5) s = -0.8;
            // Crossover detection (histogram changing sign recently)
            details.push({ name: 'MACD', value: h?.toFixed(3), score: s });
            total += s; count++;
        }

        if (ta.stochastic?.k != null) {
            let s = 0;
            if (ta.stochastic.k < 15) s = 0.8;
            else if (ta.stochastic.k < 25) s = 0.4;
            else if (ta.stochastic.k > 85) s = -0.8;
            else if (ta.stochastic.k > 75) s = -0.4;
            else s = (50 - ta.stochastic.k) / -100;
            details.push({ name: 'Stoch %K', value: ta.stochastic.k.toFixed(1), score: s });
            total += s; count++;
        }

        if (ta.movingAverages) {
            const ma = ta.movingAverages;
            let s = ma.ema9 > ma.ema21 ? 0.5 : -0.5;
            // Slope of EMA9 amplifies signal
            if (ma.ema9Slope > 0 && s > 0) s += 0.3;
            if (ma.ema9Slope < 0 && s < 0) s -= 0.3;
            s = Math.max(-1, Math.min(1, s));
            details.push({ name: 'EMA Trend', value: s > 0 ? 'Bullish' : 'Bearish', score: s });
            total += s; count++;
        }

        if (ta.patterns?.length) {
            const patternScore = ta.patterns.reduce((acc, p) => {
                return acc + (p.signal === 'bullish' ? p.strength * 0.5 : p.signal === 'bearish' ? -p.strength * 0.5 : 0);
            }, 0);
            const s = Math.max(-1, Math.min(1, patternScore));
            if (Math.abs(s) > 0.05) {
                details.push({ name: 'Patterns', value: ta.patterns.map(p => p.name).join(', '), score: s });
                total += s; count++;
            }
        }

        return { score: count > 0 ? total / count : 0, details };
    }

    function scoreVolatilityRegime(quotes, ta) {
        const details = [];
        let total = 0, count = 0;

        const vix = quotes['^VIX'];
        if (vix) {
            // Low VIX favors directional moves, high VIX favors reversals
            let s = 0;
            if (vix.price < 13) s = 0.5;
            else if (vix.price < 18) s = 0.3;
            else if (vix.price < 25) s = -0.2;
            else if (vix.price < 35) s = -0.5;
            else s = -0.8;
            details.push({ name: 'VIX', value: vix.price?.toFixed(1), score: s });
            total += s; count++;

            if (vix.change != null) {
                const vs = vix.change > 1.5 ? -0.7 : vix.change > 0.5 ? -0.3 : vix.change < -1 ? 0.5 : vix.change < -0.3 ? 0.2 : 0;
                details.push({ name: 'VIX Change', value: (vix.change > 0 ? '+' : '') + vix.change?.toFixed(2), score: vs });
                total += vs; count++;
            }
        }

        if (ta?.atr && ta?.current?.price) {
            const atrPct = (ta.atr / ta.current.price) * 100;
            let s = atrPct < 0.3 ? 0.2 : atrPct > 0.8 ? -0.3 : 0;
            details.push({ name: 'ATR', value: '$' + ta.atr.toFixed(2), score: s });
            total += s; count++;
        }

        return { score: count > 0 ? total / count : 0, details };
    }

    function scoreCrossAsset(quotes) {
        const details = [];
        let total = 0, count = 0;

        const pairs = [
            { sym: 'TLT', name: 'Bonds', mult: 0.3 },
            { sym: 'GLD', name: 'Gold', mult: -0.2 },
            { sym: 'IWM', name: 'Small Caps', mult: 0.3 },
        ];

        pairs.forEach(({ sym, name, mult }) => {
            const q = quotes[sym];
            if (q?.changePct != null) {
                const s = Math.max(-1, Math.min(1, q.changePct * mult));
                details.push({ name, value: (q.changePct > 0 ? '+' : '') + q.changePct.toFixed(2) + '%', score: s });
                total += s; count++;
            }
        });

        return { score: count > 0 ? total / count : 0, details };
    }

    function scoreSectorRotation(quotes) {
        const details = [];
        const sectors = [
            { sym: 'XLK', name: 'Tech', weight: 0.35 },
            { sym: 'XLF', name: 'Financials', weight: 0.2 },
            { sym: 'XLE', name: 'Energy', weight: 0.15 },
            { sym: 'XLV', name: 'Healthcare', weight: 0.15 },
            { sym: 'XLI', name: 'Industrials', weight: 0.15 },
        ];

        let weightedScore = 0;
        sectors.forEach(sec => {
            const q = quotes[sec.sym];
            if (!q?.changePct) return;
            const s = Math.max(-1, Math.min(1, q.changePct * 0.35));
            weightedScore += s * sec.weight;
            details.push({ name: sec.name, value: (q.changePct > 0 ? '+' : '') + q.changePct.toFixed(2) + '%', score: s });
        });

        return { score: weightedScore, details };
    }

    function scoreMegaCap(quotes) {
        const details = [];
        const megaCaps = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'];
        let bullCount = 0, bearCount = 0, totalPct = 0, n = 0;

        megaCaps.forEach(sym => {
            const q = quotes[sym];
            if (!q?.changePct) return;
            totalPct += q.changePct;
            n++;
            if (q.changePct > 0.2) bullCount++;
            if (q.changePct < -0.2) bearCount++;
            details.push({ name: sym, value: (q.changePct > 0 ? '+' : '') + q.changePct.toFixed(2) + '%', score: Math.max(-1, Math.min(1, q.changePct * 0.3)) });
        });

        const avgPct = n > 0 ? totalPct / n : 0;
        const breadth = n > 0 ? (bullCount - bearCount) / n : 0;
        const score = Math.max(-1, Math.min(1, avgPct * 0.25 + breadth * 0.5));
        details.push({ name: 'Breadth', value: `${bullCount}↑ ${bearCount}↓`, score: breadth });

        return { score, details };
    }

    function scoreSentiment(news, optionsChain) {
        const details = [];
        if (!news?.length) return { score: 0, details };

        const isReal = news.some(n => n.isReal);

        // Weight recent articles more heavily
        const now = Date.now();
        let weightedSum = 0, weightTotal = 0;
        news.forEach(n => {
            const ageHrs = Math.max(0.1, (now - n.time) / 3600_000);
            const weight = 1 / Math.sqrt(ageHrs); // recency bias
            weightedSum += n.sentiment * weight;
            weightTotal += weight;
        });
        const avgSentiment = weightTotal > 0 ? weightedSum / weightTotal : 0;
        const label = avgSentiment > 0.1 ? 'Positive' : avgSentiment < -0.1 ? 'Negative' : 'Mixed';
        details.push({
            name: isReal ? 'Live News' : 'Headlines',
            value: `${label} (${news.length} articles)`,
            score: avgSentiment,
        });

        // Put/Call ratio from real chain data if available
        let pcScore = 0;
        if (optionsChain?.isReal) {
            const totalPutVol = (optionsChain.puts || []).reduce((s, o) => s + (o.volume || 0), 0);
            const totalCallVol = (optionsChain.calls || []).reduce((s, o) => s + (o.volume || 0), 0);
            const pcRatio = totalCallVol > 0 ? totalPutVol / totalCallVol : 1.0;
            // High put/call = bearish sentiment, low = bullish
            pcScore = pcRatio > 1.3 ? -0.5 : pcRatio > 1.0 ? -0.2 : pcRatio < 0.6 ? 0.5 : pcRatio < 0.8 ? 0.2 : 0;
            details.push({ name: 'Put/Call Vol', value: pcRatio.toFixed(2), score: pcScore });

            // Open interest skew
            const totalPutOI = (optionsChain.puts || []).reduce((s, o) => s + (o.openInterest || 0), 0);
            const totalCallOI = (optionsChain.calls || []).reduce((s, o) => s + (o.openInterest || 0), 0);
            const oiRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 1.0;
            const oiScore = oiRatio > 1.3 ? -0.3 : oiRatio < 0.7 ? 0.3 : 0;
            details.push({ name: 'OI Skew', value: oiRatio.toFixed(2), score: oiScore });

            return { score: Math.max(-1, Math.min(1, avgSentiment * 0.4 + pcScore * 0.35 + oiScore * 0.25)), details };
        }

        // No chain — sentiment only (lower weight since it's less reliable alone)
        return { score: Math.max(-1, Math.min(1, avgSentiment * 0.8)), details };
    }

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
            details.push({ name: 'Volume', value: volRatio.toFixed(2) + 'x avg', score: s });
            total += s; count++;
        }

        return { score: count > 0 ? total / count : 0, details };
    }

    // KEY 0DTE factor — Intraday Momentum (25% weight)
    function scoreIntradayMomentum(ta, quotes) {
        const details = [];
        if (!ta || !quotes.SPY) return { score: 0, details };
        let total = 0, count = 0;

        const spy = quotes.SPY;

        // Price vs today's open — strongest intraday signal
        if (spy.open && spy.price) {
            const moveFromOpen = ((spy.price - spy.open) / spy.open) * 100;
            let s = Math.max(-1, Math.min(1, moveFromOpen * 1.0));
            details.push({ name: 'Move From Open', value: (moveFromOpen > 0 ? '+' : '') + moveFromOpen.toFixed(3) + '%', score: s });
            total += s * 1.5; count += 1.5; // Extra weight
        }

        // Position within today's range
        if (spy.high && spy.low && spy.price) {
            const dayRange = spy.high - spy.low;
            if (dayRange > 0) {
                const rangePos = (spy.price - spy.low) / dayRange;
                let s = Math.max(-1, Math.min(1, (rangePos - 0.5) * 1.8));
                details.push({ name: 'Day Range', value: (rangePos * 100).toFixed(0) + '%', score: s });
                total += s; count++;
            }
        }

        // VWAP position — institutional benchmark
        if (ta.vwap && ta.current) {
            const pctFromVwap = ((ta.current.price - ta.vwap) / ta.vwap) * 100;
            let s = Math.max(-1, Math.min(1, pctFromVwap * 4));
            details.push({ name: 'vs VWAP', value: (pctFromVwap > 0 ? '+' : '') + pctFromVwap.toFixed(3) + '%', score: s });
            total += s; count++;
        }

        // Day-of-week statistical edge
        const ny = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const dow = ny.getDay();
        const dowBias = { 1: 0.12, 2: 0.05, 3: -0.08, 4: 0.05, 5: 0.08 };
        const dowNames = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };
        const dowScore = dowBias[dow] || 0;
        details.push({ name: 'Day', value: dowNames[dow] || '—', score: dowScore });
        total += dowScore; count++;

        return { score: count > 0 ? total / count : 0, details };
    }

    // ── Composite Model ────────────────────────────────────────────────
    const WEIGHTS = {
        technical: 0.18,
        volatility: 0.10,
        crossAsset: 0.07,
        sector: 0.08,
        megaCap: 0.12,
        sentiment: 0.05,
        microstructure: 0.15,
        intraday: 0.25,
    };

    function predict(ta, quotes, news, optionsChain) {
        const factors = {
            technical: scoreTechnicalMomentum(ta),
            volatility: scoreVolatilityRegime(quotes, ta),
            crossAsset: scoreCrossAsset(quotes),
            sector: scoreSectorRotation(quotes),
            megaCap: scoreMegaCap(quotes),
            sentiment: scoreSentiment(news, optionsChain),
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
        if (absScore < 0.05) {
            direction = 'NEUTRAL';
            confidence = Math.round(absScore * 100);
        } else {
            direction = composite > 0 ? 'CALL' : 'PUT';
            // Better calibrated confidence: 20-85% range
            confidence = Math.round(Math.min(85, absScore * 100 + 20));
        }

        const currentPrice = quotes.SPY?.price || ta?.current?.price || 0;
        const atr = ta?.atr || currentPrice * 0.005;
        const rangeMultiplier = 1 + absScore * 0.5;
        const expectedMove = atr * rangeMultiplier;
        const bias = composite * expectedMove * 0.4;

        const predictedHigh = +(currentPrice + expectedMove * 0.8 + bias).toFixed(2);
        const predictedLow = +(currentPrice - expectedMove * 0.8 + bias).toFixed(2);
        const predictedClose = +(currentPrice + bias).toFixed(2);

        const vix = quotes['^VIX']?.price || 16;
        let riskLevel = 'MODERATE';
        if (vix > 25 || absScore < 0.15) riskLevel = 'HIGH';
        if (vix > 35) riskLevel = 'EXTREME';
        if (vix < 16 && confidence > 50) riskLevel = 'LOW';

        return {
            direction, confidence, composite,
            predictedHigh, predictedLow, predictedClose,
            riskLevel, factors, weights: WEIGHTS,
            currentPrice, atr,
        };
    }

    return { predict };
})();
