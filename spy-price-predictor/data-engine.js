/**
 * Data Engine — Live market data via Finnhub + Yahoo CORS proxies.
 *
 * Quotes:  Finnhub → Yahoo proxy → Simulated fallback.
 * News:    Finnhub market news → simulated fallback (with keyword sentiment scoring).
 * Options: Tradier sandbox (CORS, Greeks/IV) → Yahoo proxy → null.
 */

const DataEngine = (() => {
    const cache = {};
    const CACHE_TTL = 30_000; // 30s for fresher prices

    // Free API keys (public, rate-limited — not secrets)
    const FINNHUB_KEY = 'cvs2p81r01qsfepo4q30cvs2p81r01qsfepo4q3g';
    // Tradier sandbox — paper trading token, safe to expose (no real money)
    const TRADIER_SANDBOX_TOKEN = 'qNSxKgkbpFhPbVDMBqCK4AznYO7b';

    let _usingSimulated = false;

    function cached(key, ttl = CACHE_TTL) {
        const entry = cache[key];
        if (entry && Date.now() - entry.ts < ttl) return entry.data;
        return null;
    }

    function setCache(key, data, ttl = CACHE_TTL) {
        cache[key] = { data, ts: Date.now() };
        return data;
    }

    // ── Finnhub (primary — CORS enabled, 60 req/min) ────────────────
    async function finnhubQuote(symbol) {
        try {
            const resp = await fetch(
                `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`,
                { signal: AbortSignal.timeout(6000) }
            );
            if (!resp.ok) return null;
            const d = await resp.json();
            if (!d.c || d.c === 0) return null;
            return {
                price: d.c,
                change: d.d,
                changePct: d.dp,
                high: d.h,
                low: d.l,
                open: d.o,
                prevClose: d.pc,
            };
        } catch {
            return null;
        }
    }

    async function finnhubAllQuotes(symbols) {
        // Fetch in small batches to stay under rate limit
        const results = {};
        const batchSize = 10;
        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            const promises = batch.map(async sym => {
                // Finnhub uses different symbol format for VIX
                const fhSym = sym === '^VIX' ? 'VIX' : sym;
                const q = await finnhubQuote(fhSym);
                if (q) results[sym] = q;
            });
            await Promise.all(promises);
        }
        return Object.keys(results).length > 0 ? results : null;
    }

    // (Twelve Data removed — no CORS headers, doesn't work from browser)

    // ── Yahoo via CORS proxies (last resort for live data) ───────────
    const CORS_PROXIES = [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest=',
    ];

    async function yahooQuote(symbols) {
        const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}`;
        for (const proxy of CORS_PROXIES) {
            try {
                const resp = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(8000) });
                if (!resp.ok) continue;
                const json = await resp.json();
                const results = {};
                (json.quoteResponse?.result || []).forEach(q => {
                    results[q.symbol] = {
                        price: q.regularMarketPrice,
                        change: q.regularMarketChange,
                        changePct: q.regularMarketChangePercent,
                        high: q.regularMarketDayHigh,
                        low: q.regularMarketDayLow,
                        open: q.regularMarketOpen,
                        prevClose: q.regularMarketPreviousClose,
                        volume: q.regularMarketVolume,
                        fiftyDayAvg: q.fiftyDayAverage,
                        twoHundredDayAvg: q.twoHundredDayAverage,
                        avgVolume: q.averageDailyVolume3Month,
                    };
                });
                if (Object.keys(results).length > 0) return results;
            } catch { continue; }
        }
        return null;
    }

    async function yahooChart(symbol, range, interval) {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;
        for (const proxy of CORS_PROXIES) {
            try {
                const resp = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(8000) });
                if (!resp.ok) continue;
                const json = await resp.json();
                const result = json.chart?.result?.[0];
                if (!result) continue;
                const ts = result.timestamp || [];
                const q = result.indicators?.quote?.[0] || {};
                const data = ts.map((t, i) => ({
                    time: t * 1000,
                    open: q.open?.[i], high: q.high?.[i],
                    low: q.low?.[i], close: q.close?.[i],
                    volume: q.volume?.[i],
                })).filter(d => d.close != null);
                if (data.length > 10) return data;
            } catch { continue; }
        }
        return null;
    }

    // ── Finnhub candles for chart ────────────────────────────────────
    async function finnhubChart(symbol, rangeDays) {
        try {
            const now = Math.floor(Date.now() / 1000);
            const from = now - rangeDays * 86400;
            const resolution = rangeDays <= 1 ? '5' : rangeDays <= 5 ? '15' : '60';
            const resp = await fetch(
                `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${now}&token=${FINNHUB_KEY}`,
                { signal: AbortSignal.timeout(6000) }
            );
            if (!resp.ok) return null;
            const d = await resp.json();
            if (d.s !== 'ok' || !d.t) return null;
            return d.t.map((t, i) => ({
                time: t * 1000,
                open: d.o[i], high: d.h[i],
                low: d.l[i], close: d.c[i],
                volume: d.v[i],
            }));
        } catch {
            return null;
        }
    }

    // ── Simulated fallback (last resort) ─────────────────────────────
    function showSimulatedWarning() {
        if (document.getElementById('simWarning')) return;
        const warn = document.createElement('div');
        warn.id = 'simWarning';
        warn.style.cssText = 'background:#332200;color:#ffcc00;text-align:center;padding:6px;font-size:11px;position:fixed;bottom:0;left:0;right:0;z-index:999;';
        warn.textContent = 'Live data unavailable — showing simulated prices. Refresh to retry.';
        document.body.appendChild(warn);
    }

    function removeSimulatedWarning() {
        document.getElementById('simWarning')?.remove();
    }

    function generateSimulatedChart(basePrice, days, intervalMinutes) {
        const data = [];
        const now = Date.now();
        const msPerBar = intervalMinutes * 60_000;
        const barsPerDay = Math.floor((6.5 * 60) / intervalMinutes);
        const totalBars = barsPerDay * days;
        let price = basePrice;

        for (let i = totalBars; i >= 0; i--) {
            const time = now - i * msPerBar;
            const d = new Date(time);
            if (d.getDay() === 0 || d.getDay() === 6) continue;
            const drift = (basePrice - price) * 0.002;
            const vol = basePrice * 0.001 * (1 + Math.random());
            price += drift + (Math.random() - 0.48) * vol;
            data.push({
                time, open: +(price - vol * 0.3).toFixed(2),
                high: +(price + vol * 0.7).toFixed(2),
                low: +(price - vol * 0.7).toFixed(2),
                close: +price.toFixed(2),
                volume: Math.floor(200_000 + Math.random() * 500_000),
            });
        }
        return data;
    }

    function generateSimulatedQuotes(baseSpyPrice) {
        const base = baseSpyPrice || 659;
        function mkq(b, v) {
            const c = (Math.random() - 0.48) * v;
            return { price: +(b + c).toFixed(2), change: +c.toFixed(2), changePct: +((c / b) * 100).toFixed(2),
                     high: +(b + Math.abs(c) + Math.random() * v * 0.3).toFixed(2), low: +(b - Math.abs(c) - Math.random() * v * 0.3).toFixed(2),
                     open: +(b + (Math.random() - 0.5) * v * 0.3).toFixed(2), prevClose: +b.toFixed(2),
                     volume: Math.floor(30e6 + Math.random() * 50e6), avgVolume: Math.floor(40e6 + Math.random() * 20e6) };
        }
        const vb = 14 + Math.random() * 8;
        return {
            SPY: mkq(base, 4), '^VIX': { price: +vb.toFixed(2), change: +(Math.random() * 2 - 1).toFixed(2), changePct: 0 },
            QQQ: mkq(565, 5), IWM: mkq(242, 3), XLF: mkq(53, 1), XLE: mkq(93, 2), XLK: mkq(252, 4),
            XLV: mkq(161, 2), XLI: mkq(139, 2), XLU: mkq(81, 1), USO: mkq(73, 2), TLT: mkq(89, 1),
            GLD: mkq(292, 3), DXY: mkq(103, 0.8), AAPL: mkq(247, 4), MSFT: mkq(458, 6), NVDA: mkq(147, 7),
            AMZN: mkq(237, 4), GOOGL: mkq(197, 3), META: mkq(685, 8), TSLA: mkq(283, 8),
        };
    }

    // ── Keyword-based sentiment scorer ──────────────────────────────
    const BULLISH_WORDS = [
        'surge','surges','surging','rally','rallies','rallying','soar','soars',
        'jump','jumps','gain','gains','rise','rises','rising','climb','climbs',
        'beat','beats','record','high','bullish','upgrade','upgrades','outperform',
        'strong','optimism','optimistic','boom','booming','recovery','rebound',
        'breakout','upbeat','positive','acceleration','accelerate',
    ];
    const BEARISH_WORDS = [
        'crash','crashes','plunge','plunges','plummeting','tumble','tumbles',
        'drop','drops','fall','falls','falling','decline','declines','sink','sinks',
        'miss','misses','low','bearish','downgrade','downgrades','underperform',
        'weak','weakness','fear','fears','recession','slowdown','selloff','sell-off',
        'slump','slumps','panic','warning','warns','risk','losses','loss','cut','cuts',
    ];

    function scoreSentiment(text) {
        const words = text.toLowerCase().split(/\W+/);
        let score = 0;
        for (const w of words) {
            if (BULLISH_WORDS.includes(w)) score += 0.3;
            if (BEARISH_WORDS.includes(w)) score -= 0.3;
        }
        return Math.max(-1, Math.min(1, score));
    }

    // ── Finnhub news (real headlines, CORS-enabled) ────────────────
    async function finnhubNews() {
        try {
            const resp = await fetch(
                `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_KEY}`,
                { signal: AbortSignal.timeout(6000) }
            );
            if (!resp.ok) return null;
            const articles = await resp.json();
            if (!Array.isArray(articles) || articles.length === 0) return null;
            // Take last 20 articles, score sentiment from headline + summary
            return articles.slice(0, 20).map(a => ({
                title: a.headline || a.summary || '',
                source: a.source || '',
                url: a.url || '',
                time: (a.datetime || 0) * 1000,
                category: a.category || 'general',
                sentiment: scoreSentiment((a.headline || '') + ' ' + (a.summary || '')),
                related: a.related || '',
                isReal: true,
            }));
        } catch {
            return null;
        }
    }

    // Finnhub company-specific news for SPY-related tickers
    async function finnhubCompanyNews(symbol) {
        try {
            const now = new Date();
            const from = new Date(now - 86400_000).toISOString().slice(0, 10);
            const to = now.toISOString().slice(0, 10);
            const resp = await fetch(
                `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_KEY}`,
                { signal: AbortSignal.timeout(6000) }
            );
            if (!resp.ok) return [];
            const articles = await resp.json();
            if (!Array.isArray(articles)) return [];
            return articles.slice(0, 10).map(a => ({
                title: a.headline || '',
                source: a.source || '',
                url: a.url || '',
                time: (a.datetime || 0) * 1000,
                category: 'company',
                sentiment: scoreSentiment((a.headline || '') + ' ' + (a.summary || '')),
                related: symbol,
                isReal: true,
            }));
        } catch {
            return [];
        }
    }

    function generateSimulatedNews() {
        const headlines = [
            { title: 'Fed signals patience on rate cuts', sentiment: -0.3, category: 'macro' },
            { title: 'Tech earnings beat expectations', sentiment: 0.6, category: 'earnings' },
            { title: 'Jobs report beats consensus', sentiment: 0.4, category: 'macro' },
            { title: 'NVIDIA surges on AI demand', sentiment: 0.7, category: 'tech' },
            { title: 'Treasury yields climb', sentiment: -0.2, category: 'bonds' },
            { title: 'Consumer confidence rises', sentiment: 0.3, category: 'macro' },
            { title: 'Put/call ratio elevated', sentiment: -0.35, category: 'sentiment' },
        ];
        return headlines.sort(() => Math.random() - 0.5).slice(0, 5).map((h, i) => ({
            ...h, time: Date.now() - i * 15 * 60_000, isReal: false,
        }));
    }

    // ── Tradier sandbox (primary options — CORS confirmed, 15min delayed) ──
    async function tradierOptionsChain(symbol = 'SPY') {
        try {
            // Get today's expiration date (YYYY-MM-DD)
            const today = new Date().toISOString().slice(0, 10);

            // First try today (0DTE), then fall back to expirations lookup
            const chainResp = await fetch(
                `https://sandbox.tradier.com/v1/markets/options/chains?symbol=${symbol}&expiration=${today}&greeks=true`,
                {
                    headers: { 'Authorization': `Bearer ${TRADIER_SANDBOX_TOKEN}`, 'Accept': 'application/json' },
                    signal: AbortSignal.timeout(8000),
                }
            );
            if (!chainResp.ok) return null;
            const chainJson = await chainResp.json();
            const options = chainJson.options?.option;
            if (!Array.isArray(options) || options.length === 0) {
                // Today might not have an expiration — get nearest
                return tradierNearestExpiration(symbol);
            }

            const calls = options.filter(o => o.option_type === 'call').map(parseTradierOption);
            const puts = options.filter(o => o.option_type === 'put').map(parseTradierOption);

            if (calls.length === 0 && puts.length === 0) return null;

            const underlying = options[0]?.underlying_price || 0;
            console.log(`[DataEngine] Tradier 0DTE chain: ${calls.length} calls, ${puts.length} puts`);
            return { calls, puts, underlying, expiration: today, is0DTE: true, isReal: true, source: 'tradier' };
        } catch (e) {
            console.log('[DataEngine] Tradier chain error:', e.message);
            return null;
        }
    }

    async function tradierNearestExpiration(symbol) {
        try {
            const resp = await fetch(
                `https://sandbox.tradier.com/v1/markets/options/expirations?symbol=${symbol}`,
                {
                    headers: { 'Authorization': `Bearer ${TRADIER_SANDBOX_TOKEN}`, 'Accept': 'application/json' },
                    signal: AbortSignal.timeout(6000),
                }
            );
            if (!resp.ok) return null;
            const json = await resp.json();
            const dates = json.expirations?.date;
            if (!Array.isArray(dates) || dates.length === 0) return null;

            // Pick the nearest future expiration
            const today = new Date().toISOString().slice(0, 10);
            const nearest = dates.find(d => d >= today) || dates[0];

            const chainResp = await fetch(
                `https://sandbox.tradier.com/v1/markets/options/chains?symbol=${symbol}&expiration=${nearest}&greeks=true`,
                {
                    headers: { 'Authorization': `Bearer ${TRADIER_SANDBOX_TOKEN}`, 'Accept': 'application/json' },
                    signal: AbortSignal.timeout(8000),
                }
            );
            if (!chainResp.ok) return null;
            const chainJson = await chainResp.json();
            const options = chainJson.options?.option;
            if (!Array.isArray(options) || options.length === 0) return null;

            const calls = options.filter(o => o.option_type === 'call').map(parseTradierOption);
            const puts = options.filter(o => o.option_type === 'put').map(parseTradierOption);
            const underlying = options[0]?.underlying_price || 0;
            const is0DTE = nearest === today;

            console.log(`[DataEngine] Tradier nearest chain (${nearest}): ${calls.length}C / ${puts.length}P`);
            return { calls, puts, underlying, expiration: nearest, is0DTE, isReal: true, source: 'tradier' };
        } catch {
            return null;
        }
    }

    function parseTradierOption(o) {
        const greeks = o.greeks || {};
        return {
            strike: o.strike,
            bid: o.bid || 0,
            ask: o.ask || 0,
            mid: +((o.bid + o.ask) / 2).toFixed(2) || o.last || 0,
            last: o.last || 0,
            volume: o.volume || 0,
            openInterest: o.open_interest || 0,
            impliedVol: greeks.mid_iv || o.implied_volatility || 0,
            inTheMoney: o.strike ? (o.option_type === 'call' ? o.strike <= (o.underlying_price || 0) : o.strike >= (o.underlying_price || 0)) : false,
            change: o.change || 0,
            changePct: o.change_percentage || 0,
            // Real Greeks from ORATS
            delta: greeks.delta || null,
            gamma: greeks.gamma || null,
            theta: greeks.theta || null,
            vega: greeks.vega || null,
        };
    }

    // ── Yahoo options chain via CORS proxy (fallback) ─────────────
    async function yahooOptionsChain(symbol = 'SPY') {
        // Yahoo's options endpoint returns available expirations and the chain for the nearest one
        const url = `https://query2.finance.yahoo.com/v7/finance/options/${symbol}`;
        for (const proxy of CORS_PROXIES) {
            try {
                const resp = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(8000) });
                if (!resp.ok) continue;
                const json = await resp.json();
                const result = json.optionChain?.result?.[0];
                if (!result) continue;

                const expirations = result.expirationDates || [];
                const calls = (result.options?.[0]?.calls || []).map(parseYahooOption);
                const puts = (result.options?.[0]?.puts || []).map(parseYahooOption);
                const underlying = result.quote?.regularMarketPrice || 0;

                if (calls.length === 0 && puts.length === 0) continue;

                // Find today's expiration (0DTE) if available
                const todayUnix = Math.floor(new Date().setHours(16, 0, 0, 0) / 1000);
                const has0DTE = expirations.some(e => Math.abs(e - todayUnix) < 86400);

                // If the nearest expiration isn't today, try fetching today's specifically
                if (!has0DTE && expirations.length > 0) {
                    // Return what we have — it's the nearest expiration
                    return { calls, puts, underlying, expiration: expirations[0], is0DTE: false, isReal: true };
                }

                return { calls, puts, underlying, expiration: expirations[0], is0DTE: has0DTE, isReal: true };
            } catch { continue; }
        }
        return null;
    }

    // Fetch a specific expiration date's chain
    async function yahooOptionsChainForDate(symbol, expirationUnix) {
        const url = `https://query2.finance.yahoo.com/v7/finance/options/${symbol}?date=${expirationUnix}`;
        for (const proxy of CORS_PROXIES) {
            try {
                const resp = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(8000) });
                if (!resp.ok) continue;
                const json = await resp.json();
                const result = json.optionChain?.result?.[0];
                if (!result?.options?.[0]) continue;
                const calls = (result.options[0].calls || []).map(parseYahooOption);
                const puts = (result.options[0].puts || []).map(parseYahooOption);
                const underlying = result.quote?.regularMarketPrice || 0;
                if (calls.length === 0 && puts.length === 0) continue;
                return { calls, puts, underlying, expiration: expirationUnix, is0DTE: true, isReal: true };
            } catch { continue; }
        }
        return null;
    }

    function parseYahooOption(o) {
        return {
            strike: o.strike,
            bid: o.bid || 0,
            ask: o.ask || 0,
            mid: +((o.bid + o.ask) / 2).toFixed(2) || o.lastPrice || 0,
            last: o.lastPrice || 0,
            volume: o.volume || 0,
            openInterest: o.openInterest || 0,
            impliedVol: o.impliedVolatility || 0,
            inTheMoney: o.inTheMoney || false,
            change: o.change || 0,
            changePct: o.percentChange || 0,
        };
    }

    // ── Public API ───────────────────────────────────────────────────

    const CORE_SYMBOLS = ['SPY', '^VIX', 'QQQ', 'IWM', 'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLU'];
    const MEGA_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'];
    const OTHER_SYMBOLS = ['USO', 'TLT', 'GLD'];
    const SYMBOLS = [...CORE_SYMBOLS, ...MEGA_SYMBOLS, ...OTHER_SYMBOLS];

    async function fetchAllQuotes() {
        const key = 'allQuotes';
        const hit = cached(key);
        if (hit) {
            _usingSimulated = false;
            removeSimulatedWarning();
            return hit;
        }

        // 1) Try Finnhub
        console.log('[DataEngine] Trying Finnhub...');
        const fh = await finnhubAllQuotes(SYMBOLS);
        if (fh && fh.SPY) {
            console.log('[DataEngine] Finnhub OK — SPY $' + fh.SPY.price);
            _usingSimulated = false;
            removeSimulatedWarning();
            return setCache(key, fh);
        }

        // 2) Try Yahoo via CORS proxy
        console.log('[DataEngine] Trying Yahoo via CORS proxy...');
        const yh = await yahooQuote(SYMBOLS);
        if (yh && yh.SPY) {
            console.log('[DataEngine] Yahoo OK — SPY $' + yh.SPY.price);
            _usingSimulated = false;
            removeSimulatedWarning();
            return setCache(key, yh);
        }

        // 4) All failed — simulated
        console.log('[DataEngine] All APIs failed — using simulated data');
        _usingSimulated = true;
        showSimulatedWarning();
        return setCache(key, generateSimulatedQuotes());
    }

    async function fetchPriceChart(symbol = 'SPY', range = '1d', interval = '5m') {
        const key = `chart_${symbol}_${range}`;
        const hit = cached(key, 120_000);
        if (hit) return hit;

        const dayMap = { '1d': 1, '5d': 5, '1mo': 22, '3mo': 66 };
        const days = dayMap[range] || 1;

        // Try Finnhub candles
        const fh = await finnhubChart(symbol, days);
        if (fh && fh.length > 10) return setCache(key, fh, 120_000);

        // Try Yahoo chart
        const yh = await yahooChart(symbol, range, interval);
        if (yh && yh.length > 10) return setCache(key, yh, 120_000);

        // Fallback: use last known SPY price or 659
        const basePrice = cache.allQuotes?.data?.SPY?.price || 659;
        const intMap = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '1d': 390 };
        return setCache(key, generateSimulatedChart(basePrice, days, intMap[interval] || 5), 120_000);
    }

    async function fetchNews() {
        const key = 'news';
        const hit = cached(key, 300_000); // 5 min cache for news
        if (hit) return hit;

        // Try Finnhub market news + SPY-specific news
        console.log('[DataEngine] Fetching Finnhub news...');
        const [market, spy] = await Promise.all([
            finnhubNews(),
            finnhubCompanyNews('SPY'),
        ]);

        if (market && market.length > 0) {
            // Merge and deduplicate by title
            const all = [...(spy || []), ...market];
            const seen = new Set();
            const deduped = all.filter(a => {
                const k = a.title.slice(0, 50);
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            }).slice(0, 20);
            console.log(`[DataEngine] Got ${deduped.length} real news articles`);
            return setCache(key, deduped, 300_000);
        }

        // Fallback to simulated
        console.log('[DataEngine] News API failed — using simulated headlines');
        return setCache(key, generateSimulatedNews(), 300_000);
    }

    async function fetchOptionsChain(symbol = 'SPY') {
        const key = `options_${symbol}`;
        const hit = cached(key, 60_000); // 1 min cache
        if (hit) return hit;

        // 1) Try Tradier sandbox (CORS confirmed, has Greeks/IV from ORATS)
        console.log('[DataEngine] Trying Tradier options chain...');
        const tradier = await tradierOptionsChain(symbol);
        if (tradier && tradier.calls.length > 0) {
            return setCache(key, tradier, 60_000);
        }

        // 2) Fallback: Yahoo via CORS proxy
        console.log('[DataEngine] Trying Yahoo options chain via proxy...');
        const yahoo = await yahooOptionsChain(symbol);
        if (yahoo) {
            // If we didn't get 0DTE, try fetching today's specifically
            if (!yahoo.is0DTE && yahoo.expiration) {
                const todayMidnight = new Date();
                todayMidnight.setHours(0, 0, 0, 0);
                const todayUnix = Math.floor(todayMidnight.getTime() / 1000);
                const todayChain = await yahooOptionsChainForDate(symbol, todayUnix);
                if (todayChain) {
                    todayChain.source = 'yahoo';
                    return setCache(key, todayChain, 60_000);
                }
            }
            yahoo.source = 'yahoo';
            return setCache(key, yahoo, 60_000);
        }

        console.log('[DataEngine] Options chain: all sources failed');
        return null;
    }

    function isUsingSimulatedData() { return _usingSimulated; }

    // US market holidays (observed dates, month is 0-indexed)
    function isMarketHoliday(ny) {
        const y = ny.getFullYear(), m = ny.getMonth(), d = ny.getDate(), dow = ny.getDay();
        // Fixed holidays (observed: if Sat→Fri, if Sun→Mon)
        const fixed = [[0,1],[6,4],[12,25]]; // New Year, July 4, Christmas (month+1 for readability)
        // Actually let's just list known holidays for current + next year
        // MLK: 3rd Mon Jan, Presidents: 3rd Mon Feb, Good Friday: varies,
        // Memorial: last Mon May, Juneteenth: Jun 19, Labor: 1st Mon Sep,
        // Thanksgiving: 4th Thu Nov
        const nthDow = (month, weekday, n) => {
            const first = new Date(y, month, 1);
            let day = first.getDay();
            let date = 1 + ((weekday - day + 7) % 7) + (n - 1) * 7;
            return date;
        };
        const lastDow = (month, weekday) => {
            const last = new Date(y, month + 1, 0);
            const diff = (last.getDay() - weekday + 7) % 7;
            return last.getDate() - diff;
        };
        const holidays = [
            [0, 1],                          // New Year's Day
            [0, nthDow(0, 1, 3)],            // MLK Day
            [1, nthDow(1, 1, 3)],            // Presidents Day
            [4, lastDow(4, 1)],              // Memorial Day
            [5, 19],                          // Juneteenth
            [6, 4],                           // Independence Day
            [8, nthDow(8, 1, 1)],            // Labor Day
            [10, nthDow(10, 4, 4)],          // Thanksgiving
            [11, 25],                         // Christmas
        ];
        // Check observed: if holiday falls on Sat, observed Fri; Sun, observed Mon
        for (const [hm, hd] of holidays) {
            const hDate = new Date(y, hm, hd);
            let obsD = hd, obsM = hm;
            if (hDate.getDay() === 6) { obsD--; } // Saturday → Friday
            if (hDate.getDay() === 0) { obsD++; } // Sunday → Monday
            if (m === obsM && d === obsD) return true;
        }
        return false;
    }

    function getMarketStatus() {
        const now = new Date();
        const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const day = ny.getDay();
        const h = ny.getHours();
        const min = ny.getMinutes();
        const t = h + min / 60;
        const holiday = day >= 1 && day <= 5 && isMarketHoliday(ny);

        // Next open calculation
        function nextOpen() {
            const next = new Date(ny);
            if (t >= 9.5 && t < 16 && !holiday && day > 0 && day < 6) {
                return null; // market is open now
            }
            // Advance to next weekday 9:30
            if (t >= 9.5 || holiday || day === 0 || day === 6) {
                next.setDate(next.getDate() + 1);
            }
            while (next.getDay() === 0 || next.getDay() === 6 || isMarketHoliday(next)) {
                next.setDate(next.getDate() + 1);
            }
            next.setHours(9, 30, 0, 0);
            return next;
        }

        function timeUntil(target) {
            if (!target) return '';
            const diff = target - ny;
            if (diff <= 0) return '';
            const hrs = Math.floor(diff / 3600000);
            const mins = Math.floor((diff % 3600000) / 60000);
            if (hrs > 24) {
                const days = Math.floor(hrs / 24);
                return `${days}d ${hrs % 24}h`;
            }
            return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
        }

        const no = nextOpen();
        const opensIn = timeUntil(no);
        const hoursToClose = Math.max(0, 16 - t);
        const minutesToClose = Math.max(0, Math.round(hoursToClose * 60));

        if (day === 0 || day === 6) return { status: 'closed', label: 'Weekend', opensIn, session: 'closed' };
        if (holiday) return { status: 'closed', label: 'Holiday', opensIn, session: 'closed' };
        if (t < 4) return { status: 'closed', label: 'Closed', opensIn, session: 'closed' };
        if (t < 9.5) return { status: 'premarket', label: 'Pre-Market', opensIn, session: 'premarket' };
        if (t < 16) return { status: 'open', label: 'Open', hoursToClose, minutesToClose, session: 'regular' };
        if (t < 20) return { status: 'afterhours', label: 'After Hours', opensIn, session: 'afterhours' };
        return { status: 'closed', label: 'Closed', opensIn, session: 'closed' };
    }

    return { fetchAllQuotes, fetchPriceChart, fetchNews, fetchOptionsChain, getMarketStatus, isUsingSimulatedData, SYMBOLS };
})();
