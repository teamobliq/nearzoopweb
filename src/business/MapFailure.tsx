/** Full-cover failure state for any MapLibre canvas — rendered when the
    tile host can't be reached (see useMapRetry in mapResilience.ts).
    Plain language, brand tokens, one obvious action. */

export function MapFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="nz-map-failure" role="alert">
      <p className="nz-map-failure-title">The map is having a moment</p>
      <p className="nz-map-failure-sub">
        Live tiles couldn&rsquo;t load. Check your connection and try again.
      </p>
      <button type="button" className="nz-map-failure-retry" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
