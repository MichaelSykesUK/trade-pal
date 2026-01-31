export default function LoadingOverlay({ label }) {
  return (
    <div className="loading-overlay">
      <div className="loading-spinner" />
      <p>{label}</p>
    </div>
  )
}
