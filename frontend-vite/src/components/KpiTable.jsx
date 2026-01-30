import { formatLargeNumber, formatNumber, formatPercent } from '../utils/format'

export default function KpiTable({ kpi }) {
  if (!kpi) {
    return (
      <section className="panel kpi-panel">
        <h3>KPI</h3>
        <p>Loading company metrics…</p>
      </section>
    )
  }
  return (
    <section className="panel kpi-panel">
      <h3>Key Metrics</h3>
      <table>
        <tbody>
          <tr>
            <th>Company</th>
            <td>{kpi.companyName}</td>
            <th>Exchange</th>
            <td>{kpi.exchange}</td>
          </tr>
          <tr>
            <th>Previous Close</th>
            <td>{formatNumber(kpi.previousClose)}</td>
            <th>Open</th>
            <td>{formatNumber(kpi.openPrice)}</td>
          </tr>
          <tr>
            <th>Day's Range</th>
            <td>{kpi.daysRange}</td>
            <th>52W Range</th>
            <td>{kpi.weekRange}</td>
          </tr>
          <tr>
            <th>P/E</th>
            <td>{kpi.peRatio}</td>
            <th>Forward P/E</th>
            <td>{kpi.forwardPE}</td>
          </tr>
          <tr>
            <th>Market Cap</th>
            <td>{formatLargeNumber(kpi.marketCap)}</td>
            <th>Beta</th>
            <td>{kpi.beta}</td>
          </tr>
          <tr>
            <th>Free Cash Flow</th>
            <td>{formatLargeNumber(kpi.freeCashflow)}</td>
            <th>Operating Cash Flow</th>
            <td>{formatLargeNumber(kpi.operatingCashflow)}</td>
          </tr>
          <tr>
            <th>FCF Yield</th>
            <td>{formatPercent(kpi.fcfYield)}</td>
            <th>Current Ratio</th>
            <td>{formatNumber(kpi.currentRatio)}</td>
          </tr>
          <tr>
            <th>FCF / Share</th>
            <td>{formatNumber(kpi.fcfPerShare)}</td>
            <th>P / FCF</th>
            <td>{formatNumber(kpi.priceToFcf)}</td>
          </tr>
          <tr>
            <th>EV / FCF</th>
            <td>{formatNumber(kpi.evToFcf)}</td>
            <th>FCF Conversion</th>
            <td>{formatPercent(kpi.fcfConversion)}</td>
          </tr>
          <tr>
            <th>FCF Margin</th>
            <td>{formatPercent(kpi.fcfMargin)}</td>
            <th>CapEx</th>
            <td>{formatLargeNumber(kpi.capitalExpenditures)}</td>
          </tr>
          <tr>
            <th>Total Cash</th>
            <td>{formatLargeNumber(kpi.totalCash)}</td>
            <th>Total Debt</th>
            <td>{formatLargeNumber(kpi.totalDebt)}</td>
          </tr>
          <tr>
            <th>Net Debt</th>
            <td>{formatLargeNumber(kpi.netDebt)}</td>
            <th>Net Debt / EBITDA</th>
            <td>{formatNumber(kpi.netDebtToEbitda)}</td>
          </tr>
          <tr>
            <th>Int Coverage (EBIT)</th>
            <td>{formatNumber(kpi.interestCoverageEbit)}</td>
            <th>Int Coverage (Cash)</th>
            <td>{formatNumber(kpi.interestCoverageCash)}</td>
          </tr>
          <tr>
            <th>Debt / Equity</th>
            <td>{formatNumber(kpi.debtToEquity)}</td>
            <th>Revenue</th>
            <td>{formatLargeNumber(kpi.totalRevenue)}</td>
          </tr>
          <tr>
            <th>EBITDA</th>
            <td>{formatLargeNumber(kpi.ebitda)}</td>
            <th>Profit Margin</th>
            <td>{formatPercent(kpi.profitMargin)}</td>
          </tr>
          <tr>
            <th>EV / EBITDA</th>
            <td>{formatNumber(kpi.evToEbitda)}</td>
            <th>Enterprise Value</th>
            <td>{formatLargeNumber(kpi.enterpriseValue)}</td>
          </tr>
          <tr>
            <th>FCF / EBIT</th>
            <td>{formatPercent(kpi.fcfConversionEbit)}</td>
            <th>PEG</th>
            <td>{formatNumber(kpi.pegRatio)}</td>
          </tr>
          <tr>
            <th>ROE</th>
            <td>{formatPercent(kpi.returnOnEquity)}</td>
            <th>ROA</th>
            <td>{formatPercent(kpi.returnOnAssets)}</td>
          </tr>
          <tr>
            <th>Price / Book</th>
            <td>{formatNumber(kpi.priceToBook)}</td>
            <th>Price / Sales</th>
            <td>{formatNumber(kpi.priceToSales)}</td>
          </tr>
          <tr>
            <th>Dividend</th>
            <td>{formatNumber(kpi.dividend)}</td>
            <th>EPS</th>
            <td>{formatNumber(kpi.eps)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
