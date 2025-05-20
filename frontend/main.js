"use strict";
console.log("main.js loaded");

//
// === Configuration ===
//

const API_BASE = "";  // e.g. "" for same host, or "http://127.0.0.1:8000"

//
// === DOM Elements ===
//

let currentLoadedTicker = null; // Add this near the top

// Chart containers
const mainEl       = document.getElementById("mainChart");
const volumeEl     = document.getElementById("volumeChart");
const indicatorEl  = document.getElementById("indicatorChart");

// Search + suggestions + clear
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

// Add to watchlist in center
const centerAddWatchlistBtn = document.getElementById("centerAddWatchlist");

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
  { label: "MA(100)", value: "ma100" },  // newly added
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
  ma50:       "#FF0000",
  ma100:      "#00AA00",
  ma150:      "#0000FF",
  ma200:      "#FF00FF",
  boll_ma:    "#FF9900",
  boll_upper: "#FF0000",
  boll_lower: "#0000FF",
  rsi:        "#AA0000",
  obv:        "#0055AA",
  atr:        "#AA7700",
  macd:       "#660066",
  volatility: "#AA0088",
  momentum:   "#008888"
};

//
// === Overlay ===
//

function showLoadingOverlay() {
  document.getElementById("loadingOverlay").style.display = "flex";
}
function hideLoadingOverlay() {
  document.getElementById("loadingOverlay").style.display = "none";
  searchClearEl.style.display = tickerInput.value.trim().length > 0 ? "block" : "none";
}

//
// === Charts Setup ===
//

function initCharts() {
  const scaleWidth = 60;

  mainChart = LightweightCharts.createChart(mainEl, {
    width:  mainEl.clientWidth,
    height: mainEl.clientHeight,
    layout:  { backgroundColor: "#fff", textColor: "#333" },
    grid:    { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
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
    layout:  { backgroundColor: "#fff", textColor: "#333" },
    grid:    { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
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
    layout:  { backgroundColor: "#fff", textColor: "#333" },
    grid:    { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: {
      borderVisible: true,
      borderColor: "#ccc",
      width: scaleWidth,
      scaleMargins: { top: 0.05, bottom: 0.05 }
    }
  });

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
  // LightweightCharts uses remove() on the chart instance
  mainChart?.remove();
  volumeChart?.remove();
  indicatorChart?.remove();
}

//
// === Data Rendering ===
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

  const mainData   = [];
  const volumeData = [];

  for (let i = 0; i < dates.length; i++) {
    const t = Math.floor(new Date(dates[i]).getTime() / 1000);

    if (chartType === "candlestick") {
      mainData.push({
        time:  t,
        open:  open[i],
        high:  high[i],
        low:   low[i],
        close: close[i]
      });
    } else {
      mainData.push({ time: t, value: close[i] });
    }

    const color = (close[i] >= open[i]) ? "#26a69a" : "#ef5350";
    volumeData.push({ time: t, value: volume[i], color });
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
  volumeSeries.setData(volumeData);

  if (!mainData.length) {
    return { firstTime: null, lastTime: null };
  }
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
      if (!kRes.ok) throw new Error("KPI fetch error:  " + kRes.statusText);
      return Promise.all([sRes.json(), kRes.json()]);
    })
    .then(([stockData, kpiData]) => {
      console.log("StockData:", stockData, "KPI Data:", kpiData);

      const { firstTime, lastTime } = renderMainAndVolume(stockData);
      updateTopInfo(ticker, stockData, kpiData);

      // Clear previous indicators
      overlayMap   = {};
      indicatorMap = {};
      document.getElementById("mainChartLegend").innerHTML      = "";
      document.getElementById("indicatorChartLegend").innerHTML = "";

      // Load indicators + news in parallel, best-effort
      const indPromise  = reAddAllIndicators(ticker);
      const newsPromise = fetchNews(ticker);

      // Once indicators loaded, restore the visible range
      indPromise.then(() => {
        if (firstTime !== null && lastTime !== null) {
          try {
            [mainChart, volumeChart, indicatorChart].forEach(chart =>
              chart.timeScale().setVisibleRange({ from: firstTime, to: lastTime })
            );
          } catch (err) {
            console.error("Error setting visible range:", err);
          }
        }
      });

      Promise.allSettled([indPromise, newsPromise])
        .finally(() => hideLoadingOverlay());
    })
    .catch(err => {
      console.error("fetchStock error:", err);
      hideLoadingOverlay();
    });
}

//
// === Indicators ===
//

function reAddAllIndicators(ticker) {
  const tasks = [];

  selectedIndicators.price.forEach(val =>
    tasks.push(fetchIndicatorData(ticker, val))
  );
  selectedIndicators.special.forEach(val =>
    tasks.push(fetchIndicatorData(ticker, val))
  );

  return Promise.allSettled(tasks);
}

function toggleIndicator(val, isChecked) {
  const ticker = tickerInput.value.trim();
  if (!ticker) return Promise.resolve();

  const isPrice = PRICE_INDICATORS.some(pi => pi.value === val) || val === "bollinger";
  if (isPrice) {
    if (isChecked) {
      selectedIndicators.price.add(val);
      return fetchIndicatorData(ticker, val);
    } else {
      selectedIndicators.price.delete(val);
      removeIndicator(val);
      return Promise.resolve();
    }
  } else {
    if (isChecked) {
      selectedIndicators.special.add(val);
      return fetchIndicatorData(ticker, val);
    } else {
      selectedIndicators.special.delete(val);
      removeIndicator(val);
      return Promise.resolve();
    }
  }
}

function fetchIndicatorData(ticker, val) {
  const activeBtn = document.querySelector("#timeframeButtons .active");
  const period    = activeBtn?.dataset.period || "1Y";
  const url       = `${API_BASE}/indicators/${ticker}?period=${period}&interval=1d`;

  return fetch(url)
    .then(r => {
      if (!r.ok) throw new Error("Indicator fetch error: " + r.statusText);
      return r.json();
    })
    .then(data => applyIndicator(val, data))
    .catch(err => {
      console.error(`Failed to load indicator ${val}:`, err);
    });
}

function applyIndicator(val, data) {
  const isPrice = ["ma50","ma100","ma150","ma200","bollinger"].includes(val);
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
  if (!field) return;

  createLineOverlayOnIndicatorChart(val, data.Date, field);
}

function createLineOverlayOnMainChart(key, dates, values) {
  const seriesData = [];
  for (let i = 0; i < dates.length; i++) {
    if (values[i] == null) continue;
    const t = Math.floor(new Date(dates[i]).getTime() / 1000);
    seriesData.push({ time: t, value: values[i] });
  }
  const color  = INDICATOR_COLORS[key] || "#AA0000";
  const series = mainChart.addLineSeries({ color, lineWidth: 2 });
  series.setData(seriesData);
  overlayMap[key] = series;
  addLegendItem("mainChartLegend", key, color);
}

function createLineOverlayOnIndicatorChart(key, dates, values) {
  const seriesData = [];
  for (let i = 0; i < dates.length; i++) {
    if (values[i] == null) continue;
    const t = Math.floor(new Date(dates[i]).getTime() / 1000);
    seriesData.push({ time: t, value: values[i] });
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
// === Legends ===
//

function addLegendItem(legendContainerId, key, color) {
  const container = document.getElementById(legendContainerId);
  if (!container) return;

  const item = document.createElement("span");
  item.id = `legend-item-${key}`;
  item.style.display    = "inline-flex";
  item.style.alignItems = "center";
  item.style.marginRight= "8px";

  const line = document.createElement("span");
  line.style.display         = "inline-block";
  line.style.width           = "20px";
  line.style.height          = "2px";
  line.style.backgroundColor = color;
  line.style.marginRight     = "5px";

  const label = document.createElement("span");
  label.textContent = key;

  item.appendChild(line);
  item.appendChild(label);
  container.appendChild(item);
}

function removeLegendItem(legendContainerId, key) {
  const item = document.getElementById(`legend-item-${key}`);
  item?.remove();
}

//
// === Utility Formatters ===
//

function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  const opts = {
    month:  "short",
    day:    "numeric",
    year:   "numeric",
    hour:   "numeric",
    minute: "numeric",
    hour12: true,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
  return d.toLocaleString(undefined, opts);
}

function formatNumberWithCommas(num) {
  if (typeof num !== "number" || isNaN(num)) return "N/A";
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatMarketCap(val) {
  if (val >= 1e12) return (val / 1e12).toFixed(1) + "T";
  if (val >= 1e9)  return (val / 1e9).toFixed(1)  + "B";
  if (val >= 1e6)  return (val / 1e6).toFixed(1)  + "M";
  return val.toFixed(1);
}

//
// === Top Info & KPI ===
//

function updateTopInfo(ticker, data, kpiData) {
  if (!Array.isArray(data.Date) || data.Date.length === 0) return;

  const lastIndex = data.Date.length - 1;
  const lastPrice = data.Close[lastIndex];
  const prevPrice = data.Close[lastIndex - 1] ?? lastPrice;
  const change    = lastPrice - prevPrice;
  const pct       = prevPrice ? (change / prevPrice) * 100 : 0;

  const exchange = kpiData.exchange || "";
  const currency = kpiData.currency || "";
  const fullName = `${kpiData.companyName || "Unknown"} (${ticker})`;

  document.getElementById("stockName").textContent     = fullName;
  document.getElementById("stockExchange").textContent = exchange && currency ? `${exchange} · ${currency}` : "";
  document.getElementById("stockPrice").textContent    = lastPrice.toFixed(2);

  const changeEl = document.getElementById("stockChange");
  const sign     = change >= 0 ? "+" : "";
  changeEl.textContent = `${sign}${change.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
  changeEl.classList.toggle("up", change > 0);
  changeEl.classList.toggle("down", change < 0);

  const period = document.querySelector("#timeframeButtons .active")?.dataset.period || "1Y";
  const latestDate = new Date(data.Date[lastIndex]);
  const today      = new Date();
  const isToday    = latestDate.toDateString() === today.toDateString();

  const marketOpen  = new Date(latestDate); marketOpen.setHours(9,30,0,0);
  const marketClose = new Date(latestDate); marketClose.setHours(16,0,0,0);
  const marketStatus = (period === "1D" && isToday && latestDate >= marketOpen && latestDate <= marketClose)
    ? "Market Open" : "At Close";

  document.getElementById("stockDate").textContent =
    `As of ${formatDateTime(data.Date[lastIndex])} (${marketStatus})`;

  // KPI table
  document.getElementById("previousClose").textContent   = kpiData.previousClose?.toFixed(2)   ?? "N/A";
  document.getElementById("openPrice").textContent       = kpiData.openPrice?.toFixed(2)       ?? "N/A";
  document.getElementById("daysRange").textContent       = kpiData.daysRange                    ?? "N/A";
  document.getElementById("weekRange").textContent       = kpiData.weekRange                    ?? "N/A";
  document.getElementById("weekHigh").textContent        = kpiData.weekHigh52                   ?? "N/A";
  document.getElementById("weekLow").textContent         = kpiData.weekLow52                    ?? "N/A";
  document.getElementById("peRatio").textContent         = typeof kpiData.peRatio === "number"  ? kpiData.peRatio.toFixed(1) : kpiData.peRatio ?? "N/A";
  document.getElementById("marketCap").textContent       = formatMarketCap(kpiData.marketCap)   ?? "N/A";
  document.getElementById("forwardPE").textContent       = kpiData.forwardPE                    ?? "N/A";
  document.getElementById("nextEarningsDate").textContent= kpiData.nextEarningsDate             ?? "N/A";
  document.getElementById("beta").textContent            = kpiData.beta                        ?? "N/A";
  document.getElementById("eps").textContent             = kpiData.eps                         ?? "N/A";
  document.getElementById("dividend").textContent        = kpiData.dividend                    ?? "N/A";
  document.getElementById("exDividendDate").textContent  = kpiData.exDividendDate              ?? "N/A";

  document.getElementById("volumeKpi").textContent       = formatNumberWithCommas(data.Volume[lastIndex]) ?? "N/A";
  document.getElementById("avgVolume").textContent       = formatNumberWithCommas(Math.round(kpiData.avgVolume)) ?? "N/A";
}

//
// === News ===
//

function fetchNews(ticker) {
  const url = `${API_BASE}/news/${ticker}`;
  return fetch(url)
    .then(r => {
      if (!r.ok) throw new Error("News fetch error: " + r.statusText);
      return r.json();
    })
    .then(news => displayNews(news))
    .catch(err => {
      console.error("fetchNews error:", err);
      displayNews([]);
    });
}

function displayNews(news) {
  const newsList = document.getElementById("newsList");
  newsList.innerHTML = "";

  if (!Array.isArray(news) || news.length === 0) {
    newsList.innerHTML = "<li>No news found.</li>";
    return;
  }

  news.forEach(item => {
    const li = document.createElement("li");
    const textDiv = document.createElement("div");
    textDiv.classList.add("news-item-text");

    const a = document.createElement("a");
    a.href = item.link || "#";
    a.target = "_blank";
    a.textContent = item.title || "News Story";
    textDiv.appendChild(a);

    const meta = document.createElement("div");
    meta.classList.add("news-meta");

    let providerObj = null;
    if (Array.isArray(item.provider) && item.provider.length) {
      providerObj = item.provider[0];
    } else if (item.provider && typeof item.provider === "object") {
      providerObj = item.provider;
    }

    const publishTime = providerObj?.publishTime ?? item.providerPublishTime;
    let relative = "Unknown time";
    if (publishTime) {
      relative = formatRelativeTime(publishTime);
    }
    const sourceName = providerObj?.displayName || item.publisher || "Unknown source";
    meta.textContent = `${relative} • ${sourceName}`;

    textDiv.appendChild(meta);
    li.appendChild(textDiv);

    let thumb = item.thumbnail?.resolutions?.[0]?.url || "yahoo-news.jpg";
    const img = document.createElement("img");
    img.src = thumb;
    img.classList.add("news-thumbnail");
    li.appendChild(img);

    newsList.appendChild(li);
  });
}

function formatRelativeTime(unixSeconds) {
  const nowMs = Date.now();
  const pubMs = unixSeconds * 1000;
  let diff = Math.max(0, nowMs - pubMs);

  const hours = diff / (1000 * 60 * 60);
  if (hours < 24) {
    const h = Math.floor(hours);
    return h === 1 ? "1 hour ago" : `${h} hours ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

//
// === Watchlist ===
//

function loadConfig() {
  const watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  console.log("loadConfig => watchlist:", watchlist);
  updateWatchlistUI(watchlist);
}
function saveConfig() {
  alert("Watchlist saved to localStorage.");
}

centerAddWatchlistBtn.addEventListener("click", () => {
  const t = currentLoadedTicker?.trim();
  if (!t) return;
  const watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  if (!watchlist.includes(t)) {
    watchlist.push(t);
    localStorage.setItem("watchlist", JSON.stringify(watchlist));
    updateWatchlistUI(watchlist);
  }
});

async function updateWatchlistUI(watchlist) {
  watchlistEl.innerHTML = "";

  const maxConcurrent = 1;
  let index = 0;
  async function worker() {
    while (index < watchlist.length) {
      const tkr = watchlist[index++];
      const li = createWatchlistItem(tkr);
      watchlistEl.appendChild(li);

      try {
        const data = await fetchWithRetry(`${API_BASE}/watchlist_data/${encodeURIComponent(tkr)}`, 3, 500);
        updateWatchlistItem(li, data);
      } catch (err) {
        console.error(`Failed to fetch ${tkr}:`, err);
        li.querySelector(".item-row2").textContent = "Error fetching data";
      }
    }
  }
  await Promise.all(Array.from({ length: maxConcurrent }).map(() => worker()));
}

function fetchWithRetry(url, retries = 3, delay = 500) {
  return new Promise((resolve, reject) => {
    function attempt(n, currentDelay) {
      fetch(url)
        .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
        .then(resolve)
        .catch(err => {
          if (n > 0) {
            setTimeout(() => attempt(n - 1, currentDelay * 2), currentDelay);
          } else {
            reject(err);
          }
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
      <div class="item-col-remove">
        <span class="remove-watchlist-btn">×</span>
      </div>
    </div>
    <div class="item-row2">Loading...</div>
  `;

  const removeBtn = li.querySelector(".remove-watchlist-btn");
  removeBtn.addEventListener("click", e => {
    e.stopPropagation();
    removeFromWatchlist(tkr);
  });

  li.addEventListener("click", e => {
    if (e.target === removeBtn) return;
    tickerInput.value = tkr;
    fetchStock(tkr, "1Y");
  });

  return li;
}

function updateWatchlistItem(li, data) {
  const row2 = li.querySelector(".item-row2");
  if (data.currentPrice === 0 && data.companyName === "Unknown") {
    row2.textContent = "No data";
    return;
  }

  row2.textContent = data.companyName || "Unknown";

  li.querySelector(".item-col-price").textContent = data.currentPrice.toFixed(2);
  const dailyEl = li.querySelector(".item-col-daily");
  const signD = data.dailyChange >= 0 ? "+" : "";
  dailyEl.textContent = `${signD}${data.dailyChange.toFixed(2)} (${signD}${data.dailyPct.toFixed(2)}%) Day`;
  dailyEl.classList.toggle("up", data.dailyChange > 0);
  dailyEl.classList.toggle("down", data.dailyChange < 0);

  const ytdEl = li.querySelector(".item-col-ytd");
  const signY = data.ytdChange >= 0 ? "+" : "";
  ytdEl.textContent = `${signY}${data.ytdChange.toFixed(2)} (${signY}${data.ytdPct.toFixed(2)}%) YTD`;
  ytdEl.classList.toggle("up", data.ytdChange > 0);
  ytdEl.classList.toggle("down", data.ytdChange < 0);
}

function removeFromWatchlist(tkr) {
  const watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]")
    .filter(x => x !== tkr);
  localStorage.setItem("watchlist", JSON.stringify(watchlist));
  updateWatchlistUI(watchlist);
}

//
// === Autocomplete ===
//

function setupAutocomplete() {
  tickerInput.addEventListener("input", e => {
    e.target.value = e.target.value.toUpperCase();
    const query = e.target.value.trim();
    searchClearEl.style.display = query ? "block" : "none";
    if (!query) {
      suggestionsEl.innerHTML = "";
      suggestionsEl.style.display = "none";
      return;
    }
    autoSuggestTickers(query).then(quotes => {
      suggestionsEl.innerHTML = "";
      if (!quotes.length) {
        suggestionsEl.style.display = "none";
        return;
      }
      quotes.forEach(q => {
        const div = document.createElement("div");
        div.classList.add("suggestion-item");
        div.textContent = q.symbol + (q.shortname ? ` - ${q.shortname}` : "");
        div.addEventListener("click", () => {
          tickerInput.value = q.symbol;
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
  const url = `${API_BASE}/autocomplete?q=${encodeURIComponent(q)}`;
  return fetch(url)
    .then(r => r.json())
    .then(data => data.quotes || [])
    .catch(err => {
      console.error("Autocomplete error:", err);
      return [];
    });
}

//
// === Dropdowns ===
//

function populateDropdowns() {
  document.querySelectorAll(".dropdown>button").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("open"));
      btn.parentElement.classList.toggle("open");
    });
  });
  document.addEventListener("click", () => {
    document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("open"));
  });

  // Chart type
  const chartTypeDropdown = document.getElementById("chartTypeDropdown");
  chartTypeDropdown.querySelector('[data-value="candlestick"]')?.classList.add("selected");
  chartTypeDropdown.querySelectorAll(".dropdown-item").forEach(item => {
    item.addEventListener("click", () => {
      chartTypeDropdown.querySelectorAll(".dropdown-item").forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
      const t = tickerInput.value.trim();
      const timeframe = document.querySelector("#timeframeButtons .active")?.dataset.period || "1Y";
      if (t) fetchStock(t, timeframe);
    });
  });

  // Price indicators
  const priceDropdown = document.getElementById("priceIndicatorDropdown");
  PRICE_INDICATORS.forEach(ind => {
    const label = document.createElement("label");
    label.textContent = ind.label;
    const chk = document.createElement("input");
    chk.type  = "checkbox";
    chk.value = ind.value;
    const tickSpan = document.createElement("span");
    tickSpan.classList.add("tick");
    tickSpan.textContent = "✓";
    label.appendChild(tickSpan);
    label.prepend(chk);
    priceDropdown.appendChild(label);

    // default checked
    if (["ma50","ma100","ma150"].includes(ind.value)) {
      chk.checked = true;
      label.classList.add("checked");
      selectedIndicators.price.add(ind.value);
    }

    chk.addEventListener("change", e => {
      label.classList.toggle("checked", e.target.checked);
      toggleIndicator(ind.value, e.target.checked);
    });
  });

  // Special indicators
  const specialDropdown = document.getElementById("specialIndicatorDropdown");
  SPECIAL_INDICATORS.forEach(ind => {
    const label = document.createElement("label");
    label.textContent = ind.label;
    const chk = document.createElement("input");
    chk.type  = "checkbox";
    chk.value = ind.value;
    const tickSpan = document.createElement("span");
    tickSpan.classList.add("tick");
    tickSpan.textContent = "✓";
    label.appendChild(tickSpan);
    label.prepend(chk);
    specialDropdown.appendChild(label);

    // default checked
    if (ind.value === "rsi") {
      chk.checked = true;
      label.classList.add("checked");
      selectedIndicators.special.add("rsi");
    }

    chk.addEventListener("change", e => {
      label.classList.toggle("checked", e.target.checked);
      toggleIndicator(ind.value, e.target.checked);
    });
  });
}

//
// === Initialization ===
//

document.addEventListener("DOMContentLoaded", () => {
  // Market indexes
  const MARKET_INDEXES = [
    { ticker: "^GSPC", name: "S&P 500" },
    { ticker: "^IXIC", name: "Nasdaq" },
    { ticker: "^DJI",  name: "Dow Jones" },
    { ticker: "^FTSE", name: "FTSE 100" },
    { ticker: "^N225", name: "Nikkei 225" }
  ];

  function updateMarketInfoUI() {
    marketIndexesList.innerHTML = "";
    MARKET_INDEXES.forEach(ix => {
      const li = document.createElement("li");
      li.classList.add("item-container");
      li.innerHTML = `
        <div class="item-row1" style="display:grid; grid-template-columns: 60px 60px 80px 80px; gap:4px; align-items:center">
          <div class="item-col-ticker">${ix.ticker}</div>
          <div class="item-col-price">--</div>
          <div class="item-col-daily">--</div>
          <div class="item-col-ytd">--</div>
        </div>
        <div class="item-row2">${ix.name}</div>
      `;
      li.addEventListener("click", () => {
        tickerInput.value = ix.ticker;
        fetchStock(ix.ticker, "1Y");
      });
      marketIndexesList.appendChild(li);

      fetch(`${API_BASE}/watchlist_data/${encodeURIComponent(ix.ticker)}`)
        .then(r => r.json())
        .then(data => {
          const row2     = li.querySelector(".item-row2");
          const priceEl  = li.querySelector(".item-col-price");
          const dailyEl  = li.querySelector(".item-col-daily");
          const ytdEl    = li.querySelector(".item-col-ytd");

          row2.textContent = data.companyName || ix.name;
          if (data.currentPrice === 0 && data.companyName === "Unknown") {
            priceEl.textContent = "--";
            dailyEl.textContent = "--";
            ytdEl.textContent   = "--";
            return;
          }

          priceEl.textContent = data.currentPrice.toFixed(2);

          const signD = data.dailyChange >= 0 ? "+" : "";
          dailyEl.textContent = `${signD}${data.dailyChange.toFixed(2)} (${signD}${data.dailyPct.toFixed(2)}%) Day`;
          dailyEl.classList.toggle("up", data.dailyChange > 0);
          dailyEl.classList.toggle("down", data.dailyChange < 0);

          const signY = data.ytdChange >= 0 ? "+" : "";
          ytdEl.textContent = `${signY}${data.ytdChange.toFixed(2)} (${signY}${data.ytdPct.toFixed(2)}%) YTD`;
          ytdEl.classList.toggle("up", data.ytdChange > 0);
          ytdEl.classList.toggle("down", data.ytdChange < 0);
        })
        .catch(err => {
          console.error("Error fetching market info for", ix.ticker, err);
          li.querySelector(".item-row2").textContent = "Error fetching data";
        });
    });
  }

  updateMarketInfoUI();
  initCharts();
  populateDropdowns();
  setupAutocomplete();
  loadConfig();

  searchButton.addEventListener("click", () => {
    const t = tickerInput.value.trim();
    if (t) fetchStock(t, "1Y");
  });

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
