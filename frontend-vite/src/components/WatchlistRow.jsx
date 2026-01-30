import { formatNumber } from '../utils/format'

export default function WatchlistRow({ ticker, data, subtitle, extraActions }) {
  const payload =
    data || {
      companyName: subtitle || 'Loading…',
      currentPrice: 0,
      dailyChange: 0,
      dailyPct: 0,
      ytdChange: 0,
      ytdPct: 0,
    }
  const secondaryLine = subtitle
    ? subtitle
    : [data?.companyName, data?.exchange].filter(Boolean).join(' · ') || payload.companyName || 'Unknown'
  const dailySign = payload.dailyChange >= 0 ? '+' : ''
  const ytdSign = payload.ytdChange >= 0 ? '+' : ''

  return (
    <>
      <div className="item-row1">
        <div className="item-col-ticker">{ticker}</div>
        <div className="item-col-price">{formatNumber(payload.currentPrice)}</div>
        <div className={`item-col-daily ${payload.dailyChange >= 0 ? 'up' : 'down'}`}>
          {`${dailySign}${formatNumber(payload.dailyChange)} (${dailySign}${formatNumber(payload.dailyPct)}%)`}
        </div>
        <div className={`item-col-ytd ${payload.ytdChange >= 0 ? 'up' : 'down'}`}>
          {`${ytdSign}${formatNumber(payload.ytdChange)} (${ytdSign}${formatNumber(payload.ytdPct)}%)`}
        </div>
        <div className="item-col-remove">{extraActions}</div>
      </div>
      <div className="item-row2">{secondaryLine}</div>
    </>
  )
}
