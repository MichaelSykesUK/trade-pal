import { useEffect, useState } from 'react'
import { ML_DAYS, ML_FEATURES } from '../constants'
import { formatNumber } from '../utils/format'

export default function MlControls({
  models,
  loading,
  error,
  onRun,
  ticker,
  metrics,
  validation,
  modelUsed,
  requestedModel,
  autoRetrained,
  search,
  cached,
}) {
  const [model, setModel] = useState(models[0] || 'XGBoost')
  const [days, setDays] = useState(20)
  const [arimaOrder, setArimaOrder] = useState('5,1,0')
  const [scalerType, setScalerType] = useState('auto')
  const [features, setFeatures] = useState(() => {
    const initial = {}
    ML_FEATURES.forEach((f) => {
      initial[f.key] = f.defaultOn ?? true
    })
    return initial
  })

  useEffect(() => {
    if (models.length) {
      setModel(models[0])
    }
  }, [models])

  return (
    <section className="panel ml-panel">
      <h3>ML Projections</h3>
      <div className="form-row">
        <label>
          Method
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Scaler
          <select value={scalerType} onChange={(e) => setScalerType(e.target.value)}>
            <option value="auto">Auto</option>
            <option value="standard">Standard (z-score)</option>
            <option value="minmax">MinMax (-1 to 1)</option>
            <option value="none">None</option>
          </select>
        </label>
        <label>
          Days
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {ML_DAYS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>
        {model === 'ARIMA' && (
          <label>
            ARIMA (p,d,q)
            <input
              type="text"
              value={arimaOrder}
              onChange={(e) => setArimaOrder(e.target.value)}
              placeholder="5,1,0"
            />
          </label>
        )}
      </div>
      <div className="ml-features">
        {ML_FEATURES.map((feature) => (
          <label key={feature.key}>
            <input
              type="checkbox"
              checked={features[feature.key]}
              onChange={() =>
                setFeatures((prev) => ({
                  ...prev,
                  [feature.key]: !prev[feature.key],
                }))
              }
            />
            {feature.label}
          </label>
        ))}
      </div>
      {error && <div className="panel-error">{error}</div>}
      {metrics?.model && metrics?.baseline_last && (
        <div className="ml-metrics">
          <div className="metrics-header">
            <span>Walk-forward ({metrics.test_days}d)</span>
            <span className={`metrics-badge ${metrics.model.rmse < metrics.baseline_last.rmse ? 'good' : 'bad'}`}>
              {metrics.model.rmse < metrics.baseline_last.rmse ? 'Beats baseline' : 'Below baseline'}
            </span>
          </div>
          {modelUsed && (
            <div className="metrics-subtitle">
              Model: {modelUsed}
              {requestedModel && requestedModel !== modelUsed ? ` (requested ${requestedModel})` : ''}
              {autoRetrained ? ' · auto-retrained' : ''}
              {cached ? ' · cached' : ''}
            </div>
          )}
          {search?.searched && (
            <div className="metrics-subtitle">
              Auto-tune: {search.candidates} candidates ({search.model})
            </div>
          )}
          <div className="metrics-grid">
            <div className="metrics-card">
              <strong>Model</strong>
              <span>MAE: {formatNumber(metrics.model.mae)}</span>
              <span>RMSE: {formatNumber(metrics.model.rmse)}</span>
              <span>sMAPE: {formatNumber(metrics.model.smape)}%</span>
              <span>R²: {formatNumber(metrics.model.r2)}</span>
              <span>N: {metrics.model.n}</span>
            </div>
            <div className="metrics-card">
              <strong>Baseline (Last Close)</strong>
              <span>MAE: {formatNumber(metrics.baseline_last.mae)}</span>
              <span>RMSE: {formatNumber(metrics.baseline_last.rmse)}</span>
              <span>sMAPE: {formatNumber(metrics.baseline_last.smape)}%</span>
              <span>R²: {formatNumber(metrics.baseline_last.r2)}</span>
              <span>N: {metrics.baseline_last.n}</span>
            </div>
          </div>
          {validation?.note && (
            <div className={`metrics-note ${validation.passed ? 'good' : 'bad'}`}>
              {validation.note}
            </div>
          )}
          <div className="metrics-note">Lower is better. Baseline uses previous close as the forecast.</div>
        </div>
      )}
      <div className="ml-actions">
        <button
          className="secondary-btn"
          disabled={loading}
          onClick={() => {
            if (model !== 'ARIMA' && !Object.values(features).some(Boolean)) {
              alert('Select at least one feature')
              return
            }
            onRun({ model, days, features, arimaOrder, refresh: true, scalerType })
          }}
        >
          {loading ? 'Refreshing…' : 'Refresh ML'}
        </button>
        <button
          className="primary-btn"
          disabled={loading}
          onClick={() => {
            if (model !== 'ARIMA' && !Object.values(features).some(Boolean)) {
              alert('Select at least one feature')
              return
            }
            onRun({ model, days, features, arimaOrder, scalerType })
          }}
        >
          {loading ? 'Running…' : `Run ML for ${ticker}`}
        </button>
      </div>
    </section>
  )
}
