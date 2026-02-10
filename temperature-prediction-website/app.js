/* ================================================================
   Continental US Temperature Prediction – Main Application
   Uses Open-Meteo API (free, no key required)
   ================================================================ */

(function () {
    "use strict";

    // ── State ────────────────────────────────────────────────────
    let unit = "fahrenheit"; // "fahrenheit" | "celsius"
    let selectedState = null;
    let stateTemps = {};     // stateCode -> { temp, description }
    let forecastCache = {};  // "lat,lon" -> data

    const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
    const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // WMO weather codes → description + emoji
    const WMO_CODES = {
        0: { desc: "Clear sky", icon: "\u2600\uFE0F" },
        1: { desc: "Mainly clear", icon: "\uD83C\uDF24\uFE0F" },
        2: { desc: "Partly cloudy", icon: "\u26C5" },
        3: { desc: "Overcast", icon: "\u2601\uFE0F" },
        45: { desc: "Fog", icon: "\uD83C\uDF2B\uFE0F" },
        48: { desc: "Depositing rime fog", icon: "\uD83C\uDF2B\uFE0F" },
        51: { desc: "Light drizzle", icon: "\uD83C\uDF26\uFE0F" },
        53: { desc: "Moderate drizzle", icon: "\uD83C\uDF26\uFE0F" },
        55: { desc: "Dense drizzle", icon: "\uD83C\uDF27\uFE0F" },
        56: { desc: "Freezing drizzle", icon: "\u2744\uFE0F" },
        57: { desc: "Heavy freezing drizzle", icon: "\u2744\uFE0F" },
        61: { desc: "Slight rain", icon: "\uD83C\uDF26\uFE0F" },
        63: { desc: "Moderate rain", icon: "\uD83C\uDF27\uFE0F" },
        65: { desc: "Heavy rain", icon: "\uD83C\uDF27\uFE0F" },
        66: { desc: "Freezing rain", icon: "\u2744\uFE0F" },
        67: { desc: "Heavy freezing rain", icon: "\u2744\uFE0F" },
        71: { desc: "Slight snowfall", icon: "\uD83C\uDF28\uFE0F" },
        73: { desc: "Moderate snowfall", icon: "\uD83C\uDF28\uFE0F" },
        75: { desc: "Heavy snowfall", icon: "\u2744\uFE0F" },
        77: { desc: "Snow grains", icon: "\uD83C\uDF28\uFE0F" },
        80: { desc: "Slight showers", icon: "\uD83C\uDF26\uFE0F" },
        81: { desc: "Moderate showers", icon: "\uD83C\uDF27\uFE0F" },
        82: { desc: "Violent showers", icon: "\uD83C\uDF27\uFE0F" },
        85: { desc: "Slight snow showers", icon: "\uD83C\uDF28\uFE0F" },
        86: { desc: "Heavy snow showers", icon: "\u2744\uFE0F" },
        95: { desc: "Thunderstorm", icon: "\u26C8\uFE0F" },
        96: { desc: "Thunderstorm + hail", icon: "\u26C8\uFE0F" },
        99: { desc: "Thunderstorm + heavy hail", icon: "\u26C8\uFE0F" }
    };

    // ── DOM refs ─────────────────────────────────────────────────
    const $stateSelect = document.getElementById("state-select");
    const $citySelect = document.getElementById("city-select");
    const $mapSvg = document.getElementById("map-svg");
    const $tooltip = document.getElementById("map-tooltip");
    const $forecastPanel = document.getElementById("forecast-panel");
    const $forecastTitle = document.getElementById("forecast-title");
    const $currentWeather = document.getElementById("current-weather");
    const $forecastCards = document.getElementById("forecast-cards");
    const $nationalGrid = document.getElementById("national-grid");
    const $btnF = document.getElementById("btn-fahrenheit");
    const $btnC = document.getElementById("btn-celsius");

    // ── Helpers ──────────────────────────────────────────────────
    function cToF(c) { return (c * 9) / 5 + 32; }
    function fToC(f) { return ((f - 32) * 5) / 9; }
    function displayTemp(celsius) {
        const val = unit === "fahrenheit" ? cToF(celsius) : celsius;
        return Math.round(val) + "\u00B0" + (unit === "fahrenheit" ? "F" : "C");
    }

    function tempClass(celsius) {
        const f = cToF(celsius);
        if (f >= 90) return "hot";
        if (f >= 70) return "warm";
        if (f >= 50) return "cool";
        if (f >= 32) return "cold";
        return "freezing";
    }

    function tempToColor(celsius) {
        const f = cToF(celsius);
        if (f >= 100) return "#b71c1c";
        if (f >= 90)  return "#e53935";
        if (f >= 80)  return "#ff7043";
        if (f >= 70)  return "#ffa726";
        if (f >= 60)  return "#ffca28";
        if (f >= 50)  return "#66bb6a";
        if (f >= 40)  return "#42a5f5";
        if (f >= 30)  return "#29b6f6";
        if (f >= 20)  return "#81d4fa";
        if (f >= 10)  return "#b3e5fc";
        return "#e1f5fe";
    }

    function wmoInfo(code) {
        return WMO_CODES[code] || { desc: "Unknown", icon: "\u2753" };
    }

    // ── API ──────────────────────────────────────────────────────
    async function fetchForecast(lat, lon) {
        const key = lat + "," + lon;
        if (forecastCache[key]) return forecastCache[key];

        const params = new URLSearchParams({
            latitude: lat,
            longitude: lon,
            daily: "temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum,windspeed_10m_max",
            current_weather: "true",
            temperature_unit: "celsius",
            windspeed_unit: "mph",
            precipitation_unit: "inch",
            timezone: "America/New_York",
            forecast_days: "7"
        });

        const resp = await fetch(OPEN_METEO_FORECAST + "?" + params);
        if (!resp.ok) throw new Error("API error " + resp.status);
        const data = await resp.json();
        forecastCache[key] = data;
        return data;
    }

    async function fetchCurrentTemp(lat, lon) {
        const data = await fetchForecast(lat, lon);
        return {
            temp: data.current_weather.temperature,
            code: data.current_weather.weathercode
        };
    }

    // ── Map Rendering ────────────────────────────────────────────
    function renderMap() {
        $mapSvg.innerHTML = "";
        for (const [code, info] of Object.entries(US_STATES_PATHS)) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", info.d);
            path.setAttribute("data-state", code);
            path.setAttribute("fill", "#1e3a50");

            path.addEventListener("mouseenter", onStateHover);
            path.addEventListener("mousemove", onStateMouseMove);
            path.addEventListener("mouseleave", onStateLeave);
            path.addEventListener("click", onStateClick);

            $mapSvg.appendChild(path);
        }
    }

    function colorizeMap() {
        for (const [code, info] of Object.entries(stateTemps)) {
            const path = $mapSvg.querySelector(`path[data-state="${code}"]`);
            if (path) {
                path.setAttribute("fill", tempToColor(info.temp));
            }
        }
    }

    // ── Map Events ───────────────────────────────────────────────
    function onStateHover(e) {
        const code = e.target.getAttribute("data-state");
        const stateData = CITIES_DATA[code];
        const tempInfo = stateTemps[code];

        let html = "<strong>" + (stateData ? stateData.name : code) + "</strong>";
        if (tempInfo) {
            const cls = tempClass(tempInfo.temp);
            html += "<br><span class='temp " + cls + "'>" + displayTemp(tempInfo.temp) + "</span>";
            html += " " + wmoInfo(tempInfo.code).icon;
        } else {
            html += "<br><span style='color:var(--text-muted)'>Loading...</span>";
        }
        $tooltip.innerHTML = html;
        $tooltip.classList.remove("hidden");
    }

    function onStateMouseMove(e) {
        const rect = document.querySelector(".map-container").getBoundingClientRect();
        $tooltip.style.left = (e.clientX - rect.left + 15) + "px";
        $tooltip.style.top = (e.clientY - rect.top - 10) + "px";
    }

    function onStateLeave() {
        $tooltip.classList.add("hidden");
    }

    function onStateClick(e) {
        const code = e.target.getAttribute("data-state");
        selectState(code);
    }

    // ── State Selection ──────────────────────────────────────────
    function selectState(code) {
        if (!CITIES_DATA[code]) return;
        selectedState = code;

        // Update dropdown
        $stateSelect.value = code;
        populateCityDropdown(code);

        // Highlight on map
        $mapSvg.querySelectorAll("path").forEach(p => p.classList.remove("selected"));
        const path = $mapSvg.querySelector(`path[data-state="${code}"]`);
        if (path) path.classList.add("selected");

        // Load first city
        const firstCity = CITIES_DATA[code].cities[0];
        $citySelect.value = 0;
        loadCityForecast(firstCity, CITIES_DATA[code].name + " – " + firstCity.name);
    }

    function populateCityDropdown(stateCode) {
        const cities = CITIES_DATA[stateCode].cities;
        $citySelect.innerHTML = "";
        cities.forEach((c, i) => {
            const opt = document.createElement("option");
            opt.value = i;
            opt.textContent = c.name;
            $citySelect.appendChild(opt);
        });
        $citySelect.disabled = false;
    }

    // ── Forecast Display ─────────────────────────────────────────
    async function loadCityForecast(city, title) {
        $forecastPanel.classList.remove("hidden");
        $forecastTitle.textContent = title;
        $currentWeather.innerHTML = '<div class="loading-overlay"><span class="loading-spinner"></span> Loading forecast...</div>';
        $forecastCards.innerHTML = "";

        try {
            const data = await fetchForecast(city.lat, city.lon);
            renderCurrentWeather(data.current_weather);
            renderForecastCards(data.daily);
            renderChart(data.daily);
        } catch (err) {
            $currentWeather.innerHTML = '<div class="loading-overlay">Failed to load forecast. Please try again.</div>';
            console.error(err);
        }
    }

    function renderCurrentWeather(cw) {
        const info = wmoInfo(cw.weathercode);
        const cls = tempClass(cw.temperature);

        $currentWeather.innerHTML =
            '<span class="cw-icon">' + info.icon + '</span>' +
            '<span class="cw-temp ' + cls + '">' + displayTemp(cw.temperature) + '</span>' +
            '<div class="cw-details">' +
                '<span>' + info.desc + '</span>' +
                '<span>\uD83C\uDF2C\uFE0F Wind: ' + Math.round(cw.windspeed) + ' mph</span>' +
                '<span>\uD83E\uDDED Direction: ' + cw.winddirection + '\u00B0</span>' +
            '</div>';
    }

    function renderForecastCards(daily) {
        $forecastCards.innerHTML = "";
        for (let i = 0; i < daily.time.length; i++) {
            const date = new Date(daily.time[i] + "T12:00:00");
            const dayName = i === 0 ? "Today" : DAY_NAMES[date.getDay()];
            const info = wmoInfo(daily.weathercode[i]);
            const hiC = daily.temperature_2m_max[i];
            const loC = daily.temperature_2m_min[i];

            const card = document.createElement("div");
            card.className = "forecast-card";
            card.innerHTML =
                '<div class="fc-day">' + dayName + '</div>' +
                '<div class="fc-icon">' + info.icon + '</div>' +
                '<div class="fc-high ' + tempClass(hiC) + '">' + displayTemp(hiC) + '</div>' +
                '<div class="fc-low">' + displayTemp(loC) + '</div>' +
                '<div class="fc-desc">' + info.desc + '</div>';
            $forecastCards.appendChild(card);
        }
    }

    // ── Canvas Chart ─────────────────────────────────────────────
    function renderChart(daily) {
        const canvas = document.getElementById("temp-chart");
        const ctx = canvas.getContext("2d");
        const dpr = window.devicePixelRatio || 1;

        canvas.width = 800 * dpr;
        canvas.height = 300 * dpr;
        ctx.scale(dpr, dpr);

        const W = 800, H = 300;
        const pad = { top: 30, right: 20, bottom: 40, left: 50 };
        const plotW = W - pad.left - pad.right;
        const plotH = H - pad.top - pad.bottom;

        // Data
        const highs = daily.temperature_2m_max.map(c => unit === "fahrenheit" ? cToF(c) : c);
        const lows  = daily.temperature_2m_min.map(c => unit === "fahrenheit" ? cToF(c) : c);
        const labels = daily.time.map((t, i) => {
            if (i === 0) return "Today";
            const d = new Date(t + "T12:00:00");
            return DAY_NAMES[d.getDay()];
        });

        const allVals = highs.concat(lows);
        const minVal = Math.floor(Math.min(...allVals) - 5);
        const maxVal = Math.ceil(Math.max(...allVals) + 5);

        function xPos(i) { return pad.left + (i / (highs.length - 1)) * plotW; }
        function yPos(v) { return pad.top + plotH - ((v - minVal) / (maxVal - minVal)) * plotH; }

        // Clear
        ctx.clearRect(0, 0, W, H);

        // Grid lines
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 1;
        const gridSteps = 5;
        for (let i = 0; i <= gridSteps; i++) {
            const v = minVal + (i / gridSteps) * (maxVal - minVal);
            const y = yPos(v);
            ctx.beginPath();
            ctx.moveTo(pad.left, y);
            ctx.lineTo(W - pad.right, y);
            ctx.stroke();

            ctx.fillStyle = "#8899aa";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "right";
            ctx.fillText(Math.round(v) + "\u00B0", pad.left - 8, y + 4);
        }

        // X labels
        ctx.textAlign = "center";
        ctx.fillStyle = "#8899aa";
        labels.forEach((l, i) => {
            ctx.fillText(l, xPos(i), H - pad.bottom + 20);
        });

        // Fill area between high and low
        ctx.beginPath();
        for (let i = 0; i < highs.length; i++) {
            const x = xPos(i), y = yPos(highs[i]);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        for (let i = lows.length - 1; i >= 0; i--) {
            ctx.lineTo(xPos(i), yPos(lows[i]));
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(79,195,247,0.12)";
        ctx.fill();

        // High line
        drawLine(ctx, highs, xPos, yPos, "#ff8a65", 3);
        // Low line
        drawLine(ctx, lows, xPos, yPos, "#81d4fa", 3);

        // Dots
        highs.forEach((v, i) => drawDot(ctx, xPos(i), yPos(v), "#ff8a65"));
        lows.forEach((v, i) => drawDot(ctx, xPos(i), yPos(v), "#81d4fa"));

        // Legend
        ctx.font = "12px sans-serif";
        ctx.fillStyle = "#ff8a65";
        ctx.textAlign = "left";
        ctx.fillText("\u25CF High", pad.left + 10, 18);
        ctx.fillStyle = "#81d4fa";
        ctx.fillText("\u25CF Low", pad.left + 80, 18);
    }

    function drawLine(ctx, vals, xFn, yFn, color, width) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        vals.forEach((v, i) => {
            const x = xFn(i), y = yFn(v);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    function drawDot(ctx, x, y, color) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#0f1923";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // ── National Overview ────────────────────────────────────────
    async function loadNationalOverview() {
        $nationalGrid.innerHTML = '<div class="loading-overlay"><span class="loading-spinner"></span> Loading national temperatures...</div>';

        const stateCodes = Object.keys(CITIES_DATA).sort((a, b) =>
            CITIES_DATA[a].name.localeCompare(CITIES_DATA[b].name)
        );

        // Fetch in batches of 8 to avoid overwhelming the API
        const batchSize = 8;
        const cards = [];

        for (let b = 0; b < stateCodes.length; b += batchSize) {
            const batch = stateCodes.slice(b, b + batchSize);
            const promises = batch.map(async (code) => {
                const city = CITIES_DATA[code].cities[0];
                try {
                    const result = await fetchCurrentTemp(city.lat, city.lon);
                    stateTemps[code] = result;
                    return { code, temp: result.temp, weatherCode: result.code };
                } catch {
                    return { code, temp: null, weatherCode: null };
                }
            });
            const results = await Promise.all(promises);
            results.forEach(r => cards.push(r));

            // Update map colors as data comes in
            colorizeMap();
        }

        // Render grid
        $nationalGrid.innerHTML = "";
        cards.sort((a, b) => CITIES_DATA[a.code].name.localeCompare(CITIES_DATA[b.code].name));

        cards.forEach(({ code, temp, weatherCode }) => {
            const card = document.createElement("div");
            card.className = "state-card";
            card.setAttribute("data-state", code);

            const cityName = CITIES_DATA[code].cities[0].name;
            const info = weatherCode !== null ? wmoInfo(weatherCode) : { icon: "", desc: "" };

            if (temp !== null) {
                card.innerHTML =
                    '<div><div class="sc-name">' + CITIES_DATA[code].name + '</div>' +
                    '<div style="font-size:0.7rem;color:var(--text-muted)">' + cityName + '</div></div>' +
                    '<div style="text-align:right"><div class="sc-temp ' + tempClass(temp) + '">' + info.icon + " " + displayTemp(temp) + '</div>' +
                    '<div style="font-size:0.65rem;color:var(--text-muted)">' + info.desc + '</div></div>';
            } else {
                card.innerHTML =
                    '<div class="sc-name">' + CITIES_DATA[code].name + '</div>' +
                    '<div style="color:var(--text-muted)">N/A</div>';
            }

            card.addEventListener("click", () => selectState(code));
            $nationalGrid.appendChild(card);
        });
    }

    // ── Dropdowns ────────────────────────────────────────────────
    function populateStateDropdown() {
        const codes = Object.keys(CITIES_DATA).sort((a, b) =>
            CITIES_DATA[a].name.localeCompare(CITIES_DATA[b].name)
        );
        codes.forEach(code => {
            const opt = document.createElement("option");
            opt.value = code;
            opt.textContent = CITIES_DATA[code].name;
            $stateSelect.appendChild(opt);
        });
    }

    // ── Event Listeners ──────────────────────────────────────────
    $stateSelect.addEventListener("change", () => {
        const code = $stateSelect.value;
        if (code) selectState(code);
    });

    $citySelect.addEventListener("change", () => {
        if (!selectedState) return;
        const idx = parseInt($citySelect.value, 10);
        const city = CITIES_DATA[selectedState].cities[idx];
        if (city) {
            loadCityForecast(city, CITIES_DATA[selectedState].name + " \u2013 " + city.name);
        }
    });

    function setUnit(newUnit) {
        unit = newUnit;
        $btnF.classList.toggle("active", unit === "fahrenheit");
        $btnC.classList.toggle("active", unit === "celsius");

        // Re-render everything with new unit
        colorizeMap();
        refreshNationalGrid();

        if (selectedState) {
            const idx = parseInt($citySelect.value, 10) || 0;
            const city = CITIES_DATA[selectedState].cities[idx];
            if (city) {
                loadCityForecast(city, CITIES_DATA[selectedState].name + " \u2013 " + city.name);
            }
        }
    }

    function refreshNationalGrid() {
        const cards = $nationalGrid.querySelectorAll(".state-card");
        cards.forEach(card => {
            const code = card.getAttribute("data-state");
            const info = stateTemps[code];
            if (info) {
                const tempEl = card.querySelector(".sc-temp");
                if (tempEl) {
                    const w = wmoInfo(info.code);
                    tempEl.className = "sc-temp " + tempClass(info.temp);
                    tempEl.textContent = w.icon + " " + displayTemp(info.temp);
                }
            }
        });

        // Also update tooltip if visible
    }

    $btnF.addEventListener("click", () => setUnit("fahrenheit"));
    $btnC.addEventListener("click", () => setUnit("celsius"));

    // ── Init ─────────────────────────────────────────────────────
    function init() {
        populateStateDropdown();
        renderMap();
        loadNationalOverview();
    }

    init();

})();
