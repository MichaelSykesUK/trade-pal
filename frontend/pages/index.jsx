import Script from 'next/script'

export default function Home() {
  return (
    <>
      {/* Mount the legacy DOM UI by rendering the original index.html body structure. */}
      <div id="topRibbon">
        <div id="topRibbonLeft">
          <div id="topSearchContainer">
            <input type="text" id="tickerSearch" placeholder="Search..." />
            <div id="searchClear" className="search-clear-btn">&times;</div>
            <button id="searchButton" className="primary-btn">Search</button>
            <div id="tickerSuggestions" className="autocomplete-suggestions"></div>
          </div>
        </div>
        <div id="topRibbonRight">
          <button id="saveConfig" className="secondary-btn">Save Config</button>
          <button id="loadConfig" className="secondary-btn">Load Config</button>
        </div>
      </div>

      <div id="mainContainer">
        <div id="left-pane">
          <div className="watchlist-box">
            <h2>Watchlist</h2>
            <ul id="watchlistItems"></ul>
          </div>
          <div className="market-box">
            <h2>Market Info</h2>
            <ul id="marketIndexesList"></ul>
          </div>
        </div>

        <div id="center-pane">
          <div id="stockInfo">
            <div id="stockExchange"></div>
            <div id="stockNameRow">
              <h2 id="stockName">Company Name (TICKER)</h2>
              <button id="centerAddWatchlist" className="semi-round-btn">Add to Watchlist</button>
            </div>
            <div id="stockPriceContainer">
              <span id="stockPrice">0.00</span>
              <span id="stockChange">0.00 (0.00%)</span>
            </div>
            <div id="stockDateContainer">
              <span id="stockDate">As of Date (Market Status)</span>
            </div>
          </div>

          {/* controls, charts and KPI table (kept minimal here) */}
        <div id="controlsRow">
          <div id="timeframeButtons">
            <button data-period="1D" className="timeframe-btn">1D</button>
            <button data-period="5D" className="timeframe-btn">5D</button>
            <button data-period="1M" className="timeframe-btn">1M</button>
            <button data-period="6M" className="timeframe-btn">6M</button>
            <button data-period="YTD" className="timeframe-btn">YTD</button>
            <button data-period="1Y" className="timeframe-btn active">1Y</button>
            <button data-period="5Y" className="timeframe-btn">5Y</button>
            <button data-period="MAX" className="timeframe-btn">Max</button>
          </div>
          <div id="chartOptions">
            <div className="dropdown">
              <button id="chartTypeDropdownBtn" className="nice-select">Chart Type</button>
              <div id="chartTypeDropdown" className="dropdown-content">
                <div className="dropdown-item" data-value="line">Line <span className="tick">✓</span></div>
                <div className="dropdown-item" data-value="area">Mountain <span className="tick">✓</span></div>
                <div className="dropdown-item" data-value="candlestick">Candlestick <span className="tick">✓</span></div>
              </div>
            </div>
            <div className="dropdown">
              <button id="priceIndicatorDropdownBtn" className="nice-select">Price Indicators</button>
              <div id="priceIndicatorDropdown" className="dropdown-content"></div>
            </div>
            <div className="dropdown">
              <button id="specialIndicatorDropdownBtn" className="nice-select">Special Indicators</button>
              <div id="specialIndicatorDropdown" className="dropdown-content"></div>
            </div>
            <div className="dropdown">
              <button id="mlMethodDropdownBtn" className="nice-select">ML Method</button>
              <div id="mlMethodDropdown" className="dropdown-content"></div>
            </div>
            <div className="dropdown">
              <button id="mlFeaturesDropdownBtn" className="nice-select">ML Features</button>
              <div id="mlFeaturesDropdown" className="dropdown-content"></div>
            </div>
            <div className="dropdown">
              <button id="mlDaysDropdownBtn" className="nice-select">ML Days</button>
              <div id="mlDaysDropdown" className="dropdown-content">
                <div className="dropdown-item" data-days="5">1 Week (5 days)</div>
                <div className="dropdown-item" data-days="20">4 Weeks (20 days)</div>
                <div className="dropdown-item" data-days="60">12 Weeks (60 days)</div>
                <div className="dropdown-item" data-days="120">24 Weeks (120 days)</div>
              </div>
            </div>
            <button id="runMLButton" className="primary-btn">Run ML</button>
          </div>
        </div>

          <div id="chartsSection">
            <div id="mainChartContainer">
              <div id="mainChartLegend"></div>
              <div id="mainChart"></div>
            </div>
            <div id="volumeChartContainer"><div id="volumeChart"></div></div>
            <div id="indicatorChartContainer">
              <div id="indicatorChartLegend"></div>
              <div id="indicatorChart"></div>
            </div>
          </div>

        <div id="kpiTableContainer">
          <table id="kpiTable">
            <tbody>
              <tr>
                <td><strong>Previous Close:</strong></td>
                <td id="previousClose">N/A</td>
                <td><strong>Open Price:</strong></td>
                <td id="openPrice">N/A</td>
                <td><strong>Day's Range:</strong></td>
                <td id="daysRange">N/A</td>
              </tr>
              <tr>
                <td><strong>52W Range:</strong></td>
                <td id="weekRange">N/A</td>
                <td><strong>52W High:</strong></td>
                <td id="weekHigh">N/A</td>
                <td><strong>52W Low:</strong></td>
                <td id="weekLow">N/A</td>
              </tr>
              <tr>
                <td><strong>P/E Ratio:</strong></td>
                <td id="peRatio">N/A</td>
                <td><strong>Market Cap:</strong></td>
                <td id="marketCap">N/A</td>
                <td><strong>Forward P/E:</strong></td>
                <td id="forwardPE">N/A</td>
              </tr>
              <tr>
                <td><strong>Next Earnings:</strong></td>
                <td id="nextEarningsDate">N/A</td>
                <td><strong>Beta:</strong></td>
                <td id="beta">N/A</td>
                <td><strong>EPS (TTM):</strong></td>
                <td id="eps">N/A</td>
              </tr>
              <tr>
                <td><strong>Dividend:</strong></td>
                <td id="dividend">N/A</td>
                <td><strong>Ex-Dividend:</strong></td>
                <td id="exDividendDate">N/A</td>
                <td><strong>Volume:</strong></td>
                <td id="volumeKpi">N/A</td>
              </tr>
              <tr>
                <td><strong>Avg Volume:</strong></td>
                <td id="avgVolume">N/A</td>
                <td></td><td></td><td></td><td></td>
              </tr>
            </tbody>
          </table>
        </div>
        </div>

        <div id="right-pane">
          <div className="news-box">
            <h2>Related News</h2>
            <ul id="newsList"></ul>
          </div>
        </div>
      </div>

      <div id="loadingOverlay">Loading...</div>

      {/* Load legacy JS from public/static */}
      <Script src="/static/main.js" strategy="afterInteractive" />
    </>
  )
}
