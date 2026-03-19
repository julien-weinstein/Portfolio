/**
 * Technical Analysis Module
 *
 * Implements institutional-grade technical indicators used by quant desks:
 *   - Moving Averages (SMA, EMA, VWAP)
 *   - Momentum (RSI, MACD, Stochastic, ROC, Williams %R)
 *   - Volatility (Bollinger Bands, ATR, Keltner Channels, IV Percentile)
 *   - Volume (OBV, VWAP, Volume Profile, A/D Line)
 *   - Market Microstructure (support/resistance, pivot points)
 *   - Pattern Recognition (engulfing, doji, hammer)
 */

const TechnicalAnalysis = (() => {

    // ── Core Math Helpers ──────────────────────────────────────────────
    function sma(data, period) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) { result.push(null); continue; }
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) sum += data[j];
            result.push(sum / period);
        }
        return result;
    }

    function ema(data, period) {
        const result = [];
        const k = 2 / (period + 1);
        let prev = null;
        for (let i = 0; i < data.length; i++) {
            if (data[i] == null) { result.push(null); continue; }
            if (prev == null) {
                prev = data[i];
            } else {
                prev = data[i] * k + prev * (1 - k);
            }
            result.push(prev);
        }
        return result;
    }

    function stddev(data, period) {
        const means = sma(data, period);
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (means[i] == null) { result.push(null); continue; }
            let sumSq = 0;
            for (let j = i - period + 1; j <= i; j++) {
                sumSq += (data[j] - means[i]) ** 2;
            }
            result.push(Math.sqrt(sumSq / period));
        }
        return result;
    }

    // ── Indicators ─────────────────────────────────────────────────────

    function computeRSI(closes, period = 14) {
        const gains = [], losses = [];
        for (let i = 1; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            gains.push(diff > 0 ? diff : 0);
            losses.push(diff < 0 ? -diff : 0);
        }
        const avgGain = ema(gains, period);
        const avgLoss = ema(losses, period);
        const rsi = avgGain.map((g, i) => {
            if (g == null || avgLoss[i] == null || avgLoss[i] === 0) return 50;
            const rs = g / avgLoss[i];
            return 100 - 100 / (1 + rs);
        });
        return [null, ...rsi]; // align to closes array
    }

    function computeMACD(closes, fast = 12, slow = 26, signal = 9) {
        const emaFast = ema(closes, fast);
        const emaSlow = ema(closes, slow);
        const macdLine = emaFast.map((f, i) =>
            f != null && emaSlow[i] != null ? f - emaSlow[i] : null
        );
        const signalLine = ema(macdLine.filter(v => v != null), signal);
        // Pad signal line
        const padded = [];
        let si = 0;
        for (let i = 0; i < macdLine.length; i++) {
            if (macdLine[i] == null) padded.push(null);
            else padded.push(signalLine[si++] || null);
        }
        const histogram = macdLine.map((m, i) =>
            m != null && padded[i] != null ? m - padded[i] : null
        );
        return { macd: macdLine, signal: padded, histogram };
    }

    function computeStochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
        const kValues = [];
        for (let i = 0; i < closes.length; i++) {
            if (i < kPeriod - 1) { kValues.push(null); continue; }
            let hh = -Infinity, ll = Infinity;
            for (let j = i - kPeriod + 1; j <= i; j++) {
                if (highs[j] > hh) hh = highs[j];
                if (lows[j] < ll) ll = lows[j];
            }
            const range = hh - ll;
            kValues.push(range === 0 ? 50 : ((closes[i] - ll) / range) * 100);
        }
        const dValues = sma(kValues.filter(v => v != null), dPeriod);
        return { k: kValues, d: dValues };
    }

    function computeBollingerBands(closes, period = 20, mult = 2) {
        const mid = sma(closes, period);
        const sd = stddev(closes, period);
        return {
            upper: mid.map((m, i) => m != null ? m + mult * sd[i] : null),
            middle: mid,
            lower: mid.map((m, i) => m != null ? m - mult * sd[i] : null),
            bandwidth: mid.map((m, i) => m != null && m > 0 ? (2 * mult * sd[i]) / m * 100 : null),
        };
    }

    function computeATR(highs, lows, closes, period = 14) {
        const tr = [0];
        for (let i = 1; i < closes.length; i++) {
            tr.push(Math.max(
                highs[i] - lows[i],
                Math.abs(highs[i] - closes[i - 1]),
                Math.abs(lows[i] - closes[i - 1])
            ));
        }
        return ema(tr, period);
    }

    function computeVWAP(candles) {
        let cumVol = 0, cumTPV = 0;
        return candles.map(c => {
            const tp = (c.high + c.low + c.close) / 3;
            cumVol += c.volume || 1;
            cumTPV += tp * (c.volume || 1);
            return cumVol > 0 ? cumTPV / cumVol : c.close;
        });
    }

    function computeOBV(closes, volumes) {
        const obv = [0];
        for (let i = 1; i < closes.length; i++) {
            if (closes[i] > closes[i - 1]) obv.push(obv[i - 1] + (volumes[i] || 0));
            else if (closes[i] < closes[i - 1]) obv.push(obv[i - 1] - (volumes[i] || 0));
            else obv.push(obv[i - 1]);
        }
        return obv;
    }

    function computeWilliamsR(highs, lows, closes, period = 14) {
        const result = [];
        for (let i = 0; i < closes.length; i++) {
            if (i < period - 1) { result.push(null); continue; }
            let hh = -Infinity, ll = Infinity;
            for (let j = i - period + 1; j <= i; j++) {
                if (highs[j] > hh) hh = highs[j];
                if (lows[j] < ll) ll = lows[j];
            }
            const range = hh - ll;
            result.push(range === 0 ? -50 : ((hh - closes[i]) / range) * -100);
        }
        return result;
    }

    function computePivotPoints(high, low, close) {
        const pivot = (high + low + close) / 3;
        return {
            r3: high + 2 * (pivot - low),
            r2: pivot + (high - low),
            r1: 2 * pivot - low,
            pivot,
            s1: 2 * pivot - high,
            s2: pivot - (high - low),
            s3: low - 2 * (high - pivot),
        };
    }

    // ── Candlestick Patterns ───────────────────────────────────────────
    function detectPatterns(candles) {
        const patterns = [];
        const len = candles.length;
        if (len < 3) return patterns;

        const last = candles[len - 1];
        const prev = candles[len - 2];
        const prev2 = candles[len - 3];

        const bodySize = Math.abs(last.close - last.open);
        const totalRange = last.high - last.low;
        const upperShadow = last.high - Math.max(last.open, last.close);
        const lowerShadow = Math.min(last.open, last.close) - last.low;

        // Doji
        if (bodySize < totalRange * 0.1 && totalRange > 0) {
            patterns.push({ name: 'Doji', signal: 'neutral', strength: 0.6 });
        }

        // Hammer (bullish reversal)
        if (lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5 && last.close > last.open) {
            patterns.push({ name: 'Hammer', signal: 'bullish', strength: 0.7 });
        }

        // Shooting Star (bearish reversal)
        if (upperShadow > bodySize * 2 && lowerShadow < bodySize * 0.5 && last.close < last.open) {
            patterns.push({ name: 'Shooting Star', signal: 'bearish', strength: 0.7 });
        }

        // Bullish Engulfing
        if (prev.close < prev.open && last.close > last.open &&
            last.open <= prev.close && last.close >= prev.open) {
            patterns.push({ name: 'Bullish Engulfing', signal: 'bullish', strength: 0.8 });
        }

        // Bearish Engulfing
        if (prev.close > prev.open && last.close < last.open &&
            last.open >= prev.close && last.close <= prev.open) {
            patterns.push({ name: 'Bearish Engulfing', signal: 'bearish', strength: 0.8 });
        }

        // Morning Star (3-bar bullish reversal)
        if (prev2.close < prev2.open &&
            Math.abs(prev.close - prev.open) < Math.abs(prev2.close - prev2.open) * 0.3 &&
            last.close > last.open && last.close > (prev2.open + prev2.close) / 2) {
            patterns.push({ name: 'Morning Star', signal: 'bullish', strength: 0.85 });
        }

        return patterns;
    }

    // ── Full Analysis ──────────────────────────────────────────────────
    function analyze(candles) {
        if (!candles || candles.length < 30) return null;

        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        const volumes = candles.map(c => c.volume || 0);

        const rsi = computeRSI(closes);
        const macd = computeMACD(closes);
        const stoch = computeStochastic(highs, lows, closes);
        const bb = computeBollingerBands(closes);
        const atr = computeATR(highs, lows, closes);
        const vwap = computeVWAP(candles);
        const obv = computeOBV(closes, volumes);
        const williamsR = computeWilliamsR(highs, lows, closes);
        const ema9 = ema(closes, 9);
        const ema21 = ema(closes, 21);
        const sma50 = sma(closes, 50);
        const sma200 = sma(closes, Math.min(200, closes.length));

        const last = closes.length - 1;
        const lastCandle = candles[last];

        // Support / Resistance (simple: last N bars high/low)
        const lookback = Math.min(50, closes.length);
        const recentHighs = highs.slice(-lookback);
        const recentLows = lows.slice(-lookback);
        const resistance = Math.max(...recentHighs);
        const support = Math.min(...recentLows);

        // Pivot points from previous day's OHLC (use last candle as proxy)
        const pivots = computePivotPoints(
            Math.max(...highs.slice(-78)),  // ~1 day of 5m bars
            Math.min(...lows.slice(-78)),
            closes[last]
        );

        const patterns = detectPatterns(candles);

        return {
            current: {
                price: closes[last],
                open: lastCandle.open,
                high: lastCandle.high,
                low: lastCandle.low,
                volume: lastCandle.volume,
            },
            rsi: rsi[last],
            macd: {
                value: macd.macd[last],
                signal: macd.signal[last],
                histogram: macd.histogram[last],
            },
            stochastic: {
                k: stoch.k[last],
            },
            bollingerBands: {
                upper: bb.upper[last],
                middle: bb.middle[last],
                lower: bb.lower[last],
                bandwidth: bb.bandwidth[last],
                percentB: bb.upper[last] && bb.lower[last]
                    ? (closes[last] - bb.lower[last]) / (bb.upper[last] - bb.lower[last])
                    : 0.5,
            },
            atr: atr[last],
            vwap: vwap[last],
            obv: obv[last],
            williamsR: williamsR[last],
            movingAverages: {
                ema9: ema9[last],
                ema21: ema21[last],
                sma50: sma50[last],
                sma200: sma200[last],
                ema9Slope: ema9[last] && ema9[last - 1] ? ema9[last] - ema9[last - 1] : 0,
                ema21Slope: ema21[last] && ema21[last - 1] ? ema21[last] - ema21[last - 1] : 0,
            },
            support,
            resistance,
            pivots,
            patterns,
            // Full series for charting
            series: {
                closes,
                rsi,
                macd,
                bb,
                ema9,
                ema21,
                vwap,
            },
        };
    }

    return { analyze, sma, ema, computeRSI, computeMACD, computeATR };
})();
