"use strict";
console.log("main.js loaded");

// Chart containers
const mainEl = document.getElementById("mainChart");
const volumeEl = document.getElementById("volumeChart");
const indicatorEl = document.getElementById("indicatorChart");

// Search elements
const tickerInput = document.getElementById("tickerSearch");
const searchButton = document.getElementById("searchButton");
const suggestionsEl = document.getElementById("tickerSuggestions");

// Watchlist, Market Info
const watchlistEl = document.getElementById("watchlistItems");
const marketIndexesList = document.getElementById("marketIndexesList");

// Chart instances
let mainChart, volumeChart, indicatorChart;
let mainSeries, volumeSeries;
let overlayMap = {};
let indicatorMap = {};

// Distinct colors
const INDICATOR_COLORS = {
  "ma50":       "#FF0000",
  "ma100":      "#008000",
  "ma150":      "#0000FF",
  "ma200":      "#FF00FF",
  "boll_ma":    "#FF9900",
  "boll_upper": "#FF0000",
  "boll_lower": "#0000FF",
  "rsi":        "#AA0000",
  "obv":        "#0055AA",
  "atr":        "#AA7700",
  "macd":       "#660066",
  "volatility": "#AA0088",
  "momentum":   "#008888",
};

// Price & Special Indicators
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

/** Convert a publishTime (UNIX) into e.g. "16 hours ago". */
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

/** Show/hide loading overlay */
function showLoadingOverlay() {
  document.getElementById("loadingOverlay").style.display = "flex";
  console.log("Loading overlay shown.");
}
function hideLoadingOverlay() {
  document.getElementById("loadingOverlay").style.display = "none";
  console.log("Loading overlay hidden.");
}

/** Initialize charts. */
function initCharts() {
  console.log("Initializing charts...");
  mainChart = LightweightCharts.createChart(mainEl, {
    width: mainEl.clientWidth,
    height: mainEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: {
      borderVisible: true,
      borderColor: "#ccc",
      width: 60,
      scaleMargins: { top: 0.05, bottom: 0.05 }
    },
  });

  volumeChart = LightweightCharts.createChart(volumeEl, {
    width: volumeEl.clientWidth,
    height: volumeEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: {
      borderVisible: true,
      borderColor: "#ccc",
      width: 60,
      scaleMargins: { top: 0, bottom: 0 } 
    },
  });

  indicatorChart = LightweightCharts.createChart(indicatorEl, {
    width: indicatorEl.clientWidth,
    height: indicatorEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true, secondsVisible: false },
    rightPriceScale: {
      borderVisible: true,
      borderColor: "#ccc",
      width: 60,
      scaleMargins: { top: 0.05, bottom: 0.05 }
    },
  });

  // Sync times
  const charts = [mainChart, volumeChart, indicatorChart];
  charts.forEach((chart, idx) => {
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
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

/** Force same right scale width. */
function fixScaleWidths() {
  const charts = [mainChart, volumeChart, indicatorChart];
  const widths = charts.map(ch => ch.priceScale("right").width());
  const maxWidth = Math.max(...widths);
  charts.forEach(ch => {
    ch.applyOptions({ rightPriceScale: { width: maxWidth } });
  });
  console.log("Fixed scale widths to", maxWidth);
}

/** Render main + volume data. */
function renderMainAndVolume(data) {
  console.log("Rendering main + volume data:", data);
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
    let barColor = (close[i] >= open[i]) ? "#26a69a" : "#ef5350";
    volumeData.push({ time: t, value: volume[i], color: barColor });
  }

  // main series
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

  // volume
  volumeSeries = volumeChart.addHistogramSeries({
    priceFormat: { type: "volume", precision: 0, minMove: 1 },
    priceScaleId: "right",
    color: "#26a69a"
  });
  volumeSeries.setData(volumeData);

  if (!mainData.length) {
    console.warn("No chart data available for this ticker/timeframe.");
    return { firstTime: null, lastTime: null };
  }
  return {
    firstTime: mainData[0].time,
    lastTime: mainData[mainData.length - 1].time
  };
}

/** Return chart type from dropdown. */
function getCurrentChartType() {
  const selectedItem = document.querySelector("#chartTypeDropdown .dropdown-item.selected");
  return selectedItem ? selectedItem.getAttribute("data-value") : "candlestick";
}

/** Fetch stock + KPI => reAddAllIndicators => fetchNews => hide overlay. */
function fetchStock(ticker, timeframe) {
  console.log("fetchStock called with:", ticker, timeframe);
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
      console.log("StockData:", stockData);
      console.log("KPI Data:", kpiData);
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
      // hide overlay once indicators + news are done
      Promise.all([indicatorsPromise, newsPromise])
        .then(() => hideLoadingOverlay())
        .catch(() => hideLoadingOverlay());
    })
    .catch(err => {
      console.error("Error fetching stock/kpi:", err);
      hideLoadingOverlay();
    });
}

/** Re-add all checked indicators. */
function reAddAllIndicators() {
  const priceChecks = document.querySelectorAll("#priceIndicatorDropdown input[type=checkbox]:checked");
  const specialChecks = document.querySelectorAll("#specialIndicatorDropdown input[type=checkbox]:checked");
  const pricePromises = Array.from(priceChecks).map(chk => toggleIndicator(chk.value, true));
  const specialPromises = Array.from(specialChecks).map(chk => toggleIndicator(chk.value, true));
  return Promise.all([...pricePromises, ...specialPromises]).then(() => {
    setTimeout(() => fixScaleWidths(), 100);
  });
}

/** Toggle an indicator. */
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

/** Fetch data for a specific indicator. */
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

/** Apply indicator data. */
function applyIndicator(indicatorValue, data) {
  const isPrice = ["ma50", "ma100", "ma150", "ma200", "bollinger"].includes(indicatorValue);
  if (isPrice) {
    applyPriceIndicator(indicatorValue, data);
  } else {
    applySpecialIndicator(indicatorValue, data);
  }
}
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
function applySpecialIndicator(indicatorValue, data) {
  if (!indicatorChart || !data.Date) return;
  let field;
  switch (indicatorValue) {
    case "rsi":        field = data.RSI;         break;
    case "obv":        field = data.OBV;         break;
    case "atr":        field = data.ATR;         break;
    case "macd":       field = data.MACD;        break;
    case "volatility": field = data.Volatility;  break;
    case "momentum":   field = data.Momentum;    break;
  }
  if (!field) return;
  createLineOverlayOnIndicatorChart(indicatorValue, data.Date, field);
}

/** Create line overlay on main chart. */
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

/** Create line overlay on indicator chart. */
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

/** Remove an indicator. */
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

/** Add a legend item. */
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

/** Remove a legend item. */
function removeLegendItem(legendContainerId, key) {
  const item = document.getElementById(`legend-item-${key}`);
  if (item) item.remove();
}

/** Format date/time for "As of" label. */
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

/** Format number with commas. */
function formatNumberWithCommas(num) {
  if (typeof num !== 'number' || isNaN(num)) return "N/A";
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Update KPI table. */
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

  const period = document.querySelector("#timeframeButtons .active")?.dataset.period?.toUpperCase() || "1Y";
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

  // Additional KPI fields
  document.getElementById("forwardPE").textContent = kpiData.forwardPE ? kpiData.forwardPE : "N/A";
  document.getElementById("nextEarningsDate").textContent = kpiData.nextEarningsDate ? kpiData.nextEarningsDate : "N/A";
}

/** Format Market Cap. */
function formatMarketCap(value) {
  if (value >= 1e12) return (value / 1e12).toFixed(1) + "T";
  else if (value >= 1e9) return (value / 1e9).toFixed(1) + "B";
  else if (value >= 1e6) return (value / 1e6).toFixed(1) + "M";
  else return value.toFixed(1);
}

/** Fetch news. */
function fetchNews(ticker) {
  console.log("Fetching news for:", ticker);
  const newsUrl = `http://127.0.0.1:8000/news/${ticker}`;
  return fetch(newsUrl)
    .then(r => {
      if (!r.ok) throw new Error("News fetch error: " + r.statusText);
      return r.json();
    })
    .then(news => {
      console.log("News for", ticker, news);
      displayNews(news);
    })
    .catch(err => {
      console.error("Error fetching news for", ticker, err);
      displayNews([]);
    });
}

/** Display news with text on left, image on right. */
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

    if (item.provider) {
      let metaStr = "";
      if (item.provider.name) {
        metaStr += item.provider.name;
      }
      if (typeof item.provider.publishTime === "number") {
        const rt = formatRelativeTime(item.provider.publishTime);
        metaStr = metaStr ? `${metaStr} - ${rt}` : rt;
      }
      if (metaStr) {
        const metaSpan = document.createElement("div");
        metaSpan.classList.add("news-meta");
        metaSpan.textContent = metaStr;
        textDiv.appendChild(metaSpan);
      }
    }
    li.appendChild(textDiv);

    let thumbnailUrl = "yahoo-news.jpg"; // fallback
    if (item.thumbnail?.resolutions?.length) {
      thumbnailUrl = item.thumbnail.resolutions[0].url;
    }
    const img = document.createElement("img");
    img.src = thumbnailUrl;
    img.classList.add("news-thumbnail");
    li.appendChild(img);

    newsList.appendChild(li);
  });
}

/** Watchlist. */
function updateWatchlistUI(watchlist) {
  watchlistEl.innerHTML = "";
  watchlist.forEach(ticker => {
    const li = document.createElement("li");
    li.textContent = ticker;
    li.addEventListener("click", () => {
      tickerInput.value = ticker;
      fetchStock(ticker, "1Y");
    });
    watchlistEl.appendChild(li);
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

/** Market indexes placeholders. */
function populateMarketIndexes() {
  const indexes = [
    { name: "S&P 500", ticker: "^GSPC", price: 4000, dayChg: "+12 (0.3%)", ytdChg: "+5%" },
    { name: "Nasdaq", ticker: "^IXIC", price: 12000, dayChg: "+45 (0.4%)", ytdChg: "+10%" },
    { name: "Dow Jones", ticker: "^DJI", price: 33000, dayChg: "-30 (0.1%)", ytdChg: "+2%" },
    { name: "FTSE 100", ticker: "^FTSE", price: 7400, dayChg: "+20 (0.2%)", ytdChg: "+3%" },
    { name: "Nikkei 225", ticker: "^N225", price: 28000, dayChg: "+80 (0.3%)", ytdChg: "+6%" }
  ];
  indexes.forEach(ix => {
    const li = document.createElement("li");
    // Now we add explicit Day: and YTD: labels
    li.innerHTML = `
      <span>${ix.name}</span>
      <span>Price: ${ix.price}, Day: ${ix.dayChg}, YTD: ${ix.ytdChg}</span>
    `;
    li.addEventListener("click", () => {
      console.log("Clicked index:", ix.ticker);
      fetchStock(ix.ticker, "1Y");
    });
    marketIndexesList.appendChild(li);
  });
}

/** Autocomplete for top search. */
function autoSuggestTickers(query) {
  const url = `http://127.0.0.1:8000/autocomplete?q=${encodeURIComponent(query)}`;
  console.log("Fetching autocomplete for query:", query);
  return fetch(url)
    .then(r => r.json())
    .then(data => data.quotes || [])
    .catch(err => {
      console.error("Autocomplete request failed:", err);
      return [];
    });
}
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
      console.log("Autocomplete suggestions:", quotes);
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
        });
        suggestionsEl.appendChild(div);
      });
      suggestionsEl.style.display = "block";
    });
  });

  document.addEventListener("click", e => {
    if (!e.target.closest("#topSearchContainer")) {
      suggestionsEl.innerHTML = "";
      suggestionsEl.style.display = "none";
    }
  });
}

/** Populate dropdowns. */
function populateDropdowns() {
  const dropdownButtons = document.querySelectorAll(".dropdown > button");
  dropdownButtons.forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("open"));
      btn.parentElement.classList.toggle("open");
    });
  });
  document.addEventListener("click", () => {
    document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("open"));
  });

  // Chart Type
  const chartTypeDropdownBtn = document.getElementById("chartTypeDropdownBtn");
  const chartTypeDropdown = document.getElementById("chartTypeDropdown");
  const defaultItem = chartTypeDropdown.querySelector('[data-value="candlestick"]');
  if (defaultItem) defaultItem.classList.add("selected");
  chartTypeDropdown.querySelectorAll(".dropdown-item").forEach(item => {
    item.addEventListener("click", () => {
      chartTypeDropdown.querySelectorAll(".dropdown-item").forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
      chartTypeDropdownBtn.textContent = item.textContent.trim();
      const ticker = tickerInput.value.trim();
      const activeBtn = document.querySelector("#timeframeButtons .active");
      const timeframe = activeBtn ? activeBtn.dataset.period : "1Y";
      if (ticker) fetchStock(ticker, timeframe);
    });
  });

  // Price indicators
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

  // Special indicators
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

/** DOMContentLoaded. */
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed.");

  // Populate Market Info placeholders
  const indexes = [
    { name: "S&P 500", ticker: "^GSPC", price: 4000, dayChg: "+12 (0.3%)", ytdChg: "+5%" },
    { name: "Nasdaq", ticker: "^IXIC", price: 12000, dayChg: "+45 (0.4%)", ytdChg: "+10%" },
    { name: "Dow Jones", ticker: "^DJI", price: 33000, dayChg: "-30 (0.1%)", ytdChg: "+2%" },
    { name: "FTSE 100", ticker: "^FTSE", price: 7400, dayChg: "+20 (0.2%)", ytdChg: "+3%" },
    { name: "Nikkei 225", ticker: "^N225", price: 28000, dayChg: "+80 (0.3%)", ytdChg: "+6%" }
  ];
  indexes.forEach(ix => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${ix.name}</span>
      <span>Price: ${ix.price}, Day: ${ix.dayChg}, YTD: ${ix.ytdChg}</span>
    `;
    li.addEventListener("click", () => {
      console.log("Clicked index:", ix.ticker);
      fetchStock(ix.ticker, "1Y");
    });
    marketIndexesList.appendChild(li);
  });

  // Initialize charts + dropdowns + autocomplete
  initCharts();
  populateDropdowns();
  setupAutocomplete();

  // Load watchlist from localStorage
  loadConfig();

  // Search button
  searchButton.addEventListener("click", () => {
    const ticker = tickerInput.value.trim();
    if (ticker) fetchStock(ticker, "1Y");
  });

  // Timeframe
  document.getElementById("timeframeButtons").addEventListener("click", e => {
    if (e.target.tagName === "BUTTON") {
      document.querySelectorAll("#timeframeButtons button").forEach(btn => btn.classList.remove("active"));
      e.target.classList.add("active");
      const ticker = tickerInput.value.trim();
      if (ticker) fetchStock(ticker, e.target.dataset.period);
    }
  });

  // Watchlist
  document.getElementById("addWatchlistItem").addEventListener("click", () => {
    const ticker = tickerInput.value.trim();
    if (!ticker) return;
    let watchlist = JSON.parse(localStorage.getItem("watchlist") || "[]");
    if (!watchlist.includes(ticker)) {
      watchlist.push(ticker);
      localStorage.setItem("watchlist", JSON.stringify(watchlist));
      updateWatchlistUI(watchlist);
    }
  });
  document.getElementById("saveConfig").addEventListener("click", () => {
    alert("Watchlist saved.");
  });
  document.getElementById("loadConfig").addEventListener("click", () => {
    loadConfig();
  });

  // On resize
  window.addEventListener("resize", () => {
    if (mainChart) mainChart.resize(mainEl.clientWidth, mainEl.clientHeight);
    if (volumeChart) volumeChart.resize(volumeEl.clientWidth, volumeEl.clientHeight);
    if (indicatorChart) indicatorChart.resize(indicatorEl.clientWidth, indicatorEl.clientHeight);
    setTimeout(() => fixScaleWidths(), 100);
  });
});
