export const DEFAULT_TICKER = 'AAPL'
export const DEFAULT_WATCHLIST = ['AAPL']

export const MARKET_INDEXES = [
  { ticker: '^GSPC', label: 'S&P 500' },
  { ticker: '^IXIC', label: 'Nasdaq Composite' },
  { ticker: '^DJI', label: 'Dow Jones Industrial Average' },
  { ticker: '^FTSE', label: 'FTSE 100' },
  { ticker: '^N225', label: 'Nikkei 225' },
  { ticker: 'GC=F', label: 'Gold' },
  { ticker: 'SI=F', label: 'Silver' },
  { ticker: 'PL=F', label: 'Platinum' },
  { ticker: 'PA=F', label: 'Palladium' },
  { ticker: 'BTC-USD', label: 'Bitcoin' },
  { ticker: 'ETH-USD', label: 'Ethereum' },
]

export const TIMEFRAMES = [
  { label: '1D', value: '1D', interval: '30m' },
  { label: '5D', value: '5D', interval: '1h' },
  { label: '1M', value: '1M', interval: '1d' },
  { label: '6M', value: '6M', interval: '1d' },
  { label: 'YTD', value: 'YTD', interval: '1d' },
  { label: '1Y', value: '1Y', interval: '1d' },
  { label: '5Y', value: '5Y', interval: '1wk' },
  { label: 'MAX', value: 'MAX', interval: '1mo' },
]

export const SPARKLINE_PERIODS = ['1Y', '6M', '1M']

export const PRICE_OVERLAYS = [
  { key: 'MA50', label: 'MA(50)', color: '#eb4c34' },
  { key: 'MA200', label: 'MA(200)', color: '#1f77b4' },
  { key: 'Bollinger_MA', label: 'Bollinger MA', color: '#f9b115' },
]

export const LOWER_INDICATORS = [
  { key: 'ma50', label: 'MA(50)', series: [{ key: 'MA50', color: '#f97316' }] },
  { key: 'ma100', label: 'MA(100)', series: [{ key: 'MA100', color: '#d946ef' }] },
  { key: 'ma150', label: 'MA(150)', series: [{ key: 'MA150', color: '#0ea5e9' }] },
  { key: 'ma200', label: 'MA(200)', series: [{ key: 'MA200', color: '#1d4ed8' }] },
  {
    key: 'bollinger',
    label: 'Bollinger Bands',
    series: [
      { key: 'Bollinger_MA', color: '#f59e0b' },
      { key: 'Upper_Band', color: '#f472b6' },
      { key: 'Lower_Band', color: '#38bdf8' },
    ],
  },
  { key: 'rsi', label: 'RSI', series: [{ key: 'RSI', color: '#10b981' }] },
  { key: 'obv', label: 'OBV', series: [{ key: 'OBV', color: '#6366f1' }] },
  { key: 'atr', label: 'ATR', series: [{ key: 'ATR', color: '#a855f7' }] },
  {
    key: 'macd',
    label: 'MACD',
    series: [
      { key: 'MACD', color: '#ef4444' },
      { key: 'MACD_Signal', color: '#facc15' },
    ],
  },
  { key: 'volatility', label: 'Volatility', series: [{ key: 'Volatility', color: '#0ea5e9' }] },
  { key: 'momentum', label: 'Momentum', series: [{ key: 'Momentum', color: '#fb7185' }] },
]

export const ML_FEATURES = [
  { key: 'ma50', label: 'MA(50)', defaultOn: true },
  { key: 'ma100', label: 'MA(100)', defaultOn: false },
  { key: 'ma150', label: 'MA(150)', defaultOn: true },
  { key: 'ma200', label: 'MA(200)', defaultOn: false },
  { key: 'ema50', label: 'EMA(50)', defaultOn: false },
  { key: 'bollinger', label: 'Bollinger Bands', defaultOn: true },
  { key: 'rsi', label: 'RSI', defaultOn: true },
  { key: 'obv', label: 'OBV', defaultOn: true },
  { key: 'atr', label: 'ATR', defaultOn: false },
  { key: 'macd', label: 'MACD', defaultOn: true },
  { key: 'volatility', label: 'Volatility', defaultOn: false },
  { key: 'momentum', label: 'Momentum', defaultOn: true },
  { key: 'sp500_ret', label: 'S&P 500 (1D %)', defaultOn: false },
  { key: 'sp500_level', label: 'S&P 500 (Level)', defaultOn: false },
  { key: 'sp500_log', label: 'S&P 500 (Log)', defaultOn: false },
  { key: 'sp500_level_z20', label: 'S&P 500 (Level z20)', defaultOn: false },
  { key: 'sp500_level_z60', label: 'S&P 500 (Level z60)', defaultOn: false },
  { key: 'sp500_level_pct_ma20', label: 'S&P 500 (% vs MA20)', defaultOn: false },
  { key: 'sp500_level_pct_ma60', label: 'S&P 500 (% vs MA60)', defaultOn: false },
  { key: 'fed_funds', label: 'Fed Funds Rate', defaultOn: false },
  { key: 'dgs10', label: '10Y Treasury', defaultOn: false },
  { key: 'dgs2', label: '2Y Treasury', defaultOn: false },
  { key: 'yield_curve_10y_2y', label: 'Yield Curve (10Y-2Y)', defaultOn: false },
  { key: 'cpi_yoy', label: 'CPI YoY', defaultOn: false },
  { key: 'pce_yoy', label: 'PCE YoY', defaultOn: false },
  { key: 'vix_ret', label: 'VIX (1D %)', defaultOn: false },
  { key: 'wti_ret', label: 'WTI Oil (1D %)', defaultOn: false },
  { key: 'usd_ret', label: 'USD Broad (1D %)', defaultOn: false },
  { key: 'gold_ret', label: 'Gold (GLD, 1D %)', defaultOn: false },
  { key: 'gold_level', label: 'Gold (GLD Level)', defaultOn: false },
  { key: 'gold_log', label: 'Gold (GLD Log)', defaultOn: false },
  { key: 'gold_level_z20', label: 'Gold (GLD Level z20)', defaultOn: false },
  { key: 'gold_level_z60', label: 'Gold (GLD Level z60)', defaultOn: false },
  { key: 'gold_level_pct_ma20', label: 'Gold (% vs MA20)', defaultOn: false },
  { key: 'gold_level_pct_ma60', label: 'Gold (% vs MA60)', defaultOn: false },
  { key: 'silver_ret', label: 'Silver (SLV, 1D %)', defaultOn: false },
  { key: 'silver_level', label: 'Silver (SLV Level)', defaultOn: false },
  { key: 'silver_log', label: 'Silver (SLV Log)', defaultOn: false },
  { key: 'silver_level_z20', label: 'Silver (SLV Level z20)', defaultOn: false },
  { key: 'silver_level_z60', label: 'Silver (SLV Level z60)', defaultOn: false },
  { key: 'silver_level_pct_ma20', label: 'Silver (% vs MA20)', defaultOn: false },
  { key: 'silver_level_pct_ma60', label: 'Silver (% vs MA60)', defaultOn: false },
]

export const ML_MODEL_ALLOWLIST = ['XGBoost', 'RandomForest', 'GBR']

export const ML_DAYS = [5, 20, 60, 120]

export const CHART_TYPES = [
  { key: 'candles', label: 'Candles' },
  { key: 'line', label: 'Line' },
  { key: 'area', label: 'Mountain' },
]

export const CANDLE_INTERVALS = [
  { key: 'auto', label: 'Auto', value: null },
  { key: '1d', label: '1D', value: '1d' },
  { key: '1w', label: '1W', value: '1wk' },
  { key: '1m', label: '1M', value: '1mo' },
  { key: '3m', label: '3M', value: '3mo' },
]

export const SCREENER_METRICS = [
  { key: 'fcfYield', label: 'FCF Yield', order: 'desc' },
  { key: 'fcfMargin', label: 'FCF Margin', order: 'desc' },
  { key: 'fcfToCapex', label: 'FCF / CapEx', order: 'desc' },
  { key: 'fcfPerShare', label: 'FCF / Share', order: 'desc' },
  { key: 'priceToFcf', label: 'P / FCF', order: 'asc' },
  { key: 'evToFcf', label: 'EV / FCF', order: 'asc' },
  { key: 'netDebtToEbitda', label: 'Net Debt / EBITDA', order: 'asc' },
  { key: 'debtToEquity', label: 'Debt / Equity', order: 'asc' },
  { key: 'interestCoverageEbit', label: 'Interest Coverage (EBIT)', order: 'desc' },
  { key: 'fcfConversion', label: 'FCF Conversion', order: 'desc' },
  { key: 'returnOnEquity', label: 'ROE', order: 'desc' },
  { key: 'operatingMargin', label: 'Operating Margin', order: 'desc' },
  { key: 'profitMargin', label: 'Profit Margin', order: 'desc' },
  { key: 'evToEbitda', label: 'EV / EBITDA', order: 'asc' },
  { key: 'trailingPE', label: 'P/E (TTM)', order: 'asc' },
  { key: 'forwardPE', label: 'P/E (Forward)', order: 'asc' },
  { key: 'pegRatio', label: 'PEG', order: 'asc' },
  { key: 'priceToBook', label: 'Price / Book', order: 'asc' },
  { key: 'priceToSales', label: 'Price / Sales', order: 'asc' },
  { key: 'freeCashflow', label: 'Free Cash Flow', order: 'desc' },
  { key: 'marketCap', label: 'Market Cap', order: 'desc' },
]

export const SCREENER_COLUMNS = [
  { key: 'ticker', label: 'Ticker', type: 'text', sticky: true },
  { key: 'companyName', label: 'Company', type: 'text', sticky: true },
  { key: 'sector', label: 'Sector', type: 'text' },
  { key: 'marketCap', label: 'Mkt Cap', type: 'money' },
  { key: 'freeCashflow', label: 'FCF', type: 'money' },
  { key: 'fcfPerShare', label: 'FCF/Share', type: 'ratio' },
  { key: 'fcfYield', label: 'FCF Yield', type: 'percent' },
  { key: 'fcfMargin', label: 'FCF Margin', type: 'percent' },
  { key: 'capitalExpenditures', label: 'CapEx', type: 'money' },
  { key: 'fcfToCapex', label: 'FCF/CapEx', type: 'ratio' },
  { key: 'priceToFcf', label: 'P/FCF', type: 'ratio' },
  { key: 'evToFcf', label: 'EV/FCF', type: 'ratio' },
  { key: 'netDebtToEbitda', label: 'Net Debt/EBITDA', type: 'ratio' },
  { key: 'debtToEquity', label: 'Debt/Equity', type: 'ratio' },
  { key: 'interestCoverageEbit', label: 'Int Cov (EBIT)', type: 'ratio' },
  { key: 'interestCoverageCash', label: 'Int Cov (Cash)', type: 'ratio' },
  { key: 'fcfConversion', label: 'FCF Conv', type: 'percent' },
  { key: 'fcfConversionEbit', label: 'FCF/EBIT', type: 'percent' },
  { key: 'returnOnEquity', label: 'ROE', type: 'percent' },
  { key: 'evToEbitda', label: 'EV/EBITDA', type: 'ratio' },
  { key: 'trailingPE', label: 'P/E (TTM)', type: 'ratio' },
  { key: 'forwardPE', label: 'P/E (Fwd)', type: 'ratio' },
  { key: 'pegRatio', label: 'PEG', type: 'ratio' },
  { key: 'priceToBook', label: 'P/B', type: 'ratio' },
  { key: 'priceToSales', label: 'P/S', type: 'ratio' },
  { key: 'operatingMargin', label: 'Op Margin', type: 'percent' },
  { key: 'profitMargin', label: 'Profit Margin', type: 'percent' },
]

export const PRICE_SCALE_WIDTH = 60
