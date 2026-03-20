/**
 * App — Main controller
 *
 * Market-session aware: adjusts UI, recommendations, and refresh rate.
 * Now includes pre-market trade planning with entry timing and sell targets.
 */
(async function () {
    'use strict';

    let quotes = {}, chartData = [], ta = null, prediction = null, news = [], strategy = null;
    let optionsChain = null;
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
        const interval = s === 'regular' ? 60_000
            : s === 'premarket' ? 90_000
            : s === 'afterhours' ? 120_000
            : 300_000;
        refreshTimer = setInterval(refresh, interval);
    }

    function updateMarketStatusAndSchedule() {
        const prev = marketStatus?.session;
        marketStatus = DataEngine.getMarketStatus();
        updateMarketStatusUI();
        if (marketStatus.session !== prev) {
            scheduleRefresh();
            refresh();
        }
    }

    async function refresh() {
        try {
            marketStatus = DataEngine.getMarketStatus();
            [quotes, news] = await Promise.all([
                DataEngine.fetchAllQuotes(),
                DataEngine.fetchNews(),
            ]);
            chartData = await DataEngine.fetchPriceChart('SPY', '1d', '5m');
            ta = TechnicalAnalysis.analyze(chartData);

            const session = marketStatus.session;

            if (session === 'regular' || session === 'premarket') {
                // Fetch options chain during regular and pre-market
                optionsChain = await DataEngine.fetchOptionsChain('SPY').catch(() => null);
                prediction = PredictionEngine.predict(ta, quotes, news, optionsChain, session);
                strategy = OptionsStrategy.generateStrategy(prediction, optionsChain);
            } else {
                optionsChain = null;
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

        if (prevPrice !== '--' && prevPrice !== newPrice) {
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
            document.getElementById('ivValue').textContent = '--';
        }

        if (prediction) {
            document.getElementById('rangeValue').textContent =
                '$' + prediction.predictedLow + ' - $' + prediction.predictedHigh;
        } else {
            document.getElementById('rangeValue').textContent = '--';
        }
    }

    function renderRecommendation() {
        const card = document.getElementById('recCard');
        const signal = document.getElementById('recSignal');
        const details = document.getElementById('recDetails');
        const session = marketStatus?.session;

        // ── Pre-market: show trade plan ──
        if (session === 'premarket' && prediction && strategy) {
            const rec = strategy.recommendation;
            const entry = prediction.entryTiming;

            if (!rec) {
                card.className = 'rec-card session-info';
                signal.innerHTML = 'PRE-MARKET ANALYSIS';
                details.innerHTML = `
                    <div class="rec-reason">Signals are mixed. No high-conviction trade setup detected yet.</div>
                    <div class="session-hint">Monitoring pre-market data. Check back closer to open for updated analysis.</div>
                `;
                return;
            }

            const dir = rec.direction;
            card.className = 'rec-card ' + (dir === 'CALL' ? 'bullish' : 'bearish');
            signal.innerHTML = `
                <span class="rec-action">TRADE PLAN</span>
                <span class="rec-strike">${rec.strike}</span>
                <span class="rec-type">${dir}</span>
            `;

            details.innerHTML = `
                <div class="data-badge premarket">Pre-Market Analysis</div>

                <div class="trade-plan">
                    <div class="plan-section">
                        <div class="plan-label">Entry</div>
                        <div class="plan-row">
                            <div class="plan-item">
                                <span class="plan-value highlight">${entry.entryTime}</span>
                                <span class="plan-meta">Optimal Entry</span>
                            </div>
                            <div class="plan-item">
                                <span class="plan-value">~$${rec.premium}</span>
                                <span class="plan-meta">Est. Premium</span>
                            </div>
                        </div>
                        <div class="plan-note">${entry.entryReason}</div>
                    </div>

                    <div class="plan-section">
                        <div class="plan-label">Targets</div>
                        <div class="plan-row">
                            <div class="plan-item green">
                                <span class="plan-value">$${rec.target1}</span>
                                <span class="plan-meta">Take 50% (+${rec.target1Pct}%)</span>
                            </div>
                            <div class="plan-item green">
                                <span class="plan-value">$${rec.target2}</span>
                                <span class="plan-meta">Trail rest (+${rec.target2Pct}%)</span>
                            </div>
                            <div class="plan-item red">
                                <span class="plan-value">$${rec.stopLoss}</span>
                                <span class="plan-meta">Stop Loss</span>
                            </div>
                        </div>
                    </div>

                    <div class="plan-section">
                        <div class="plan-label">Exit Timing</div>
                        <div class="plan-row">
                            <div class="plan-item">
                                <span class="plan-value">${rec.sellBy}</span>
                                <span class="plan-meta">Sell By</span>
                            </div>
                            <div class="plan-item">
                                <span class="plan-value">${rec.momentum}</span>
                                <span class="plan-meta">Signal Strength</span>
                            </div>
                        </div>
                    </div>
                </div>

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
                        <span class="rec-stat-value">$${rec.breakeven}</span>
                        <span class="rec-stat-label">Breakeven</span>
                    </div>
                    <div class="rec-stat">
                        <span class="rec-stat-value">${prediction.confidence}%</span>
                        <span class="rec-stat-label">Confidence</span>
                    </div>
                </div>

                <div class="rec-risk">
                    <span>Risk: <b>${prediction.riskLevel}</b></span>
                    <span>Range: <b>$${prediction.predictedLow} - $${prediction.predictedHigh}</b></span>
                </div>
            `;
            return;
        }

        // ── Non-trading sessions (after-hours, closed) ──
        if (session !== 'regular' && session !== 'premarket') {
            card.className = 'rec-card session-info';
            if (session === 'afterhours') {
                signal.innerHTML = 'AFTER HOURS';
                details.innerHTML = `
                    <div class="rec-reason">Today's 0DTE contracts have <b>expired</b>.</div>
                    <div class="session-hint">After-hours price shown above. Pre-market analysis begins at 4:00 AM ET.</div>
                `;
            } else {
                const label = marketStatus?.label || 'Closed';
                signal.innerHTML = `MARKET ${label.toUpperCase()}`;
                const opensIn = marketStatus.opensIn || '';
                details.innerHTML = `
                    <div class="rec-reason">0DTE options are not available outside trading hours.</div>
                    ${opensIn ? `<div class="session-countdown">Next session in <b>${opensIn}</b></div>` : ''}
                    <div class="session-hint">Pre-market analysis with trade plan will appear when pre-market opens.</div>
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
            details.innerHTML = '<div class="rec-reason">Signals are mixed. No high-conviction setup detected.</div>';
            return;
        }

        const dir = rec.direction;
        card.className = 'rec-card ' + (dir === 'CALL' ? 'bullish' : 'bearish');
        signal.innerHTML = `
            <span class="rec-action">BUY</span>
            <span class="rec-strike">${rec.strike}</span>
            <span class="rec-type">${dir}</span>
        `;

        const premiumDisplay = rec.fromChain && rec.bid != null
            ? `$${rec.bid}/$${rec.ask}`
            : `$${rec.premium}`;
        const premiumLabel = rec.fromChain ? 'Bid/Ask' : 'Est. Premium';

        const chainExtras = rec.fromChain ? `
            <div class="rec-stat">
                <span class="rec-stat-value">${rec.volume?.toLocaleString() || '--'}</span>
                <span class="rec-stat-label">Volume</span>
            </div>
            <div class="rec-stat">
                <span class="rec-stat-value">${rec.openInterest?.toLocaleString() || '--'}</span>
                <span class="rec-stat-label">Open Int</span>
            </div>` : '';

        const sourceLabel = rec.fromChain
            ? `Live Chain${strategy.chainUsed && optionsChain?.source === 'tradier' ? ' (Tradier)' : strategy.chainUsed && optionsChain?.source === 'yahoo' ? ' (Yahoo)' : ''}`
            : 'Estimated';

        details.innerHTML = `
            <div class="data-badge ${rec.fromChain ? 'live' : 'est'}">${sourceLabel}</div>

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
                    <span class="rec-stat-value">${premiumDisplay}</span>
                    <span class="rec-stat-label">${premiumLabel}</span>
                </div>
                <div class="rec-stat">
                    <span class="rec-stat-value">$${rec.breakeven}</span>
                    <span class="rec-stat-label">Breakeven</span>
                </div>
                ${chainExtras}
            </div>

            <div class="trade-plan compact">
                <div class="plan-section">
                    <div class="plan-label">Trade Management</div>
                    <div class="plan-row">
                        <div class="plan-item green">
                            <span class="plan-value">$${rec.target1}</span>
                            <span class="plan-meta">Take 50% (+${rec.target1Pct}%)</span>
                        </div>
                        <div class="plan-item green">
                            <span class="plan-value">$${rec.target2}</span>
                            <span class="plan-meta">Trail rest (+${rec.target2Pct}%)</span>
                        </div>
                        <div class="plan-item red">
                            <span class="plan-value">$${rec.stopLoss}</span>
                            <span class="plan-meta">Stop Loss</span>
                        </div>
                        <div class="plan-item">
                            <span class="plan-value">${rec.sellBy}</span>
                            <span class="plan-meta">Sell By</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="rec-risk">
                <span>Confidence: <b>${prediction.confidence}%</b></span>
                <span>Risk: <b>${prediction.riskLevel}</b></span>
                <span>Strength: <b>${rec.momentum}</b></span>
            </div>
        `;
    }

    function renderTimingBar() {
        const timing = document.getElementById('timingBar');
        const session = marketStatus?.session;

        if (session !== 'regular' && session !== 'premarket') {
            timing.textContent = '';
            timing.className = 'timing-bar hidden';
            return;
        }

        if (strategy) {
            timing.textContent = strategy.timing;
            const warn = session === 'regular' && strategy.hoursToClose < 1;
            const premarket = session === 'premarket';
            timing.className = 'timing-bar' + (warn ? ' warn' : '') + (premarket ? ' premarket' : '');
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

        const firstClose = closes[0] || 0;
        const lastClose = closes[closes.length - 1] || 0;
        const isUp = lastClose >= firstClose;
        const lineColor = session === 'premarket' ? '#a78bfa'
            : session === 'afterhours' ? '#a78bfa'
            : session === 'closed' ? '#71717a'
            : isUp ? '#10b981' : '#f43f5e';

        const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.clientHeight || 280);
        gradient.addColorStop(0, hexToRgba(lineColor, 0.12));
        gradient.addColorStop(0.7, hexToRgba(lineColor, 0.01));
        gradient.addColorStop(1, 'transparent');

        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'SPY',
                        data: closes,
                        borderColor: lineColor,
                        backgroundColor: gradient,
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                        pointHoverBackgroundColor: lineColor,
                        fill: true,
                        tension: 0.3,
                    },
                    ...(session === 'regular' ? [{
                        label: 'VWAP',
                        data: vwap,
                        borderColor: 'rgba(161, 161, 170, 0.35)',
                        borderWidth: 1,
                        borderDash: [4, 4],
                        pointRadius: 0,
                        fill: false,
                    }] : []),
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#71717a',
                            font: { family: 'Inter, sans-serif', size: 11, weight: '500' },
                            usePointStyle: true,
                            pointStyle: 'line',
                            padding: 20,
                        },
                    },
                    tooltip: {
                        backgroundColor: '#18181b',
                        titleColor: '#a1a1aa',
                        bodyColor: '#fafafa',
                        borderColor: 'rgba(255,255,255,0.06)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        titleFont: { family: 'Inter, sans-serif', size: 11, weight: '500' },
                        bodyFont: { family: 'Inter, sans-serif', size: 13, weight: '600' },
                        displayColors: false,
                        callbacks: {
                            label: (c) => '$' + c.parsed.y?.toFixed(2),
                        },
                    },
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { tooltipFormat: 'h:mm a' },
                        ticks: {
                            color: '#52525b',
                            maxTicksLimit: 7,
                            font: { family: 'Inter, sans-serif', size: 11 },
                        },
                        grid: { display: false },
                        border: { display: false },
                    },
                    y: {
                        ticks: {
                            color: '#52525b',
                            font: { family: 'Inter, sans-serif', size: 11 },
                            callback: (v) => '$' + v.toFixed(0),
                        },
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        border: { display: false },
                    },
                },
            },
        });
    }

    function renderFactors() {
        const panel = document.querySelector('.factors-panel');
        const list = document.getElementById('factorList');

        if (!prediction || (marketStatus?.session !== 'regular' && marketStatus?.session !== 'premarket')) {
            panel.style.display = 'none';
            return;
        }
        panel.style.display = '';

        const names = {
            technical: 'Technical', volatility: 'Volatility', crossAsset: 'Cross-Asset',
            sector: 'Sectors', megaCap: 'Mega-Caps', sentiment: 'Sentiment',
            microstructure: 'Microstructure', intraday: 'Intraday', overnightGap: 'Overnight Gap',
        };

        let html = '';
        Object.entries(prediction.factors).forEach(([key, factor]) => {
            const score = factor.score || 0;
            const weight = ((prediction.weights[key] || 0) * 100).toFixed(0);
            const cls = score > 0.1 ? 'bullish' : score < -0.1 ? 'bearish' : 'neutral';
            const pct = ((score + 1) / 2 * 100).toFixed(0);

            html += `
                <div class="factor">
                    <div class="factor-head">
                        <span>${names[key] || key} <span class="factor-wt">${weight}%</span></span>
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
