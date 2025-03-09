"use strict";

// We'll have three charts: mainChart, volumeChart, indicatorChart
let mainChart, volumeChart, indicatorChart;
let mainSeries, volumeSeries;
let overlayMap = {};    // For price indicators on mainChart
let indicatorMap = {};  // For special indicators on indicatorChart

// Price Indicators
const PRICE_INDICATORS = [
  { label: "MA(50)", value: "ma50" },
  { label: "MA(100)", value: "ma100" },
  { label: "MA(150)", value: "ma150" },
  { label: "MA(200)", value: "ma200" },
  { label: "Bollinger Bands", value: "bollinger" }
];

// Special Indicators
const SPECIAL_INDICATORS = [
  { label: "RSI", value: "rsi" },
  { label: "OBV", value: "obv" },
  { label: "ATR", value: "atr" },
  { label: "MACD", value: "macd" },
  { label: "Volatility", value: "volatility" },
  { label: "Momentum", value: "momentum" }
];

/**
 * Show/Hide Loading Overlay
 */
function showLoadingOverlay() {
  document.getElementById("loadingOverlay").style.display = "flex";
}
function hideLoadingOverlay() {
  document.getElementById("loadingOverlay").style.display = "none";
}

/**
 * Initialize all charts: mainChart, volumeChart, indicatorChart
 */
function initCharts() {
  const mainEl = document.getElementById("mainChart");
  mainChart = LightweightCharts.createChart(mainEl, {
    width: mainEl.clientWidth,
    height: mainEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true, secondsVisible: false }
  });

  const volumeEl = document.getElementById("volumeChart");
  volumeChart = LightweightCharts.createChart(volumeEl, {
    width: volumeEl.clientWidth,
    height: volumeEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true, secondsVisible: false }
  });

  const indEl = document.getElementById("indicatorChart");
  indicatorChart = LightweightCharts.createChart(indEl, {
    width: indEl.clientWidth,
    height: indEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true, secondsVisible: false }
  });
}

/**
 * Render main price data + volume
 */
function renderMainAndVolume(data) {
  // Re-init charts (remove old ones if they exist)
  if (mainChart) mainChart.remove();
  if (volumeChart) volumeChart.remove();
  if (indicatorChart) indicatorChart.remove();
  
  initCharts();

  const chartType = document.getElementById("chartType").value;
  const dates = data.Date;
  const open = data.Open;
  const close = data.Close;
  const high = data.High;
  const low = data.Low;
  const volume = data.Volume;

  let mainData = [];
  let volumeData = [];
  for (let i = 0; i < dates.length; i++) {
    let time = Math.floor(new Date(dates[i]).getTime() / 1000);

    if (chartType === "candlestick") {
      mainData.push({ time, open: open[i], high: high[i], low: low[i], close: close[i] });
    } else if (chartType === "area" || chartType === "line") {
      mainData.push({ time, value: close[i] });
    }

    let barColor = (close[i] >= open[i]) ? "#26a69a" : "#ef5350";
    volumeData.push({ time, value: volume[i], color: barColor });
  }

  // Main chart
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

  // Volume chart
  volumeSeries = volumeChart.addHistogramSeries({
    priceFormat: { type: "volume" },
    priceScaleId: "",
    color: "#26a69a"
  });
  volumeSeries.setData(volumeData);

  mainChart.timeScale().fitContent();
  volumeChart.timeScale().fitContent();
  indicatorChart.timeScale().fitContent();

  // Reapply any selected indicators
  reapplyAllIndicators();
}

/**
 * Reapply all indicators (both price + special) after re-rendering the main chart.
 */
function reapplyAllIndicators() {
  // Remove old overlays from main chart
  for (let key in overlayMap) {
    if (overlayMap[key] && mainChart.removeSeries) {
      mainChart.removeSeries(overlayMap[key]);
    }
  }
  overlayMap = {};

  // Remove old indicators from indicator chart
  for (let key in indicatorMap) {
    if (indicatorMap[key] && indicatorChart.removeSeries) {
      indicatorChart.removeSeries(indicatorMap[key]);
    }
  }
  indicatorMap = {};

  // Re-check checkboxes in priceIndicatorDropdown
  document.querySelectorAll("#priceIndicatorDropdown input[type=checkbox]").forEach(chk => {
    if (chk.checked) toggleIndicator(chk.value, true);
  });
  // Re-check checkboxes in specialIndicatorDropdown
  document.querySelectorAll("#specialIndicatorDropdown input[type=checkbox]").forEach(chk => {
    if (chk.checked) toggleIndicator(chk.value, true);
  });
}

/**
 * Update top info bar + KPI fields
 */
function updateTopInfo(ticker, data, kpiData) {
  if (!data.Date || data.Date.length === 0) return;
  const lastIndex = data.Date.length - 1;
  const lastPrice = data.Close[lastIndex];
  const prevPrice = lastIndex > 0 ? data.Close[lastIndex - 1] : lastPrice;
  const change = lastPrice - prevPrice;
  const pct = (change / prevPrice) * 100;

  const companyName = kpiData.companyName || "Company Name";

  document.getElementById("stockName").textContent = `${ticker} - ${companyName}`;
  document.getElementById("stockPrice").textContent = lastPrice.toFixed(2);
  document.getElementById("stockChange").textContent =
    `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${pct.toFixed(2)}%)`;
  document.getElementById("stockDate").textContent = `As of ${data.Date[lastIndex]}`;

  // Additional KPI fields
  document.getElementById("peRatio").textContent = kpiData.peRatio ?? "N/A";
  document.getElementById("weekHigh").textContent = kpiData.weekHigh52 ?? "N/A";
  document.getElementById("weekLow").textContent = kpiData.weekLow52 ?? "N/A";
  document.getElementById("marketCap").textContent = kpiData.marketCap ?? "N/A";
  document.getElementById("beta").textContent = kpiData.beta ?? "N/A";
  document.getElementById("eps").textContent = kpiData.eps ?? "N/A";
  document.getElementById("dividend").textContent = kpiData.dividend ?? "N/A";
  document.getElementById("exDividendDate").textContent = kpiData.exDividendDate ?? "N/A";
}

/**
 * Fetch stock data + KPI
 */
function fetchStock(ticker, timeframe) {
  showLoadingOverlay();
  let periodParam = "1y";
  switch (timeframe) {
    case "1D": periodParam = "5d"; break;
    case "5D": periodParam = "5d"; break;
    case "1M": periodParam = "1mo"; break;
    case "6M": periodParam = "6mo"; break;
    case "YTD": periodParam = "ytd"; break;
    case "1Y": periodParam = "1y"; break;
    case "5Y": periodParam = "5y"; break;
    case "MAX": periodParam = "max"; break;
  }

  const stockUrl = `http://127.0.0.1:8000/stock/${ticker}?period=${periodParam}&interval=1d`;
  const kpiUrl = `http://127.0.0.1:8000/kpi/${ticker}`;

  Promise.all([ fetch(stockUrl), fetch(kpiUrl) ])
    .then(([stockRes, kpiRes]) => {
      if (!stockRes.ok) throw new Error("Stock fetch error: " + stockRes.statusText);
      if (!kpiRes.ok) throw new Error("KPI fetch error: " + kpiRes.statusText);
      return Promise.all([stockRes.json(), kpiRes.json()]);
    })
    .then(([stockData, kpiData]) => {
      hideLoadingOverlay();
      if (!stockData.Date || stockData.Date.length === 0) {
        console.error("No stock data returned for ticker:", ticker);
        return;
      }
      // Render main & volume
      renderMainAndVolume(stockData);
      // Update info bar
      updateTopInfo(ticker, stockData, kpiData);
    })
    .catch(err => {
      hideLoadingOverlay();
      console.error("Error fetching stock/kpi:", err);
    });
}

/**
 * Populate the two dropdowns: priceIndicatorDropdown + specialIndicatorDropdown
 */
function populateDropdowns() {
  const priceDropdown = document.getElementById("priceIndicatorDropdown");
  priceDropdown.innerHTML = "";
  PRICE_INDICATORS.forEach(ind => {
    let label = document.createElement("label");
    label.textContent = ind.label;
    let chk = document.createElement("input");
    chk.type = "checkbox";
    chk.value = ind.value;
    chk.addEventListener("change", e => {
      toggleIndicator(ind.value, e.target.checked);
    });
    label.prepend(chk);
    priceDropdown.appendChild(label);
  });

  const specialDropdown = document.getElementById("specialIndicatorDropdown");
  specialDropdown.innerHTML = "";
  SPECIAL_INDICATORS.forEach(ind => {
    let label = document.createElement("label");
    label.textContent = ind.label;
    let chk = document.createElement("input");
    chk.type = "checkbox";
    chk.value = ind.value;
    chk.addEventListener("change", e => {
      toggleIndicator(ind.value, e.target.checked);
    });
    label.prepend(chk);
    specialDropdown.appendChild(label);
  });
}

/**
 * Toggle an indicator on/off
 */
function toggleIndicator(indicatorValue, isChecked) {
  const ticker = document.getElementById("tickerSearch").value.trim();
  if (!ticker) {
    console.log("No ticker selected, ignoring toggle for", indicatorValue);
    return;
  }
  if (isChecked) {
    // fetch indicator data
    fetchIndicatorData(ticker, indicatorValue);
  } else {
    // remove from mainChart or indicatorChart
    if (overlayMap[indicatorValue] && mainChart.removeSeries) {
      mainChart.removeSeries(overlayMap[indicatorValue]);
      delete overlayMap[indicatorValue];
    }
    if (indicatorMap[indicatorValue] && indicatorChart.removeSeries) {
      indicatorChart.removeSeries(indicatorMap[indicatorValue]);
      delete indicatorMap[indicatorValue];
    }
    // If Bollinger had multiple lines
    if (indicatorValue === "bollinger") {
      ["boll_ma","boll_upper","boll_lower"].forEach(k => {
        if (overlayMap[k] && mainChart.removeSeries) {
          mainChart.removeSeries(overlayMap[k]);
          delete overlayMap[k];
        }
      });
    }
  }
}

/**
 * Fetch data for a specific indicator
 */
function fetchIndicatorData(ticker, indicatorValue) {
  // Decide MA param
  let maParam = 50;
  if (indicatorValue === "ma100") maParam = 100;
  if (indicatorValue === "ma150") maParam = 150;
  if (indicatorValue === "ma200") maParam = 200;

  // Get the active timeframe
  const activeBtn = document.querySelector("#timeframeButtons .active");
  let periodParam = "1y";
  if (activeBtn) {
    let timeframe = activeBtn.dataset.period;
    switch (timeframe) {
      case "1D": periodParam = "5d"; break;
      case "5D": periodParam = "5d"; break;
      case "1M": periodParam = "1mo"; break;
      case "6M": periodParam = "6mo"; break;
      case "YTD": periodParam = "ytd"; break;
      case "1Y": periodParam = "1y"; break;
      case "5Y": periodParam = "5y"; break;
      case "MAX": periodParam = "max"; break;
    }
  }

  const url = `http://127.0.0.1:8000/indicators/${ticker}?period=${periodParam}&interval=1d&ma=${maParam}`;
  console.log("Fetching indicator data for", indicatorValue, ":", url);
  
  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error("Indicator fetch error: " + res.statusText);
      return res.json();
    })
    .then(data => {
      console.log("Indicator data for", indicatorValue, ":", data);
      applyIndicator(indicatorValue, data);
    })
    .catch(err => console.error("Error fetching indicator data:", err));
}

/**
 * Apply indicator data to main chart (for price indicators) or indicator chart (for special).
 */
function applyIndicator(indicatorValue, data) {
  // Distinguish between price vs. special
  const isPriceIndicator = PRICE_INDICATORS.some(ind => ind.value === indicatorValue);
  if (isPriceIndicator) {
    applyPriceIndicator(indicatorValue, data);
  } else {
    applySpecialIndicator(indicatorValue, data);
  }
}

/**
 * Apply a price indicator (MA, Bollinger) to the main chart
 */
function applyPriceIndicator(indicatorValue, data) {
  if (!mainChart) return;
  const dates = data.Date;
  if (!dates) return;

  if (indicatorValue.startsWith("ma")) {
    // data.MA => line
    createLineOverlayOnMainChart(indicatorValue, dates, data.MA, "#AA0000");
  } else if (indicatorValue === "bollinger") {
    // Plot Bollinger_MA, Upper_Band, Lower_Band
    createLineOverlayOnMainChart("boll_ma", dates, data.Bollinger_MA, "#FF0000");
    createLineOverlayOnMainChart("boll_upper", dates, data.Upper_Band, "#888888");
    createLineOverlayOnMainChart("boll_lower", dates, data.Lower_Band, "#888888");
  }
}

/**
 * Apply a special indicator (RSI, OBV, ATR, MACD, etc.) to the indicator chart
 */
function applySpecialIndicator(indicatorValue, data) {
  if (!indicatorChart) return;
  const dates = data.Date;
  if (!dates) return;

  let field = null;
  let color = "#AA0000";
  switch (indicatorValue) {
    case "rsi": field = data.RSI; break;
    case "obv": field = data.OBV; break;
    case "atr": field = data.ATR; break;
    case "macd": field = data.MACD; break;
    case "volatility": field = data.Volatility; break;
    case "momentum": field = data.Momentum; break;
  }
  if (!field) {
    console.error("No field found for special indicator:", indicatorValue);
    return;
  }

  createLineOverlayOnIndicatorChart(indicatorValue, dates, field, color);
}

/**
 * Create line overlay on main chart
 */
function createLineOverlayOnMainChart(key, dates, values, color) {
  let seriesData = [];
  for (let i = 0; i < dates.length; i++) {
    let t = Math.floor(new Date(dates[i]).getTime() / 1000);
    if (values[i] != null) {
      seriesData.push({ time: t, value: values[i] });
    }
  }
  let series = mainChart.addLineSeries({ color, lineWidth: 2 });
  series.setData(seriesData);
  overlayMap[key] = series;
}

/**
 * Create line overlay on indicator chart
 */
function createLineOverlayOnIndicatorChart(key, dates, values, color) {
  let seriesData = [];
  for (let i = 0; i < dates.length; i++) {
    let t = Math.floor(new Date(dates[i]).getTime() / 1000);
    if (values[i] != null) {
      seriesData.push({ time: t, value: values[i] });
    }
  }
  let series = indicatorChart.addLineSeries({ color, lineWidth: 2 });
  series.setData(seriesData);
  indicatorMap[key] = series;
}

/**
 * DOMContentLoaded
 */
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, main.js running");
  initCharts();

  // Populate the two dropdowns
  populateDropdowns();

  // Search button
  document.getElementById("searchButton").addEventListener("click", () => {
    const ticker = document.getElementById("tickerSearch").value.trim();
    if (ticker) fetchStock(ticker, "1Y");
  });

  // Popular tickers
  document.querySelectorAll("#popularTickers li").forEach(li => {
    li.addEventListener("click", () => {
      const ticker = li.dataset.ticker;
      document.getElementById("tickerSearch").value = ticker;
      fetchStock(ticker, "1Y");
    });
  });

  // Timeframe
  document.getElementById("timeframeButtons").addEventListener("click", e => {
    if (e.target.tagName === "BUTTON") {
      document.querySelectorAll("#timeframeButtons button").forEach(btn => btn.classList.remove("active"));
      e.target.classList.add("active");
      const ticker = document.getElementById("tickerSearch").value.trim();
      const timeframe = e.target.dataset.period;
      if (ticker) fetchStock(ticker, timeframe);
    }
  });

  // Chart type
  document.getElementById("chartType").addEventListener("change", e => {
    const ticker = document.getElementById("tickerSearch").value.trim();
    const activeBtn = document.querySelector("#timeframeButtons .active");
    const timeframe = activeBtn ? activeBtn.dataset.period : "1Y";
    if (ticker) fetchStock(ticker, timeframe);
  });

  // Resize all charts on window resize
  window.addEventListener("resize", () => {
    if (mainChart) {
      const mainEl = document.getElementById("mainChart");
      mainChart.resize(mainEl.clientWidth, mainEl.clientHeight);
    }
    if (volumeChart) {
      const volEl = document.getElementById("volumeChart");
      volumeChart.resize(volEl.clientWidth, volEl.clientHeight);
    }
    if (indicatorChart) {
      const indEl = document.getElementById("indicatorChart");
      indicatorChart.resize(indEl.clientWidth, indEl.clientHeight);
    }
  });
});
