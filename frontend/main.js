"use strict";
console.log("main.js loaded");

//
//
// === Configuration ===
//
const API_BASE = "";  // leave blank if FastAPI is on the same origin

//
// === DOM Elements ===
//
let currentLoadedTicker = null;

// Charts
const mainEl       = document.getElementById("mainChart");
const volumeEl     = document.getElementById("volumeChart");
const indicatorEl  = document.getElementById("indicatorChart");

// Search + suggestions
const tickerInput   = document.getElementById("tickerSearch");
const searchButton  = document.getElementById("searchButton");
const suggestionsEl = document.getElementById("tickerSuggestions");
const searchClearEl = document.getElementById("searchClear");

// Watchlist & market
const watchlistEl       = document.getElementById("watchlistItems");
const marketIndexesList = document.getElementById("marketIndexesList");

// Save/Load config
const saveConfigBtn = document.getElementById("saveConfig");
const loadConfigBtn = document.getElementById("loadConfig");

// Add to watchlist
const centerAddWatchlistBtn = document.getElementById("centerAddWatchlist");

// ML controls
const mlMethodDropdownBtn   = document.getElementById("mlMethodDropdownBtn");
const mlMethodDropdown      = document.getElementById("mlMethodDropdown");
const mlFeaturesDropdownBtn = document.getElementById("mlFeaturesDropdownBtn");
const mlFeaturesDropdown    = document.getElementById("mlFeaturesDropdown");
// must match HTML id="runMLButton"
const runMLBtn              = document.getElementById("runMLButton");

//
// === Global State ===
//
let mainChart, volumeChart, indicatorChart;
let mainSeries, volumeSeries;
let overlayMap   = {};
let indicatorMap = {};

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
      if (!sRes.ok) throw new Error("Stock fetch error: " + sRes.statusText);
      if (!kRes.ok) throw new Error("KPI fetch error: " + kRes.statusText);
      return Promise.all([sRes.json(), kRes.json()]);
    })
    .then(([stockData, kpiData]) => {
      const { firstTime, lastTime } = renderMainAndVolume(stockData);
      updateTopInfo(ticker, stockData, kpiData);

      // clear old overlays
      overlayMap   = {};
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
      Promise.allSettled([indPromise, newsPromise]).finally(hideLoadingOverlay);
    })
    .catch(err => {
      console.error(err);
      alert("❌ Error loading " + ticker + ": " + err.message);
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
  const timeframe = document.querySelector("#timeframeButtons .active")?.dataset.period || "1Y";
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

  // ML Features (multi-select)
  ML_FEATURES.forEach(f => {
    const label = document.createElement("label");
    label.textContent = f.label;
    const chk = document.createElement("input");
    chk.type  = "checkbox";
    chk.value = f.value;
    const tick = document.createElement("span");
    tick.classList.add("tick");
    tick.textContent = "✓";
    label.prepend(chk);
    label.appendChild(tick);
    mlFeaturesDropdown.appendChild(label);

    chk.addEventListener("change", e => {
      e.stopPropagation();
      label.classList.toggle("checked", chk.checked);
      selectedMLFeatures[f.value] = chk.checked;
    });
  });
}

function fetchMLData(ticker, model, features) {
  showLoadingOverlay();
  const timeframe = document.querySelector("#timeframeButtons .active").dataset.period;
  const url =
    `${API_BASE}/ml/${ticker}` +
    `?period=${timeframe}` +
    `&interval=1d` +
    `&model=${encodeURIComponent(model)}` +
    `&features=${encodeURIComponent(JSON.stringify(features))}`;

  fetch(url)
    .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
    .then(data => {
      applyMLOverlay(model, data);
      hideLoadingOverlay();
    })
    .catch(err => {
      console.error(err);
      alert("❌ ML failed: " + err.message);
      hideLoadingOverlay();
    });
}

function applyMLOverlay(name, data) {
  if (overlayMap[name]) {
    mainChart.removeSeries(overlayMap[name]);
    removeLegendItem("mainChartLegend", name);
  }
  const dates = data.Date       || data.dates       || [];
  const preds = data.Prediction || data.predictions || [];
  const seriesData = dates.map((d,i) => ({
    time:  Math.floor(new Date(d).getTime() / 1000),
    value: preds[i]
  }));
  const color  = "#AA00AA";
  const series = mainChart.addLineSeries({ color, lineWidth: 2 });
  series.setData(seriesData);
  overlayMap[name] = series;
  addLegendItem("mainChartLegend", name, color);
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

  // clear out the old list
  marketIndexesList.innerHTML = "";

  // fetch one at a time to avoid rate‐limit bursts
  for (const ix of MARKET_INDEXES) {
    // build the LI scaffold
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

    // clicking it still loads the full chart
    li.addEventListener("click", () => {
      tickerInput.value = ix.ticker;
      fetchStock(ix.ticker, "1Y");
    });

    // add it to the DOM before we await
    marketIndexesList.appendChild(li);

    // now actually fetch the data, with retry
    try {
      const data = await fetchWithRetry(
        `${API_BASE}/watchlist_data/${encodeURIComponent(ix.ticker)}`,
        3,      // retries
        500     // initial backoff ms
      );

      // pull out the cells
      const row2    = li.querySelector(".item-row2");
      const priceEl = li.querySelector(".item-col-price");
      const dailyEl = li.querySelector(".item-col-daily");
      const ytdEl   = li.querySelector(".item-col-ytd");

      // company name (shortName/longName) comes back here
      row2.textContent = data.companyName || ix.name;

      // only overwrite the dashes if we got a non‐zero price
      if (data.currentPrice != null && data.currentPrice !== 0) {
        // today's price
        priceEl.textContent = data.currentPrice.toFixed(2);

        // daily change
        const signD = data.dailyChange >= 0 ? "+" : "";
        dailyEl.textContent = `${signD}${data.dailyChange.toFixed(2)} (${signD}${data.dailyPct.toFixed(2)}%)`;
        dailyEl.classList.toggle("up",   data.dailyChange >  0);
        dailyEl.classList.toggle("down", data.dailyChange <  0);

        // YTD change
        const signY = data.ytdChange   >= 0 ? "+" : "";
        ytdEl.textContent = `${signY}${data.ytdChange.toFixed(2)} (${signY}${data.ytdPct.toFixed(2)}%)`;
        ytdEl.classList.toggle("up",   data.ytdChange >  0);
        ytdEl.classList.toggle("down", data.ytdChange <  0);
      }
    }
    catch (err) {
      console.error(`Market fetch failed for ${ix.ticker}:`, err);
      // leave the “--” or show an error
      li.querySelector(".item-row2").textContent = "Error fetching data";
    }
  }
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

  const timeframe = document.querySelector("#timeframeButtons .active")?.dataset.period || "1Y";
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
    img.src = item.thumbnail?.resolutions?.[0]?.url || "yahoo-news.jpg";
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

async function updateWatchlistUI(wl) {
  watchlistEl.innerHTML = "";
  for (const tkr of wl) {
    const li = createWatchlistItem(tkr);
    watchlistEl.appendChild(li);
    try {
      const data = await fetchWithRetry(`${API_BASE}/watchlist_data/${encodeURIComponent(tkr)}`);
      updateWatchlistItem(li, data);
    } catch (e) {
      console.error(e);
      li.querySelector(".item-row2").textContent = "Error fetching data";
    }
    await sleep(200);
  }
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
    fetchStock(tkr, "1Y");
  });
  return li;
}

function updateWatchlistItem(li, data) {
  const row2 = li.querySelector(".item-row2");
  if (data.currentPrice === 0 && data.companyName === "Unknown") {
    row2.textContent = "No data"; return;
  }
  row2.textContent = data.companyName || "Unknown";
  li.querySelector(".item-col-price").textContent = data.currentPrice.toFixed(2);

  const dailyEl = li.querySelector(".item-col-daily");
  const sD      = data.dailyChange >= 0 ? "+" : "";
  dailyEl.textContent = `${sD}${data.dailyChange.toFixed(2)} (${sD}${data.dailyPct.toFixed(2)}%) Day`;
  dailyEl.classList.toggle("up", data.dailyChange > 0);
  dailyEl.classList.toggle("down", data.dailyChange < 0);

  const ytdEl = li.querySelector(".item-col-ytd");
  const sY    = data.ytdChange >= 0 ? "+" : "";
  ytdEl.textContent = `${sY}${data.ytdChange.toFixed(2)} (${sY}${data.ytdPct.toFixed(2)}%) YTD`;
  ytdEl.classList.toggle("up", data.ytdChange > 0);
  ytdEl.classList.toggle("down", data.ytdChange < 0);
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
  tickerInput.addEventListener("input", e => {
    e.target.value = e.target.value.toUpperCase();
    const q = e.target.value.trim();
    searchClearEl.style.display = q ? "block" : "none";
    if (!q) {
      suggestionsEl.innerHTML = "";
      suggestionsEl.style.display = "none";
      return;
    }
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
      const tf = document.querySelector("#timeframeButtons .active")?.dataset.period || "1Y";
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
document.addEventListener("DOMContentLoaded", async () => {
  await updateMarketInfoUI();
  const wl = JSON.parse(localStorage.getItem("watchlist") || "[]");
  await updateWatchlistUI(wl);

  initCharts();
  populateDropdowns();
  setupAutocomplete();
  populateMLDropdowns();

  // Run ML button
  runMLBtn.addEventListener("click", () => {
    const t = tickerInput.value.trim();
    if (!t)                return alert("Enter a ticker first");
    if (!selectedMLMethod) return alert("Select an ML Method");
    fetchMLData(t, selectedMLMethod, selectedMLFeatures);
  });

  // Search
  searchButton.addEventListener("click", () => {
    const t = tickerInput.value.trim();
    if (t) fetchStock(t, "1Y");
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

  window.addEventListener("resize", () => {
    mainChart?.resize(mainEl.clientWidth,  mainEl.clientHeight);
    volumeChart?.resize(volumeEl.clientWidth, volumeEl.clientHeight);
    indicatorChart?.resize(indicatorEl.clientWidth, indicatorEl.clientHeight);
  });
});
