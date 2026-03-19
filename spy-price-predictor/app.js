/**
 * App — Main controller
 *
 * Market-session aware: adjusts UI, recommendations, and refresh rate
 * based on whether market is open, pre-market, after-hours, or closed.
 */
(async function () {
    'use strict';

    let quotes = {}, chartData = [], ta = null, prediction = null, news = [], strategy = null;
    let priceChart = null;
    let marketStatus = null;
    let refreshTimer = null;

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    async function init() {
        marketStatus = DataEngine.getMarketStatus();
        updateMarketStatusUI();
        await refresh();
        setInterval(updateMarketStatusAndSchedule, 30_000);
        scheduleRefresh();
    }

    function scheduleRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);
        const s = marketStatus?.session;
        // Faster polling during market hours, slower otherwise
        const interval = s === 'regular' ? 60_000
            : s === 'premarket' ? 90_000
            : s === 'afterhours' ? 120_000
            : 300_000; // closed: every 5 min
        refreshTimer = setInterval(refresh, interval);
    }

    function updateMarketStatusAndSchedule() {
        const prev = marketStatus?.session;
        marketStatus = DataEngine.getMarketStatus();
        updateMarketStatusUI();
        // Re-schedule if session changed (e.g. pre-market → open)
        if (marketStatus.session !== prev) {
            scheduleRefresh();
            refresh(); // immediate refresh on session change
        }
    }

    async function refresh() {
        try {
            marketStatus = DataEngine.getMarketStatus();
            [quotes, news] = await Promise.all([
                DataEngine.fetchAllQuotes(),
                Promise.resolve(DataEngine.fetchNews()),
            ]);
            chartData = await DataEngine.fetchPriceChart('SPY', '1d', '5m');
            ta = TechnicalAnalysis.analyze(chartData);

            // Only run prediction/strategy during actionable sessions
            if (marketStatus.session === 'regular') {
                prediction = PredictionEngine.predict(ta, quotes, news);
                strategy = OptionsStrategy.generateStrategy(prediction);
            } else {
                prediction = null;
                strategy = null;
            }

            render();
            document.getElementById('lastUpdate').textContent =
                new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }) + ' ET';
        } catch (err) {
            console.error('[App]', err);
        }
    }

    function updateMarketStatusUI() {
        const s = marketStatus || DataEngine.getMarketStatus();
        const el = document.getElementById('marketStatus');
        let label = s.label;
        if (s.opensIn && s.session !== 'regular') {
            label += ` · Opens in ${s.opensIn}`;
        }
        if (s.session === 'regular' && s.minutesToClose != null) {
            const h = Math.floor(s.minutesToClose / 60);
            const m = s.minutesToClose % 60;
            label += ` · ${h}h ${m}m to close`;
        }
        el.querySelector('.status-text').textContent = label;
        el.className = 'market-status ' + s.status;
    }

    function render() {
        renderPriceBar();
        renderRecommendation();
        renderTimingBar();
        renderChart();
        renderFactors();
    }

    function renderPriceBar() {
        const spy = quotes.SPY;
        if (!spy) return;

        const priceEl = document.getElementById('spyPrice');
        const prevPrice = priceEl.textContent;
        const newPrice = '$' + spy.price?.toFixed(2);
        priceEl.textContent = newPrice;

        // Flash on price change
        if (prevPrice !== '—' && prevPrice !== newPrice) {
            priceEl.classList.add('flash');
            setTimeout(() => priceEl.classList.remove('flash'), 600);
        }

        const ch = document.getElementById('spyChange');
        const session = marketStatus?.session;
        let changePrefix = '';
        if (session === 'premarket') changePrefix = 'PM ';
        else if (session === 'afterhours') changePrefix = 'AH ';

        ch.textContent = `${changePrefix}${spy.change > 0 ? '+' : ''}${spy.change?.toFixed(2)} (${spy.changePct > 0 ? '+' : ''}${spy.changePct?.toFixed(2)}%)`;
        ch.className = 'price-change ' + (spy.change >= 0 ? 'up' : 'down');

        const vix = quotes['^VIX'];
        if (vix) document.getElementById('vixValue').textContent = vix.price?.toFixed(1);

        if (strategy) {
            document.getElementById('ivValue').textContent = strategy.iv + '%';
        } else {
            document.getElementById('ivValue').textContent = '—';
        }

        if (prediction) {
            document.getElementById('rangeValue').textContent =
                '$' + prediction.predictedLow + ' – $' + prediction.predictedHigh;
        } else {
            document.getElementById('rangeValue').textContent = '—';
        }
    }

    function renderRecommendation() {
        const card = document.getElementById('recCard');
        const signal = document.getElementById('recSignal');
        const details = document.getElementById('recDetails');
        const session = marketStatus?.session;

        // ── Non-trading sessions: show appropriate message ──
        if (session !== 'regular') {
            card.className = 'rec-card session-info';
            if (session === 'premarket') {
                signal.innerHTML = `<span class="session-icon">&#9788;</span> PRE-MARKET`;
                const opensIn = marketStatus.opensIn || '';
                details.innerHTML = `
                    <div class="rec-reason">0DTE options begin trading at <b>9:30 AM ET</b>.</div>
                    ${opensIn ? `<div class="session-countdown">Market opens in <b>${opensIn}</b></div>` : ''}
                    <div class="session-hint">Pre-market data is being collected for the opening analysis.</div>
                `;
            } else if (session === 'afterhours') {
                signal.innerHTML = `<span class="session-icon">&#9790;</span> AFTER HOURS`;
                details.innerHTML = `
                    <div class="rec-reason">Today's 0DTE contracts have <b>expired</b>.</div>
                    <div class="session-hint">After-hours price shown above. No 0DTE recommendations until next market open.</div>
                `;
            } else {
                // closed (weekend, holiday, overnight)
                const label = marketStatus?.label || 'Closed';
                signal.innerHTML = `<span class="session-icon">&#9211;</span> MARKET ${label.toUpperCase()}`;
                const opensIn = marketStatus.opensIn || '';
                details.innerHTML = `
                    <div class="rec-reason">0DTE options are not available outside regular trading hours.</div>
                    ${opensIn ? `<div class="session-countdown">Next session opens in <b>${opensIn}</b></div>` : ''}
                    <div class="session-hint">Showing last available closing data above.</div>
                `;
            }
            return;
        }

        // ── Regular session ──
        if (!prediction || !strategy) {
            card.className = 'rec-card';
            signal.textContent = 'ANALYZING...';
            details.innerHTML = '';
            return;
        }

        const rec = strategy.recommendation;

        if (!rec) {
            card.className = 'rec-card neutral';
            signal.textContent = 'NO TRADE';
            details.innerHTML = '<div class="rec-reason">Signals are mixed — sit this one out.</div>';
            return;
        }

        const dir = rec.direction;
        card.className = 'rec-card ' + (dir === 'CALL' ? 'bullish' : 'bearish');
        signal.innerHTML = `
            <span class="rec-action">BUY</span>
            <span class="rec-strike">${rec.strike}</span>
            <span class="rec-type">${dir}</span>
        `;

        details.innerHTML = `
            <div class="rec-stats">
                <div class="rec-stat main">
                    <span class="rec-stat-value">${rec.probITM}%</span>
                    <span class="rec-stat-label">Prob ITM</span>
                </div>
                <div class="rec-stat">
                    <span class="rec-stat-value">${rec.probProfit}%</span>
                    <span class="rec-stat-label">Prob Profit</span>
                </div>
                <div class="rec-stat">
                    <span class="rec-stat-value">$${rec.premium}</span>
                    <span class="rec-stat-label">Premium</span>
                </div>
                <div class="rec-stat">
                    <span class="rec-stat-value">$${rec.breakeven}</span>
                    <span class="rec-stat-label">Breakeven</span>
                </div>
            </div>
            <div class="rec-risk">
                <span>Stop: <b class="red">$${rec.stopLoss}</b></span>
                <span>Target: <b class="green">$${rec.target}</b></span>
                <span>Confidence: <b>${prediction.confidence}%</b></span>
                <span>Risk: <b>${prediction.riskLevel}</b></span>
            </div>
        `;
    }

    function renderTimingBar() {
        const timing = document.getElementById('timingBar');
        const session = marketStatus?.session;

        if (session !== 'regular') {
            timing.textContent = '';
            timing.className = 'timing-bar hidden';
            return;
        }

        if (strategy) {
            timing.textContent = strategy.timing;
            timing.className = 'timing-bar ' + (strategy.hoursToClose < 1 ? 'warn' : '');
        } else {
            timing.textContent = '';
            timing.className = 'timing-bar hidden';
        }
    }

    function renderChart() {
        if (!chartData?.length) return;
        const ctx = document.getElementById('priceChart').getContext('2d');
        const labels = chartData.map(d => d.time);
        const closes = chartData.map(d => d.close);
        const vwap = ta?.series?.vwap || [];

        if (priceChart) priceChart.destroy();

        const session = marketStatus?.session;
        const lineColor = session === 'regular' ? '#00d4ff'
            : session === 'premarket' ? '#ffcc00'
            : session === 'afterhours' ? '#8866ff'
            : '#556677';

        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'SPY', data: closes, borderColor: lineColor, backgroundColor: hexToRgba(lineColor, 0.04), borderWidth: 2, pointRadius: 0, fill: true, tension: 0.1 },
                    ...(session === 'regular' ? [{ label: 'VWAP', data: vwap, borderColor: 'rgba(255,165,0,0.6)', borderWidth: 1.5, borderDash: [5, 3], pointRadius: 0, fill: false }] : []),
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: true, position: 'top', labels: { color: '#666', font: { size: 11 }, usePointStyle: true, pointStyle: 'line' } },
                },
                scales: {
                    x: { type: 'time', time: { tooltipFormat: 'HH:mm' }, ticks: { color: '#444', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.03)' } },
                    y: { ticks: { color: '#444' }, grid: { color: 'rgba(255,255,255,0.03)' } },
                },
            },
        });
    }

    function renderFactors() {
        const panel = document.querySelector('.factors-panel');
        const list = document.getElementById('factorList');

        if (!prediction || marketStatus?.session !== 'regular') {
            panel.style.display = 'none';
            return;
        }
        panel.style.display = '';

        const names = {
            technical: 'Technical', volatility: 'Volatility', crossAsset: 'Cross-Asset',
            sector: 'Sectors', megaCap: 'Mega-Caps', sentiment: 'Sentiment',
            microstructure: 'Microstructure', intraday: 'Intraday',
        };

        let html = '';
        Object.entries(prediction.factors).forEach(([key, factor]) => {
            const score = factor.score || 0;
            const weight = (prediction.weights[key] * 100).toFixed(0);
            const cls = score > 0.1 ? 'bullish' : score < -0.1 ? 'bearish' : 'neutral';
            const pct = ((score + 1) / 2 * 100).toFixed(0);

            html += `
                <div class="factor">
                    <div class="factor-head">
                        <span>${names[key]} <span class="factor-wt">${weight}%</span></span>
                        <span class="factor-val ${cls}">${score > 0 ? '+' : ''}${score.toFixed(2)}</span>
                    </div>
                    <div class="factor-bar-bg">
                        <div class="factor-bar ${cls}" style="width: ${pct}%"></div>
                        <div class="factor-mid"></div>
                    </div>
                </div>
            `;
        });

        list.innerHTML = html;
    }

    init();
})();
