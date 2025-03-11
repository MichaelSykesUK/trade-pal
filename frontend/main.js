"use strict";
console.log("main.js loaded");

// Chart containers
const mainEl = document.getElementById("mainChart");
const volumeEl = document.getElementById("volumeChart");
const indicatorEl = document.getElementById("indicatorChart");

// Search + suggestions + clear
const tickerInput = document.getElementById("tickerSearch");
const searchButton = document.getElementById("searchButton");
const suggestionsEl = document.getElementById("tickerSuggestions");
const searchClearEl = document.getElementById("searchClear");

// Watchlist & market
const watchlistEl = document.getElementById("watchlistItems");
const marketIndexesList = document.getElementById("marketIndexesList");

// Save/Load config
const saveConfigBtn = document.getElementById("saveConfig");
const loadConfigBtn = document.getElementById("loadConfig");

// Add to watchlist in center
const centerAddWatchlistBtn = document.getElementById("centerAddWatchlist");

// Charts
let mainChart, volumeChart, indicatorChart;
let mainSeries, volumeSeries;
let overlayMap = {};
let indicatorMap = {};

// Indicators
let selectedIndicators = {
  price: new Set(),
  special: new Set()
};

const PRICE_INDICATORS = [
  { label: "MA(50)", value: "ma50" },
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
const INDICATOR_COLORS = {
  "ma50": "#FF0000",
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

/** Show/hide overlay */
function showLoadingOverlay() {
  document.getElementById("loadingOverlay").style.display = "flex";
}
function hideLoadingOverlay() {
  document.getElementById("loadingOverlay").style.display = "none";
}

/** Initialize charts */
function initCharts() {
  mainChart = LightweightCharts.createChart(mainEl, {
    width: mainEl.clientWidth,
    height: mainEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderVisible: true, borderColor: "#ccc", width: 60, scaleMargins: { top: 0.05, bottom: 0.05 } },
  });
  volumeChart = LightweightCharts.createChart(volumeEl, {
    width: volumeEl.clientWidth,
    height: volumeEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderVisible: true, borderColor: "#ccc", width: 60, scaleMargins: { top: 0, bottom: 0 } },
  });
  indicatorChart = LightweightCharts.createChart(indicatorEl, {
    width: indicatorEl.clientWidth,
    height: indicatorEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: { borderVisible: true, borderColor: "#ccc", width: 60, scaleMargins: { top: 0.05, bottom: 0.05 } },
  });

  const charts = [mainChart, volumeChart, indicatorChart];
  charts.forEach((chart, idx) => {
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (range !== null) {
        charts.forEach((other, oIdx) => {
          if (oIdx !== idx) {
            other.timeScale().setVisibleLogicalRange(range);
          }
        });
      }
    });
  });
}

/** Fix scale widths */
function fixScaleWidths() {
  const charts = [mainChart, volumeChart, indicatorChart];
  const widths = charts.map(ch => ch.priceScale("right").width());
  const maxWidth = Math.max(...widths);
  charts.forEach(ch => {
    ch.applyOptions({ rightPriceScale: { width: maxWidth } });
  });
}

/** Render main & volume data */
function renderMainAndVolume(stockData) {
  if (mainChart) mainChart.remove();
  if (volumeChart) volumeChart.remove();
  if (indicatorChart) indicatorChart.remove();
  initCharts();

  const chartType = getCurrentChartType();
  const dates = stockData.Date || [];
  const open = stockData.Open || [];
  const close = stockData.Close || [];
  const high = stockData.High || [];
  const low = stockData.Low || [];
  const volume = stockData.Volume || [];

  let mainData = [], volumeData = [];
  for (let i = 0; i < dates.length; i++) {
    const t = Math.floor(new Date(dates[i]).getTime() / 1000);
    if (chartType === "candlestick") {
      mainData.push({ time: t, open: open[i], high: high[i], low: low[i], close: close[i] });
    } else {
      mainData.push({ time: t, value: close[i] });
    }
    let barColor = (close[i] >= open[i]) ? "#26a69a" : "#ef5350";
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

  if (!mainData.length) return { firstTime: null, lastTime: null };
  return { firstTime: mainData[0].time, lastTime: mainData[mainData.length - 1].time };
}

/** Get current chart type */
function getCurrentChartType() {
  const sel = document.querySelector("#chartTypeDropdown .dropdown-item.selected");
  return sel ? sel.getAttribute("data-value") : "candlestick";
}

/** Fetch stock + KPI => reAdd => fetch news => hide overlay */
function fetchStock(ticker, timeframe) {
  console.log("fetchStock:", ticker, timeframe);
  showLoadingOverlay();
  const stockUrl = `http://127.0.0.1:8000/stock/${ticker}?period=${timeframe}&interval=1d`;
  const kpiUrl = `http://127.0.0.1:8000/kpi/${ticker}`;

  Promise.all([fetch(stockUrl), fetch(kpiUrl)])
    .then(([sRes, kRes]) => {
      if (!sRes.ok) throw new Error("Stock fetch error: " + sRes.statusText);
      if (!kRes.ok) throw new Error("KPI fetch error: " + kRes.statusText);
      return Promise.all([sRes.json(), kRes.json()]);
    })
    .then(([stockData, kpiData]) => {
      console.log("StockData:", stockData, "KPI Data:", kpiData);
      const { firstTime, lastTime } = renderMainAndVolume(stockData);
      updateTopInfo(ticker, stockData, kpiData);

      overlayMap = {};
      indicatorMap = {};
      document.getElementById("mainChartLegend").innerHTML = "";
      document.getElementById("indicatorChartLegend").innerHTML = "";

      const indicatorsPromise = reAddAllIndicators();
      const newsPromise = fetchNews(ticker);

      if (firstTime !== null && lastTime !== null) {
        indicatorsPromise.then(() => {
          try {
            mainChart.timeScale().setVisibleRange({ from: firstTime, to: lastTime });
            volumeChart.timeScale().setVisibleRange({ from: firstTime, to: lastTime });
            indicatorChart.timeScale().setVisibleRange({ from: firstTime, to: lastTime });
          } catch (err) {
            console.error("Error setting visible range:", err);
          }
          setTimeout(() => fixScaleWidths(), 200);
        });
      }
      Promise.all([indicatorsPromise, newsPromise])
        .then(() => hideLoadingOverlay())
        .catch(() => hideLoadingOverlay());
    })
    .catch(err => {
      console.error("fetchStock error:", err);
      hideLoadingOverlay();
    });
}

/** Re-add selected indicators */
function reAddAllIndicators() {
  const tasks = [];
  selectedIndicators.price.forEach(val => tasks.push(fetchIndicatorData(tickerInput.value.trim(), val)));
  selectedIndicators.special.forEach(val => tasks.push(fetchIndicatorData(tickerInput.value.trim(), val)));
  return Promise.all(tasks);
}

/** Toggle indicator */
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
      fixScaleWidths();
      return Promise.resolve();
    }
  } else {
    if (isChecked) {
      selectedIndicators.special.add(val);
      return fetchIndicatorData(ticker, val);
    } else {
      selectedIndicators.special.delete(val);
      removeIndicator(val);
      fixScaleWidths();
      return Promise.resolve();
    }
  }
}

/** Fetch indicator data */
function fetchIndicatorData(ticker, val) {
  return new Promise((resolve, reject) => {
    const activeBtn = document.querySelector("#timeframeButtons .active");
    const period = activeBtn ? activeBtn.dataset.period : "1Y";
    const url = `http://127.0.0.1:8000/indicators/${ticker}?period=${period}&interval=1d`;
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error("Indicator fetch error: " + r.statusText);
        return r.json();
      })
      .then(data => {
        applyIndicator(val, data);
        fixScaleWidths();
        resolve();
      })
      .catch(err => reject(err));
  });
}

/** Apply indicator data */
function applyIndicator(val, data) {
  const isPrice = ["ma50", "ma100", "ma150", "ma200", "bollinger"].includes(val);
  if (isPrice) applyPriceIndicator(val, data);
  else applySpecialIndicator(val, data);
}

/** Price indicators => main chart */
function applyPriceIndicator(val, data) {
  if (!mainChart || !data.Date) return;
  if (val.startsWith("ma")) {
    const maField = "MA" + val.replace("ma", "");
    createLineOverlayOnMainChart(val, data.Date, data[maField]);
  } else if (val === "bollinger") {
    createLineOverlayOnMainChart("boll_ma", data.Date, data.Bollinger_MA, "#FF9900");
    createLineOverlayOnMainChart("boll_upper", data.Date, data.Upper_Band, "#FF0000");
    createLineOverlayOnMainChart("boll_lower", data.Date, data.Lower_Band, "#0000FF");
  }
}

/** Special indicators => indicator chart */
function applySpecialIndicator(val, data) {
  if (!indicatorChart || !data.Date) return;
  let field;
  switch (val) {
    case "rsi": field = data.RSI; break;
    case "obv": field = data.OBV; break;
    case "atr": field = data.ATR; break;
    case "macd": field = data.MACD; break;
    case "volatility": field = data.Volatility; break;
    case "momentum": field = data.Momentum; break;
  }
  if (!field) return;
  createLineOverlayOnIndicatorChart(val, data.Date, field);
}

/** Create line overlay on main chart */
function createLineOverlayOnMainChart(key, dates, values, color) {
  let seriesData = [];
  for (let i = 0; i < dates.length; i++) {
    if (values[i] != null) {
      const t = Math.floor(new Date(dates[i]).getTime() / 1000);
      seriesData.push({ time: t, value: values[i] });
    }
  }
  const c = color || INDICATOR_COLORS[key] || "#AA0000";
  const series = mainChart.addLineSeries({ color: c, lineWidth: 2 });
  series.setData(seriesData);
  overlayMap[key] = series;
  addLegendItem("mainChartLegend", key, c);
}

/** Create line overlay on indicator chart */
function createLineOverlayOnIndicatorChart(key, dates, values) {
  let seriesData = [];
  for (let i = 0; i < dates.length; i++) {
    if (values[i] != null) {
      const t = Math.floor(new Date(dates[i]).getTime() / 1000);
      seriesData.push({ time: t, value: values[i] });
    }
  }
  const c = INDICATOR_COLORS[key] || "#AA0000";
  const series = indicatorChart.addLineSeries({ color: c, lineWidth: 2 });
  series.setData(seriesData);
  indicatorMap[key] = series;
  addLegendItem("indicatorChartLegend", key, c);
}

/** Remove indicator */
function removeIndicator(val) {
  if (overlayMap[val] && mainChart.removeSeries) {
    mainChart.removeSeries(overlayMap[val]);
    delete overlayMap[val];
    removeLegendItem("mainChartLegend", val);
  }
  if (indicatorMap[val] && indicatorChart.removeSeries) {
    indicatorChart.removeSeries(indicatorMap[val]);
    delete indicatorMap[val];
    removeLegendItem("indicatorChartLegend", val);
  }
  if (val === "bollinger") {
    ["boll_ma", "boll_upper", "boll_lower"].forEach(k => {
      if (overlayMap[k]) {
        mainChart.removeSeries(overlayMap[k]);
        delete overlayMap[k];
        removeLegendItem("mainChartLegend", k);
      }
    });
  }
}

/** Legend item */
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
function removeLegendItem(legendContainerId, key) {
  const item = document.getElementById(`legend-item-${key}`);
  if (item) item.remove();
}

/** Format date/time */
function formatDateTime(dateStr) {
  const d = new Date(dateStr);
  const opts = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
    timeZone: "America/New_York"
  };
  return d.toLocaleString("en-US", opts);
}

/** Format number with commas */
function formatNumberWithCommas(num) {
  if (typeof num !== "number" || isNaN(num)) return "N/A";
  return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Update top info with color-coded daily change */
function updateTopInfo(ticker, data, kpiData) {
  if (!data.Date || !data.Date.length) return;
  const lastIndex = data.Date.length - 1;
  const lastPrice = data.Close[lastIndex];
  const prevPrice = (lastIndex > 0) ? data.Close[lastIndex - 1] : lastPrice;
  const change = lastPrice - prevPrice;
  const pct = (change / prevPrice) * 100;

  const exchange = kpiData.exchange || "";
  const currency = kpiData.currency || "";
  const fullName = `${kpiData.companyName || "Unknown"} (${ticker})`;
  document.getElementById("stockName").textContent = fullName;
  document.getElementById("stockExchange").textContent = (exchange && currency) ? `${exchange} - ${currency}` : "";
  document.getElementById("stockPrice").textContent = (lastPrice || 0).toFixed(2);

  const changeEl = document.getElementById("stockChange");
  const sign = (change >= 0) ? "+" : "";
  changeEl.textContent = `${sign}${change.toFixed(2)} (${sign}${pct.toFixed(2)}%)`;
  changeEl.classList.remove("up", "down");
  if (change > 0) changeEl.classList.add("up");
  else if (change < 0) changeEl.classList.add("down");

  const period = document.querySelector("#timeframeButtons .active")?.dataset.period?.toUpperCase() || "1Y";
  const latestDate = new Date(data.Date[lastIndex]);
  const today = new Date();
  const isToday = (latestDate.toDateString() === today.toDateString());
  const marketOpen = new Date(latestDate); marketOpen.setHours(9, 30, 0, 0);
  const marketClose = new Date(latestDate); marketClose.setHours(16, 0, 0, 0);
  let marketStatus = (period === "1D" && isToday && latestDate >= marketOpen && latestDate <= marketClose)
    ? "Market Open" : "At Close";
  const formattedDate = formatDateTime(data.Date[lastIndex]);
  document.getElementById("stockDate").textContent = `As of ${formattedDate} (${marketStatus})`;

  // KPI fields
  const pe = (typeof kpiData.peRatio === "number") ? kpiData.peRatio.toFixed(1) : kpiData.peRatio;
  document.getElementById("peRatio").textContent = pe ?? "N/A";

  let mc = kpiData.marketCap;
  if (typeof mc === "number") mc = formatMarketCap(mc);
  document.getElementById("marketCap").textContent = mc ?? "N/A";

  document.getElementById("weekHigh").textContent = kpiData.weekHigh52 || "N/A";
  document.getElementById("weekLow").textContent = kpiData.weekLow52 || "N/A";
  document.getElementById("beta").textContent = kpiData.beta ?? "N/A";
  document.getElementById("eps").textContent = kpiData.eps ?? "N/A";
  document.getElementById("dividend").textContent = kpiData.dividend ?? "N/A";
  document.getElementById("exDividendDate").textContent = kpiData.exDividendDate ?? "N/A";
  document.getElementById("openPrice").textContent = (kpiData.openPrice ? kpiData.openPrice.toFixed(2) : "N/A");
  document.getElementById("previousClose").textContent = (kpiData.previousClose ? kpiData.previousClose.toFixed(2) : "N/A");
  document.getElementById("daysRange").textContent = (kpiData.daysRange ?? "N/A");
  document.getElementById("weekRange").textContent = (kpiData.weekRange ?? "N/A");
  const lastVolume = data.Volume[lastIndex];
  document.getElementById("volumeKpi").textContent = (lastVolume ? formatNumberWithCommas(lastVolume) : "N/A");
  const avgVol = kpiData.avgVolume;
  document.getElementById("avgVolume").textContent = (avgVol ? formatNumberWithCommas(Math.round(avgVol)) : "N/A");
  document.getElementById("forwardPE").textContent = (kpiData.forwardPE ?? "N/A");
  document.getElementById("nextEarningsDate").textContent = (kpiData.nextEarningsDate ?? "N/A");
}

/** Format market cap */
function formatMarketCap(val) {
  if (val >= 1e12) return (val / 1e12).toFixed(1) + "T";
  else if (val >= 1e9) return (val / 1e9).toFixed(1) + "B";
  else if (val >= 1e6) return (val / 1e6).toFixed(1) + "M";
  else return val.toFixed(1);
}

/** Fetch news */
function fetchNews(ticker) {
  console.log("fetchNews for", ticker);
  const url = `http://127.0.0.1:8000/news/${ticker}`;
  return fetch(url)
    .then(r => {
      if (!r.ok) throw new Error("News fetch error: " + r.statusText);
      return r.json();
    })
    .then(news => {
      displayNews(news);
    })
    .catch(err => {
      console.error("fetchNews error:", err);
      displayNews([]);
    });
}

/** Display news */
function displayNews(news) {
  const newsList = document.getElementById("newsList");
  newsList.innerHTML = "";
  if (!Array.isArray(news) || !news.length) {
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

    let publishTime = item.publishTime;
    if (!publishTime && item.provider && typeof item.provider.publishTime === "number") {
      publishTime = item.provider.publishTime;
    }
    if (!publishTime && item.provider && typeof item.provider.publish_time === "number") {
      publishTime = item.provider.publish_time;
    }
    if (publishTime) {
      const metaSpan = document.createElement("div");
      metaSpan.classList.add("news-meta");
      metaSpan.textContent = formatRelativeTime(publishTime);
      textDiv.appendChild(metaSpan);
    }

    li.appendChild(textDiv);

    let thumb = "yahoo-news.jpg";
    if (item.thumbnail?.resolutions?.length) {
      thumb = item.thumbnail.resolutions[0].url;
    }
    const img = document.createElement("img");
    img.src = thumb;
    img.classList.add("news-thumbnail");
    li.appendChild(img);

    newsList.appendChild(li);
  });
}

/** Format relative time => "16 hours ago" etc. */
function formatRelativeTime(unixSeconds) {
  const nowMs = Date.now();
  const pubMs = unixSeconds * 1000;
  let diff = nowMs - pubMs;
  if (diff < 0) diff = 0;
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

/** load/save watchlist from localStorage */
function loadConfig() {
  let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  console.log("loadConfig => watchlist:", watchlist);
  updateWatchlistUI(watchlist);
}
function saveConfig() {
  alert("Watchlist saved to localStorage.");
}

/** Add to Watchlist from center button */
centerAddWatchlistBtn.addEventListener("click", () => {
  const t = tickerInput.value.trim();
  if (!t) return;
  let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  if (!watchlist.includes(t)) {
    watchlist.push(t);
    localStorage.setItem("watchlist", JSON.stringify(watchlist));
    updateWatchlistUI(watchlist);
  }
});

/** Update watchlist UI => real daily & YTD data */
function updateWatchlistUI(watchlist) {
  watchlistEl.innerHTML = "";
  console.log("updateWatchlistUI => watchlist:", watchlist);
  watchlist.forEach(tkr => {
    // row1 is Ticker, Price, Daily, YTD, Remove X
    const li = document.createElement("li");
    li.classList.add("item-container");
    li.innerHTML = `
      <div class="item-row1">
        <div class="item-col-ticker">${tkr}</div>
        <div class="item-col-price">--</div>
        <div class="item-col-daily">--</div>
        <div class="item-col-ytd">--</div>
        <div class="item-col-remove">
          <span class="remove-watchlist-btn">&times;</span>
        </div>
      </div>
      <div class="item-row2">Loading name...</div>
    `;
    const removeBtn = li.querySelector(".remove-watchlist-btn");
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFromWatchlist(tkr);
    });
    li.addEventListener("click", (e) => {
      if (e.target === removeBtn) return;
      tickerInput.value = tkr;
      fetchStock(tkr, "1Y");
    });
    watchlistEl.appendChild(li);

    // fetch daily(5D), ytd(YTD), and KPI
    Promise.all([fetchKPI(tkr), fetchDailyData(tkr), fetchYTDData(tkr)])
      .then(([kpi, dailyData, ytdData]) => {
        console.log("Watchlist item fetched =>", tkr, kpi, dailyData, ytdData);
        li.querySelector(".item-row2").textContent = kpi.companyName || "Unknown";

        const priceEl = li.querySelector(".item-col-price");
        const dailyEl = li.querySelector(".item-col-daily");
        const ytdEl   = li.querySelector(".item-col-ytd");

        let currentPrice = 0, dailyChange = 0, dailyPct = 0;
        if (dailyData.Close && dailyData.Close.length >= 2) {
          const len = dailyData.Close.length;
          currentPrice = dailyData.Close[len - 1];
          const prev = dailyData.Close[len - 2];
          dailyChange = currentPrice - prev;
          dailyPct = (dailyChange / prev) * 100;
        }
        priceEl.textContent = currentPrice.toFixed(2);

        dailyEl.classList.remove("up","down");
        const sign = (dailyChange >= 0) ? "+" : "";
        dailyEl.textContent = `${sign}${dailyChange.toFixed(2)} (${sign}${dailyPct.toFixed(2)}%) Day`;
        if (dailyChange > 0) dailyEl.classList.add("up");
        else if (dailyChange < 0) dailyEl.classList.add("down");

        let ytdChange = 0, ytdPct = 0;
        if (ytdData.Close && ytdData.Close.length) {
          const firstClose = ytdData.Close[0];
          ytdChange = currentPrice - firstClose;
          ytdPct = (ytdChange / firstClose) * 100;
        }
        ytdEl.classList.remove("up","down");
        const sign2 = (ytdChange >= 0) ? "+" : "";
        ytdEl.textContent = `${sign2}${ytdChange.toFixed(2)} (${sign2}${ytdPct.toFixed(2)}%) YTD`;
        if (ytdChange > 0) ytdEl.classList.add("up");
        else if (ytdChange < 0) ytdEl.classList.add("down");
      })
      .catch(err => {
        console.error("Error fetching watchlist item data for", tkr, err);
        li.querySelector(".item-row2").textContent = "Error fetching data";
      });
  });
}

/** Remove from watchlist */
function removeFromWatchlist(tkr) {
  let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
  watchlist = watchlist.filter(x => x !== tkr);
  localStorage.setItem("watchlist", JSON.stringify(watchlist));
  updateWatchlistUI(watchlist);
}

/** Fetch daily => 5D => last 2 closes => daily change */
function fetchDailyData(ticker) {
  const url = `http://127.0.0.1:8000/stock/${ticker}?period=5D&interval=1d`;
  return fetch(url).then(r => r.json()).catch(() => ({}));
}

/** Fetch YTD => from Jan1 => YTD change */
function fetchYTDData(ticker) {
  const url = `http://127.0.0.1:8000/stock/${ticker}?period=YTD&interval=1d`;
  return fetch(url).then(r => r.json()).catch(() => ({}));
}

/** Fetch KPI => get companyName */
function fetchKPI(ticker) {
  const url = `http://127.0.0.1:8000/kpi/${ticker}`;
  return fetch(url).then(r => r.json()).catch(() => ({}));
}

/** Setup Autocomplete + Clear button */
function setupAutocomplete() {
  tickerInput.addEventListener("input", e => {
    e.target.value = e.target.value.toUpperCase();
    const query = e.target.value.trim();
    searchClearEl.style.display = query.length > 0 ? "block" : "none";
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
  });

  document.addEventListener("click", e => {
    if (!e.target.closest("#topSearchContainer")) {
      suggestionsEl.innerHTML = "";
      suggestionsEl.style.display = "none";
    }
  });
}

/** Autocomplete to your backend */
function autoSuggestTickers(q) {
  const url = `http://127.0.0.1:8000/autocomplete?q=${encodeURIComponent(q)}`;
  return fetch(url)
    .then(r => r.json())
    .then(data => data.quotes || [])
    .catch(err => []);
}

/** Populate dropdowns => default check ma50, ma150, rsi */
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

  const chartTypeDropdown = document.getElementById("chartTypeDropdown");
  chartTypeDropdown.querySelector('[data-value="candlestick"]')?.classList.add("selected");
  chartTypeDropdown.querySelectorAll(".dropdown-item").forEach(item => {
    item.addEventListener("click", () => {
      chartTypeDropdown.querySelectorAll(".dropdown-item").forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
      const t = tickerInput.value.trim();
      const activeBtn = document.querySelector("#timeframeButtons .active");
      const timeframe = activeBtn ? activeBtn.dataset.period : "1Y";
      if (t) fetchStock(t, timeframe);
    });
  });

  const priceDropdown = document.getElementById("priceIndicatorDropdown");
  PRICE_INDICATORS.forEach(ind => {
    const label = document.createElement("label");
    label.textContent = ind.label;
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.value = ind.value;
    const tickSpan = document.createElement("span");
    tickSpan.classList.add("tick");
    tickSpan.textContent = "✓";
    label.appendChild(tickSpan);
    label.prepend(chk);
    priceDropdown.appendChild(label);
    if (["ma50", "ma150"].includes(ind.value)) {
      chk.checked = true;
      label.classList.add("checked");
      selectedIndicators.price.add(ind.value);
    }
    chk.addEventListener("change", e => {
      label.classList.toggle("checked", e.target.checked);
      toggleIndicator(chk.value, e.target.checked);
    });
  });

  const specialDropdown = document.getElementById("specialIndicatorDropdown");
  SPECIAL_INDICATORS.forEach(ind => {
    const label = document.createElement("label");
    label.textContent = ind.label;
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.value = ind.value;
    const tickSpan = document.createElement("span");
    tickSpan.classList.add("tick");
    tickSpan.textContent = "✓";
    label.appendChild(tickSpan);
    label.prepend(chk);
    specialDropdown.appendChild(label);
    if (ind.value === "rsi") {
      chk.checked = true;
      label.classList.add("checked");
      selectedIndicators.special.add("rsi");
    }
    chk.addEventListener("change", e => {
      label.classList.toggle("checked", e.target.checked);
      toggleIndicator(chk.value, e.target.checked);
    });
  });
}

/** DOMContentLoaded */
document.addEventListener("DOMContentLoaded", () => {
  // Real Market Info (with ^ indexes)
  const MARKET_INDEXES = [
    { ticker: "^GSPC", name: "S&P 500" },
    { ticker: "^IXIC", name: "Nasdaq" },
    { ticker: "^DJI",  name: "Dow Jones" },
    { ticker: "^FTSE", name: "FTSE 100" },
    { ticker: "^N225", name: "Nikkei 225" },
  ];

  function updateMarketInfoUI() {
    marketIndexesList.innerHTML = "";
    MARKET_INDEXES.forEach(ix => {
      const li = document.createElement("li");
      li.classList.add("item-container");
      // same grid layout: Ticker, Price, Daily, YTD, no remove X
      li.innerHTML = `
        <div class="item-row1" style="display:grid; grid-template-columns: 60px 60px 80px 80px; align-items:center; gap:4px;">
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

      Promise.all([
        fetchMarketDaily(ix.ticker),
        fetchMarketYTD(ix.ticker),
        fetchKPI(ix.ticker)
      ])
      .then(([dailyData, ytdData, kpi]) => {
        const row2 = li.querySelector(".item-row2");
        if (kpi && kpi.companyName && kpi.companyName !== "N/A") {
          row2.textContent = kpi.companyName;
        }
        const priceEl = li.querySelector(".item-col-price");
        const dailyEl = li.querySelector(".item-col-daily");
        const ytdEl   = li.querySelector(".item-col-ytd");

        let currentPrice = 0, dailyChange = 0, dailyPct = 0;
        if (dailyData.Close && dailyData.Close.length >= 2) {
          const len = dailyData.Close.length;
          currentPrice = dailyData.Close[len - 1];
          const prev = dailyData.Close[len - 2];
          dailyChange = currentPrice - prev;
          dailyPct = (dailyChange / prev) * 100;
        }
        priceEl.textContent = currentPrice.toFixed(2);

        dailyEl.classList.remove("up","down");
        const sign = (dailyChange >= 0) ? "+" : "";
        dailyEl.textContent = `${sign}${dailyChange.toFixed(2)} (${sign}${dailyPct.toFixed(2)}%) Day`;
        if (dailyChange > 0) dailyEl.classList.add("up");
        else if (dailyChange < 0) dailyEl.classList.add("down");

        let ytdChange = 0, ytdPct = 0;
        if (ytdData.Close && ytdData.Close.length) {
          const firstClose = ytdData.Close[0];
          ytdChange = currentPrice - firstClose;
          ytdPct = (ytdChange / firstClose) * 100;
        }
        ytdEl.classList.remove("up","down");
        const sign2 = (ytdChange >= 0) ? "+" : "";
        ytdEl.textContent = `${sign2}${ytdChange.toFixed(2)} (${sign2}${ytdPct.toFixed(2)}%) YTD`;
        if (ytdChange > 0) ytdEl.classList.add("up");
        else if (ytdChange < 0) ytdEl.classList.add("down");
      })
      .catch(err => {
        console.error("Market info fetch error for", ix.ticker, err);
        li.querySelector(".item-row2").textContent = "Error fetching data";
      });
    });
  }
  updateMarketInfoUI();

  initCharts();
  populateDropdowns();
  setupAutocomplete();
  loadConfig();

  // On search click
  searchButton.addEventListener("click", () => {
    const t = tickerInput.value.trim();
    if (t) fetchStock(t, "1Y");
  });

  // Timeframe
  document.getElementById("timeframeButtons").addEventListener("click", e => {
    if (e.target.tagName === "BUTTON") {
      document.querySelectorAll("#timeframeButtons button").forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      const t = tickerInput.value.trim();
      if (t) fetchStock(t, e.target.dataset.period);
    }
  });

  saveConfigBtn.addEventListener("click", saveConfig);
  loadConfigBtn.addEventListener("click", loadConfig);

  window.addEventListener("resize", () => {
    if (mainChart) mainChart.resize(mainEl.clientWidth, mainEl.clientHeight);
    if (volumeChart) volumeChart.resize(volumeEl.clientWidth, volumeEl.clientHeight);
    if (indicatorChart) indicatorChart.resize(indicatorEl.clientWidth, indicatorEl.clientHeight);
    setTimeout(() => fixScaleWidths(), 100);
  });
});

/** Market daily => 5D data */
function fetchMarketDaily(ticker) {
  const url = `http://127.0.0.1:8000/stock/${ticker}?period=5D&interval=1d`;
  return fetch(url).then(r => r.json()).catch(() => ({}));
}
/** Market YTD => from Jan1 => YTD data */
function fetchMarketYTD(ticker) {
  const url = `http://127.0.0.1:8000/stock/${ticker}?period=YTD&interval=1d`;
  return fetch(url).then(r => r.json()).catch(() => ({}));
}
