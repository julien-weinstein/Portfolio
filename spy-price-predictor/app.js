/**
 * App — Main controller that wires data, analysis, prediction, and UI together.
 */

(async function () {
    'use strict';

    // ── State ──────────────────────────────────────────────────────────
    let quotes = {};
    let chartData = [];
    let ta = null;
    let prediction = null;
    let news = [];
    let strategy = null;
    let priceChart = null;
    let signalChart = null;
    let riskGaugeChart = null;
    let performanceChart = null;
    let selectedRange = '5D';

    const rangeMap = {
        '1D': { range: '1d', interval: '5m' },
        '5D': { range: '5d', interval: '15m' },
        '1M': { range: '1mo', interval: '1h' },
        '3M': { range: '3mo', interval: '1d' },
    };

    // ── Init ───────────────────────────────────────────────────────────
    async function init() {
        updateMarketStatus();
        await refresh();
        setupChartControls();
        setInterval(updateMarketStatus, 30_000);
        setInterval(refresh, 60_000); // refresh every minute
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
                'Updated: ' + new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' }) + ' ET';
        } catch (err) {
            console.error('[App] Refresh error:', err);
        }
    }

    // ── Market Status ──────────────────────────────────────────────────
    function updateMarketStatus() {
        const status = DataEngine.getMarketStatus();
        const el = document.getElementById('marketStatus');
        el.querySelector('.status-text').textContent = status.label;
        el.className = 'market-status ' + status.status;
    }

    // ── Chart Range Controls ───────────────────────────────────────────
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

    // ── Render Everything ──────────────────────────────────────────────
    function renderAll() {
        renderMetrics();
        renderPriceChart();
        renderSignalChart();
        renderFactors();
        renderTechnicalIndicators();
        renderNewsFeed();
        renderStrategy();
        renderRiskGauge();
        renderPerformance();
    }

    // ── Metrics Cards ──────────────────────────────────────────────────
    function renderMetrics() {
        if (!prediction) return;

        // Signal
        const signalCard = document.getElementById('signalCard');
        const signalDir = document.getElementById('signalDirection');
        const signalConf = document.getElementById('signalConfidence');
        signalDir.textContent = prediction.direction;
        signalConf.textContent = `${prediction.confidence}% confidence`;
        signalCard.className = 'metric-card signal-card ' +
            (prediction.direction === 'CALL' ? 'bullish' :
             prediction.direction === 'PUT' ? 'bearish' : 'neutral');

        // SPY Price
        const spy = quotes.SPY;
        if (spy) {
            document.getElementById('spyPrice').textContent = '$' + spy.price?.toFixed(2);
            const chEl = document.getElementById('spyChange');
            chEl.textContent = `${spy.change > 0 ? '+' : ''}${spy.change?.toFixed(2)} (${spy.changePct > 0 ? '+' : ''}${spy.changePct?.toFixed(2)}%)`;
            chEl.className = 'metric-sub ' + (spy.change >= 0 ? 'positive' : 'negative');
        }

        // VIX
        const vix = quotes['^VIX'];
        if (vix) {
            document.getElementById('vixValue').textContent = vix.price?.toFixed(2);
            const vchEl = document.getElementById('vixChange');
            vchEl.textContent = (vix.change > 0 ? '+' : '') + vix.change?.toFixed(2);
            vchEl.className = 'metric-sub ' + (vix.change <= 0 ? 'positive' : 'negative');
        }

        // Predicted Range
        document.getElementById('predictedRange').textContent =
            `$${prediction.predictedLow} — $${prediction.predictedHigh}`;
        document.getElementById('rangeConfidence').textContent =
            `Expected close: $${prediction.predictedClose}`;

        // Optimal Strike
        if (strategy?.strategies?.length) {
            const best = strategy.strategies[0];
            document.getElementById('optimalStrike').textContent = '$' + best.strike;
            document.getElementById('strikeType').textContent = best.name;
        }
    }

    // ── Price Chart ────────────────────────────────────────────────────
    function renderPriceChart() {
        if (!chartData?.length) return;

        const ctx = document.getElementById('priceChart').getContext('2d');
        const labels = chartData.map(d => d.time);
        const closes = chartData.map(d => d.close);
        const vwap = ta?.series?.vwap || [];
        const ema9 = ta?.series?.ema9 || [];
        const bbUpper = ta?.series?.bb?.upper || [];
        const bbLower = ta?.series?.bb?.lower || [];

        // Prediction zone (last 20% of chart as forecast)
        const forecastStart = closes.length - 1;
        const lastPrice = closes[closes.length - 1];

        if (priceChart) priceChart.destroy();

        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'SPY',
                        data: closes,
                        borderColor: '#00d4ff',
                        backgroundColor: 'rgba(0,212,255,0.05)',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.1,
                    },
                    {
                        label: 'VWAP',
                        data: vwap,
                        borderColor: '#ffa500',
                        borderWidth: 1.5,
                        borderDash: [5, 3],
                        pointRadius: 0,
                        fill: false,
                    },
                    {
                        label: 'EMA 9',
                        data: ema9,
                        borderColor: '#ff6bff',
                        borderWidth: 1,
                        pointRadius: 0,
                        fill: false,
                    },
                    {
                        label: 'BB Upper',
                        data: bbUpper,
                        borderColor: 'rgba(255,255,255,0.2)',
                        borderWidth: 1,
                        pointRadius: 0,
                        fill: false,
                    },
                    {
                        label: 'BB Lower',
                        data: bbLower,
                        borderColor: 'rgba(255,255,255,0.2)',
                        borderWidth: 1,
                        pointRadius: 0,
                        fill: '-1',
                        backgroundColor: 'rgba(255,255,255,0.03)',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { display: true, position: 'top', labels: { color: '#aaa', font: { size: 11 } } },
                    annotation: prediction ? {
                        annotations: {
                            predHigh: {
                                type: 'line', yMin: prediction.predictedHigh, yMax: prediction.predictedHigh,
                                borderColor: 'rgba(0,255,136,0.5)', borderWidth: 1, borderDash: [4, 4],
                                label: { display: true, content: `Pred High $${prediction.predictedHigh}`, position: 'start', color: '#0f8', font: { size: 10 } },
                            },
                            predLow: {
                                type: 'line', yMin: prediction.predictedLow, yMax: prediction.predictedLow,
                                borderColor: 'rgba(255,68,68,0.5)', borderWidth: 1, borderDash: [4, 4],
                                label: { display: true, content: `Pred Low $${prediction.predictedLow}`, position: 'start', color: '#f44', font: { size: 10 } },
                            },
                        },
                    } : {},
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { tooltipFormat: 'MMM d, HH:mm' },
                        ticks: { color: '#666', maxTicksLimit: 10 },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                    },
                    y: {
                        ticks: { color: '#666' },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                    },
                },
            },
        });
    }

    // ── Signal Breakdown Radar Chart ───────────────────────────────────
    function renderSignalChart() {
        if (!prediction) return;

        const ctx = document.getElementById('signalChart').getContext('2d');
        const factorNames = ['Technical', 'Volatility', 'Cross-Asset', 'Sector', 'Mega-Cap', 'Sentiment', 'Micro'];
        const factorKeys = ['technical', 'volatility', 'crossAsset', 'sector', 'megaCap', 'sentiment', 'microstructure'];
        const scores = factorKeys.map(k => ((prediction.factors[k]?.score || 0) + 1) / 2 * 100); // normalize 0-100

        if (signalChart) signalChart.destroy();

        signalChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: factorNames,
                datasets: [{
                    label: 'Signal Strength',
                    data: scores,
                    backgroundColor: prediction.direction === 'CALL'
                        ? 'rgba(0,255,136,0.15)' : prediction.direction === 'PUT'
                        ? 'rgba(255,68,68,0.15)' : 'rgba(255,200,0,0.15)',
                    borderColor: prediction.direction === 'CALL'
                        ? '#0f8' : prediction.direction === 'PUT'
                        ? '#f44' : '#fc0',
                    borderWidth: 2,
                    pointBackgroundColor: prediction.direction === 'CALL' ? '#0f8' : prediction.direction === 'PUT' ? '#f44' : '#fc0',
                    pointRadius: 4,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    r: {
                        min: 0, max: 100,
                        ticks: { display: false, stepSize: 25 },
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        angleLines: { color: 'rgba(255,255,255,0.1)' },
                        pointLabels: { color: '#aaa', font: { size: 11 } },
                    },
                },
            },
        });
    }

    // ── Factor List ────────────────────────────────────────────────────
    function renderFactors() {
        if (!prediction) return;

        const container = document.getElementById('factorList');
        const factorNames = {
            technical: 'Technical Momentum',
            volatility: 'Volatility Regime',
            crossAsset: 'Cross-Asset Flow',
            sector: 'Sector Rotation',
            megaCap: 'Mega-Cap Momentum',
            sentiment: 'Sentiment & News',
            microstructure: 'Market Microstructure',
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
                        <span class="factor-name">${factorNames[key]}</span>
                        <span class="factor-weight">${weight}%</span>
                    </div>
                    <div class="factor-bar-track">
                        <div class="factor-bar ${cls}" style="width: ${pct}%"></div>
                        <div class="factor-bar-center"></div>
                    </div>
                    <div class="factor-score ${cls}">${score > 0 ? '+' : ''}${score.toFixed(3)}</div>
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

        // Toggle detail expansion
        container.querySelectorAll('.factor-item').forEach(item => {
            item.querySelector('.factor-header').addEventListener('click', () => {
                item.classList.toggle('expanded');
            });
        });
    }

    // ── Technical Indicators Grid ──────────────────────────────────────
    function renderTechnicalIndicators() {
        if (!ta) return;

        const indicators = [
            { name: 'RSI (14)', value: ta.rsi?.toFixed(1), signal: ta.rsi < 30 ? 'Oversold' : ta.rsi > 70 ? 'Overbought' : 'Neutral',
              cls: ta.rsi < 30 ? 'bullish' : ta.rsi > 70 ? 'bearish' : 'neutral' },
            { name: 'MACD Hist', value: ta.macd?.histogram?.toFixed(3), signal: ta.macd?.histogram > 0 ? 'Bullish' : 'Bearish',
              cls: ta.macd?.histogram > 0 ? 'bullish' : 'bearish' },
            { name: 'Stoch %K', value: ta.stochastic?.k?.toFixed(1), signal: ta.stochastic?.k < 20 ? 'Oversold' : ta.stochastic?.k > 80 ? 'Overbought' : 'Neutral',
              cls: ta.stochastic?.k < 20 ? 'bullish' : ta.stochastic?.k > 80 ? 'bearish' : 'neutral' },
            { name: 'Williams %R', value: ta.williamsR?.toFixed(1), signal: ta.williamsR > -20 ? 'Overbought' : ta.williamsR < -80 ? 'Oversold' : 'Neutral',
              cls: ta.williamsR < -80 ? 'bullish' : ta.williamsR > -20 ? 'bearish' : 'neutral' },
            { name: 'ATR', value: '$' + ta.atr?.toFixed(2), signal: 'Volatility', cls: 'neutral' },
            { name: 'VWAP', value: '$' + ta.vwap?.toFixed(2),
              signal: ta.current?.price > ta.vwap ? 'Above' : 'Below',
              cls: ta.current?.price > ta.vwap ? 'bullish' : 'bearish' },
            { name: 'BB %B', value: ta.bollingerBands?.percentB?.toFixed(2),
              signal: ta.bollingerBands?.percentB > 1 ? 'Above Upper' : ta.bollingerBands?.percentB < 0 ? 'Below Lower' : 'In Band',
              cls: ta.bollingerBands?.percentB > 0.8 ? 'bearish' : ta.bollingerBands?.percentB < 0.2 ? 'bullish' : 'neutral' },
            { name: 'EMA 9/21', value: ta.movingAverages?.ema9?.toFixed(2) + ' / ' + ta.movingAverages?.ema21?.toFixed(2),
              signal: ta.movingAverages?.ema9 > ta.movingAverages?.ema21 ? 'Bullish Cross' : 'Bearish Cross',
              cls: ta.movingAverages?.ema9 > ta.movingAverages?.ema21 ? 'bullish' : 'bearish' },
            { name: 'Support', value: '$' + ta.support?.toFixed(2), signal: '', cls: 'neutral' },
            { name: 'Resistance', value: '$' + ta.resistance?.toFixed(2), signal: '', cls: 'neutral' },
            { name: 'Pivot', value: '$' + ta.pivots?.pivot?.toFixed(2),
              signal: ta.current?.price > ta.pivots?.pivot ? 'Above' : 'Below',
              cls: ta.current?.price > ta.pivots?.pivot ? 'bullish' : 'bearish' },
            { name: 'Patterns', value: ta.patterns?.map(p => p.name).join(', ') || 'None',
              signal: ta.patterns?.[0]?.signal || '', cls: ta.patterns?.[0]?.signal || 'neutral' },
        ];

        const container = document.getElementById('technicalIndicators');
        container.innerHTML = indicators.map(ind => `
            <div class="indicator-item">
                <div class="indicator-name">${ind.name}</div>
                <div class="indicator-value">${ind.value || '—'}</div>
                <div class="indicator-signal ${ind.cls}">${ind.signal}</div>
            </div>
        `).join('');
    }

    // ── News Feed ──────────────────────────────────────────────────────
    function renderNewsFeed() {
        const container = document.getElementById('newsFeed');
        container.innerHTML = news.map(n => {
            const cls = n.sentiment > 0.1 ? 'bullish' : n.sentiment < -0.1 ? 'bearish' : 'neutral';
            const time = new Date(n.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
            return `
                <div class="news-item">
                    <span class="news-time">${time}</span>
                    <span class="news-badge ${n.category}">${n.category}</span>
                    <span class="news-title">${n.title}</span>
                    <span class="news-sentiment ${cls}">${n.sentiment > 0 ? '+' : ''}${n.sentiment.toFixed(1)}</span>
                </div>
            `;
        }).join('');
    }

    // ── Strategy Panel ─────────────────────────────────────────────────
    function renderStrategy() {
        if (!strategy) return;

        const container = document.getElementById('strategyContent');
        let html = `
            <div class="strategy-timing">
                <div class="timing-badge">${prediction.timing}</div>
                <span>${strategy.timingAdvice}</span>
            </div>
            <div class="strategy-sizing">${strategy.sizeAdvice}</div>
            <div class="strategy-iv">Implied Volatility: ${strategy.iv}% | Hours to Close: ${strategy.hoursToClose}</div>
            <div class="strategy-list">
        `;

        strategy.strategies.forEach(s => {
            html += `
                <div class="strategy-card ${s.type.toLowerCase()}">
                    <div class="strategy-card-header">
                        <h4>${s.name}</h4>
                        <span class="strike-badge">Strike: $${s.strike}</span>
                    </div>
                    <div class="strategy-card-body">
                        <div class="strategy-rationale">${s.rationale}</div>
                        <div class="strategy-grid">
                            <div><span class="label">Premium</span><span class="value">$${s.premium}</span></div>
                            <div><span class="label">Max Risk</span><span class="value">$${s.maxRisk}</span></div>
                            <div><span class="label">Max Reward</span><span class="value">${typeof s.maxReward === 'number' ? '$' + s.maxReward : s.maxReward}</span></div>
                            <div><span class="label">Breakeven</span><span class="value">${typeof s.breakeven === 'number' ? '$' + s.breakeven : s.breakeven}</span></div>
                            <div><span class="label">Target</span><span class="value">$${s.target}</span></div>
                            <div><span class="label">Stop Loss</span><span class="value">$${s.stopLoss}</span></div>
                        </div>
                        <div class="greeks-row">
                            <span>Δ ${s.greeks.delta}</span>
                            <span>Γ ${s.greeks.gamma}</span>
                            <span>Θ ${s.greeks.theta}</span>
                            <span>V ${s.greeks.vega}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    // ── Risk Gauge ─────────────────────────────────────────────────────
    function renderRiskGauge() {
        if (!prediction) return;

        const ctx = document.getElementById('riskGauge').getContext('2d');
        const riskMap = { LOW: 25, MODERATE: 50, HIGH: 75, EXTREME: 95 };
        const riskVal = riskMap[prediction.riskLevel] || 50;

        if (riskGaugeChart) riskGaugeChart.destroy();

        riskGaugeChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Risk', ''],
                datasets: [{
                    data: [riskVal, 100 - riskVal],
                    backgroundColor: [
                        riskVal < 40 ? '#0f8' : riskVal < 60 ? '#fc0' : riskVal < 80 ? '#f80' : '#f44',
                        'rgba(255,255,255,0.05)',
                    ],
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                rotation: -90,
                circumference: 180,
                plugins: { legend: { display: false } },
            },
        });

        document.getElementById('riskDetails').innerHTML = `
            <div class="risk-level ${prediction.riskLevel.toLowerCase()}">${prediction.riskLevel}</div>
            <div class="risk-item">VIX: ${quotes['^VIX']?.price?.toFixed(1) || '—'}</div>
            <div class="risk-item">Confidence: ${prediction.confidence}%</div>
            <div class="risk-item">ATR: $${prediction.atr?.toFixed(2) || '—'}</div>
        `;
    }

    // ── Performance Backtest ───────────────────────────────────────────
    function renderPerformance() {
        const backtest = OptionsStrategy.generateBacktestData();
        const ctx = document.getElementById('performanceChart').getContext('2d');

        if (performanceChart) performanceChart.destroy();

        performanceChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: backtest.trades.map(t => t.date),
                datasets: [
                    {
                        label: 'Daily P&L',
                        data: backtest.trades.map(t => t.pnl),
                        backgroundColor: backtest.trades.map(t =>
                            t.pnl >= 0 ? 'rgba(0,255,136,0.6)' : 'rgba(255,68,68,0.6)'
                        ),
                        borderWidth: 0,
                        yAxisID: 'y',
                    },
                    {
                        label: 'Cumulative P&L',
                        data: backtest.trades.map(t => t.cumPnl),
                        type: 'line',
                        borderColor: '#00d4ff',
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false,
                        yAxisID: 'y1',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { labels: { color: '#aaa' } },
                },
                scales: {
                    x: { ticks: { color: '#666', maxTicksLimit: 15 }, grid: { display: false } },
                    y: { position: 'left', ticks: { color: '#666' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y1: { position: 'right', ticks: { color: '#666' }, grid: { display: false } },
                },
            },
        });

        const s = backtest.stats;
        document.getElementById('performanceStats').innerHTML = `
            <div class="perf-stat"><span class="label">Win Rate</span><span class="value">${s.winRate}%</span></div>
            <div class="perf-stat"><span class="label">Total Trades</span><span class="value">${s.totalTrades}</span></div>
            <div class="perf-stat"><span class="label">Avg Win</span><span class="value positive">+$${s.avgWin}</span></div>
            <div class="perf-stat"><span class="label">Avg Loss</span><span class="value negative">$${s.avgLoss}</span></div>
            <div class="perf-stat"><span class="label">Profit Factor</span><span class="value">${s.profitFactor}</span></div>
            <div class="perf-stat"><span class="label">Sharpe Ratio</span><span class="value">${s.sharpeRatio}</span></div>
            <div class="perf-stat"><span class="label">Max Drawdown</span><span class="value negative">$${s.maxDrawdown}</span></div>
            <div class="perf-stat"><span class="label">Total Return</span><span class="value ${s.totalReturn >= 0 ? 'positive' : 'negative'}">${s.totalReturn >= 0 ? '+' : ''}$${s.totalReturn}</span></div>
        `;
    }

    // ── Boot ───────────────────────────────────────────────────────────
    init();
})();
