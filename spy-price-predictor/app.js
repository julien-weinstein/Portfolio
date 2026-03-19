/**
 * App — Main controller
 */
(async function () {
    'use strict';

    let quotes = {}, chartData = [], ta = null, prediction = null, news = [], strategy = null;
    let priceChart = null, performanceChart = null, selectedRange = '1D';

    const rangeMap = {
        '1D': { range: '1d', interval: '5m' },
        '5D': { range: '5d', interval: '15m' },
        '1M': { range: '1mo', interval: '1h' },
        '3M': { range: '3mo', interval: '1d' },
    };

    async function init() {
        updateMarketStatus();
        await refresh();
        setupChartControls();
        setInterval(updateMarketStatus, 30_000);
        setInterval(refresh, 60_000);
    }

    async function refresh() {
        try {
            [quotes, news] = await Promise.all([
                DataEngine.fetchAllQuotes(),
                Promise.resolve(DataEngine.fetchNews()),
            ]);
            const { range, interval } = rangeMap[selectedRange];
            chartData = await DataEngine.fetchPriceChart('SPY', range, interval);
            ta = TechnicalAnalysis.analyze(chartData);
            prediction = PredictionEngine.predict(ta, quotes, news);
            strategy = OptionsStrategy.generateStrategy(prediction);
            renderAll();
            document.getElementById('lastUpdate').textContent =
                'Updated ' + new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' }) + ' ET';
        } catch (err) {
            console.error('[App] Refresh error:', err);
        }
    }

    function updateMarketStatus() {
        const status = DataEngine.getMarketStatus();
        const el = document.getElementById('marketStatus');
        el.querySelector('.status-text').textContent = status.label;
        el.className = 'market-status ' + status.status;
    }

    function setupChartControls() {
        document.querySelectorAll('.chart-controls .btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                document.querySelector('.chart-controls .btn.active')?.classList.remove('active');
                btn.classList.add('active');
                selectedRange = btn.dataset.range;
                const { range, interval } = rangeMap[selectedRange];
                chartData = await DataEngine.fetchPriceChart('SPY', range, interval);
                ta = TechnicalAnalysis.analyze(chartData);
                prediction = PredictionEngine.predict(ta, quotes, news);
                strategy = OptionsStrategy.generateStrategy(prediction);
                renderAll();
            });
        });
    }

    function renderAll() {
        renderHero();
        renderStrikeTable();
        renderPriceChart();
        renderFactors();
        renderTechnicalIndicators();
        renderPerformance();
    }

    // ── Hero Section ───────────────────────────────────────────────────
    function renderHero() {
        if (!prediction || !strategy) return;
        const dir = prediction.direction;
        const hero = document.getElementById('hero');
        hero.className = 'hero ' + (dir === 'CALL' ? 'bullish' : dir === 'PUT' ? 'bearish' : 'neutral');

        document.getElementById('heroDirection').textContent =
            dir === 'CALL' ? 'BUY CALLS' : dir === 'PUT' ? 'BUY PUTS' : 'NO TRADE';
        document.getElementById('heroConf').textContent =
            `${prediction.confidence}% confidence | ${prediction.riskLevel} risk`;

        const spy = quotes.SPY;
        if (spy) {
            document.getElementById('heroSpyPrice').textContent = '$' + spy.price?.toFixed(2);
            const ch = document.getElementById('heroSpyChange');
            ch.textContent = `${spy.change > 0 ? '+' : ''}${spy.change?.toFixed(2)} (${spy.changePct > 0 ? '+' : ''}${spy.changePct?.toFixed(2)}%)`;
            ch.className = 'hero-metric-sub ' + (spy.change >= 0 ? 'positive' : 'negative');
        }

        const vix = quotes['^VIX'];
        if (vix) {
            document.getElementById('heroVix').textContent = vix.price?.toFixed(1);
            const vc = document.getElementById('heroVixChange');
            vc.textContent = (vix.change > 0 ? '+' : '') + vix.change?.toFixed(2);
            vc.className = 'hero-metric-sub ' + (vix.change <= 0 ? 'positive' : 'negative');
        }

        document.getElementById('heroRange').textContent =
            `$${prediction.predictedLow} - $${prediction.predictedHigh}`;
        document.getElementById('heroRangeSub').textContent =
            `Close est: $${prediction.predictedClose}`;

        document.getElementById('heroIV').textContent = strategy.iv + '%';
        document.getElementById('heroTimeSub').textContent =
            strategy.hoursToClose.toFixed(1) + 'h to close';

        document.getElementById('heroTiming').textContent = strategy.timingAdvice;
    }

    // ── Strike Comparison Table ────────────────────────────────────────
    function renderStrikeTable() {
        if (!strategy) return;
        const container = document.getElementById('strikeTable');
        const strats = strategy.strategies;

        if (strats.length === 1 && strats[0].type === 'NEUTRAL') {
            container.innerHTML = `<div class="no-trade-card">
                <div class="no-trade-icon">—</div>
                <div class="no-trade-text">No high-conviction 0DTE setup. Signals are mixed — sit this one out.</div>
            </div>`;
            return;
        }

        container.innerHTML = strats.map((s, i) => {
            const isRecommended = i === 1; // moderate is default pick
            const tierClass = s.tier;
            const probColor = s.probITM > 50 ? 'var(--accent-green)' :
                              s.probITM > 35 ? 'var(--accent-yellow)' : 'var(--accent-red)';
            const evColor = s.ev > 0 ? 'var(--accent-green)' : 'var(--accent-red)';

            return `
                <div class="strike-card ${tierClass} ${isRecommended ? 'recommended' : ''}">
                    ${isRecommended ? '<div class="recommended-tag">RECOMMENDED</div>' : ''}
                    <div class="strike-card-header">
                        <span class="strike-name">${s.name}</span>
                        <span class="strike-tier">${s.tierLabel}</span>
                    </div>
                    <div class="strike-card-body">
                        <div class="strike-prob">
                            <div class="strike-prob-number" style="color: ${probColor}">${s.probITM}%</div>
                            <div class="strike-prob-label">Prob ITM</div>
                        </div>
                        <div class="strike-details">
                            <div class="strike-row">
                                <span>Premium</span><span class="val">$${s.premium}</span>
                            </div>
                            <div class="strike-row">
                                <span>Breakeven</span><span class="val">$${s.breakeven}</span>
                            </div>
                            <div class="strike-row">
                                <span>Prob Profit</span><span class="val">${s.probProfit}%</span>
                            </div>
                            <div class="strike-row">
                                <span>Exp Value</span><span class="val" style="color: ${evColor}">${s.ev > 0 ? '+' : ''}$${s.ev}</span>
                            </div>
                            <div class="strike-row">
                                <span>Stop Loss</span><span class="val red">$${s.stopLoss}</span>
                            </div>
                            <div class="strike-row">
                                <span>Target (2x)</span><span class="val green">$${s.target}</span>
                            </div>
                        </div>
                        <div class="strike-greeks">
                            <span>D ${s.greeks.delta}</span>
                            <span>G ${s.greeks.gamma}</span>
                            <span>T ${s.greeks.theta}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ── Price Chart ────────────────────────────────────────────────────
    function renderPriceChart() {
        if (!chartData?.length) return;
        const ctx = document.getElementById('priceChart').getContext('2d');
        const labels = chartData.map(d => d.time);
        const closes = chartData.map(d => d.close);
        const vwap = ta?.series?.vwap || [];
        const ema9 = ta?.series?.ema9 || [];

        if (priceChart) priceChart.destroy();

        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'SPY', data: closes, borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.05)', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.1 },
                    { label: 'VWAP', data: vwap, borderColor: '#ffa500', borderWidth: 1.5, borderDash: [5, 3], pointRadius: 0, fill: false },
                    { label: 'EMA 9', data: ema9, borderColor: '#ff6bff', borderWidth: 1, pointRadius: 0, fill: false },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: true, position: 'top', labels: { color: '#aaa', font: { size: 11 }, usePointStyle: true, pointStyle: 'line' } },
                    annotation: prediction ? {
                        annotations: {
                            predHigh: {
                                type: 'line', yMin: prediction.predictedHigh, yMax: prediction.predictedHigh,
                                borderColor: 'rgba(0,255,136,0.4)', borderWidth: 1, borderDash: [4, 4],
                                label: { display: true, content: `Target $${prediction.predictedHigh}`, position: 'start', color: '#0f8', font: { size: 10 } },
                            },
                            predLow: {
                                type: 'line', yMin: prediction.predictedLow, yMax: prediction.predictedLow,
                                borderColor: 'rgba(255,68,68,0.4)', borderWidth: 1, borderDash: [4, 4],
                                label: { display: true, content: `Target $${prediction.predictedLow}`, position: 'start', color: '#f44', font: { size: 10 } },
                            },
                        },
                    } : {},
                },
                scales: {
                    x: { type: 'time', time: { tooltipFormat: 'MMM d, HH:mm' }, ticks: { color: '#555', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.03)' } },
                    y: { ticks: { color: '#555' }, grid: { color: 'rgba(255,255,255,0.03)' } },
                },
            },
        });
    }

    // ── Factors ────────────────────────────────────────────────────────
    function renderFactors() {
        if (!prediction) return;
        const container = document.getElementById('factorList');
        const names = {
            technical: 'Technical', volatility: 'Volatility', crossAsset: 'Cross-Asset',
            sector: 'Sectors', megaCap: 'Mega-Caps', sentiment: 'Sentiment',
            microstructure: 'Microstructure', intraday: 'Intraday Momentum',
        };

        let html = '';
        Object.entries(prediction.factors).forEach(([key, factor]) => {
            const score = factor.score || 0;
            const pct = ((score + 1) / 2 * 100).toFixed(0);
            const weight = (prediction.weights[key] * 100).toFixed(0);
            const cls = score > 0.1 ? 'bullish' : score < -0.1 ? 'bearish' : 'neutral';

            html += `
                <div class="factor-item">
                    <div class="factor-header">
                        <span class="factor-name">${names[key]}</span>
                        <span class="factor-score ${cls}">${score > 0 ? '+' : ''}${score.toFixed(2)}</span>
                        <span class="factor-weight">${weight}%</span>
                    </div>
                    <div class="factor-bar-track">
                        <div class="factor-bar ${cls}" style="width: ${pct}%"></div>
                        <div class="factor-bar-center"></div>
                    </div>
                    <div class="factor-details">
                        ${(factor.details || []).map(d => `
                            <div class="factor-detail-row">
                                <span>${d.name}</span>
                                <span class="detail-value">${d.value}</span>
                                <span class="detail-score ${d.score > 0.05 ? 'bullish' : d.score < -0.05 ? 'bearish' : 'neutral'}">
                                    ${d.score > 0 ? '+' : ''}${d.score.toFixed(2)}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        container.querySelectorAll('.factor-item').forEach(item => {
            item.querySelector('.factor-header').addEventListener('click', () => item.classList.toggle('expanded'));
        });
    }

    // ── Technical Indicators ───────────────────────────────────────────
    function renderTechnicalIndicators() {
        if (!ta) return;
        const indicators = [
            { name: 'RSI (14)', value: ta.rsi?.toFixed(1), signal: ta.rsi < 30 ? 'Oversold' : ta.rsi > 70 ? 'Overbought' : 'Neutral', cls: ta.rsi < 30 ? 'bullish' : ta.rsi > 70 ? 'bearish' : 'neutral' },
            { name: 'MACD', value: ta.macd?.histogram?.toFixed(3), signal: ta.macd?.histogram > 0 ? 'Bullish' : 'Bearish', cls: ta.macd?.histogram > 0 ? 'bullish' : 'bearish' },
            { name: 'Stoch %K', value: ta.stochastic?.k?.toFixed(1), signal: ta.stochastic?.k < 20 ? 'Oversold' : ta.stochastic?.k > 80 ? 'Overbought' : 'Neutral', cls: ta.stochastic?.k < 20 ? 'bullish' : ta.stochastic?.k > 80 ? 'bearish' : 'neutral' },
            { name: 'VWAP', value: '$' + ta.vwap?.toFixed(2), signal: ta.current?.price > ta.vwap ? 'Above' : 'Below', cls: ta.current?.price > ta.vwap ? 'bullish' : 'bearish' },
            { name: 'ATR', value: '$' + ta.atr?.toFixed(2), signal: '', cls: 'neutral' },
            { name: 'BB %B', value: ta.bollingerBands?.percentB?.toFixed(2), signal: ta.bollingerBands?.percentB > 0.8 ? 'Extended' : ta.bollingerBands?.percentB < 0.2 ? 'Oversold' : 'Mid', cls: ta.bollingerBands?.percentB > 0.8 ? 'bearish' : ta.bollingerBands?.percentB < 0.2 ? 'bullish' : 'neutral' },
            { name: 'EMA 9/21', value: ta.movingAverages?.ema9 > ta.movingAverages?.ema21 ? 'Bullish' : 'Bearish', signal: '', cls: ta.movingAverages?.ema9 > ta.movingAverages?.ema21 ? 'bullish' : 'bearish' },
            { name: 'Support', value: '$' + ta.support?.toFixed(2), signal: '', cls: 'neutral' },
            { name: 'Resistance', value: '$' + ta.resistance?.toFixed(2), signal: '', cls: 'neutral' },
            { name: 'Pivot', value: '$' + ta.pivots?.pivot?.toFixed(2), signal: ta.current?.price > ta.pivots?.pivot ? 'Above' : 'Below', cls: ta.current?.price > ta.pivots?.pivot ? 'bullish' : 'bearish' },
        ];

        document.getElementById('technicalIndicators').innerHTML = indicators.map(ind => `
            <div class="indicator-item">
                <div class="indicator-name">${ind.name}</div>
                <div class="indicator-value">${ind.value || '—'}</div>
                <div class="indicator-signal ${ind.cls}">${ind.signal}</div>
            </div>
        `).join('');
    }

    // ── Performance ────────────────────────────────────────────────────
    function renderPerformance() {
        const backtest = OptionsStrategy.generateBacktestData();
        const ctx = document.getElementById('performanceChart').getContext('2d');
        if (performanceChart) performanceChart.destroy();

        performanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: backtest.trades.map(t => t.date),
                datasets: [
                    { label: 'Daily P&L', data: backtest.trades.map(t => t.pnl), backgroundColor: backtest.trades.map(t => t.pnl >= 0 ? 'rgba(0,255,136,0.5)' : 'rgba(255,68,68,0.5)'), borderWidth: 0, yAxisID: 'y' },
                    { label: 'Cumulative', data: backtest.trades.map(t => t.cumPnl), type: 'line', borderColor: '#00d4ff', borderWidth: 2, pointRadius: 0, fill: false, yAxisID: 'y1' },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: { legend: { labels: { color: '#888', font: { size: 11 } } } },
                scales: {
                    x: { ticks: { color: '#555', maxTicksLimit: 12 }, grid: { display: false } },
                    y: { position: 'left', ticks: { color: '#555' }, grid: { color: 'rgba(255,255,255,0.03)' } },
                    y1: { position: 'right', ticks: { color: '#555' }, grid: { display: false } },
                },
            },
        });

        const s = backtest.stats;
        document.getElementById('performanceStats').innerHTML = `
            <div class="perf-stat"><span class="label">Win Rate</span><span class="value">${s.winRate}%</span></div>
            <div class="perf-stat"><span class="label">Trades</span><span class="value">${s.totalTrades}</span></div>
            <div class="perf-stat"><span class="label">Avg Win</span><span class="value positive">+$${s.avgWin}</span></div>
            <div class="perf-stat"><span class="label">Avg Loss</span><span class="value negative">$${s.avgLoss}</span></div>
            <div class="perf-stat"><span class="label">Profit Factor</span><span class="value">${s.profitFactor}</span></div>
            <div class="perf-stat"><span class="label">Sharpe</span><span class="value">${s.sharpeRatio}</span></div>
            <div class="perf-stat"><span class="label">Max DD</span><span class="value negative">$${s.maxDrawdown}</span></div>
            <div class="perf-stat"><span class="label">Total P&L</span><span class="value ${s.totalReturn >= 0 ? 'positive' : 'negative'}">${s.totalReturn >= 0 ? '+' : ''}$${s.totalReturn}</span></div>
        `;
    }

    init();
})();
