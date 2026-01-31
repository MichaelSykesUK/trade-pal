import { rest } from 'msw'

const screenerRows = [
  { ticker: 'AAA', companyName: 'Alpha', fcfYield: 2 },
  { ticker: 'BBB', companyName: 'Beta', fcfYield: 5 },
]

const watchlist = ['AAPL', 'MSFT']

const mockSnapshots = {
  AAPL: {
    companyName: 'Apple Inc.',
    exchange: 'NASDAQ',
    currentPrice: 187.24,
    dailyChange: 1.12,
    dailyPct: 0.6,
    ytdChange: 12.34,
    ytdPct: 7.1,
  },
  MSFT: {
    companyName: 'Microsoft Corp.',
    exchange: 'NASDAQ',
    currentPrice: 412.88,
    dailyChange: -2.03,
    dailyPct: -0.49,
    ytdChange: 28.4,
    ytdPct: 7.4,
  },
  '^GSPC': {
    companyName: 'S&P 500',
    exchange: 'INDEX',
    currentPrice: 4950.42,
    dailyChange: 15.12,
    dailyPct: 0.31,
    ytdChange: 210.2,
    ytdPct: 4.4,
  },
  '^IXIC': {
    companyName: 'Nasdaq Composite',
    exchange: 'INDEX',
    currentPrice: 15780.12,
    dailyChange: 45.01,
    dailyPct: 0.29,
    ytdChange: 980.7,
    ytdPct: 6.6,
  },
  '^DJI': {
    companyName: 'Dow Jones',
    exchange: 'INDEX',
    currentPrice: 38210.55,
    dailyChange: 120.4,
    dailyPct: 0.32,
    ytdChange: 640.2,
    ytdPct: 1.7,
  },
}

const mockBundle = {
  stock: {
    Date: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'],
    Open: [180, 181, 182, 184],
    High: [182, 183, 185, 186],
    Low: [179, 180, 181, 183],
    Close: [181, 182, 184, 185],
    Volume: [95000000, 87000000, 91000000, 88000000],
  },
  indicators: {
    Date: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'],
    MA50: [175, 176, 177, 178],
    MA200: [150, 151, 152, 153],
    Bollinger_MA: [178, 179, 180, 181],
    Upper_Band: [185, 186, 187, 188],
    Lower_Band: [170, 171, 172, 173],
    RSI: [52, 54, 57, 59],
    MACD: [0.2, 0.25, 0.3, 0.35],
    MACD_Signal: [0.15, 0.2, 0.25, 0.28],
    ATR: [2.1, 2.0, 2.2, 2.3],
  },
  kpi: {
    companyName: 'Apple Inc.',
    exchange: 'NASDAQ',
    previousClose: 184.1,
    openPrice: 184.5,
    daysRange: '183.1 - 186.2',
    weekRange: '150.0 - 199.9',
    peRatio: 29.1,
    forwardPE: 27.4,
    marketCap: 2.9e12,
    beta: 1.2,
    freeCashflow: 9.2e10,
    operatingCashflow: 1.1e11,
    fcfYield: 3.2,
    currentRatio: 1.15,
    fcfPerShare: 5.25,
    priceToFcf: 25.4,
    evToFcf: 24.1,
    fcfConversion: 0.82,
    fcfMargin: 0.24,
    capitalExpenditures: 1.2e10,
    totalCash: 6.4e10,
    totalDebt: 1.1e11,
    netDebt: 4.6e10,
    netDebtToEbitda: 1.8,
    interestCoverageEbit: 9.2,
    interestCoverageCash: 8.7,
    debtToEquity: 1.3,
    totalRevenue: 3.6e11,
    ebitda: 1.2e11,
    profitMargin: 0.22,
    evToEbitda: 22.1,
    enterpriseValue: 3.1e12,
    fcfConversionEbit: 0.7,
    pegRatio: 2.1,
    returnOnEquity: 0.45,
    returnOnAssets: 0.18,
    priceToBook: 38.2,
    priceToSales: 7.6,
    dividend: 0.24,
    eps: 6.41,
  },
}

const mockNews = [
  {
    title: 'Apple rallies after earnings beat',
    link: 'https://example.com/news/apple-earnings',
    publisher: 'MarketWatch',
    published: '2024-01-04T12:00:00Z',
    image: '/static/icons/yahoo-news.jpg',
  },
  {
    title: 'Tech stocks lift markets',
    link: 'https://example.com/news/tech-stocks',
    publisher: 'Reuters',
    published: '2024-01-03T09:30:00Z',
    image: '/static/icons/yahoo-news.jpg',
  },
]

const mockMlModels = ['XGBoost', 'RandomForest', 'GBR', 'ARIMA']

const mockMlResponse = {
  projected: {
    Date: ['2024-01-05', '2024-01-06', '2024-01-07'],
    Predicted: [186.2, 187.4, 188.1],
  },
  metrics: {
    test_days: 20,
    model: { mae: 1.2, rmse: 1.8, smape: 2.4, r2: 0.72, n: 120 },
    baseline_last: { mae: 1.5, rmse: 2.1, smape: 2.8, r2: 0.62, n: 120 },
  },
  validation: { passed: true, note: 'Model beats baseline on RMSE.' },
  model_used: 'XGBoost',
  requested_model: 'XGBoost',
  auto_retrained: false,
  cached: false,
  scaler: 'auto',
}

const mockMacroSeries = [
  { key: 'sp500_ret', label: 'S&P 500 (1D %)', transform: 'pct_change' },
  { key: 'sp500_level', label: 'S&P 500 (Level)', transform: 'level' },
  { key: 'sp500_log', label: 'S&P 500 (Log)', transform: 'log' },
  { key: 'vix_ret', label: 'VIX (1D %)', transform: 'pct_change' },
  { key: 'gold_level', label: 'Gold (GLD Level)', transform: 'level' },
  { key: 'gold_log', label: 'Gold (GLD Log)', transform: 'log' },
  { key: 'silver_level', label: 'Silver (SLV Level)', transform: 'level' },
  { key: 'silver_log', label: 'Silver (SLV Log)', transform: 'log' },
]

const mockMacroData = {
  data: {
    Date: ['2024-01-01', '2024-01-02', '2024-01-03'],
    sp500_ret: [0.01, -0.005, 0.004],
    sp500_level: [4800, 4820, 4835],
    sp500_log: [8.48, 8.49, 8.49],
    vix_ret: [0.02, -0.01, 0.015],
    gold_level: [180, 182, 181],
    gold_log: [5.19, 5.20, 5.20],
    silver_level: [22, 22.5, 22.1],
    silver_log: [3.09, 3.11, 3.10],
  },
}

export const handlers = [
  rest.get('http://test/config/watchlist', (_req, res, ctx) =>
    res(ctx.status(200), ctx.json({ watchlist })),
  ),
  rest.post('http://test/config/watchlist', async (req, res, ctx) => {
    const body = await req.json().catch(() => ({}))
    return res(ctx.status(200), ctx.json({ watchlist: body.tickers || watchlist }))
  }),
  rest.post('http://test/watchlist_data/batch', async (req, res, ctx) => {
    const body = await req.json().catch(() => ({}))
    const tickers = Array.isArray(body.tickers) ? body.tickers : []
    const filtered = {}
    tickers.forEach((ticker) => {
      if (mockSnapshots[ticker]) {
        filtered[ticker] = mockSnapshots[ticker]
      }
    })
    return res(ctx.status(200), ctx.json(filtered))
  }),
  rest.get('http://test/bundle/:ticker', (_req, res, ctx) => res(ctx.status(200), ctx.json(mockBundle))),
  rest.get('http://test/news/:ticker', (_req, res, ctx) => res(ctx.status(200), ctx.json(mockNews))),
  rest.get('http://test/screener/sp500', (_req, res, ctx) =>
    res(
      ctx.status(200),
      ctx.json({
        rows: screenerRows,
        remaining: 0,
        complete: true,
        universeSize: screenerRows.length,
        cooldownSeconds: 0,
      }),
    ),
  ),
  rest.get('http://test/ml/models', (_req, res, ctx) => res(ctx.status(200), ctx.json(mockMlModels))),
  rest.get('http://test/ml/:ticker', (_req, res, ctx) => res(ctx.status(200), ctx.json(mockMlResponse))),
  rest.get('http://test/macro/series', (_req, res, ctx) =>
    res(
      ctx.status(200),
      ctx.json({
        series: mockMacroSeries,
      }),
    ),
  ),
  rest.get('http://test/macro/data', (_req, res, ctx) => res(ctx.status(200), ctx.json(mockMacroData))),
]
