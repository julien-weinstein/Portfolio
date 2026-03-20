/**
 * Options Strategy — 0DTE Strike Recommendations
 *
 * Generates two picks:
 *   Primary: Near-the-money (ATM/slightly OTM) — higher prob, moderate reward
 *   OTM:     Further OTM "lotto" — cheaper premium, lower prob, huge upside
 *
 * Uses:
 *   - Real chain (Yahoo): ranks by liquidity, spread, delta, gamma
 *   - Black-Scholes estimation when chain unavailable
 *   - Dynamic profit targets with scale-out levels
 *   - Theta-aware sell timing
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

    // ── Build a recommendation object from an option ────────────────
    function buildRec(direction, opt, currentPrice, T, r, defaultIV) {
        const type = direction === 'CALL' ? 'call' : 'put';
        const premium = opt.mid > 0 ? opt.mid : opt.last;
        const iv = opt.impliedVol > 0 ? opt.impliedVol : defaultIV;
        const pItm = probITM(currentPrice, opt.strike, T, r, iv, type);
        const breakeven = type === 'call' ? opt.strike + premium : opt.strike - premium;
        const pProfit = probITM(currentPrice, breakeven, T, r, iv, type);

        const g = (opt.delta != null)
            ? { delta: +opt.delta.toFixed(2), gamma: +(opt.gamma || 0).toFixed(4), theta: +(opt.theta || 0).toFixed(2) }
            : greeks(currentPrice, opt.strike, T, r, iv, type);

        return {
            direction,
            strike: opt.strike,
            type: direction,
            premium: +premium.toFixed(2),
            bid: opt.bid,
            ask: opt.ask,
            breakeven: +breakeven.toFixed(2),
            probITM: Math.round(pItm * 100),
            probProfit: Math.round(pProfit * 100),
            greeks: g,
            volume: opt.volume,
            openInterest: opt.openInterest,
            impliedVol: +(iv * 100).toFixed(1),
            fromChain: true,
        };
    }

    // ── Pick primary (near-money) strike from chain ─────────────────
    function pickPrimary(chain, direction, currentPrice, atr, T, r) {
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
        return buildRec(direction, scored[0], currentPrice, T, r, 0.2);
    }

    // ── Pick OTM "lotto" strike — cheaper, further from money ───────
    function pickOTM(chain, direction, currentPrice, atr, T, r, composite) {
        const type = direction === 'CALL' ? 'call' : 'put';
        const options = type === 'call' ? chain.calls : chain.puts;
        if (!options || options.length === 0) return null;

        const absScore = Math.abs(composite);

        // Target: 0.5–1.5x ATR out-of-the-money depending on signal strength
        // Stronger signal → willing to go further OTM (bigger move expected)
        const otmMultiplier = 0.5 + absScore * 1.5; // 0.5 to 2.0
        const targetOTM = direction === 'CALL'
            ? currentPrice + atr * otmMultiplier
            : currentPrice - atr * otmMultiplier;

        const candidates = options
            .filter(o => {
                if (o.bid <= 0 && o.last <= 0) return false;
                const premium = o.mid > 0 ? o.mid : o.last;
                // Must be cheaper than $2.00 and OTM
                if (premium > 2.00) return false;
                if (premium < 0.02) return false; // too cheap = no liquidity
                if (type === 'call' && o.strike <= currentPrice) return false;
                if (type === 'put' && o.strike >= currentPrice) return false;
                // Don't go more than 3x ATR out
                const dist = Math.abs(o.strike - currentPrice);
                if (dist > atr * 3) return false;
                return true;
            })
            .map(o => {
                const premium = o.mid > 0 ? o.mid : o.last;
                const dist = Math.abs(o.strike - targetOTM);

                // Scoring: balance proximity to target, cheapness, and liquidity
                // We want cheap options near our OTM target with decent volume
                const cheapness = Math.max(0, 2.0 - premium); // cheaper = better
                const liquidity = Math.log10(Math.max(1, o.volume)) + Math.log10(Math.max(1, o.openInterest)) * 0.5;
                const spread = o.ask > 0 && o.bid > 0 ? (o.ask - o.bid) / Math.max(0.01, o.mid) : 2;

                // Risk/reward: calculate potential gain if it goes ITM by 1 ATR past strike
                const iv = o.impliedVol > 0 ? o.impliedVol : 0.25;
                const expectedPayoff = type === 'call'
                    ? Math.max(0, (currentPrice + atr * (1 + absScore)) - o.strike)
                    : Math.max(0, o.strike - (currentPrice - atr * (1 + absScore)));
                const riskReward = premium > 0 ? expectedPayoff / premium : 0;

                const score = -dist * 1.5 + cheapness * 10 + liquidity * 3 - spread * 20 + riskReward * 2;
                return { ...o, score, riskReward: +riskReward.toFixed(1) };
            })
            .sort((a, b) => b.score - a.score);

        if (candidates.length === 0) return null;

        const best = candidates[0];
        const rec = buildRec(direction, best, currentPrice, T, r, 0.25);
        rec.riskReward = best.riskReward;
        rec.isOTM = true;
        return rec;
    }

    // ── Estimate strikes when no chain available ────────────────────
    function estimateFromModel(direction, currentPrice, atr, T, r, iv, otmOffset) {
        const type = direction === 'CALL' ? 'call' : 'put';
        const offset = direction === 'CALL' ? atr * otmOffset : -atr * otmOffset;
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

    function addTargets(rec, currentPrice, atr, composite, hoursToClose) {
        if (!rec) return;
        const targets = PredictionEngine.calculateTargets(
            rec.premium, currentPrice, atr, composite, hoursToClose
        );
        rec.stopLoss = targets.stopLoss;
        rec.target1 = targets.target1;
        rec.target1Pct = targets.target1Pct;
        rec.target2 = targets.target2;
        rec.target2Pct = targets.target2Pct;
        rec.sellBy = targets.sellBy;
        rec.momentum = targets.momentum;
        rec.scaleOut = targets.scaleOut;
    }

    function generateStrategy(prediction, optionsChain) {
        const { direction, confidence, currentPrice, atr, composite } = prediction;

        const now = new Date();
        const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const marketHour = ny.getHours() + ny.getMinutes() / 60;
        const isPremarket = prediction.isPremarket;

        const hoursToClose = isPremarket ? Math.max(0.1, 16 - 9.5) : Math.max(0.1, 16 - marketHour);
        const T = hoursToClose / (252 * 6.5);

        const vixDetail = prediction.factors?.volatility?.details?.find(d => d.name === 'VIX');
        const ivBase = vixDetail ? parseFloat(vixDetail.value) / 100 : 0.18;
        const ivMult = isPremarket ? 1.3 : hoursToClose > 5 ? 1.2 : hoursToClose > 3 ? 1.35 : hoursToClose > 1 ? 1.5 : 1.8;
        const iv = ivBase * ivMult;
        const r = 0.053;

        let recommendation = null;
        let otmPick = null;
        let chainUsed = false;

        const minConfidence = isPremarket ? 15 : 20;
        if (direction !== 'NEUTRAL' && confidence > minConfidence && hoursToClose > 0.25) {
            // Primary pick (near-money)
            if (optionsChain?.isReal && optionsChain.calls?.length > 0) {
                recommendation = pickPrimary(optionsChain, direction, currentPrice, atr, T, r);
                if (recommendation) chainUsed = true;

                // OTM pick — cheaper alternative with bigger upside
                otmPick = pickOTM(optionsChain, direction, currentPrice, atr, T, r, composite);
            }
            if (!recommendation) {
                recommendation = estimateFromModel(direction, currentPrice, atr, T, r, iv, 0.15);
            }
            if (!otmPick) {
                // Estimate an OTM strike: ~0.8–1.2x ATR out depending on signal
                const absScore = Math.abs(composite);
                const otmOffset = 0.6 + absScore * 0.8;
                otmPick = estimateFromModel(direction, currentPrice, atr, T, r, iv * 1.1, otmOffset);
                otmPick.isOTM = true;
                // Estimate risk/reward
                const expectedMove = atr * (1 + absScore);
                otmPick.riskReward = otmPick.premium > 0
                    ? +(expectedMove / otmPick.premium).toFixed(1) : 0;
            }

            addTargets(recommendation, currentPrice, atr, composite, hoursToClose);
            if (otmPick) addTargets(otmPick, currentPrice, atr, composite, hoursToClose);
        }

        let timing;
        if (isPremarket) {
            timing = prediction.entryTiming?.entryReason || 'Analyzing pre-market conditions...';
        } else if (hoursToClose > 5.5) {
            timing = 'Opening in progress — wait for 9:45-10:15 ET range to form';
        } else if (hoursToClose > 4.5) {
            timing = 'Opening range established — prime entry window';
        } else if (hoursToClose > 3) {
            timing = 'Mid-day — look for VWAP retest or breakout';
        } else if (hoursToClose > 1.5) {
            timing = 'Theta accelerating — tighten stops, reduce size';
        } else if (hoursToClose > 0.5) {
            timing = 'Power hour — high conviction only, tight stops';
        } else if (hoursToClose > 0.25) {
            timing = 'Final 15 min — close all positions';
        } else {
            timing = 'Market closing — no new entries';
        }

        let displayIV = +(iv * 100).toFixed(1);
        if (recommendation?.impliedVol) {
            displayIV = recommendation.impliedVol;
        }

        return {
            recommendation,
            otmPick,
            timing,
            hoursToClose: +hoursToClose.toFixed(1),
            iv: displayIV,
            chainUsed,
            isPremarket,
        };
    }

    return { generateStrategy };
})();
