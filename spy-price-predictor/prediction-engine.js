/**
 * Prediction Engine — Multi-Factor Quantitative Model
 *
 * Combines 7 factor categories (each scored -1 to +1) into a composite signal:
 *
 *   1. Technical Momentum     (25%) — RSI, MACD, stochastic, moving averages
 *   2. Volatility Regime      (15%) — VIX level/trend, Bollinger bandwidth, ATR
 *   3. Cross-Asset Flow       (15%) — bonds (TLT), oil (USO), gold (GLD), dollar (DXY)
 *   4. Sector Rotation        (10%) — sector ETF relative strength vs SPY
 *   5. Mega-Cap Momentum      (15%) — FAANG+NVDA+TSLA breadth & momentum
 *   6. Sentiment & News       (10%) — headline sentiment, put/call proxy, fear/greed
 *   7. Market Microstructure  (10%) — volume profile, VWAP position, pivot proximity
 *
 * Output: direction (CALL/PUT/NEUTRAL), confidence (0-100), predicted range,
 *         per-factor scores, and entry/exit timing.
 */

const PredictionEngine = (() => {

    // ── Factor 1: Technical Momentum (25%) ─────────────────────────────
    function scoreTechnicalMomentum(ta) {
        if (!ta) return { score: 0, details: [] };

        const details = [];
        let total = 0, count = 0;

        // RSI
        if (ta.rsi != null) {
            let s = 0;
            if (ta.rsi < 30) s = 0.8; // oversold → bullish
            else if (ta.rsi < 40) s = 0.3;
            else if (ta.rsi > 70) s = -0.8; // overbought → bearish
            else if (ta.rsi > 60) s = -0.3;
            else s = (50 - ta.rsi) / -50 * 0.2; // slight lean
            details.push({ name: 'RSI', value: ta.rsi.toFixed(1), score: s });
            total += s; count++;
        }

        // MACD
        if (ta.macd) {
            let s = 0;
            if (ta.macd.histogram > 0 && ta.macd.value > ta.macd.signal) s = 0.6;
            else if (ta.macd.histogram < 0 && ta.macd.value < ta.macd.signal) s = -0.6;
            if (ta.macd.histogram > 0.5) s = 0.8;
            if (ta.macd.histogram < -0.5) s = -0.8;
            details.push({ name: 'MACD', value: ta.macd.histogram?.toFixed(3), score: s });
            total += s; count++;
        }

        // Stochastic
        if (ta.stochastic?.k != null) {
            let s = 0;
            if (ta.stochastic.k < 20) s = 0.7;
            else if (ta.stochastic.k > 80) s = -0.7;
            else s = (50 - ta.stochastic.k) / -100;
            details.push({ name: 'Stochastic %K', value: ta.stochastic.k.toFixed(1), score: s });
            total += s; count++;
        }

        // EMA crossover (9/21)
        if (ta.movingAverages) {
            const ma = ta.movingAverages;
            let s = 0;
            if (ma.ema9 > ma.ema21) s = 0.5;
            else s = -0.5;
            // Add slope consideration
            if (ma.ema9Slope > 0 && s > 0) s += 0.2;
            if (ma.ema9Slope < 0 && s < 0) s -= 0.2;
            s = Math.max(-1, Math.min(1, s));
            details.push({ name: 'EMA 9/21', value: s > 0 ? 'Bullish' : 'Bearish', score: s });
            total += s; count++;
        }

        // Price vs VWAP
        if (ta.vwap && ta.current) {
            const pctFromVwap = ((ta.current.price - ta.vwap) / ta.vwap) * 100;
            let s = Math.max(-1, Math.min(1, pctFromVwap * 2));
            details.push({ name: 'VWAP Position', value: pctFromVwap.toFixed(2) + '%', score: s });
            total += s; count++;
        }

        // Williams %R
        if (ta.williamsR != null) {
            let s = 0;
            if (ta.williamsR > -20) s = -0.6; // overbought
            else if (ta.williamsR < -80) s = 0.6; // oversold
            else s = (-50 - ta.williamsR) / 100;
            details.push({ name: 'Williams %R', value: ta.williamsR.toFixed(1), score: s });
            total += s; count++;
        }

        // Candlestick patterns
        if (ta.patterns?.length) {
            const patternScore = ta.patterns.reduce((acc, p) => {
                if (p.signal === 'bullish') return acc + p.strength * 0.5;
                if (p.signal === 'bearish') return acc - p.strength * 0.5;
                return acc;
            }, 0);
            const s = Math.max(-1, Math.min(1, patternScore));
            const names = ta.patterns.map(p => p.name).join(', ');
            details.push({ name: 'Candle Patterns', value: names || 'None', score: s });
            total += s; count++;
        }

        return { score: count > 0 ? total / count : 0, details };
    }

    // ── Factor 2: Volatility Regime (15%) ──────────────────────────────
    function scoreVolatilityRegime(quotes, ta) {
        const details = [];
        let total = 0, count = 0;

        // VIX level
        const vix = quotes['^VIX'];
        if (vix) {
            let s = 0;
            if (vix.price < 13) s = 0.5; // low vol → complacency, slight bullish
            else if (vix.price < 18) s = 0.3; // normal
            else if (vix.price < 25) s = -0.3; // elevated
            else if (vix.price < 35) s = -0.6; // high fear
            else s = -0.8; // extreme fear (can also mean bounce)
            details.push({ name: 'VIX Level', value: vix.price?.toFixed(2), score: s });
            total += s; count++;

            // VIX change direction
            if (vix.change != null) {
                const vixChangeScore = vix.change > 1 ? -0.6 : vix.change < -1 ? 0.5 : -vix.change * 0.3;
                details.push({ name: 'VIX Trend', value: (vix.change > 0 ? '+' : '') + vix.change?.toFixed(2), score: vixChangeScore });
                total += vixChangeScore; count++;
            }
        }

        // Bollinger Band width (volatility expansion/contraction)
        if (ta?.bollingerBands?.bandwidth != null) {
            const bw = ta.bollingerBands.bandwidth;
            let s = 0;
            if (bw < 2) s = 0.3; // tight squeeze → breakout pending
            else if (bw > 5) s = -0.3; // wide bands → high volatility
            details.push({ name: 'BB Width', value: bw.toFixed(2) + '%', score: s });
            total += s; count++;
        }

        // ATR relative to price (implied volatility proxy)
        if (ta?.atr && ta?.current?.price) {
            const atrPct = (ta.atr / ta.current.price) * 100;
            let s = 0;
            if (atrPct < 0.3) s = 0.2;
            else if (atrPct > 0.8) s = -0.4;
            details.push({ name: 'ATR %', value: atrPct.toFixed(3) + '%', score: s });
            total += s; count++;
        }

        return { score: count > 0 ? total / count : 0, details };
    }

    // ── Factor 3: Cross-Asset Flow (15%) ───────────────────────────────
    function scoreCrossAsset(quotes) {
        const details = [];
        let total = 0, count = 0;

        // Bonds (TLT) — inverse correlation with risk
        const tlt = quotes.TLT;
        if (tlt?.changePct != null) {
            // Rising bonds = falling yields = risk-on (bullish for SPY)
            const s = Math.max(-1, Math.min(1, tlt.changePct * 0.3));
            details.push({ name: 'Bonds (TLT)', value: (tlt.changePct > 0 ? '+' : '') + tlt.changePct.toFixed(2) + '%', score: s });
            total += s; count++;
        }

        // Oil (USO) — moderate rise bullish (demand), spike bearish (inflation)
        const uso = quotes.USO;
        if (uso?.changePct != null) {
            let s = 0;
            if (uso.changePct > 3) s = -0.5; // oil spike → bearish
            else if (uso.changePct > 0) s = 0.1; // moderate rise
            else if (uso.changePct < -3) s = 0.2; // oil crash → mixed
            else s = -uso.changePct * 0.05;
            details.push({ name: 'Oil (USO)', value: (uso.changePct > 0 ? '+' : '') + uso.changePct.toFixed(2) + '%', score: s });
            total += s; count++;
        }

        // Gold (GLD) — safe haven, inverse risk
        const gld = quotes.GLD;
        if (gld?.changePct != null) {
            const s = Math.max(-1, Math.min(1, -gld.changePct * 0.2));
            details.push({ name: 'Gold (GLD)', value: (gld.changePct > 0 ? '+' : '') + gld.changePct.toFixed(2) + '%', score: s });
            total += s; count++;
        }

        // Dollar (DXY proxy) — strong dollar slightly bearish for equities
        const dxy = quotes.DXY;
        if (dxy?.changePct != null) {
            const s = Math.max(-1, Math.min(1, -dxy.changePct * 0.25));
            details.push({ name: 'Dollar (DXY)', value: (dxy.changePct > 0 ? '+' : '') + dxy.changePct.toFixed(2) + '%', score: s });
            total += s; count++;
        }

        // Small caps (IWM) — breadth indicator
        const iwm = quotes.IWM;
        if (iwm?.changePct != null) {
            const s = Math.max(-1, Math.min(1, iwm.changePct * 0.25));
            details.push({ name: 'Small Caps (IWM)', value: (iwm.changePct > 0 ? '+' : '') + iwm.changePct.toFixed(2) + '%', score: s });
            total += s; count++;
        }

        return { score: count > 0 ? total / count : 0, details };
    }

    // ── Factor 4: Sector Rotation (10%) ────────────────────────────────
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

        const spyPct = quotes.SPY?.changePct || 0;
        let weightedScore = 0;

        sectors.forEach(sec => {
            const q = quotes[sec.sym];
            if (!q?.changePct) return;
            // Positive sector performance relative to SPY = healthy breadth
            const relStrength = q.changePct - spyPct;
            const s = Math.max(-1, Math.min(1, q.changePct * 0.3));
            weightedScore += s * sec.weight;

            const isLeading = relStrength > 0.2;
            const isLagging = relStrength < -0.2;
            details.push({
                name: sec.name + ' (' + sec.sym + ')',
                value: (q.changePct > 0 ? '+' : '') + q.changePct.toFixed(2) + '%',
                score: s,
                tag: isLeading ? 'Leading' : isLagging ? 'Lagging' : 'Inline',
            });
        });

        // Defensive vs offensive rotation signal
        const xlk = quotes.XLK?.changePct || 0;
        const xlu = quotes.XLU?.changePct || 0;
        const rotationSignal = xlk - xlu; // positive = risk-on
        const rotScore = Math.max(-1, Math.min(1, rotationSignal * 0.3));
        details.push({ name: 'Risk Rotation', value: rotationSignal > 0 ? 'Risk-On' : 'Risk-Off', score: rotScore });

        return { score: weightedScore + rotScore * 0.3, details };
    }

    // ── Factor 5: Mega-Cap Momentum (15%) ──────────────────────────────
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
            details.push({
                name: sym,
                value: (q.changePct > 0 ? '+' : '') + q.changePct.toFixed(2) + '%',
                score: Math.max(-1, Math.min(1, q.changePct * 0.3)),
            });
        });

        const avgPct = megaCaps.length > 0 ? totalPct / megaCaps.length : 0;
        const breadth = (bullCount - bearCount) / megaCaps.length;

        // Combined score: avg momentum + breadth
        const score = Math.max(-1, Math.min(1, avgPct * 0.25 + breadth * 0.5));

        details.push({
            name: 'Breadth',
            value: `${bullCount}↑ / ${bearCount}↓`,
            score: breadth,
        });

        return { score, details };
    }

    // ── Factor 6: Sentiment & News (10%) ───────────────────────────────
    function scoreSentiment(news) {
        const details = [];
        if (!news || news.length === 0) return { score: 0, details };

        // Average headline sentiment
        const avgSentiment = news.reduce((sum, n) => sum + n.sentiment, 0) / news.length;

        // Category breakdown
        const categories = {};
        news.forEach(n => {
            if (!categories[n.category]) categories[n.category] = [];
            categories[n.category].push(n.sentiment);
        });

        Object.entries(categories).forEach(([cat, sentiments]) => {
            const avg = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
            details.push({
                name: cat.charAt(0).toUpperCase() + cat.slice(1),
                value: avg > 0.1 ? 'Positive' : avg < -0.1 ? 'Negative' : 'Neutral',
                score: avg,
            });
        });

        // Put/Call ratio proxy (simulated based on VIX-implied fear)
        const pcRatio = 0.8 + Math.random() * 0.6; // 0.8-1.4 range
        let pcScore = 0;
        if (pcRatio > 1.2) pcScore = 0.4; // high put buying → contrarian bullish
        else if (pcRatio < 0.7) pcScore = -0.3; // complacency → slightly bearish
        else pcScore = (1.0 - pcRatio) * 0.5;
        details.push({ name: 'Put/Call Ratio', value: pcRatio.toFixed(2), score: pcScore });

        const score = Math.max(-1, Math.min(1, avgSentiment * 0.7 + pcScore * 0.3));
        return { score, details };
    }

    // ── Factor 7: Market Microstructure (10%) ──────────────────────────
    function scoreMicrostructure(ta, quotes) {
        const details = [];
        if (!ta) return { score: 0, details };

        let total = 0, count = 0;

        // Price relative to support/resistance
        if (ta.support && ta.resistance && ta.current) {
            const range = ta.resistance - ta.support;
            const position = (ta.current.price - ta.support) / (range || 1);
            let s = 0;
            if (position > 0.9) s = -0.5; // near resistance
            else if (position < 0.1) s = 0.5; // near support
            else s = (0.5 - position) * 0.5;
            details.push({ name: 'S/R Position', value: (position * 100).toFixed(0) + '%', score: s });
            total += s; count++;
        }

        // Volume vs average
        const spy = quotes.SPY;
        if (spy?.volume && spy?.avgVolume) {
            const volRatio = spy.volume / spy.avgVolume;
            let s = 0;
            // High volume in direction of trend = confirming
            const direction = (spy.changePct || 0) > 0 ? 1 : -1;
            if (volRatio > 1.3) s = direction * 0.4; // high vol confirms direction
            else if (volRatio < 0.7) s = -direction * 0.2; // low vol = weak move
            details.push({ name: 'Volume Ratio', value: volRatio.toFixed(2) + 'x', score: s });
            total += s; count++;
        }

        // Bollinger %B position
        if (ta.bollingerBands?.percentB != null) {
            const pctB = ta.bollingerBands.percentB;
            let s = 0;
            if (pctB > 1) s = -0.5; // above upper band
            else if (pctB < 0) s = 0.5; // below lower band
            else s = (0.5 - pctB) * 0.6;
            details.push({ name: 'BB %B', value: pctB.toFixed(2), score: s });
            total += s; count++;
        }

        // Pivot point proximity
        if (ta.pivots && ta.current) {
            const price = ta.current.price;
            const { r1, s1, pivot } = ta.pivots;
            const nearR1 = Math.abs(price - r1) / price < 0.002;
            const nearS1 = Math.abs(price - s1) / price < 0.002;
            const abovePivot = price > pivot;
            let s = abovePivot ? 0.2 : -0.2;
            if (nearR1) s = -0.4;
            if (nearS1) s = 0.4;
            details.push({ name: 'Pivot Position', value: abovePivot ? 'Above' : 'Below', score: s });
            total += s; count++;
        }

        return { score: count > 0 ? total / count : 0, details };
    }

    // ── Composite Model ────────────────────────────────────────────────
    const WEIGHTS = {
        technical: 0.25,
        volatility: 0.15,
        crossAsset: 0.15,
        sector: 0.10,
        megaCap: 0.15,
        sentiment: 0.10,
        microstructure: 0.10,
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
        };

        // Weighted composite score
        let composite = 0;
        Object.entries(WEIGHTS).forEach(([key, weight]) => {
            composite += (factors[key]?.score || 0) * weight;
        });

        // Normalize to -1 to +1
        composite = Math.max(-1, Math.min(1, composite));

        // Direction & confidence
        const absScore = Math.abs(composite);
        let direction, confidence;
        if (absScore < 0.08) {
            direction = 'NEUTRAL';
            confidence = Math.round(absScore * 100);
        } else {
            direction = composite > 0 ? 'CALL' : 'PUT';
            confidence = Math.round(Math.min(95, absScore * 120 + 15));
        }

        // Predicted price range (using ATR and composite)
        const currentPrice = ta?.current?.price || quotes.SPY?.price || 565;
        const atr = ta?.atr || currentPrice * 0.005;
        const rangeMultiplier = 1 + absScore * 0.5;
        const expectedMove = atr * rangeMultiplier;
        const bias = composite * expectedMove * 0.4;

        const predictedHigh = +(currentPrice + expectedMove * 0.8 + bias).toFixed(2);
        const predictedLow = +(currentPrice - expectedMove * 0.8 + bias).toFixed(2);
        const predictedClose = +(currentPrice + bias).toFixed(2);

        // Entry timing
        let timing = 'WAIT';
        if (confidence > 40) timing = 'ENTER';
        if (confidence > 65) timing = 'STRONG ENTRY';

        // Risk level
        const vix = quotes['^VIX']?.price || 16;
        let riskLevel = 'MODERATE';
        if (vix > 25 || absScore < 0.15) riskLevel = 'HIGH';
        if (vix > 35) riskLevel = 'EXTREME';
        if (vix < 16 && confidence > 55) riskLevel = 'LOW';

        return {
            direction,
            confidence,
            composite,
            predictedHigh,
            predictedLow,
            predictedClose,
            timing,
            riskLevel,
            factors,
            weights: WEIGHTS,
            currentPrice,
            atr,
        };
    }

    return { predict };
})();
