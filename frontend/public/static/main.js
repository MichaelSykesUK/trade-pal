"use strict";
// main.js
console.log("main.js loaded");



//
// === Configuration ===
//
// During local development we point API calls to the backend running on port 8000.
// Change this to "" or to your production API base when deploying.
const API_BASE =
	(typeof window !== "undefined" && window.TRADEPAL_API_BASE) ||
	"http://localhost:8000";

//
// === DOM Elements ===
// We declare element variables here but bind them after the DOM is ready
let currentLoadedTicker = null;

// Charts
let mainEl, volumeEl, indicatorEl;

// Search + suggestions
let tickerInput, searchButton, suggestionsEl, searchClearEl;

// Watchlist & market
let watchlistEl, marketIndexesList;

// Save/Load config
let saveConfigBtn, loadConfigBtn;

// Add to watchlist
let centerAddWatchlistBtn;

// ML controls
let mlMethodDropdownBtn, mlMethodDropdown, mlFeaturesDropdownBtn, mlFeaturesDropdown, runMLBtn, mlDaysDropdownBtn, mlDaysDropdown;
let selectedMLDays = 20;  // default = 1 week

//
// === Global State ===
//
let mainChart, volumeChart, indicatorChart;
let mainSeries, volumeSeries;
let overlayMap   = {};
let indicatorMap = {};
// stash the last-loaded real data so ML can re-plot it
let lastStockData = null;
let selectedIndicators = {
	price:   new Set(),
	special: new Set()
};

const PRICE_INDICATORS = [
	{ label: "MA(50)",  value: "ma50"  },
	{ label: "MA(100)", value: "ma100" },
	{ label: "MA(150)", value: "ma150" },
	{ label: "MA(200)", value: "ma200" },
	{ label: "Bollinger Bands", value: "bollinger" }
];
const SPECIAL_INDICATORS = [
	{ label: "RSI",        value: "rsi"        },
	{ label: "OBV",        value: "obv"        },
	{ label: "ATR",        value: "atr"        },
	{ label: "MACD",       value: "macd"       },
	{ label: "Volatility", value: "volatility" },
	{ label: "Momentum",   value: "momentum"   }
];
const INDICATOR_COLORS = {
	ma50: "#FF0000", ma100: "#00AA00", ma150: "#0000FF", ma200: "#FF00FF",
	boll_ma: "#FF9900", boll_upper: "#FF0000", boll_lower: "#0000FF",
	rsi: "#AA0000", obv: "#0055AA", atr: "#AA7700",
	macd: "#660066", volatility: "#AA0088", momentum: "#008888"
};

// ML options
const ML_METHODS  = ["LinearRegression","RandomForest","GBR","XGBoost","ARIMA"];
const ML_FEATURES = PRICE_INDICATORS.concat(SPECIAL_INDICATORS);

// currently selected ML settings
let selectedMLMethod   = null;
let selectedMLFeatures = {};
ML_FEATURES.forEach(f => selectedMLFeatures[f.value] = false);

//
// === Loading Overlay ===
//
function showLoadingOverlay() {
	document.getElementById("loadingOverlay").style.display = "flex";
}
function hideLoadingOverlay() {
	document.getElementById("loadingOverlay").style.display = "none";
	searchClearEl.style.display = tickerInput.value.trim() ? "block" : "none";
}

//
// === Charts Setup ===
//
function initCharts() {
	const scaleWidth = 60;

	mainChart = LightweightCharts.createChart(mainEl, {
		width:  mainEl.clientWidth,
		height: mainEl.clientHeight,
		layout: { backgroundColor: "#fff", textColor: "#333" },
		grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
		timeScale: { timeVisible: true, secondsVisible: false },
		rightPriceScale: {
			borderVisible: true,
			borderColor: "#ccc",
			width: scaleWidth,
			scaleMargins: { top: 0.05, bottom: 0.05 }
		}
	});

	volumeChart = LightweightCharts.createChart(volumeEl, {
		width:  volumeEl.clientWidth,
		height: volumeEl.clientHeight,
		layout: { backgroundColor: "#fff", textColor: "#333" },
		grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
		timeScale: { timeVisible: true, secondsVisible: false },
		rightPriceScale: {
			borderVisible: true,
			borderColor: "#ccc",
			width: scaleWidth,
			scaleMargins: { top: 0, bottom: 0 }
		}
	});

	indicatorChart = LightweightCharts.createChart(indicatorEl, {
		width:  indicatorEl.clientWidth,
		height: indicatorEl.clientHeight,
		layout: { backgroundColor: "#fff", textColor: "#333" },
		grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
		timeScale: { timeVisible: true, secondsVisible: false },
		rightPriceScale: {
			borderVisible: true,
			borderColor: "#ccc",
			width: scaleWidth,
			scaleMargins: { top: 0.05, bottom: 0.05 }
		}
	});

	// sync pan/zoom
	const charts = [mainChart, volumeChart, indicatorChart];
	charts.forEach((chart, idx) => {
		chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
			if (!range) return;
			charts.forEach((other, oIdx) => {
				if (oIdx !== idx) {
					other.timeScale().setVisibleLogicalRange(range);
				}
			});
		});
	});
}

function destroyCharts() {
	mainChart?.remove();
	volumeChart?.remove();
	indicatorChart?.remove();
}

//
// === Render Data ===
//
function renderMainAndVolume(stockData) {
	destroyCharts();
	initCharts();

	const chartType = getCurrentChartType();
	const dates  = stockData.Date   || [];
	const open   = stockData.Open   || [];
	const close  = stockData.Close  || [];
	const high   = stockData.High   || [];
	const low    = stockData.Low    || [];
	const volume = stockData.Volume || [];

	const mainData = [];
	const volData  = [];

	for (let i = 0; i < dates.length; i++) {
		const t = Math.floor(new Date(dates[i]).getTime() / 1000);
		if (chartType === "candlestick") {
			mainData.push({ time: t, open: open[i], high: high[i], low: low[i], close: close[i] });
		} else {
			mainData.push({ time: t, value: close[i] });
		}
		volData.push({
			time:  t,
			value: volume[i],
			color: (close[i] >= open[i]) ? "#26a69a" : "#ef5350"
		});
	}

	if (chartType === "candlestick") {
		mainSeries = mainChart.addCandlestickSeries();
	} else if (chartType === "area") {
		mainSeries = mainChart.addAreaSeries();
	} else {
		mainSeries = mainChart.addLineSeries();
	}
	mainSeries.setData(mainData);

	volumeSeries = volumeChart.addHistogramSeries({
		priceFormat: { type: "volume", precision: 0, minMove: 1 },
		priceScaleId: "right",
		color: "#26a69a"
	});
	volumeSeries.setData(volData);

	if (!mainData.length) return { firstTime: null, lastTime: null };
	return {
		firstTime: mainData[0].time,
		lastTime:  mainData[mainData.length - 1].time
	};
}

function getCurrentChartType() {
	const sel = document.querySelector("#chartTypeDropdown .dropdown-item.selected");
	return sel?.getAttribute("data-value") || "candlestick";
}

//
// === Fetch & Update Sequence ===
//
function fetchStock(ticker, timeframe) {
	console.log("fetchStock:", ticker, timeframe);
	currentLoadedTicker = ticker;
	showLoadingOverlay();

	const stockUrl = `${API_BASE}/stock/${ticker}?period=${timeframe}&interval=1d`;
	const kpiUrl   = `${API_BASE}/kpi/${ticker}`;

	Promise.all([fetch(stockUrl), fetch(kpiUrl)])
		.then(([sRes, kRes]) => {
			if (!sRes.ok) {
				if (sRes.status === 429) throw new Error("Rate limit exceeded. Please try again later.");
				throw new Error(`Stock fetch error: ${sRes.statusText}`);
			}
			if (!kRes.ok) {
				if (kRes.status === 429) throw new Error("Rate limit exceeded. Please try again later.");
				throw new Error(`KPI fetch error: ${kRes.statusText}`);
			}
			return Promise.all([sRes.json(), kRes.json()]);
		})
		.then(([stockData, kpiData]) => {
			// ****** KEY CHANGE ******
			// overwrite the top-level var so ML overlay can see it
			lastStockData = stockData;

			const { firstTime, lastTime } = renderMainAndVolume(stockData);
			updateTopInfo(ticker, stockData, kpiData);

			overlayMap = {};
			indicatorMap = {};
			document.getElementById("mainChartLegend").innerHTML      = "";
			document.getElementById("indicatorChartLegend").innerHTML = "";

			const indPromise  = reAddAllIndicators(ticker);
			const newsPromise = fetchNews(ticker);

			indPromise.then(() => {
				if (firstTime !== null && lastTime !== null) {
					[mainChart, volumeChart, indicatorChart].forEach(c =>
						c.timeScale().setVisibleRange({ from: firstTime, to: lastTime })
					);
				}
			});

			Promise.allSettled([indPromise, newsPromise])
						 .finally(hideLoadingOverlay);
		})
		.catch(err => {
			console.error(err);
			alert(`❌ Error loading ${ticker}: ${err.message}`);
			hideLoadingOverlay();
		});
}


//
// === Indicators ===
//
function reAddAllIndicators(ticker) {
	const tasks = [];
	selectedIndicators.price.forEach(v => tasks.push(fetchIndicatorData(ticker, v)));
	selectedIndicators.special.forEach(v => tasks.push(fetchIndicatorData(ticker, v)));
	return Promise.allSettled(tasks);
}

function toggleIndicator(val, isChecked) {
	const t = tickerInput.value.trim();
	if (!t) return Promise.resolve();
	const isPrice = PRICE_INDICATORS.some(pi => pi.value === val) || val === "bollinger";

	if (isPrice) {
		if (isChecked) {
			selectedIndicators.price.add(val);
			return fetchIndicatorData(t, val);
		} else {
			selectedIndicators.price.delete(val);
			removeIndicator(val);
			return Promise.resolve();
		}
	} else {
		if (isChecked) {
			selectedIndicators.special.add(val);
			return fetchIndicatorData(t, val);
		} else {
			selectedIndicators.special.delete(val);
			removeIndicator(val);
			return Promise.resolve();
		}
	}
}

function fetchIndicatorData(ticker, val) {
	const timeframe = document.querySelector("#timeframeButtons .active")?.dataset.period.toLowerCase() || "1y";
  
	const url = `${API_BASE}/indicators/${ticker}?period=${timeframe}&interval=1d`;
	return fetch(url)
		.then(r => { if (!r.ok) throw new Error("Indicator fetch error: " + r.statusText); return r.json(); })
		.then(data => applyIndicator(val, data))
		.catch(err => console.error(`Indicator [${val}] failed:`, err));
}

function applyIndicator(val, data) {
	const isPrice = ["ma50", "ma100", "ma150", "ma200", "bollinger"].includes(val);
	isPrice ? applyPriceIndicator(val, data) : applySpecialIndicator(val, data);
}

function applyPriceIndicator(val, data) {
	if (!mainChart || !Array.isArray(data.Date)) return;
	if (val.startsWith("ma")) {
		const maField = "MA" + val.replace("ma", "");
		createLineOverlayOnMainChart(val, data.Date, data[maField]);
	} else if (val === "bollinger") {
		createLineOverlayOnMainChart("boll_ma",    data.Date, data.Bollinger_MA);
		createLineOverlayOnMainChart("boll_upper", data.Date, data.Upper_Band);
		createLineOverlayOnMainChart("boll_lower", data.Date, data.Lower_Band);
	}
}

function applySpecialIndicator(val, data) {
	if (!indicatorChart || !Array.isArray(data.Date)) return;
	let field;
	switch (val) {
		case "rsi":        field = data.RSI;        break;
		case "obv":        field = data.OBV;        break;
		case "atr":        field = data.ATR;        break;
		case "macd":       field = data.MACD;       break;
		case "volatility": field = data.Volatility; break;
		case "momentum":   field = data.Momentum;   break;
	}
	if (field) createLineOverlayOnIndicatorChart(val, data.Date, field);
}

function createLineOverlayOnMainChart(key, dates, values) {
	if (overlayMap[key]) {
		mainChart.removeSeries(overlayMap[key]);
		removeLegendItem("mainChartLegend", key);
	}
	const seriesData = [];
	for (let i = 0; i < dates.length; i++) {
		if (values[i] == null) continue;
		seriesData.push({
			time:  Math.floor(new Date(dates[i]).getTime() / 1000),
			value: values[i]
		});
	}
	const color  = INDICATOR_COLORS[key] || "#AA0000";
	const series = mainChart.addLineSeries({ color, lineWidth: 2 });
	series.setData(seriesData);
	overlayMap[key] = series;
	addLegendItem("mainChartLegend", key, color);
}

function createLineOverlayOnIndicatorChart(key, dates, values) {
	if (indicatorMap[key]) {
		indicatorChart.removeSeries(indicatorMap[key]);
		removeLegendItem("indicatorChartLegend", key);
	}
	const seriesData = [];
	for (let i = 0; i < dates.length; i++) {
		if (values[i] == null) continue;
		seriesData.push({
			time:  Math.floor(new Date(dates[i]).getTime() / 1000),
			value: values[i]
		});
	}
	const color  = INDICATOR_COLORS[key] || "#AA0000";
	const series = indicatorChart.addLineSeries({ color, lineWidth: 2 });
	series.setData(seriesData);
	indicatorMap[key] = series;
	addLegendItem("indicatorChartLegend", key, color);
}

function removeIndicator(val) {
	if (overlayMap[val]) {
		mainChart.removeSeries(overlayMap[val]);
		delete overlayMap[val];
		removeLegendItem("mainChartLegend", val);
	}
	if (indicatorMap[val]) {
		indicatorChart.removeSeries(indicatorMap[val]);
		delete indicatorMap[val];
		removeLegendItem("indicatorChartLegend", val);
	}
	if (val === "bollinger") {
		["boll_ma","boll_upper","boll_lower"].forEach(k => {
			if (overlayMap[k]) {
				mainChart.removeSeries(overlayMap[k]);
				delete overlayMap[k];
				removeLegendItem("mainChartLegend", k);
			}
		});
	}
}

//
// === ML Integration ===
//
function populateMLDropdowns() {
	// ML Method (single-select)
	ML_METHODS.forEach(m => {
		const di = document.createElement("div");
		di.classList.add("dropdown-item");
		di.dataset.value = m;
		di.innerHTML = `${m} <span class="tick">✓</span>`;
		mlMethodDropdown.appendChild(di);
		di.addEventListener("click", e => {
			e.stopPropagation();
			mlMethodDropdown.querySelectorAll(".dropdown-item").forEach(i => i.classList.remove("selected"));
			di.classList.add("selected");
			selectedMLMethod = m;
		});
	});

	selectedMLMethod = "LinearRegression";
	const defaultMethodItem = mlMethodDropdown.querySelector('[data-value="LinearRegression"]');
	if (defaultMethodItem) defaultMethodItem.classList.add("selected");

	// ML Features (multi-select)
	ML_FEATURES.forEach(f => {
		const label = document.createElement("label");
		label.textContent = f.label;

		const chk = document.createElement("input");
		chk.type = "checkbox";
		chk.value = f.value;
		chk.checked = true;  // ✅ check by default

		selectedMLFeatures[f.value] = true;  // ✅ track as checked

		const tick = document.createElement("span");
		tick.classList.add("tick");
		tick.textContent = "✓";

		label.classList.add("checked");
		label.prepend(chk);
		label.appendChild(tick);

		chk.addEventListener("change", e => {
			e.stopPropagation();
			label.classList.toggle("checked", chk.checked);
			selectedMLFeatures[f.value] = chk.checked;
		});

		mlFeaturesDropdown.appendChild(label);

		// ML Days: highlight default and setup click behavior
		mlDaysDropdown.querySelectorAll(".dropdown-item").forEach(item => {
			const days = parseInt(item.dataset.days);
			if (days === 20) item.classList.add("selected");  // ✅ Preselect 4 weeks

			item.addEventListener("click", e => {
				e.stopPropagation();
				// Deselect all items
				mlDaysDropdown.querySelectorAll(".dropdown-item").forEach(i => i.classList.remove("selected"));
				// Mark this one
				item.classList.add("selected");
				selectedMLDays = days;
				// Note: we DO NOT change the button label (ML Days)
			});
		});
	});
}

function fetchMLData(ticker, model, features) {
	if (!model) {
		return alert("❌ Please select an ML Method before running.");
	}
	if (!Object.values(features).some(f => f)) {
		return alert("❌ Select at least one ML Feature before running.");
	}

	showLoadingOverlay();
	const timeframe = document.querySelector("#timeframeButtons .active").dataset.period;
	const featsJson = encodeURIComponent(JSON.stringify(features));
	const url = `${API_BASE}/ml/${ticker}`
						+ `?period=${timeframe}`
						+ `&interval=1d`
						+ `&model=${encodeURIComponent(model)}`
						+ `&features=${featsJson}`
						+ `&pre_days=${selectedMLDays}`;

	fetch(url)
		.then(async r => {
			const payload = await r.json().catch(() => ({}));
			if (!r.ok) {
				// Surface the backend’s detail message if present
				const msg = payload.detail || payload.error || r.statusText;
				throw new Error(msg);
			}
			return payload;
		})
		.then(data => {
			applyMLOverlay("ML", data.projected);
		})
		.catch(err => {
			console.error("ML call failed:", err);
			alert("❌ ML error: " + err.message);
		})
		.finally(hideLoadingOverlay);
}

function applyMLOverlay(key, projected) {
	if (!lastStockData) {
		return alert("No stock data loaded yet!");
	}

	// 1) Remove any old ML overlay
	if (overlayMap[key]) {
		mainChart.removeSeries(overlayMap[key]);
		delete overlayMap[key];
		removeLegendItem("mainChartLegend", key);
	}

	// 2) Find the timestamp of the last real data point
	const lastRealDateStr = lastStockData.Date[lastStockData.Date.length - 1];
	const lastRealTs = Math.floor(new Date(lastRealDateStr).getTime() / 1000);

	// 3) Build & filter the projection to only days AFTER lastRealTs
	const projPoints = [];
	for (let i = 0; i < projected.Date.length; i++) {
		const d = new Date(projected.Date[i]);
		const day = d.getUTCDay(); // 0 = Sun, 6 = Sat
		if (day === 0 || day === 6) continue; // Skip weekends

		const time = Math.floor(d.getTime() / 1000);
		if (time <= lastRealTs) continue;

		projPoints.push({ time, value: projected.Predicted[i] });
	}

	if (!projPoints.length) {
		return alert("No projected points beyond the last real date.");
	}

	// 4) Add the ML projection as a single line series
	const mlSeries = mainChart.addLineSeries({
		color: "#AA00AA",
		lineWidth: 2,
		lineStyle: 1,
	});
	mlSeries.setData(projPoints);
	overlayMap[key] = mlSeries;
	addLegendItem("mainChartLegend", key, "#AA00AA");

	// 5) Shift the X-axis window right so the new points are visible
	const vr = mainChart.timeScale().getVisibleRange();
	if (vr && vr.from != null && vr.to != null) {
		const extra = projPoints[projPoints.length - 1].time - lastRealTs;
		mainChart.timeScale().setVisibleRange({
			from: vr.from,
			to:   vr.to + extra,
		});
	}
}

// small sleep helper
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// SERIAL watchlist loader
async function updateMarketInfoUI() {
	const MARKET_INDEXES = [
		{ ticker: "^GSPC", name: "S&P 500" },
		{ ticker: "^IXIC", name: "Nasdaq Composite" },
		{ ticker: "^DJI",  name: "Dow Jones Industrial Average" },
		{ ticker: "^FTSE", name: "FTSE 100" },
		{ ticker: "^N225", name: "Nikkei 225" }
	];

	marketIndexesList.innerHTML = "";
	const tickers = MARKET_INDEXES.map(ix => ix.ticker);
	const batch = await fetchWatchlistBatch(tickers);

	for (const ix of MARKET_INDEXES) {
		const li = document.createElement("li");
		li.classList.add("item-container");
		li.innerHTML = `
			<div class="item-row1" style="display:grid; grid-template-columns:60px 60px 80px 80px; gap:4px; align-items:center">
				<div class="item-col-ticker">${ix.ticker}</div>
				<div class="item-col-price">--</div>
				<div class="item-col-daily">--</div>
				<div class="item-col-ytd">--</div>
			</div>
			<div class="item-row2">${ix.name}</div>
		`;
		marketIndexesList.appendChild(li);

		const snapshot = batch[ix.ticker];
		if (!snapshot) continue;

		const row2    = li.querySelector(".item-row2");
		const priceEl = li.querySelector(".item-col-price");
		const dailyEl = li.querySelector(".item-col-daily");
		const ytdEl   = li.querySelector(".item-col-ytd");

		row2.textContent = snapshot.companyName || ix.name;

		const price = typeof snapshot.currentPrice === "number" ? snapshot.currentPrice : 0;
		priceEl.textContent = price.toFixed(2);

		const d = typeof snapshot.dailyChange === "number" ? snapshot.dailyChange : 0;
		const p = typeof snapshot.dailyPct === "number" ? snapshot.dailyPct : 0;
		const signD = d >= 0 ? "+" : "";
		dailyEl.textContent = `${signD}${d.toFixed(2)} (${signD}${p.toFixed(2)}%)`;
		dailyEl.classList.toggle("up", d > 0);
		dailyEl.classList.toggle("down", d < 0);

		const y = typeof snapshot.ytdChange === "number" ? snapshot.ytdChange : 0;
		const yp = typeof snapshot.ytdPct === "number" ? snapshot.ytdPct : 0;
		const signY = y >= 0 ? "+" : "";
		ytdEl.textContent = `${signY}${y.toFixed(2)} (${signY}${yp.toFixed(2)}%)`;
		ytdEl.classList.toggle("up", y > 0);
		ytdEl.classList.toggle("down", y < 0);
	}
}

async function updateWatchlistUI(watchlist) {
	watchlistEl.innerHTML = "";
	if (!Array.isArray(watchlist) || watchlist.length === 0) {
		return;
	}

	const liMap = {};
	watchlist.forEach(tkr => {
		const li = createWatchlistItem(tkr);
		liMap[tkr] = li;
		watchlistEl.appendChild(li);
	});

	try {
		const snapshots = await fetchWatchlistBatch(watchlist);
		watchlist.forEach(tkr => {
			const li = liMap[tkr];
			const snap = snapshots[tkr];
			if (li && snap) {
				updateWatchlistItem(li, snap);
			}
		});
	} catch (err) {
		console.error("Failed to load watchlist batch:", err);
		Object.values(liMap).forEach(li => {
			const row2 = li.querySelector(".item-row2");
			if (row2) row2.textContent = "Error loading data.";
		});
	}
}


function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWatchlistBatch(tickers, retries = 2) {
	const unique = Array.from(new Set((tickers || []).filter(Boolean)));
	if (!unique.length) return {};

	const body = JSON.stringify({ tickers: unique });
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const resp = await fetch(`${API_BASE}/watchlist_data/batch`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body,
			});
			if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			return await resp.json();
		} catch (err) {
			if (attempt === retries) throw err;
			await wait(1000 * (attempt + 1));
		}
	}
	return {};
}


function addLegendItem(containerId, key, color) {
	const container = document.getElementById(containerId);
	if (!container) return;
	const item = document.createElement("span");
	item.id = `legend-item-${key}`;
	item.style.display = "inline-flex";
	item.style.alignItems = "center";
	item.style.marginRight = "8px";

	const line = document.createElement("span");
	line.style.display = "inline-block";
	line.style.width = "20px";
	line.style.height = "2px";
	line.style.backgroundColor = color;
	line.style.marginRight = "5px";

	const label = document.createElement("span");
	label.textContent = key;

	item.appendChild(line);
	item.appendChild(label);
	container.appendChild(item);
}

function removeLegendItem(containerId, key) {
	const it = document.getElementById(`legend-item-${key}`);
	if (it) it.remove();
}

function formatDateTime(ds) {
	const d = new Date(ds);
	return d.toLocaleString(undefined, {
		month:   "short",
		day:     "numeric",
		year:    "numeric",
		hour:    "numeric",
		minute:  "numeric",
		hour12:  true,
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
	});
}

function formatNumberWithCommas(n) {
	if (typeof n !== "number" || isNaN(n)) return "N/A";
	return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatMarketCap(v) {
	if (v >= 1e12) return (v/1e12).toFixed(1) + "T";
	if (v >= 1e9)  return (v/1e9).toFixed(1)  + "B";
	if (v >= 1e6)  return (v/1e6).toFixed(1)  + "M";
	return v.toFixed(1);
}

function updateTopInfo(ticker, data, kpi) {
	if (!Array.isArray(data.Date) || data.Date.length === 0) return;
	const lastIndex = data.Date.length - 1;
	const lastPrice = data.Close[lastIndex];
	const prevPrice = data.Close[lastIndex - 1] || lastPrice;
	const change    = lastPrice - prevPrice;
	const pct       = prevPrice ? (change/prevPrice)*100 : 0;

	const fullName = `${kpi.companyName || "Unknown"} (${ticker})`;
	document.getElementById("stockName").textContent     = fullName;
	document.getElementById("stockExchange").textContent= kpi.exchange && kpi.currency
		? `${kpi.exchange} · ${kpi.currency}` : "";
	document.getElementById("stockPrice").textContent    = lastPrice.toFixed(2);

	const changeEl = document.getElementById("stockChange");
	const sign     = change >= 0 ? "+" : "";
	changeEl.textContent = `${sign}${change.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
	changeEl.classList.toggle("up", change > 0);
	changeEl.classList.toggle("down", change < 0);

	const timeframe = document.querySelector("#timeframeButtons .active")?.dataset.period.toLowerCase() || "1y";
	const latestDate= new Date(data.Date[lastIndex]);
	const today     = new Date();
	const isToday   = latestDate.toDateString() === today.toDateString();
	const mo        = new Date(latestDate); mo.setHours(9,30,0,0);
	const mc        = new Date(latestDate); mc.setHours(16,0,0,0);
	const status    = (timeframe==="1D" && isToday && latestDate>=mo && latestDate<=mc)
										 ? "Market Open" : "At Close";
	document.getElementById("stockDate").textContent =
		`As of ${formatDateTime(data.Date[lastIndex])} (${status})`;

	document.getElementById("previousClose").textContent   = kpi.previousClose?.toFixed(2)   ?? "N/A";
	document.getElementById("openPrice").textContent       = kpi.openPrice?.toFixed(2)       ?? "N/A";
	document.getElementById("daysRange").textContent       = kpi.daysRange                  ?? "N/A";
	document.getElementById("weekRange").textContent       = kpi.weekRange                  ?? "N/A";
	document.getElementById("weekHigh").textContent        = kpi.weekHigh52                 ?? "N/A";
	document.getElementById("weekLow").textContent         = kpi.weekLow52                  ?? "N/A";
	document.getElementById("peRatio").textContent         = typeof kpi.peRatio==="number"  ? kpi.peRatio.toFixed(1) : kpi.peRatio ?? "N/A";
	document.getElementById("marketCap").textContent       = formatMarketCap(kpi.marketCap) ?? "N/A";
	document.getElementById("forwardPE").textContent       = kpi.forwardPE                  ?? "N/A";
	document.getElementById("nextEarningsDate").textContent= kpi.nextEarningsDate           ?? "N/A";
	document.getElementById("beta").textContent            = kpi.beta                       ?? "N/A";
	document.getElementById("eps").textContent             = kpi.eps                        ?? "N/A";
	document.getElementById("dividend").textContent        = kpi.dividend                   ?? "N/A";
	document.getElementById("exDividendDate").textContent  = kpi.exDividendDate             ?? "N/A";

	const volumeLast = data.Volume[lastIndex];
	document.getElementById("volumeKpi").textContent       = formatNumberWithCommas(volumeLast) ?? "N/A";
	document.getElementById("avgVolume").textContent       = formatNumberWithCommas(Math.round(kpi.avgVolume)) ?? "N/A";
}

function fetchNews(ticker) {
	return fetch(`${API_BASE}/news/${ticker}`)
		.then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
		.then(displayNews)
		.catch(err => { console.error(err); displayNews([]); });

}

function displayNews(news) {
	const ul = document.getElementById("newsList");
	ul.innerHTML = "";
	if (!Array.isArray(news) || news.length === 0) {
		ul.innerHTML = "<li>No news found.</li>";
		return;
	}
	news.forEach(item => {
		const li = document.createElement("li");
		const txt = document.createElement("div");
		txt.classList.add("news-item-text");

		const a = document.createElement("a");
		a.href = item.link || "#"; a.target = "_blank";
		a.textContent = item.title || "News Story";
		txt.appendChild(a);

		const meta = document.createElement("div");
		meta.classList.add("news-meta");
		let prov = null;
		if (Array.isArray(item.provider) && item.provider.length) prov = item.provider[0];
		else if (item.provider && typeof item.provider === "object") prov = item.provider;
		const pt = prov?.publishTime || item.providerPublishTime;
		const rel = pt ? formatRelativeTime(pt) : "Unknown time";
		const src = prov?.displayName || item.publisher || "Unknown source";
		meta.textContent = `${rel} • ${src}`;
		txt.appendChild(meta);

		li.appendChild(txt);
		const img = document.createElement("img");
		img.src = item.thumbnail?.resolutions?.[0]?.url || "static/icons/yahoo-news.jpg";
		img.classList.add("news-thumbnail");
		li.appendChild(img);

		ul.appendChild(li);
	});
}

function formatRelativeTime(sec) {
	const now = Date.now();
	const diff = Math.max(0, now - sec * 1000);
	const hrs = diff / (1000 * 60 * 60);
	if (hrs < 24) {
		const h = Math.floor(hrs);
		return h === 1 ? "1 hour ago" : `${h} hours ago`;
	}
	const days = Math.floor(hrs / 24);
	if (days < 7) return days === 1 ? "1 day ago" : `${days} days ago`;
	const w = Math.floor(days / 7);
	return w === 1 ? "1 week ago" : `${w} weeks ago`;
}

function loadConfig() {
	const wl = JSON.parse(localStorage.getItem("watchlist") || "[]");
	updateWatchlistUI(wl);
}
function saveConfig() {
	alert("Watchlist saved to localStorage.");
}

function fetchWithRetry(url, retries = 3, delay = 500) {
	return new Promise((res, rej) => {
		function attempt(n, d) {
			fetch(url)
				.then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
				.then(res)
				.catch(err => {
					if (n > 0) setTimeout(() => attempt(n - 1, d * 2), d);
					else rej(err);
				});
		}
		attempt(retries, delay);
	});
}

function createWatchlistItem(tkr) {
	const li = document.createElement("li");
	li.classList.add("item-container");
	li.innerHTML = `
		<div class="item-row1">
			<div class="item-col-ticker">${tkr}</div>
			<div class="item-col-price">--</div>
			<div class="item-col-daily">--</div>
			<div class="item-col-ytd">--</div>
			<div class="item-col-remove"><span class="remove-watchlist-btn">×</span></div>
		</div>
		<div class="item-row2">Loading...</div>
	`;
	const rem = li.querySelector(".remove-watchlist-btn");
	rem.addEventListener("click", e => { e.stopPropagation(); removeFromWatchlist(tkr); });
	li.addEventListener("click", e => {
		if (e.target === rem) return;
		tickerInput.value = tkr;
		fetchStock(tkr, "1y");


	});
	return li;
}

function updateWatchlistItem(li, data) {
	const snapshot = data || {};
	const row2 = li.querySelector(".item-row2");
	const priceEl = li.querySelector(".item-col-price");
	const dailyEl = li.querySelector(".item-col-daily");
	const ytdEl   = li.querySelector(".item-col-ytd");

	row2.textContent = snapshot.companyName || "Unknown";

	const price = typeof snapshot.currentPrice === "number" ? snapshot.currentPrice : 0;
	priceEl.textContent = price.toFixed(2);

	const dailyChange = typeof snapshot.dailyChange === "number" ? snapshot.dailyChange : 0;
	const dailyPct = typeof snapshot.dailyPct === "number" ? snapshot.dailyPct : 0;
	const sD = dailyChange >= 0 ? "+" : "";
	dailyEl.textContent = `${sD}${dailyChange.toFixed(2)} (${sD}${dailyPct.toFixed(2)}%) Day`;
	dailyEl.classList.toggle("up", dailyChange > 0);
	dailyEl.classList.toggle("down", dailyChange < 0);

	const ytdChange = typeof snapshot.ytdChange === "number" ? snapshot.ytdChange : 0;
	const ytdPct = typeof snapshot.ytdPct === "number" ? snapshot.ytdPct : 0;
	const sY = ytdChange >= 0 ? "+" : "";
	ytdEl.textContent = `${sY}${ytdChange.toFixed(2)} (${sY}${ytdPct.toFixed(2)}%) YTD`;
	ytdEl.classList.toggle("up", ytdChange > 0);
	ytdEl.classList.toggle("down", ytdChange < 0);
}

function removeFromWatchlist(tkr) {
	const wl = JSON.parse(localStorage.getItem("watchlist") || "[]")
		.filter(x => x !== tkr);
	localStorage.setItem("watchlist", JSON.stringify(wl));
	updateWatchlistUI(wl);
}

//
// === Autocomplete ===
//
function setupAutocomplete() {
	const AUTOCOMPLETE_DELAY = 1000;
	let autocompleteTimer = null;
	tickerInput.addEventListener("input", e => {
		e.target.value = e.target.value.toUpperCase();
		const q = e.target.value.trim();
		searchClearEl.style.display = q ? "block" : "none";
		if (autocompleteTimer) clearTimeout(autocompleteTimer);
		if (!q) {
			suggestionsEl.innerHTML = "";
			suggestionsEl.style.display = "none";
			return;
		}
		autocompleteTimer = setTimeout(() => {
			autoSuggestTickers(q).then(quotes => {
				suggestionsEl.innerHTML = "";
				if (!quotes.length) {
					suggestionsEl.style.display = "none";
					return;
				}
				quotes.forEach(qt => {
					const div = document.createElement("div");
					div.classList.add("suggestion-item");
					div.textContent = qt.symbol + (qt.shortname ? ` - ${qt.shortname}` : "");
					div.addEventListener("click", () => {
						tickerInput.value = qt.symbol;
						suggestionsEl.innerHTML = "";
						suggestionsEl.style.display = "none";
						searchClearEl.style.display = "block";
					});
					suggestionsEl.appendChild(div);
				});
				suggestionsEl.style.display = "block";
			});
		}, AUTOCOMPLETE_DELAY);
	});

	searchClearEl.addEventListener("click", () => {
		tickerInput.value = "";
		suggestionsEl.innerHTML = "";
		suggestionsEl.style.display = "none";
		searchClearEl.style.display = "none";
		tickerInput.focus();
	});

	document.addEventListener("click", e => {
		if (!e.target.closest("#topSearchContainer")) {
			suggestionsEl.innerHTML = "";
			suggestionsEl.style.display = "none";
		}
	});
}

function autoSuggestTickers(q) {
	return fetch(`${API_BASE}/autocomplete?q=${encodeURIComponent(q)}`)
		.then(r => r.json())
		.then(d => d.quotes || [])
		.catch(e => { console.error(e); return []; });
}

//
// === Dropdowns (stay open when selecting) ===
//
function populateDropdowns() {
	// toggles on button click
	document.querySelectorAll(".dropdown>button").forEach(btn => {
		btn.addEventListener("click", e => {
			e.stopPropagation();
			document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("open"));
			btn.parentElement.classList.toggle("open");
		});
	});

	// close on outside click
	document.addEventListener("click", () => {
		document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("open"));
	});

	// prevent clicks inside dropdown-content from closing
	document.querySelectorAll(".dropdown-content").forEach(dc => {
		dc.addEventListener("click", e => e.stopPropagation());
	});

	// Chart Type
	const ctd = document.getElementById("chartTypeDropdown");
	ctd.querySelector('[data-value="candlestick"]').classList.add("selected");
	ctd.querySelectorAll(".dropdown-item").forEach(item => {
		item.addEventListener("click", e => {
			e.stopPropagation();
			ctd.querySelectorAll(".dropdown-item").forEach(i => i.classList.remove("selected"));
			item.classList.add("selected");
			const t = tickerInput.value.trim();
			const tf = document.querySelector("#timeframeButtons .active")?.dataset.period.toLowerCase() || "1y";
			if (t) fetchStock(t, tf);
		});
	});

	// Price Indicators
	const pd = document.getElementById("priceIndicatorDropdown");
	PRICE_INDICATORS.forEach(ind => {
		const label = document.createElement("label");
		label.textContent = ind.label;
		const chk = document.createElement("input");
		chk.type = "checkbox"; chk.value = ind.value;
		const tick = document.createElement("span");
		tick.classList.add("tick"); tick.textContent = "✓";
		label.prepend(chk); label.appendChild(tick);
		pd.appendChild(label);
		if (["ma50","ma100","ma150"].includes(ind.value)) {
			chk.checked = true; label.classList.add("checked");
			selectedIndicators.price.add(ind.value);
		}
		chk.addEventListener("change", e => {
			e.stopPropagation();
			label.classList.toggle("checked", chk.checked);
			toggleIndicator(ind.value, chk.checked);
		});
	});

	// Special Indicators
	const sd = document.getElementById("specialIndicatorDropdown");
	SPECIAL_INDICATORS.forEach(ind => {
		const label = document.createElement("label");
		label.textContent = ind.label;
		const chk = document.createElement("input");
		chk.type = "checkbox"; chk.value = ind.value;
		const tick = document.createElement("span");
		tick.classList.add("tick"); tick.textContent = "✓";
		label.prepend(chk); label.appendChild(tick);
		sd.appendChild(label);
		if (ind.value === "rsi") {
			chk.checked = true; label.classList.add("checked");
			selectedIndicators.special.add("rsi");
		}
		chk.addEventListener("change", e => {
			e.stopPropagation();
			label.classList.toggle("checked", chk.checked);
			toggleIndicator(ind.value, chk.checked);
		});
	});
}

//
// === Initialization ===
//
function onReady(fn) {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', fn);
	} else {
		// DOM already ready — run immediately
		fn();
	}
}

onReady(async () => {
	// Bind DOM element references now that DOM is available
	function bindDOM() {
		mainEl       = document.getElementById("mainChart");
		volumeEl     = document.getElementById("volumeChart");
		indicatorEl  = document.getElementById("indicatorChart");

		tickerInput   = document.getElementById("tickerSearch");
		searchButton  = document.getElementById("searchButton");
		suggestionsEl = document.getElementById("tickerSuggestions");
		searchClearEl = document.getElementById("searchClear");

		watchlistEl       = document.getElementById("watchlistItems");
		marketIndexesList = document.getElementById("marketIndexesList");

		saveConfigBtn = document.getElementById("saveConfig");
		loadConfigBtn = document.getElementById("loadConfig");

		centerAddWatchlistBtn = document.getElementById("centerAddWatchlist");

		mlMethodDropdownBtn   = document.getElementById("mlMethodDropdownBtn");
		mlMethodDropdown      = document.getElementById("mlMethodDropdown");
		mlFeaturesDropdownBtn = document.getElementById("mlFeaturesDropdownBtn");
		mlFeaturesDropdown    = document.getElementById("mlFeaturesDropdown");
		runMLBtn              = document.getElementById("runMLButton");
		mlDaysDropdownBtn     = document.getElementById("mlDaysDropdownBtn");
		mlDaysDropdown        = document.getElementById("mlDaysDropdown");
	}

	bindDOM();
	await updateMarketInfoUI();
	const wl = JSON.parse(localStorage.getItem("watchlist") || "[]");
	await updateWatchlistUI(wl);

	initCharts();
	populateDropdowns();
	setupAutocomplete();
	populateMLDropdowns();

	// Run ML button
	runMLBtn.addEventListener("click", () => {
		const t = currentLoadedTicker?.trim();
		if (!t) return alert("No ticker loaded in view.");
		if (!selectedMLMethod) return alert("Select an ML Method");
		fetchMLData(t, selectedMLMethod, selectedMLFeatures, selectedMLDays);
	});

	// Search
	searchButton.addEventListener("click", () => {
		const t = tickerInput.value.trim();
		if (t) fetchStock(t, "1y");
	});

	// Timeframe buttons
	document.getElementById("timeframeButtons").addEventListener("click", e => {
		if (e.target.tagName !== "BUTTON") return;
		document.querySelectorAll("#timeframeButtons button").forEach(b => b.classList.remove("active"));
		e.target.classList.add("active");
		const t = tickerInput.value.trim();
		if (t) fetchStock(t, e.target.dataset.period);
	});

	saveConfigBtn.addEventListener("click", saveConfig);
	loadConfigBtn.addEventListener("click", loadConfig);

	centerAddWatchlistBtn.addEventListener("click", () => {
		const t = currentLoadedTicker?.trim();
		if (!t) return;
		const wl = JSON.parse(localStorage.getItem("watchlist") || "[]");
		if (!wl.includes(t)) {
			wl.push(t);
			localStorage.setItem("watchlist", JSON.stringify(wl));
			updateWatchlistUI(wl);
		}
	});

	window.addEventListener("resize", () => {
		mainChart?.resize(mainEl.clientWidth,  mainEl.clientHeight);
		volumeChart?.resize(volumeEl.clientWidth, volumeEl.clientHeight);
		indicatorChart?.resize(indicatorEl.clientWidth, indicatorEl.clientHeight);
	});
});
