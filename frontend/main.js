"use strict";

let mainChart, volumeChart, indicatorChart;
let mainSeries, volumeSeries;
let overlayMap = {};    // Price indicators on main chart
let indicatorMap = {};  // Special indicators on indicator chart

// Distinct colors for each indicator
const INDICATOR_COLORS = {
  // Price Indicators
  "ma50":       "#FF0000",
  "ma100":      "#008000",
  "ma150":      "#0000FF",
  "ma200":      "#FF00FF",
  "boll_ma":    "#FF9900",
  "boll_upper": "#AAAAAA",
  "boll_lower": "#AAAAAA",

  // Special Indicators
  "rsi":        "#AA0000",
  "obv":        "#0055AA",
  "atr":        "#AA7700",
  "macd":       "#660066",
  "volatility": "#AA0088",
  "momentum":   "#008888",
};

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
 * Show/hide loading overlay
 */
function showLoadingOverlay() {
  document.getElementById("loadingOverlay").style.display = "flex";
}
function hideLoadingOverlay() {
  document.getElementById("loadingOverlay").style.display = "none";
}

/**
 * Create & sync mainChart, volumeChart, indicatorChart
 */
function initCharts() {
  const mainEl = document.getElementById("mainChart");
  mainChart = LightweightCharts.createChart(mainEl, {
    width: mainEl.clientWidth,
    height: mainEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true }
  });
  makeChartGrabbable(mainEl);

  const volumeEl = document.getElementById("volumeChart");
  volumeChart = LightweightCharts.createChart(volumeEl, {
    width: volumeEl.clientWidth,
    height: volumeEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true }
  });
  makeChartGrabbable(volumeEl);

  // Label the volume y-axis
  volumeChart.applyOptions({
    rightPriceScale: {
      visible: true,
      borderVisible: false,
      title: "Volume",
    },
    leftPriceScale: {
      visible: false
    }
  });

  const indEl = document.getElementById("indicatorChart");
  indicatorChart = LightweightCharts.createChart(indEl, {
    width: indEl.clientWidth,
    height: indEl.clientHeight,
    layout: { backgroundColor: "#fff", textColor: "#333" },
    grid: { vertLines: { color: "#eee" }, horzLines: { color: "#eee" } },
    timeScale: { timeVisible: true }
  });
  makeChartGrabbable(indEl);

  // Sync time scale across all three
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
}

/**
 * Make chart container have "grab" cursor on drag
 */
function makeChartGrabbable(container) {
  container.style.cursor = "grab";
  container.addEventListener("mousedown", () => {
    container.style.cursor = "grabbing";
  });
  container.addEventListener("mouseup", () => {
    container.style.cursor = "grab";
  });
  container.addEventListener("mouseleave", () => {
    container.style.cursor = "grab";
  });
}

/**
 * Render main (price) + volume data
 */
function renderMainAndVolume(data) {
  // Remove old charts, re-init
  if (mainChart) mainChart.remove();
  if (volumeChart) volumeChart.remove();
  if (indicatorChart) indicatorChart.remove();

  initCharts();

  const chartType = getCurrentChartType(); // from custom dropdown
  const dates = data.Date;
  const open = data.Open;
  const close = data.Close;
  const high = data.High;
  const low = data.Low;
  const volume = data.Volume;

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
    priceFormat: { type: "volume", precision: 0, minMove: 1 },
    priceScaleId: "",
    color: "#26a69a"
  });
  volumeSeries.setData(volumeData);
}

/**
 * Get the current chart type from the custom dropdown (radio group)
 */
function getCurrentChartType() {
  const checked = document.querySelector('#chartTypeDropdown input[name="chartType"]:checked');
  return checked ? checked.value : "candlestick";
}

/**
 * Fetch stock data + KPI, then re-add indicators
 */
function fetchStock(ticker, timeframe) {
  showLoadingOverlay();
  const stockUrl = `http://127.0.0.1:8000/stock/${ticker}?period=${timeframe}&interval=1d`;
  const kpiUrl = `http://127.0.0.1:8000/kpi/${ticker}`;

  Promise.all([ fetch(stockUrl), fetch(kpiUrl) ])
    .then(([stockRes, kpiRes]) => {
      if (!stockRes.ok) throw new Error("Stock fetch error: " + stockRes.statusText);
      if (!kpiRes.ok) throw new Error("KPI fetch error: " + kpiRes.statusText);
      return Promise.all([stockRes.json(), kpiRes.json()]);
    })
    .then(([stockData, kpiData]) => {
      hideLoadingOverlay();
      if (!stockData.Date || !stockData.Date.length) {
        console.error("No stock data returned for ticker:", ticker);
        return;
      }
      renderMainAndVolume(stockData);

      // Clear old overlays + legends
      overlayMap = {};
      indicatorMap = {};
      document.getElementById("mainChartLegend").innerHTML = "";
      document.getElementById("indicatorChartLegend").innerHTML = "";

      // Re-add any checked indicators
      reAddAllIndicators();

      // Fit content once
      mainChart.timeScale().fitContent();
      volumeChart.timeScale().fitContent();
      indicatorChart.timeScale().fitContent();

      // Update top info + KPI
      updateTopInfo(ticker, stockData, kpiData);
    })
    .catch(err => {
      hideLoadingOverlay();
      console.error("Error fetching stock/kpi:", err);
    });
}

/**
 * Re-add all indicators that are checked
 */
function reAddAllIndicators() {
  // Price
  document.querySelectorAll("#priceIndicatorDropdown input[type=checkbox]:checked").forEach(chk => {
    toggleIndicator(chk.value, true);
  });
  // Special
  document.querySelectorAll("#specialIndicatorDropdown input[type=checkbox]:checked").forEach(chk => {
    toggleIndicator(chk.value, true);
  });
}

/**
 * Toggle an indicator on/off
 */
function toggleIndicator(indicatorValue, isChecked) {
  const ticker = document.getElementById("tickerSearch").value.trim();
  if (!ticker) return;

  if (isChecked) {
    // Capture time scale for each chart to restore after adding the line
    const mainRange = mainChart.timeScale().getVisibleLogicalRange();
    const volRange = volumeChart.timeScale().getVisibleLogicalRange();
    const indRange = indicatorChart.timeScale().getVisibleLogicalRange();

    fetchIndicatorData(ticker, indicatorValue)
      .then(() => {
        // Restore the same horizontal range (time scale)
        if (mainRange) mainChart.timeScale().setVisibleLogicalRange(mainRange);
        if (volRange) volumeChart.timeScale().setVisibleLogicalRange(volRange);
        if (indRange) indicatorChart.timeScale().setVisibleLogicalRange(indRange);
      })
      .catch(err => console.error("Error toggling indicator:", err));
  } else {
    removeIndicator(indicatorValue);
  }
}

/**
 * Fetch data for a specific indicator
 */
function fetchIndicatorData(ticker, indicatorValue) {
  return new Promise((resolve, reject) => {
    let maParam = 50;
    if (indicatorValue === "ma100") maParam = 100;
    if (indicatorValue === "ma150") maParam = 150;
    if (indicatorValue === "ma200") maParam = 200;

    const activeBtn = document.querySelector("#timeframeButtons .active");
    let periodParam = activeBtn ? activeBtn.dataset.period : "1Y";

    const url = `http://127.0.0.1:8000/indicators/${ticker}?period=${periodParam}&interval=1d&ma=${maParam}`;
    console.log("Fetching indicator data:", indicatorValue, url);

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error("Indicator fetch error: " + res.statusText);
        return res.json();
      })
      .then(data => {
        applyIndicator(indicatorValue, data);
        resolve();
      })
      .catch(err => reject(err));
  });
}

/**
 * Apply indicator data
 */
function applyIndicator(indicatorValue, data) {
  const isPrice = ["ma50","ma100","ma150","ma200","bollinger"].includes(indicatorValue);
  if (isPrice) {
    applyPriceIndicator(indicatorValue, data);
  } else {
    applySpecialIndicator(indicatorValue, data);
  }
}

/**
 * Apply a price indicator (MA, Bollinger) to the main chart
 */
function applyPriceIndicator(indicatorValue, data) {
  if (!mainChart || !data.Date) return;

  if (indicatorValue.startsWith("ma")) {
    createLineOverlayOnMainChart(indicatorValue, data.Date, data.MA);
  } else if (indicatorValue === "bollinger") {
    createLineOverlayOnMainChart("boll_ma", data.Date, data.Bollinger_MA);
    createLineOverlayOnMainChart("boll_upper", data.Date, data.Upper_Band);
    createLineOverlayOnMainChart("boll_lower", data.Date, data.Lower_Band);
  }
}

/**
 * Apply a special indicator (RSI, OBV, etc.) to the indicator chart
 */
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

/**
 * Create line overlay on main chart
 */
function createLineOverlayOnMainChart(key, dates, values) {
  let seriesData = [];
  for (let i = 0; i < dates.length; i++) {
    const t = Math.floor(new Date(dates[i]).getTime() / 1000);
    seriesData.push({ time: t, value: values[i] });
  }
  const color = INDICATOR_COLORS[key] || "#AA0000";
  const series = mainChart.addLineSeries({ color, lineWidth: 2 });
  series.setData(seriesData);
  overlayMap[key] = series;
  addLegendItem("mainChartLegend", key, color);
}

/**
 * Create line overlay on indicator chart
 */
function createLineOverlayOnIndicatorChart(key, dates, values) {
  let seriesData = [];
  for (let i = 0; i < dates.length; i++) {
    const t = Math.floor(new Date(dates[i]).getTime() / 1000);
    seriesData.push({ time: t, value: values[i] });
  }
  const color = INDICATOR_COLORS[key] || "#AA0000";
  const series = indicatorChart.addLineSeries({ color, lineWidth: 2 });
  series.setData(seriesData);
  indicatorMap[key] = series;
  addLegendItem("indicatorChartLegend", key, color);
}

/**
 * Remove an indicator
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
    ["boll_ma","boll_upper","boll_lower"].forEach(k => {
      if (overlayMap[k]) {
        mainChart.removeSeries(overlayMap[k]);
        delete overlayMap[k];
        removeLegendItem("mainChartLegend", k);
      }
    });
  }
}

/**
 * Add a legend item (small colored line + label)
 */
function addLegendItem(legendContainerId, key, color) {
  const container = document.getElementById(legendContainerId);
  if (!container) return;

  const item = document.createElement("span");
  item.id = `legend-item-${key}`;
  item.style.display = "inline-flex";
  item.style.alignItems = "center";
  item.style.marginRight = "8px";

  // A small colored line
  const line = document.createElement("span");
  line.style.display = "inline-block";
  line.style.width = "20px";
  line.style.height = "2px";
  line.style.backgroundColor = color;
  line.style.marginRight = "5px";

  // A label
  const label = document.createElement("span");
  label.textContent = key;

  item.appendChild(line);
  item.appendChild(label);
  container.appendChild(item);
}

/**
 * Remove a legend item
 */
function removeLegendItem(legendContainerId, key) {
  const item = document.getElementById(`legend-item-${key}`);
  if (item) item.remove();
}

/**
 * Update top info + KPI table
 * P/E ratio => 1 decimal, Market Cap => T/B/M w/1 decimal
 */
function updateTopInfo(ticker, data, kpiData) {
  if (!data.Date || !data.Date.length) return;
  const lastIndex = data.Date.length - 1;
  const lastPrice = data.Close[lastIndex];
  const prevPrice = lastIndex > 0 ? data.Close[lastIndex - 1] : lastPrice;
  const change = lastPrice - prevPrice;
  const pct = (change / prevPrice) * 100;

  // Exchange & currency
  const exchange = kpiData.exchange || "Nasdaq";
  const currency = kpiData.currency || "USD";
  document.getElementById("stockExchange").textContent = `${exchange} - ${currency}`;

  document.getElementById("stockName").textContent = `${ticker} - ${kpiData.companyName || ""}`;
  document.getElementById("stockPrice").textContent = (lastPrice ?? 0).toFixed(2);
  document.getElementById("stockChange").textContent =
    (change >= 0 ? '+' : '') + change.toFixed(2) + ` (${pct.toFixed(2)}%)`;
  document.getElementById("stockDate").textContent = `As of ${data.Date[lastIndex]} (At close)`;

  // Format P/E ratio to 1 decimal
  let pe = kpiData.peRatio;
  if (typeof pe === "number") {
    pe = pe.toFixed(1);
  }
  document.getElementById("peRatio").textContent = pe ?? "N/A";

  // Market cap in T/B/M with 1 decimal
  let mc = kpiData.marketCap;
  if (typeof mc === "number") {
    mc = formatMarketCap(mc);
  }
  document.getElementById("marketCap").textContent = mc ?? "N/A";

  document.getElementById("weekHigh").textContent = kpiData.weekHigh52 ?? "N/A";
  document.getElementById("weekLow").textContent = kpiData.weekLow52 ?? "N/A";
  document.getElementById("beta").textContent = kpiData.beta ?? "N/A";
  document.getElementById("eps").textContent = kpiData.eps ?? "N/A";
  document.getElementById("dividend").textContent = kpiData.dividend ?? "N/A";
  document.getElementById("exDividendDate").textContent = kpiData.exDividendDate ?? "N/A";

  // Example placeholders
  document.getElementById("openPrice").textContent = "N/A";
  document.getElementById("preMarketPrice").textContent = "N/A";

  // Last volume
  const lastVolume = data.Volume[lastIndex];
  document.getElementById("volumeKpi").textContent = lastVolume ?? "N/A";
}

/**
 * Format market cap in T/B/M with 1 decimal
 */
function formatMarketCap(value) {
  if (value >= 1e12) {
    return (value / 1e12).toFixed(1) + "T";
  } else if (value >= 1e9) {
    return (value / 1e9).toFixed(1) + "B";
  } else if (value >= 1e6) {
    return (value / 1e6).toFixed(1) + "M";
  } else {
    return value.toFixed(1);
  }
}

/**
 * Populate the indicator checkboxes + chart type radio
 */
function populateDropdowns() {
  // Price Indicators
  const priceDropdown = document.getElementById("priceIndicatorDropdown");
  PRICE_INDICATORS.forEach(ind => {
    let label = document.createElement("label");
    label.textContent = ind.label;
    let chk = document.createElement("input");
    chk.type = "checkbox";
    chk.value = ind.value;
    label.prepend(chk);
    priceDropdown.appendChild(label);

    chk.addEventListener("change", e => {
      toggleIndicator(chk.value, e.target.checked);
    });
  });

  // Special Indicators
  const specialDropdown = document.getElementById("specialIndicatorDropdown");
  SPECIAL_INDICATORS.forEach(ind => {
    let label = document.createElement("label");
    label.textContent = ind.label;
    let chk = document.createElement("input");
    chk.type = "checkbox";
    chk.value = ind.value;
    label.prepend(chk);
    specialDropdown.appendChild(label);

    chk.addEventListener("change", e => {
      toggleIndicator(chk.value, e.target.checked);
    });
  });

  // Chart Type Radio
  const chartTypeDropdownBtn = document.getElementById("chartTypeDropdownBtn");
  const chartTypeDropdown = document.getElementById("chartTypeDropdown");
  chartTypeDropdown.addEventListener("change", e => {
    if (e.target.name === "chartType") {
      // Update the button text
      if (e.target.value === "candlestick") {
        chartTypeDropdownBtn.textContent = "Candlestick";
      } else if (e.target.value === "area") {
        chartTypeDropdownBtn.textContent = "Mountain";
      } else {
        chartTypeDropdownBtn.textContent = e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1);
      }
      // Re-fetch stock data to redraw chart
      const ticker = document.getElementById("tickerSearch").value.trim();
      const activeBtn = document.querySelector("#timeframeButtons .active");
      const timeframe = activeBtn ? activeBtn.dataset.period : "1Y";
      if (ticker) fetchStock(ticker, timeframe);
    }
  });
}

/**
 * DOMContentLoaded
 */
document.addEventListener("DOMContentLoaded", () => {
  initCharts();

  // Force uppercase for ticker
  const tickerInput = document.getElementById("tickerSearch");
  tickerInput.addEventListener("input", e => {
    e.target.value = e.target.value.toUpperCase();
  });

  // Populate checkboxes + chart type
  populateDropdowns();

  // Search button
  document.getElementById("searchButton").addEventListener("click", () => {
    const ticker = tickerInput.value.trim();
    if (ticker) fetchStock(ticker, "1Y");
  });

  // Popular tickers
  document.querySelectorAll("#popularTickers li").forEach(li => {
    li.addEventListener("click", () => {
      const ticker = li.dataset.ticker;
      tickerInput.value = ticker;
      fetchStock(ticker, "1Y");
    });
  });

  // Timeframe
  document.getElementById("timeframeButtons").addEventListener("click", e => {
    if (e.target.tagName === "BUTTON") {
      document.querySelectorAll("#timeframeButtons button").forEach(btn => btn.classList.remove("active"));
      e.target.classList.add("active");
      const ticker = tickerInput.value.trim();
      const timeframe = e.target.dataset.period;
      if (ticker) fetchStock(ticker, timeframe);
    }
  });

  // Handle window resize
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
