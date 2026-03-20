/**
 * Options Strategy — 0DTE Single Strike Recommendation
 *
 * Professional-grade strike selection:
 *   - Real chain (Yahoo): ranks by liquidity, spread, delta proximity
 *   - Estimated: Black-Scholes with VIX-calibrated IV
 *   - Dynamic profit targets with scale-out levels
 *   - Theta-aware sell timing recommendations
 *   - Pre-market trade planning for next-day entries
 */

const OptionsStrategy = (() => {

    function normalCDF(x) {
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
        const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.SQRT2;
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    }

    function blackScholes(S, K, T, r, sigma, type = 'call') {
        if (T <= 0) T = 0.0001;
        const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
        const d2 = d1 - sigma * Math.sqrt(T);
        return type === 'call'
            ? S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2)
            : K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
    }

    function greeks(S, K, T, r, sigma, type = 'call') {
        if (T <= 0) T = 0.0001;
        const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
        const nd1 = Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
        const delta = type === 'call' ? normalCDF(d1) : normalCDF(d1) - 1;
        const gamma = nd1 / (S * sigma * Math.sqrt(T));
        const theta = (-(S * sigma * nd1) / (2 * Math.sqrt(T))) / 365;
        return { delta: +delta.toFixed(2), gamma: +gamma.toFixed(4), theta: +theta.toFixed(2) };
    }

    function probITM(S, K, T, r, sigma, type = 'call') {
        if (T <= 0) T = 0.0001;
        const d2 = (Math.log(S / K) + (r - sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
        return type === 'call' ? normalCDF(d2) : normalCDF(-d2);
    }

    // ── Pick best strike from real options chain ───────────────────
    function pickFromChain(chain, direction, currentPrice, atr, T, r) {
        const type = direction === 'CALL' ? 'call' : 'put';
        const options = type === 'call' ? chain.calls : chain.puts;
        if (!options || options.length === 0) return null;

        const targetOffset = atr * 0.15;
        const targetStrike = direction === 'CALL'
            ? currentPrice + targetOffset
            : currentPrice - targetOffset;

        const scored = options
            .filter(o => {
                if (o.bid <= 0 && o.last <= 0) return false;
                if (type === 'call' && o.strike < currentPrice - 1) return false;
                if (type === 'put' && o.strike > currentPrice + 1) return false;
                const dist = Math.abs(o.strike - currentPrice);
                if (dist > atr * 2) return false;
                return true;
            })
            .map(o => {
                const distFromTarget = Math.abs(o.strike - targetStrike);
                const spread = o.ask > 0 && o.bid > 0 ? (o.ask - o.bid) / o.mid : 1;
                const liquidity = Math.log10(Math.max(1, o.volume)) + Math.log10(Math.max(1, o.openInterest));
                const score = -distFromTarget * 2 - spread * 50 + liquidity * 5;
                return { ...o, score };
            })
            .sort((a, b) => b.score - a.score);

        if (scored.length === 0) return null;

        const best = scored[0];
        const premium = best.mid > 0 ? best.mid : best.last;
        const iv = best.impliedVol > 0 ? best.impliedVol : 0.2;
        const pItm = probITM(currentPrice, best.strike, T, r, iv, type);
        const breakeven = type === 'call' ? best.strike + premium : best.strike - premium;
        const pProfit = probITM(currentPrice, breakeven, T, r, iv, type);

        const g = (best.delta != null)
            ? { delta: +best.delta.toFixed(2), gamma: +(best.gamma || 0).toFixed(4), theta: +(best.theta || 0).toFixed(2) }
            : greeks(currentPrice, best.strike, T, r, iv, type);

        return {
            direction,
            strike: best.strike,
            type: direction,
            premium: +premium.toFixed(2),
            bid: best.bid,
            ask: best.ask,
            breakeven: +breakeven.toFixed(2),
            probITM: Math.round(pItm * 100),
            probProfit: Math.round(pProfit * 100),
            greeks: g,
            volume: best.volume,
            openInterest: best.openInterest,
            impliedVol: +(iv * 100).toFixed(1),
            fromChain: true,
        };
    }

    // ── Estimate when no chain is available ────────────────────────
    function estimateFromModel(direction, currentPrice, atr, T, r, iv) {
        const type = direction === 'CALL' ? 'call' : 'put';
        const offset = direction === 'CALL' ? atr * 0.15 : -atr * 0.15;
        const strike = Math.round(currentPrice + offset);

        const premium = Math.max(0.01, blackScholes(currentPrice, strike, T, r, iv, type));
        const g = greeks(currentPrice, strike, T, r, iv, type);
        const pItm = probITM(currentPrice, strike, T, r, iv, type);
        const breakeven = type === 'call' ? strike + premium : strike - premium;
        const pProfit = probITM(currentPrice, breakeven, T, r, iv, type);

        return {
            direction,
            strike,
            type: direction,
            premium: +premium.toFixed(2),
            breakeven: +breakeven.toFixed(2),
            probITM: Math.round(pItm * 100),
            probProfit: Math.round(pProfit * 100),
            greeks: g,
            fromChain: false,
        };
    }

    function generateStrategy(prediction, optionsChain) {
        const { direction, confidence, currentPrice, atr, composite } = prediction;

        const now = new Date();
        const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const marketHour = ny.getHours() + ny.getMinutes() / 60;
        const isPremarket = prediction.isPremarket;

        // For pre-market, calculate as if full day ahead
        const hoursToClose = isPremarket ? Math.max(0.1, 16 - 9.5) : Math.max(0.1, 16 - marketHour);
        const T = hoursToClose / (252 * 6.5);

        const vixDetail = prediction.factors?.volatility?.details?.find(d => d.name === 'VIX');
        const ivBase = vixDetail ? parseFloat(vixDetail.value) / 100 : 0.18;
        const ivMult = isPremarket ? 1.3 : hoursToClose > 5 ? 1.2 : hoursToClose > 3 ? 1.35 : hoursToClose > 1 ? 1.5 : 1.8;
        const iv = ivBase * ivMult;
        const r = 0.053;

        let recommendation = null;
        let chainUsed = false;

        // Generate recommendations for both regular and pre-market sessions
        const minConfidence = isPremarket ? 15 : 20;
        if (direction !== 'NEUTRAL' && confidence > minConfidence && hoursToClose > 0.25) {
            if (optionsChain?.isReal && optionsChain.calls?.length > 0) {
                recommendation = pickFromChain(optionsChain, direction, currentPrice, atr, T, r);
                if (recommendation) chainUsed = true;
            }
            if (!recommendation) {
                recommendation = estimateFromModel(direction, currentPrice, atr, T, r, iv);
            }

            // Add dynamic profit targets
            if (recommendation) {
                const targets = PredictionEngine.calculateTargets(
                    recommendation.premium, currentPrice, atr, composite, hoursToClose
                );
                recommendation.stopLoss = targets.stopLoss;
                recommendation.target1 = targets.target1;
                recommendation.target1Pct = targets.target1Pct;
                recommendation.target2 = targets.target2;
                recommendation.target2Pct = targets.target2Pct;
                recommendation.sellBy = targets.sellBy;
                recommendation.momentum = targets.momentum;
                recommendation.scaleOut = targets.scaleOut;
            }
        }

        let timing;
        if (isPremarket) {
            timing = prediction.entryTiming?.entryReason || 'Analyzing pre-market conditions...';
        } else if (hoursToClose > 5.5) {
            timing = 'Opening in progress -- wait for 9:45-10:15 ET range to form';
        } else if (hoursToClose > 4.5) {
            timing = 'Opening range established -- prime entry window';
        } else if (hoursToClose > 3) {
            timing = 'Mid-day -- look for VWAP retest or breakout';
        } else if (hoursToClose > 1.5) {
            timing = 'Theta accelerating -- tighten stops, reduce size';
        } else if (hoursToClose > 0.5) {
            timing = 'Power hour -- high conviction only, tight stops';
        } else if (hoursToClose > 0.25) {
            timing = 'Final 15 min -- close all positions';
        } else {
            timing = 'Market closing -- no new entries';
        }

        let displayIV = +(iv * 100).toFixed(1);
        if (recommendation?.impliedVol) {
            displayIV = recommendation.impliedVol;
        }

        return {
            recommendation,
            timing,
            hoursToClose: +hoursToClose.toFixed(1),
            iv: displayIV,
            chainUsed,
            isPremarket,
        };
    }

    return { generateStrategy };
})();
