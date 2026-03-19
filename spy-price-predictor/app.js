/**
 * App — Main controller (simplified)
 */
(async function () {
    'use strict';

    let quotes = {}, chartData = [], ta = null, prediction = null, news = [], strategy = null;
    let priceChart = null;

    async function init() {
        updateMarketStatus();
        await refresh();
        setInterval(updateMarketStatus, 30_000);
        setInterval(refresh, 60_000);
    }

    async function refresh() {
        try {
            [quotes, news] = await Promise.all([
                DataEngine.fetchAllQuotes(),
                Promise.resolve(DataEngine.fetchNews()),
            ]);
            chartData = await DataEngine.fetchPriceChart('SPY', '1d', '5m');
            ta = TechnicalAnalysis.analyze(chartData);
            prediction = PredictionEngine.predict(ta, quotes, news);
            strategy = OptionsStrategy.generateStrategy(prediction);
            render();
            document.getElementById('lastUpdate').textContent =
                new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }) + ' ET';
        } catch (err) {
            console.error('[App]', err);
        }
    }

    function updateMarketStatus() {
        const s = DataEngine.getMarketStatus();
        const el = document.getElementById('marketStatus');
        el.querySelector('.status-text').textContent = s.label;
        el.className = 'market-status ' + s.status;
    }

    function render() {
        renderPriceBar();
        renderRecommendation();
        renderChart();
        renderFactors();
    }

    function renderPriceBar() {
        const spy = quotes.SPY;
        if (!spy) return;
        document.getElementById('spyPrice').textContent = '$' + spy.price?.toFixed(2);
        const ch = document.getElementById('spyChange');
        ch.textContent = `${spy.change > 0 ? '+' : ''}${spy.change?.toFixed(2)} (${spy.changePct > 0 ? '+' : ''}${spy.changePct?.toFixed(2)}%)`;
        ch.className = 'price-change ' + (spy.change >= 0 ? 'up' : 'down');

        const vix = quotes['^VIX'];
        if (vix) document.getElementById('vixValue').textContent = vix.price?.toFixed(1);
        if (strategy) document.getElementById('ivValue').textContent = strategy.iv + '%';
        if (prediction) document.getElementById('rangeValue').textContent =
            '$' + prediction.predictedLow + ' – $' + prediction.predictedHigh;
    }

    function renderRecommendation() {
        if (!prediction || !strategy) return;
        const card = document.getElementById('recCard');
        const signal = document.getElementById('recSignal');
        const details = document.getElementById('recDetails');
        const timing = document.getElementById('timingBar');
        const rec = strategy.recommendation;

        if (!rec) {
            card.className = 'rec-card neutral';
            signal.textContent = 'NO TRADE';
            details.innerHTML = '<div class="rec-reason">Signals are mixed — sit this one out.</div>';
            timing.textContent = strategy.timing;
            timing.className = 'timing-bar';
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

        timing.textContent = strategy.timing;
        timing.className = 'timing-bar ' + (strategy.hoursToClose < 1 ? 'warn' : '');
    }

    function renderChart() {
        if (!chartData?.length) return;
        const ctx = document.getElementById('priceChart').getContext('2d');
        const labels = chartData.map(d => d.time);
        const closes = chartData.map(d => d.close);
        const vwap = ta?.series?.vwap || [];

        if (priceChart) priceChart.destroy();

        priceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'SPY', data: closes, borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.04)', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.1 },
                    { label: 'VWAP', data: vwap, borderColor: 'rgba(255,165,0,0.6)', borderWidth: 1.5, borderDash: [5, 3], pointRadius: 0, fill: false },
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
        if (!prediction) return;
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

        document.getElementById('factorList').innerHTML = html;
    }

    init();
})();
