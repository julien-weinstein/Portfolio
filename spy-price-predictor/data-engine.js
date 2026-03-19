/**
 * Data Engine — Fetches market data with multiple fallback strategies.
 */

const DataEngine = (() => {
    const cache = {};
    const CACHE_TTL = 60_000;

    function cached(key, ttl = CACHE_TTL) {
        const entry = cache[key];
        if (entry && Date.now() - entry.ts < ttl) return entry.data;
        return null;
    }

    function setCache(key, data) {
        cache[key] = { data, ts: Date.now() };
        return data;
    }

    // Multiple CORS proxies for reliability
    const CORS_PROXIES = [
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://cors-anywhere.herokuapp.com/',
        'https://thingproxy.freeboard.io/fetch/',
    ];

    async function tryFetchWithProxies(targetUrl) {
        // Try direct first (works in some environments)
        try {
            const resp = await fetch(targetUrl, { signal: AbortSignal.timeout(5000) });
            if (resp.ok) return await resp.json();
        } catch {}

        // Then try each proxy
        for (const proxy of CORS_PROXIES) {
            try {
                const url = proxy + encodeURIComponent(targetUrl);
                const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
                if (resp.ok) return await resp.json();
            } catch {
                continue;
            }
        }
        return null;
    }

    async function yahooQuote(symbols) {
        const key = `yq_${symbols.join(',')}`;
        const hit = cached(key);
        if (hit) return hit;

        try {
            const json = await tryFetchWithProxies(
                `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}`
            );
            if (!json) return null;
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
            return setCache(key, results);
        } catch {
            return null;
        }
    }

    async function yahooChart(symbol, range = '5d', interval = '5m') {
        const key = `yc_${symbol}_${range}_${interval}`;
        const hit = cached(key, 120_000);
        if (hit) return hit;

        try {
            const json = await tryFetchWithProxies(
                `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`
            );
            if (!json) return null;
            const result = json.chart?.result?.[0];
            if (!result) return null;
            const ts = result.timestamp || [];
            const q = result.indicators?.quote?.[0] || {};
            const data = ts.map((t, i) => ({
                time: t * 1000,
                open: q.open?.[i],
                high: q.high?.[i],
                low: q.low?.[i],
                close: q.close?.[i],
                volume: q.volume?.[i],
            })).filter(d => d.close != null);
            return setCache(key, data);
        } catch {
            return null;
        }
    }

    // ── Simulated fallback data ──────────────────────────────────────
    function generateSimulatedQuotes() {
        const baseSpyPrice = 659 + Math.random() * 4 - 2; // ~657-661 range (Mar 2026)
        const vixBase = 14 + Math.random() * 8;

        function makeQuote(base, volatility) {
            const change = (Math.random() - 0.48) * volatility;
            return {
                price: +(base + change).toFixed(2),
                change: +change.toFixed(2),
                changePct: +((change / base) * 100).toFixed(2),
                high: +(base + Math.abs(change) + Math.random() * volatility * 0.3).toFixed(2),
                low: +(base - Math.abs(change) - Math.random() * volatility * 0.3).toFixed(2),
                open: +(base + (Math.random() - 0.5) * volatility * 0.5).toFixed(2),
                prevClose: +base.toFixed(2),
                volume: Math.floor(30_000_000 + Math.random() * 50_000_000),
                fiftyDayAvg: +(base - 2 + Math.random() * 4).toFixed(2),
                twoHundredDayAvg: +(base - 10 + Math.random() * 8).toFixed(2),
                avgVolume: Math.floor(40_000_000 + Math.random() * 20_000_000),
            };
        }

        return {
            SPY: makeQuote(baseSpyPrice, 4),
            '^VIX': { price: +vixBase.toFixed(2), change: +(Math.random() * 2 - 1).toFixed(2), changePct: +((Math.random() * 2 - 1) / vixBase * 100).toFixed(2) },
            QQQ: makeQuote(565 + Math.random() * 8, 5),
            IWM: makeQuote(242 + Math.random() * 6, 3),
            XLF: makeQuote(53 + Math.random() * 2, 1),
            XLE: makeQuote(93 + Math.random() * 3, 2),
            XLK: makeQuote(252 + Math.random() * 6, 4),
            XLV: makeQuote(161 + Math.random() * 3, 2),
            XLI: makeQuote(139 + Math.random() * 3, 2),
            XLU: makeQuote(81 + Math.random() * 2, 1),
            USO: makeQuote(73 + Math.random() * 3, 2),
            TLT: makeQuote(89 + Math.random() * 2, 1),
            GLD: makeQuote(292 + Math.random() * 6, 3),
            DXY: makeQuote(103 + Math.random() * 2, 0.8),
            AAPL: makeQuote(247 + Math.random() * 6, 4),
            MSFT: makeQuote(458 + Math.random() * 10, 6),
            NVDA: makeQuote(147 + Math.random() * 8, 7),
            AMZN: makeQuote(237 + Math.random() * 6, 4),
            GOOGL: makeQuote(197 + Math.random() * 5, 3),
            META: makeQuote(685 + Math.random() * 12, 8),
            TSLA: makeQuote(283 + Math.random() * 12, 8),
        };
    }

    function generateSimulatedChart(basePrice, days, intervalMinutes) {
        const data = [];
        const now = Date.now();
        const msPerBar = intervalMinutes * 60_000;
        const barsPerDay = Math.floor((6.5 * 60) / intervalMinutes);
        const totalBars = barsPerDay * days;
        let price = basePrice - (Math.random() * 4);

        for (let i = totalBars; i >= 0; i--) {
            const time = now - i * msPerBar;
            const d = new Date(time);
            if (d.getDay() === 0 || d.getDay() === 6) continue;

            const drift = (basePrice - price) * 0.002;
            const vol = basePrice * 0.001 * (1 + Math.random());
            price += drift + (Math.random() - 0.48) * vol;

            const barVol = vol * (0.5 + Math.random());
            data.push({
                time,
                open: +(price - barVol * 0.3).toFixed(2),
                high: +(price + barVol * 0.7).toFixed(2),
                low: +(price - barVol * 0.7).toFixed(2),
                close: +price.toFixed(2),
                volume: Math.floor(200_000 + Math.random() * 500_000),
            });
        }
        return data;
    }

    function generateSimulatedNews() {
        const headlines = [
            { title: 'Fed officials signal patience on rate cuts', sentiment: -0.3, category: 'macro' },
            { title: 'Tech earnings beat expectations', sentiment: 0.6, category: 'earnings' },
            { title: 'Oil prices rise on supply concerns', sentiment: -0.2, category: 'geopolitical' },
            { title: 'Jobs report beats consensus', sentiment: 0.4, category: 'macro' },
            { title: 'NVIDIA surges on AI chip demand', sentiment: 0.7, category: 'tech' },
            { title: 'Treasury yields climb', sentiment: -0.2, category: 'bonds' },
            { title: 'Consumer confidence rises', sentiment: 0.3, category: 'macro' },
            { title: 'Semiconductor rally on AI outlook', sentiment: 0.55, category: 'tech' },
            { title: 'S&P 500 earnings beat rate at 78%', sentiment: 0.5, category: 'earnings' },
            { title: 'Put/call ratio elevated ahead of FOMC', sentiment: -0.35, category: 'sentiment' },
        ];

        const shuffled = headlines.sort(() => Math.random() - 0.5);
        return shuffled.slice(0, 7).map((h, i) => ({
            ...h,
            time: Date.now() - i * 15 * 60_000 - Math.random() * 30 * 60_000,
        }));
    }

    const SYMBOLS = ['SPY', '^VIX', 'QQQ', 'IWM', 'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLU',
                     'USO', 'TLT', 'GLD', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'];

    async function fetchAllQuotes() {
        const live = await yahooQuote(SYMBOLS);
        if (live && Object.keys(live).length > 5) return live;
        console.log('[DataEngine] Using simulated quote data');
        return generateSimulatedQuotes();
    }

    async function fetchPriceChart(symbol = 'SPY', range = '5d', interval = '5m') {
        const live = await yahooChart(symbol, range, interval);
        if (live && live.length > 10) return live;
        console.log(`[DataEngine] Using simulated chart for ${symbol}`);
        const dayMap = { '1d': 1, '5d': 5, '1mo': 22, '3mo': 66 };
        const intMap = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '1d': 390 };
        return generateSimulatedChart(659, dayMap[range] || 5, intMap[interval] || 5);
    }

    function fetchNews() { return generateSimulatedNews(); }

    function getMarketStatus() {
        const now = new Date();
        const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const day = ny.getDay();
        const t = ny.getHours() + ny.getMinutes() / 60;
        if (day === 0 || day === 6) return { status: 'closed', label: 'Closed' };
        if (t < 4) return { status: 'closed', label: 'Closed' };
        if (t < 9.5) return { status: 'premarket', label: 'Pre-Market' };
        if (t < 16) return { status: 'open', label: 'Open' };
        if (t < 20) return { status: 'afterhours', label: 'After Hours' };
        return { status: 'closed', label: 'Closed' };
    }

    return { fetchAllQuotes, fetchPriceChart, fetchNews, getMarketStatus, SYMBOLS };
})();
