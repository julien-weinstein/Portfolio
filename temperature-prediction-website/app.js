/* ================================================================
   US Temperature Forecast – 24-Hour Hourly Predictions
   Open-Meteo API (free, no key)
   ================================================================ */
(function () {
    "use strict";

    // ── State ────────────────────────────────────────
    let unit = "fahrenheit";
    let selectedCityId = null;
    let cache = {}; // cityId -> API response

    const API = "https://api.open-meteo.com/v1/forecast";

    // WMO weather code → emoji + description
    const WMO = {
        0:  { icon: "\u2600\uFE0F",       desc: "Clear" },
        1:  { icon: "\uD83C\uDF24\uFE0F", desc: "Mostly clear" },
        2:  { icon: "\u26C5",             desc: "Partly cloudy" },
        3:  { icon: "\u2601\uFE0F",       desc: "Overcast" },
        45: { icon: "\uD83C\uDF2B\uFE0F", desc: "Fog" },
        48: { icon: "\uD83C\uDF2B\uFE0F", desc: "Freezing fog" },
        51: { icon: "\uD83C\uDF26\uFE0F", desc: "Light drizzle" },
        53: { icon: "\uD83C\uDF26\uFE0F", desc: "Drizzle" },
        55: { icon: "\uD83C\uDF27\uFE0F", desc: "Heavy drizzle" },
        56: { icon: "\u2744\uFE0F",       desc: "Freezing drizzle" },
        57: { icon: "\u2744\uFE0F",       desc: "Heavy freezing drizzle" },
        61: { icon: "\uD83C\uDF26\uFE0F", desc: "Light rain" },
        63: { icon: "\uD83C\uDF27\uFE0F", desc: "Rain" },
        65: { icon: "\uD83C\uDF27\uFE0F", desc: "Heavy rain" },
        66: { icon: "\u2744\uFE0F",       desc: "Freezing rain" },
        67: { icon: "\u2744\uFE0F",       desc: "Heavy freezing rain" },
        71: { icon: "\uD83C\uDF28\uFE0F", desc: "Light snow" },
        73: { icon: "\uD83C\uDF28\uFE0F", desc: "Snow" },
        75: { icon: "\u2744\uFE0F",       desc: "Heavy snow" },
        77: { icon: "\uD83C\uDF28\uFE0F", desc: "Snow grains" },
        80: { icon: "\uD83C\uDF26\uFE0F", desc: "Light showers" },
        81: { icon: "\uD83C\uDF27\uFE0F", desc: "Showers" },
        82: { icon: "\uD83C\uDF27\uFE0F", desc: "Heavy showers" },
        85: { icon: "\uD83C\uDF28\uFE0F", desc: "Snow showers" },
        86: { icon: "\u2744\uFE0F",       desc: "Heavy snow showers" },
        95: { icon: "\u26C8\uFE0F",       desc: "Thunderstorm" },
        96: { icon: "\u26C8\uFE0F",       desc: "T-storm + hail" },
        99: { icon: "\u26C8\uFE0F",       desc: "T-storm + heavy hail" }
    };

    function wmo(code) { return WMO[code] || { icon: "\u2753", desc: "Unknown" }; }

    // ── Helpers ──────────────────────────────────────
    const cToF = c => (c * 9) / 5 + 32;
    const display = c => {
        const v = unit === "fahrenheit" ? cToF(c) : c;
        return Math.round(v) + "\u00B0";
    };
    const displayFull = c => display(c) + (unit === "fahrenheit" ? "F" : "C");

    function tempClass(c) {
        const f = cToF(c);
        if (f >= 90) return "t-hot";
        if (f >= 70) return "t-warm";
        if (f >= 55) return "t-mild";
        if (f >= 40) return "t-cool";
        if (f >= 25) return "t-cold";
        return "t-freezing";
    }

    function tempColor(c) {
        const f = cToF(c);
        if (f >= 95)  return "#c62828";
        if (f >= 85)  return "#ef5350";
        if (f >= 75)  return "#ff9800";
        if (f >= 65)  return "#fdd835";
        if (f >= 55)  return "#66bb6a";
        if (f >= 45)  return "#42a5f5";
        if (f >= 32)  return "#90caf9";
        return "#e1f5fe";
    }

    function formatHour(isoStr) {
        const d = new Date(isoStr);
        const h = d.getHours();
        if (h === 0) return "12 AM";
        if (h === 12) return "12 PM";
        return h > 12 ? (h - 12) + " PM" : h + " AM";
    }

    // ── DOM ──────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const $statePaths  = $("state-paths");
    const $cityMarkers = $("city-markers");
    const $cityCards   = $("city-cards");
    const $detail      = $("detail-panel");
    const $detailName  = $("detail-city-name");
    const $detailLabel = $("detail-city-label");
    const $detailCur   = $("detail-current");
    const $hourlyCards = $("hourly-cards");
    const $btnF        = $("btn-f");
    const $btnC        = $("btn-c");

    // ── API ──────────────────────────────────────────
    async function fetchCity(city) {
        if (cache[city.id]) return cache[city.id];

        const params = new URLSearchParams({
            latitude: city.lat,
            longitude: city.lon,
            hourly: "temperature_2m,weathercode,precipitation_probability,windspeed_10m,relative_humidity_2m",
            current_weather: "true",
            temperature_unit: "celsius",
            windspeed_unit: "mph",
            timezone: "auto",
            forecast_days: 2
        });

        const res = await fetch(API + "?" + params);
        if (!res.ok) throw new Error("API " + res.status);
        const data = await res.json();
        cache[city.id] = data;
        return data;
    }

    // ── Map ──────────────────────────────────────────
    function renderMap() {
        // Draw state shapes
        for (const [code, info] of Object.entries(US_STATES_PATHS)) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", info.d);
            path.setAttribute("data-state", code);
            $statePaths.appendChild(path);
        }

        // Draw city markers
        CITIES.forEach(city => {
            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            g.setAttribute("class", "city-dot");
            g.setAttribute("data-city", city.id);

            // Pulsing ring
            const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            ring.setAttribute("cx", city.mapX);
            ring.setAttribute("cy", city.mapY);
            ring.setAttribute("r", "10");
            ring.setAttribute("class", "city-dot-ring pulse");

            // Static ring
            const ring2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            ring2.setAttribute("cx", city.mapX);
            ring2.setAttribute("cy", city.mapY);
            ring2.setAttribute("r", "10");
            ring2.setAttribute("class", "city-dot-ring");

            // Inner dot
            const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            dot.setAttribute("cx", city.mapX);
            dot.setAttribute("cy", city.mapY);
            dot.setAttribute("r", "6");
            dot.setAttribute("class", "city-dot-inner");

            // City name label
            const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            label.setAttribute("x", city.mapX);
            label.setAttribute("y", city.mapY - 20);
            label.setAttribute("class", "city-dot-label");
            label.textContent = city.name;

            // Temperature label (filled later)
            const tempLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
            tempLabel.setAttribute("x", city.mapX);
            tempLabel.setAttribute("y", city.mapY + 24);
            tempLabel.setAttribute("class", "city-dot-temp");
            tempLabel.setAttribute("data-temp-label", city.id);

            g.appendChild(ring);
            g.appendChild(ring2);
            g.appendChild(dot);
            g.appendChild(label);
            g.appendChild(tempLabel);

            g.addEventListener("click", () => selectCity(city.id));
            $cityMarkers.appendChild(g);
        });
    }

    function updateMapTemps() {
        CITIES.forEach(city => {
            const data = cache[city.id];
            if (!data) return;

            const tempC = data.current_weather.temperature;
            const el = document.querySelector(`[data-temp-label="${city.id}"]`);
            if (el) {
                el.textContent = displayFull(tempC);
                el.setAttribute("fill", tempColor(tempC));
            }

            // Color the dot by temp
            const dot = document.querySelector(`.city-dot[data-city="${city.id}"] .city-dot-inner`);
            if (dot) dot.setAttribute("fill", tempColor(tempC));

            const rings = document.querySelectorAll(`.city-dot[data-city="${city.id}"] .city-dot-ring`);
            rings.forEach(r => r.setAttribute("stroke", tempColor(tempC)));
        });
    }

    function highlightMapCity(cityId) {
        document.querySelectorAll(".city-dot").forEach(g => g.classList.remove("selected"));
        if (cityId) {
            const g = document.querySelector(`.city-dot[data-city="${cityId}"]`);
            if (g) g.classList.add("selected");
        }
    }

    // ── City Summary Cards ───────────────────────────
    function renderCityCards() {
        $cityCards.innerHTML = "";
        CITIES.forEach(city => {
            const card = document.createElement("div");
            card.className = "city-card";
            card.setAttribute("data-city", city.id);
            card.innerHTML =
                '<div class="cc-icon"><span class="spinner"></span></div>' +
                '<div class="cc-name">' + city.name + '</div>' +
                '<div class="cc-state">' + city.state + '</div>' +
                '<div class="cc-temp">&mdash;</div>' +
                '<div class="cc-desc">Loading...</div>';
            card.addEventListener("click", () => selectCity(city.id));
            $cityCards.appendChild(card);
        });
    }

    function updateCityCard(city, data) {
        const card = document.querySelector(`.city-card[data-city="${city.id}"]`);
        if (!card) return;

        const cw = data.current_weather;
        const info = wmo(cw.weathercode);
        const cls = tempClass(cw.temperature);

        card.querySelector(".cc-icon").textContent = info.icon;
        card.querySelector(".cc-temp").className = "cc-temp " + cls;
        card.querySelector(".cc-temp").textContent = displayFull(cw.temperature);
        card.querySelector(".cc-desc").textContent = info.desc;
    }

    // ── Detail Panel ─────────────────────────────────
    function selectCity(cityId) {
        selectedCityId = cityId;
        const city = CITIES.find(c => c.id === cityId);
        if (!city) return;

        // Highlight
        document.querySelectorAll(".city-card").forEach(c => c.classList.remove("active"));
        const activeCard = document.querySelector(`.city-card[data-city="${cityId}"]`);
        if (activeCard) activeCard.classList.add("active");
        highlightMapCity(cityId);

        // Show panel
        $detail.classList.remove("hidden");
        $detailName.textContent = city.name + ", " + city.state;
        $detailLabel.textContent = city.label;
        $detailCur.innerHTML = '<span class="spinner"></span>';
        $hourlyCards.innerHTML = '<div class="loading-msg"><span class="spinner"></span> Loading hourly data...</div>';

        fetchCity(city).then(data => {
            renderDetail(city, data);
        }).catch(() => {
            $detailCur.innerHTML = '<span style="color:var(--text-muted)">Failed to load</span>';
            $hourlyCards.innerHTML = '<div class="loading-msg">Could not load forecast data.</div>';
        });

        // Scroll to detail
        $detail.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderDetail(city, data) {
        const cw = data.current_weather;
        const info = wmo(cw.weathercode);
        const cls = tempClass(cw.temperature);

        $detailCur.innerHTML =
            '<span class="dc-icon">' + info.icon + '</span>' +
            '<span class="dc-temp ' + cls + '">' + displayFull(cw.temperature) + '</span>' +
            '<div class="dc-meta">' +
                info.desc + '<br>' +
                '\uD83C\uDF2C\uFE0F ' + Math.round(cw.windspeed) + ' mph' +
            '</div>';

        renderHourlyCards(data);
        renderHourlyChart(data);
    }

    function renderHourlyCards(data) {
        const hourly = data.hourly;
        // Find current hour index
        const nowISO = data.current_weather.time;
        let startIdx = hourly.time.findIndex(t => t >= nowISO);
        if (startIdx < 0) startIdx = 0;
        const count = 24;

        $hourlyCards.innerHTML = "";
        for (let i = startIdx; i < startIdx + count && i < hourly.time.length; i++) {
            const isNow = i === startIdx;
            const info = wmo(hourly.weathercode[i]);
            const cls = tempClass(hourly.temperature_2m[i]);
            const precip = hourly.precipitation_probability[i];

            const card = document.createElement("div");
            card.className = "hourly-card" + (isNow ? " now" : "");
            card.innerHTML =
                '<div class="hc-time">' + (isNow ? "Now" : formatHour(hourly.time[i])) + '</div>' +
                '<div class="hc-icon">' + info.icon + '</div>' +
                '<div class="hc-temp ' + cls + '">' + display(hourly.temperature_2m[i]) + '</div>' +
                (precip > 0 ? '<div class="hc-precip">\uD83D\uDCA7 ' + precip + '%</div>' : '');
            $hourlyCards.appendChild(card);
        }
    }

    // ── Chart ────────────────────────────────────────
    function renderHourlyChart(data) {
        const canvas = $("hourly-chart");
        const ctx = canvas.getContext("2d");
        const dpr = window.devicePixelRatio || 1;

        const W = 900, H = 280;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);

        const pad = { top: 35, right: 25, bottom: 45, left: 50 };
        const pW = W - pad.left - pad.right;
        const pH = H - pad.top - pad.bottom;

        // Get 24 hours of data
        const hourly = data.hourly;
        const nowISO = data.current_weather.time;
        let start = hourly.time.findIndex(t => t >= nowISO);
        if (start < 0) start = 0;
        const n = Math.min(24, hourly.time.length - start);

        const temps = [];
        const labels = [];
        const precips = [];
        for (let i = start; i < start + n; i++) {
            const c = hourly.temperature_2m[i];
            temps.push(unit === "fahrenheit" ? cToF(c) : c);
            labels.push(i === start ? "Now" : formatHour(hourly.time[i]));
            precips.push(hourly.precipitation_probability[i] || 0);
        }

        const tMin = Math.floor(Math.min(...temps) - 3);
        const tMax = Math.ceil(Math.max(...temps) + 3);

        const xOf = i => pad.left + (i / (n - 1)) * pW;
        const yOf = v => pad.top + pH - ((v - tMin) / (tMax - tMin)) * pH;

        ctx.clearRect(0, 0, W, H);

        // Grid
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth = 1;
        const steps = 5;
        for (let s = 0; s <= steps; s++) {
            const v = tMin + (s / steps) * (tMax - tMin);
            const y = yOf(v);
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
            ctx.fillStyle = "#6b7f90";
            ctx.font = "11px Inter, sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(Math.round(v) + "\u00B0", pad.left - 8, y + 4);
        }

        // X labels (every 3 hours)
        ctx.textAlign = "center";
        ctx.fillStyle = "#6b7f90";
        ctx.font = "10px Inter, sans-serif";
        for (let i = 0; i < n; i += 3) {
            ctx.fillText(labels[i], xOf(i), H - pad.bottom + 18);
        }

        // Precipitation bars (background)
        const barW = pW / n * 0.6;
        precips.forEach((p, i) => {
            if (p <= 0) return;
            const barH = (p / 100) * pH * 0.3;
            ctx.fillStyle = "rgba(66,165,245,0.15)";
            ctx.fillRect(xOf(i) - barW / 2, pad.top + pH - barH, barW, barH);
        });

        // Area fill under temp line
        ctx.beginPath();
        ctx.moveTo(xOf(0), yOf(temps[0]));
        for (let i = 1; i < n; i++) ctx.lineTo(xOf(i), yOf(temps[i]));
        ctx.lineTo(xOf(n - 1), pad.top + pH);
        ctx.lineTo(xOf(0), pad.top + pH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + pH);
        grad.addColorStop(0, "rgba(255,152,0,0.2)");
        grad.addColorStop(1, "rgba(255,152,0,0)");
        ctx.fillStyle = grad;
        ctx.fill();

        // Temperature line
        ctx.beginPath();
        ctx.strokeStyle = "#ff9800";
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        for (let i = 0; i < n; i++) {
            const x = xOf(i), y = yOf(temps[i]);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Dots
        temps.forEach((t, i) => {
            const x = xOf(i), y = yOf(t);
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = tempColor(unit === "fahrenheit" ? (t - 32) * 5 / 9 : t);
            ctx.fill();
            ctx.strokeStyle = "#0b1117";
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // "Now" indicator
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(79,195,247,0.4)";
        ctx.lineWidth = 1;
        ctx.moveTo(xOf(0), pad.top);
        ctx.lineTo(xOf(0), pad.top + pH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Legend
        ctx.font = "11px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = "#ff9800";
        ctx.fillText("\u25CF Temperature", pad.left + 5, 16);
        ctx.fillStyle = "rgba(66,165,245,0.6)";
        ctx.fillText("\u25A0 Precipitation %", pad.left + 130, 16);
    }

    // ── Unit Toggle ──────────────────────────────────
    function setUnit(u) {
        unit = u;
        $btnF.classList.toggle("active", u === "fahrenheit");
        $btnC.classList.toggle("active", u === "celsius");

        // Re-render everything
        CITIES.forEach(city => {
            if (cache[city.id]) updateCityCard(city, cache[city.id]);
        });
        updateMapTemps();

        if (selectedCityId) {
            const city = CITIES.find(c => c.id === selectedCityId);
            if (city && cache[city.id]) renderDetail(city, cache[city.id]);
        }
    }

    $btnF.addEventListener("click", () => setUnit("fahrenheit"));
    $btnC.addEventListener("click", () => setUnit("celsius"));

    // ── Init ─────────────────────────────────────────
    async function init() {
        renderMap();
        renderCityCards();

        // Fetch all cities in parallel
        const results = await Promise.allSettled(
            CITIES.map(city => fetchCity(city).then(data => ({ city, data })))
        );

        results.forEach(r => {
            if (r.status === "fulfilled") {
                updateCityCard(r.value.city, r.value.data);
            }
        });

        updateMapTemps();

        // Auto-select first city
        selectCity(CITIES[0].id);
    }

    init();

})();
