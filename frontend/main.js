"use strict";
console.log("main.js loaded");

// Chart containers
const mainEl = document.getElementById("mainChart");
const volumeEl = document.getElementById("volumeChart");
const indicatorEl = document.getElementById("indicatorChart");

// Input and button elements
const tickerInput = document.getElementById("tickerSearch");
const searchButton = document.getElementById("searchButton");

// Suggestions element for autocomplete
const suggestionsEl = document.getElementById("tickerSuggestions");

// Watchlist container
const watchlistEl = document.getElementById("watchlistItems");

// Chart instances and data maps
let mainChart, volumeChart, indicatorChart;
let mainSeries, volumeSeries;
let overlayMap = {};
let indicatorMap = {};

// Definitions for indicator colors and dropdown options
const INDICATOR_COLORS = {
  "ma50": "#FF0000",
  "ma100": "#008000",
  "ma150": "#0000FF",
  "ma200": "#FF00FF",
  "boll_ma": "#FF9900",
  "boll_upper": "#FF0000",
  "boll_lower": "#0000FF",
  "rsi": "#AA0000",
  "obv": "#0055AA",
  "atr": "#AA7700",
  "macd": "#660066",
  "volatility": "#AA0088",
  "momentum": "#008888",
};

const PRICE_INDICATORS = [
  { label: "MA(50)", value: "ma50" },
  { label: "MA(100)", value: "ma100" },
  { label: "MA(150)", value: "ma150" },
  { label: "MA(200)", value: "ma200" },
  { label: "Bollinger Bands", value: "bollinger" }
];
const SPECIAL_INDICATORS = [
  { label: "RSI", value: "rsi" },
  { label: "OBV", value: "obv" },
  { label: "ATR", value: "atr" },
  { label: "MACD", value: "macd" },
  { label: "Volatility", value: "volatility" },
  { label: "Momentum", value: "momentum" }
];

/**
 * Helper: Format market cap.
 */
function formatMarketCap(value) {
  if (value >= 1e12) return (value / 1e12).toFixed(1) + "T";
  else if (value >= 1e9) return (value / 1e9).toFixed(1) + "B";
  else if (value >= 1e6) return (value / 1e6).toFixed(1) + "M";
  else return value.toFixed(1);
}

/**
 * Show/hide loading overlay.
 */
function showLoadingOverlay() {
  document.getElementById("loadingOverlay").style.display = "flex";
  console.log("Loading overlay shown.");
}
function hideLoadingOverlay() {
  document.getElementById("loadingOverlay").style.display = "none";
  console.log("Loading overlay hidden.");
}

/**
 * Create and sync charts.
 */
function initCharts() {
  const PRICE_SCALE_WIDTH = 60;
  console.log("Initializing charts...");
  mainChart = LightweightCharts.createChart(mainEl, {
    width: mainEl.clientWidth,
    height: mainEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderVisible: true, borderColor: "#000", width: PRICE_SCALE_WIDTH },
  });
  volumeChart = LightweightCharts.createChart(volumeEl, {
    width: volumeEl.clientWidth,
    height: volumeEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderVisible: true, borderColor: "#000", width: PRICE_SCALE_WIDTH },
  });
  indicatorChart = LightweightCharts.createChart(indicatorEl, {
    width: indicatorEl.clientWidth,
    height: indicatorEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderVisible: true, borderColor: "#000", width: PRICE_SCALE_WIDTH },
  });
  const charts = [mainChart, volumeChart, indicatorChart];
  charts.forEach((chart, idx) => {
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range !== null) {
        charts.forEach((other, otherIdx) => {
          if (otherIdx !== idx) {
            other.timeScale().setVisibleLogicalRange(range);
          }
        });
      }
    });
  });
  console.log("Charts initialized.");
}

/**
 * Fix scale widths so that the volume axis aligns.
 */
function fixScaleWidths() {
  const charts = [mainChart, volumeChart, indicatorChart];
  const widths = charts.map(ch => ch.priceScale("right").width());
  const maxWidth = Math.max(...widths);
  charts.forEach(ch => {
    ch.applyOptions({ rightPriceScale: { width: maxWidth } });
  });
  console.log("Fixed scale widths to", maxWidth);
}

/**
 * Render main and volume data.
 */
function renderMainAndVolume(data) {
  console.log("Rendering main and volume data...", data);
  if (mainChart) mainChart.remove();
  if (volumeChart) volumeChart.remove();
  if (indicatorChart) indicatorChart.remove();
  initCharts();
  const chartType = getCurrentChartType();
  const dates = data.Date || [];
  const open = data.Open || [];
  const close = data.Close || [];
  const high = data.High || [];
  const low = data.Low || [];
  const volume = data.Volume || [];
  let mainData = [];
  let volumeData = [];
  for (let i = 0; i < dates.length; i++) {
    const t = Math.floor(new Date(dates[i]).getTime() / 1000);
    if (chartType === "candlestick") {
      mainData.push({ time: t, open: open[i], high: high[i], low: low[i], close: close[i] });
    } else {
      mainData.push({ time: t, value: close[i] });
    }
    const barColor = (close[i] >= open[i]) ? "#26a69a" : "#ef5350";
    volumeData.push({ time: t, value: volume[i], color: barColor });
  }
  if (chartType === "candlestick") {
    mainSeries = mainChart.addCandlestickSeries();
    mainSeries.setData(mainData);
  } else if (chartType === "area") {
    mainSeries = mainChart.addAreaSeries();
    mainSeries.setData(mainData);
  } else {
    mainSeries = mainChart.addLineSeries();
    mainSeries.setData(mainData);
  }
  volumeSeries = volumeChart.addHistogramSeries({
    priceFormat: { type: "volume", precision: 0, minMove: 1 },
    priceScaleId: "right",
    color: "#26a69a"
  });
  volumeSeries.setData(volumeData);
  if (mainData.length === 0) {
    console.warn("No main chart data available.");
    return { firstTime: null, lastTime: null };
  }
  return {
    firstTime: mainData[0].time,
    lastTime: mainData[mainData.length - 1].time
  };
}

/**
 * Get the current chart type from the dropdown.
 */
function getCurrentChartType() {
  const selectedItem = document.querySelector("#chartTypeDropdown .dropdown-item.selected");
  return selectedItem ? selectedItem.getAttribute("data-value") : "candlestick";
}

/**
 * Fetch stock data and KPI, then update charts.
 */
function fetchStock(ticker, timeframe) {
  console.log("Fetching stock data for:", ticker, "with timeframe:", timeframe);
  showLoadingOverlay();
  const stockUrl = `http://127.0.0.1:8000/stock/${ticker}?period=${timeframe}&interval=1d`;
  const kpiUrl = `http://127.0.0.1:8000/kpi/${ticker}`;
  Promise.all([fetch(stockUrl), fetch(kpiUrl)])
    .then(([stockRes, kpiRes]) => {
      console.log("Responses received.");
      if (!stockRes.ok) throw new Error("Stock fetch error: " + stockRes.statusText);
      if (!kpiRes.ok) throw new Error("KPI fetch error: " + kpiRes.statusText);
      return Promise.all([stockRes.json(), kpiRes.json()]);
    })
    .then(([stockData, kpiData]) => {
      hideLoadingOverlay();
      console.log("Stock data:", stockData);
      console.log("KPI data:", kpiData);
      const { firstTime, lastTime } = renderMainAndVolume(stockData);
      overlayMap = {};
      indicatorMap = {};
      document.getElementById("mainChartLegend").innerHTML = "";
      document.getElementById("indicatorChartLegend").innerHTML = "";
      if (firstTime && lastTime) {
        reAddAllIndicators().then(() => {
          mainChart.timeScale().setVisibleRange({ from: firstTime, to: lastTime });
          volumeChart.timeScale().setVisibleRange({ from: firstTime, to: lastTime });
          indicatorChart.timeScale().setVisibleRange({ from: firstTime, to: lastTime });
          setTimeout(() => fixScaleWidths(), 200);
        });
      }
      updateTopInfo(ticker, stockData, kpiData);
      fetchNews(ticker);
    })
    .catch(err => {
      hideLoadingOverlay();
      console.error("Error fetching stock/kpi:", err);
    });
}

/**
 * Re-add all checked indicators.
 */
function reAddAllIndicators() {
  const priceChecks = document.querySelectorAll("#priceIndicatorDropdown input[type=checkbox]:checked");
  const specialChecks = document.querySelectorAll("#specialIndicatorDropdown input[type=checkbox]:checked");
  const pricePromises = Array.from(priceChecks).map(chk => toggleIndicator(chk.value, true));
  const specialPromises = Array.from(specialChecks).map(chk => toggleIndicator(chk.value, true));
  return Promise.all([...pricePromises, ...specialPromises]).then(() => {
    setTimeout(() => fixScaleWidths(), 100);
  });
}

/**
 * Toggle an indicator on/off.
 */
function toggleIndicator(indicatorValue, isChecked) {
  const ticker = tickerInput.value.trim();
  if (!ticker) return Promise.resolve();
  if (isChecked) {
    return fetchIndicatorData(ticker, indicatorValue);
  } else {
    removeIndicator(indicatorValue);
    fixScaleWidths();
    return Promise.resolve();
  }
}

/**
 * Fetch indicator data.
 */
function fetchIndicatorData(ticker, indicatorValue) {
  return new Promise((resolve, reject) => {
    const activeBtn = document.querySelector("#timeframeButtons .active");
    const periodParam = activeBtn ? activeBtn.dataset.period : "1Y";
    const url = `http://127.0.0.1:8000/indicators/${ticker}?period=${periodParam}&interval=1d`;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error("Indicator fetch error: " + res.statusText);
        return res.json();
      })
      .then(data => {
        applyIndicator(indicatorValue, data);
        fixScaleWidths();
        resolve();
      })
      .catch(err => reject(err));
  });
}

/**
 * Apply indicator data.
 */
function applyIndicator(indicatorValue, data) {
  const isPrice = ["ma50", "ma100", "ma150", "ma200", "bollinger"].includes(indicatorValue);
  if (isPrice) {
    applyPriceIndicator(indicatorValue, data);
  } else {
    applySpecialIndicator(indicatorValue, data);
  }
}

/**
 * Apply a price indicator on the main chart.
 */
function applyPriceIndicator(indicatorValue, data) {
  if (!mainChart || !data.Date) return;
  if (indicatorValue.startsWith("ma")) {
    const maField = "MA" + indicatorValue.replace("ma", "");
    createLineOverlayOnMainChart(indicatorValue, data.Date, data[maField]);
  } else if (indicatorValue === "bollinger") {
    createLineOverlayOnMainChart("boll_ma", data.Date, data.Bollinger_MA, "#FF9900");
    createLineOverlayOnMainChart("boll_upper", data.Date, data.Upper_Band, "#FF0000");
    createLineOverlayOnMainChart("boll_lower", data.Date, data.Lower_Band, "#0000FF");
  }
}

/**
 * Apply a special indicator on the indicator chart.
 */
function applySpecialIndicator(indicatorValue, data) {
  if (!indicatorChart || !data.Date) return;
  let field;
  switch (indicatorValue) {
    case "rsi":        field = data.RSI; break;
    case "obv":        field = data.OBV; break;
    case "atr":        field = data.ATR; break;
    case "macd":       field = data.MACD; break;
    case "volatility": field = data.Volatility; break;
    case "momentum":   field = data.Momentum; break;
  }
  if (!field) return;
  createLineOverlayOnIndicatorChart(indicatorValue, data.Date, field);
}

/**
 * Create a line overlay on the main chart.
 */
function createLineOverlayOnMainChart(key, dates, values, color) {
  let seriesData = [];
  for (let i = 0; i < dates.length; i++) {
    if (values[i] != null) {
      const t = Math.floor(new Date(dates[i]).getTime() / 1000);
      seriesData.push({ time: t, value: values[i] });
    }
  }
  const series = mainChart.addLineSeries({
    color: color || INDICATOR_COLORS[key] || "#AA0000",
    lineWidth: 2
  });
  series.setData(seriesData);
  overlayMap[key] = series;
  addLegendItem("mainChartLegend", key, color || INDICATOR_COLORS[key]);
}

/**
 * Create a line overlay on the indicator chart.
 */
function createLineOverlayOnIndicatorChart(key, dates, values) {
  let seriesData = [];
  for (let i = 0; i < dates.length; i++) {
    if (values[i] != null) {
      const t = Math.floor(new Date(dates[i]).getTime() / 1000);
      seriesData.push({ time: t, value: values[i] });
    }
  }
  const color = INDICATOR_COLORS[key] || "#AA0000";
  const series = indicatorChart.addLineSeries({ color, lineWidth: 2 });
  series.setData(seriesData);
  indicatorMap[key] = series;
  addLegendItem("indicatorChartLegend", key, color);
}

/**
 * Remove an indicator.
 */
function removeIndicator(indicatorValue) {
  if (overlayMap[indicatorValue] && mainChart.removeSeries) {
    mainChart.removeSeries(overlayMap[indicatorValue]);
    delete overlayMap[indicatorValue];
    removeLegendItem("mainChartLegend", indicatorValue);
  }
  if (indicatorMap[indicatorValue] && indicatorChart.removeSeries) {
    indicatorChart.removeSeries(indicatorMap[indicatorValue]);
    delete indicatorMap[indicatorValue];
    removeLegendItem("indicatorChartLegend", indicatorValue);
  }
  if (indicatorValue === "bollinger") {
    ["boll_ma", "boll_upper", "boll_lower"].forEach(k => {
      if (overlayMap[k]) {
        mainChart.removeSeries(overlayMap[k]);
        delete overlayMap[k];
        removeLegendItem("mainChartLegend", k);
      }
    });
  }
}

/**
 * Add a legend item.
 */
function addLegendItem(legendContainerId, key, color) {
  const container = document.getElementById(legendContainerId);
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

/**
 * Remove a legend item.
 */
function removeLegendItem(legendContainerId, key) {
  const item = document.getElementById(`legend-item-${key}`);
  if (item) item.remove();
}

/**
 * Format date/time.
 */
function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  const options = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    timeZone: 'America/New_York'
  };
  return date.toLocaleString('en-US', options);
}

/**
 * Format number with commas.
 */
function formatNumberWithCommas(num) {
  if (typeof num !== 'number' || isNaN(num)) return "N/A";
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Update KPI table.
 */
function updateTopInfo(ticker, data, kpiData) {
  if (!data.Date || !data.Date.length) return;
  const lastIndex = data.Date.length - 1;
  const lastPrice = data.Close[lastIndex];
  const prevPrice = lastIndex > 0 ? data.Close[lastIndex - 1] : lastPrice;
  const change = lastPrice - prevPrice;
  const pct = (change / prevPrice) * 100;
  const exchange = kpiData.exchange || "";
  const currency = kpiData.currency || "";
  document.getElementById("stockExchange").textContent = exchange && currency ? `${exchange} - ${currency}` : "";
  document.getElementById("stockName").textContent = `${ticker} - ${kpiData.companyName || ""}`;
  document.getElementById("stockPrice").textContent = (lastPrice ?? 0).toFixed(2);
  document.getElementById("stockChange").textContent =
    (change >= 0 ? "+" : "") + change.toFixed(2) + ` (${pct.toFixed(2)}%)`;
  const period = document.querySelector("#timeframeButtons .active").dataset.period.toUpperCase();
  const latestDate = new Date(data.Date[lastIndex]);
  const today = new Date();
  const isToday = latestDate.toDateString() === today.toDateString();
  const marketOpenTime = new Date(latestDate); marketOpenTime.setHours(9, 30, 0, 0);
  const marketCloseTime = new Date(latestDate); marketCloseTime.setHours(16, 0, 0, 0);
  let marketStatus = (period === "1D" && isToday && latestDate >= marketOpenTime && latestDate <= marketCloseTime)
    ? "Market Open" : "At Close";
  const formattedDate = formatDateTime(data.Date[lastIndex]);
  document.getElementById("stockDate").textContent = `As of ${formattedDate} (${marketStatus})`;
  let pe = kpiData.peRatio;
  if (typeof pe === "number") pe = pe.toFixed(1);
  document.getElementById("peRatio").textContent = pe ?? "N/A";
  let mc = kpiData.marketCap;
  if (typeof mc === "number") mc = formatMarketCap(mc);
  document.getElementById("marketCap").textContent = mc ?? "N/A";
  document.getElementById("weekHigh").textContent = kpiData.weekHigh52 ? kpiData.weekHigh52.toFixed(2) : "N/A";
  document.getElementById("weekLow").textContent = kpiData.weekLow52 ? kpiData.weekLow52.toFixed(2) : "N/A";
  document.getElementById("beta").textContent = kpiData.beta ?? "N/A";
  document.getElementById("eps").textContent = kpiData.eps ?? "N/A";
  document.getElementById("dividend").textContent = kpiData.dividend ?? "N/A";
  document.getElementById("exDividendDate").textContent = kpiData.exDividendDate ?? "N/A";
  document.getElementById("openPrice").textContent = kpiData.openPrice ? kpiData.openPrice.toFixed(2) : "N/A";
  document.getElementById("previousClose").textContent = kpiData.previousClose ? kpiData.previousClose.toFixed(2) : "N/A";
  document.getElementById("daysRange").textContent = kpiData.daysRange ?? "N/A";
  document.getElementById("weekRange").textContent = kpiData.weekRange ?? "N/A";
  const lastVolume = data.Volume[lastIndex];
  document.getElementById("volumeKpi").textContent = lastVolume ? formatNumberWithCommas(lastVolume) : "N/A";
  const avgVol = kpiData.avgVolume;
  document.getElementById("avgVolume").textContent = avgVol ? formatNumberWithCommas(Math.round(avgVol)) : "N/A";

  // New KPI fields:
  document.getElementById("forwardPE").textContent = kpiData.forwardPE ? kpiData.forwardPE : "N/A";
  document.getElementById("nextEarningsDate").textContent = kpiData.nextEarningsDate ? kpiData.nextEarningsDate : "N/A";
}

/**
 * Fetch news for the ticker.
 */
function fetchNews(ticker) {
  const newsUrl = `http://127.0.0.1:8000/news/${ticker}`;
  console.log("Fetching news for", ticker);
  fetch(newsUrl)
    .then(res => {
      if (!res.ok) throw new Error("News fetch error: " + res.statusText);
      return res.json();
    })
    .then(news => {
      console.log("News received:", news);
      displayNews(news);
    })
    .catch(err => {
      console.error("Error fetching news:", err);
      displayNews([]);
    });
}

/**
 * Display news items.
 */
function displayNews(news) {
  const newsList = document.getElementById("newsList");
  newsList.innerHTML = "";
  if (news.length === 0) {
    newsList.innerHTML = "<li>No news found.</li>";
    return;
  }
  news.forEach(item => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = item.link;
    a.target = "_blank";
    a.textContent = item.title;
    li.appendChild(a);
    if (item.provider && item.provider.name) {
      const span = document.createElement("span");
      span.textContent = ` (${item.provider.name})`;
      li.appendChild(span);
    }
    newsList.appendChild(li);
  });
}

/**
 * Autocomplete: Use local proxy.
 */
function autoSuggestTickers(query) {
  const url = `http://127.0.0.1:8000/autocomplete?q=${encodeURIComponent(query)}`;
  console.log("Fetching autocomplete suggestions for query:", query);
  return fetch(url)
    .then(r => r.json())
    .then(data => data.quotes || [])
    .catch(err => {
      console.error("Ticker search request failed:", err);
      return [];
    });
}

/**
 * Setup autocomplete.
 */
function setupAutocomplete() {
  tickerInput.addEventListener("input", e => {
    e.target.value = e.target.value.toUpperCase();
    const query = e.target.value.trim();
    if (query.length < 1) {
      suggestionsEl.innerHTML = "";
      suggestionsEl.style.display = "none";
      return;
    }
    autoSuggestTickers(query).then(quotes => {
      console.log("Autocomplete suggestions received:", quotes);
      suggestionsEl.innerHTML = "";
      if (quotes.length === 0) {
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
        });
        suggestionsEl.appendChild(div);
      });
      suggestionsEl.style.display = "block";
    });
  });
  document.addEventListener("click", e => {
    if (!e.target.closest(".search-container")) {
      suggestionsEl.innerHTML = "";
      suggestionsEl.style.display = "none";
    }
  });
}

/**
 * Populate dropdowns for chart type and indicators.
 */
function populateDropdowns() {
  // Chart type dropdown: Toggle on button click.
  const chartTypeDropdownBtn = document.getElementById("chartTypeDropdownBtn");
  const chartTypeDropdown = document.getElementById("chartTypeDropdown");
  chartTypeDropdownBtn.addEventListener("click", e => {
    // Toggle display of dropdown content.
    if (chartTypeDropdown.style.display === "block") {
      chartTypeDropdown.style.display = "none";
    } else {
      chartTypeDropdown.style.display = "block";
    }
  });
  // Default selection:
  const defaultItem = chartTypeDropdown.querySelector('[data-value="candlestick"]');
  if (defaultItem) defaultItem.classList.add("selected");
  chartTypeDropdown.querySelectorAll(".dropdown-item").forEach(item => {
    item.addEventListener("click", () => {
      chartTypeDropdown.querySelectorAll(".dropdown-item").forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
      chartTypeDropdownBtn.textContent = item.textContent.trim();
      chartTypeDropdown.style.display = "none"; // Hide dropdown after selection.
      const ticker = tickerInput.value.trim();
      const activeBtn = document.querySelector("#timeframeButtons .active");
      const timeframe = activeBtn ? activeBtn.dataset.period : "1Y";
      if (ticker) fetchStock(ticker, timeframe);
    });
  });

  // Price indicators dropdown (custom checkboxes)
  const priceDropdown = document.getElementById("priceIndicatorDropdown");
  PRICE_INDICATORS.forEach(ind => {
    let label = document.createElement("label");
    label.textContent = ind.label;
    let chk = document.createElement("input");
    chk.type = "checkbox";
    chk.value = ind.value;
    let tickSpan = document.createElement("span");
    tickSpan.classList.add("tick");
    tickSpan.textContent = "✓";
    label.appendChild(tickSpan);
    label.prepend(chk);
    priceDropdown.appendChild(label);
    chk.addEventListener("change", e => {
      if (e.target.checked) {
        label.classList.add("checked");
      } else {
        label.classList.remove("checked");
      }
      toggleIndicator(chk.value, e.target.checked);
    });
  });

  // Special indicators dropdown (custom checkboxes)
  const specialDropdown = document.getElementById("specialIndicatorDropdown");
  SPECIAL_INDICATORS.forEach(ind => {
    let label = document.createElement("label");
    label.textContent = ind.label;
    let chk = document.createElement("input");
    chk.type = "checkbox";
    chk.value = ind.value;
    let tickSpan = document.createElement("span");
    tickSpan.classList.add("tick");
    tickSpan.textContent = "✓";
    label.appendChild(tickSpan);
    label.prepend(chk);
    specialDropdown.appendChild(label);
    chk.addEventListener("change", e => {
      if (e.target.checked) {
        label.classList.add("checked");
      } else {
        label.classList.remove("checked");
      }
      toggleIndicator(chk.value, e.target.checked);
    });
  });
}

/**
 * Watchlist functions.
 */
function updateWatchlistUI(watchlist) {
  const ul = document.getElementById("watchlistItems");
  ul.innerHTML = "";
  watchlist.forEach(ticker => {
    const li = document.createElement("li");
    li.textContent = ticker;
    li.addEventListener("click", () => {
      tickerInput.value = ticker;
      fetchStock(ticker, "1Y");
    });
    ul.appendChild(li);
  });
}

function addToWatchlist() {
  const ticker = tickerInput.value.trim();
  if (!ticker) return;
  let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  if (!watchlist.includes(ticker)) {
    watchlist.push(ticker);
    localStorage.setItem("watchlist", JSON.stringify(watchlist));
    updateWatchlistUI(watchlist);
    console.log("Added to watchlist:", ticker);
  }
}

function saveConfig() {
  alert("Watchlist saved.");
}

function loadConfig() {
  let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  updateWatchlistUI(watchlist);
  console.log("Watchlist loaded.");
}

/**
 * DOMContentLoaded: Initialize everything.
 */
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed.");
  initCharts();
  setupAutocomplete();
  populateDropdowns();

  searchButton.addEventListener("click", () => {
    const ticker = tickerInput.value.trim();
    if (ticker) fetchStock(ticker, "1Y");
  });

  document.getElementById("addWatchlistItem").addEventListener("click", addToWatchlist);
  document.getElementById("saveConfig").addEventListener("click", saveConfig);
  document.getElementById("loadConfig").addEventListener("click", loadConfig);

  document.getElementById("timeframeButtons").addEventListener("click", e => {
    if (e.target.tagName === "BUTTON") {
      document.querySelectorAll("#timeframeButtons button").forEach(btn => btn.classList.remove("active"));
      e.target.classList.add("active");
      const ticker = tickerInput.value.trim();
      if (ticker) fetchStock(ticker, e.target.dataset.period);
    }
  });

  window.addEventListener("resize", () => {
    if (mainChart) mainChart.resize(mainEl.clientWidth, mainEl.clientHeight);
    if (volumeChart) volumeChart.resize(volumeEl.clientWidth, volumeEl.clientHeight);
    if (indicatorChart) indicatorChart.resize(indicatorEl.clientWidth, indicatorEl.clientHeight);
    setTimeout(() => fixScaleWidths(), 100);
  });
});
