/**
 * Options Strategy — 0DTE Single Strike Recommendation
 *
 * Recommends ONE option: call or put, strike price, probability, premium.
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

    function generateStrategy(prediction) {
        const { direction, confidence, currentPrice, atr,
                predictedHigh, predictedLow } = prediction;

        const now = new Date();
        const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const marketHour = ny.getHours() + ny.getMinutes() / 60;
        const hoursToClose = Math.max(0.1, 16 - marketHour);
        const T = hoursToClose / (252 * 6.5);

        const vixDetail = prediction.factors?.volatility?.details?.find(d => d.name === 'VIX');
        const ivBase = vixDetail ? parseFloat(vixDetail.value) / 100 : 0.18;
        // 0DTE IV premium increases as expiry nears
        const ivMult = hoursToClose > 5 ? 1.2 : hoursToClose > 3 ? 1.35 : hoursToClose > 1 ? 1.5 : 1.8;
        const iv = ivBase * ivMult;
        const r = 0.053;

        let recommendation = null;

        if (direction !== 'NEUTRAL' && confidence > 20) {
            const type = direction === 'CALL' ? 'call' : 'put';
            // Pick strike: slightly OTM for better risk/reward
            const offset = direction === 'CALL' ? atr * 0.15 : -atr * 0.15;
            const strike = Math.round(currentPrice + offset);

            const premium = Math.max(0.01, blackScholes(currentPrice, strike, T, r, iv, type));
            const g = greeks(currentPrice, strike, T, r, iv, type);
            const pItm = probITM(currentPrice, strike, T, r, iv, type);
            const breakeven = type === 'call' ? strike + premium : strike - premium;
            const pProfit = probITM(currentPrice, breakeven, T, r, iv, type);

            recommendation = {
                direction,
                strike,
                type: direction,
                premium: +premium.toFixed(2),
                breakeven: +breakeven.toFixed(2),
                probITM: Math.round(pItm * 100),
                probProfit: Math.round(pProfit * 100),
                greeks: g,
                stopLoss: +(premium * 0.4).toFixed(2),
                target: +(premium * 2).toFixed(2),
            };
        }

        let timing;
        if (hoursToClose > 5) timing = 'Wait for 9:45-10:15 ET opening range';
        else if (hoursToClose > 3) timing = 'Good entry window — look for VWAP test';
        else if (hoursToClose > 1.5) timing = 'Theta accelerating — tighten stops';
        else if (hoursToClose > 0.5) timing = 'Power hour — high conviction only';
        else timing = 'Close all positions — no new entries';

        return {
            recommendation,
            timing,
            hoursToClose: +hoursToClose.toFixed(1),
            iv: +(iv * 100).toFixed(1),
        };
    }

    return { generateStrategy };
})();
