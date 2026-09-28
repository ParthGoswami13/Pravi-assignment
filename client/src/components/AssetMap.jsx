import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import { MAP_CENTER, STATUS, CATEGORIES } from '../lib/constants'
import { useTheme } from '../context/ThemeContext'

const TILES = {
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
}
const ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'

function FitBounds({ points }) {
  const map = useMap()
  const key = points.map((p) => p.join(',')).join('|')
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 })
    else if (points.length === 1) map.setView(points[0], 16)
    // refit only when the set of visible points changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

export const IMPACT_RING = '#f5a524'
const HEALTH_PIN =(h) => (h == null ? '#8a93a3' : h >= 70 ? '#1a9a4b' : h >= 40 ? '#e0a312' : '#d4262e')
export const pinColor = (a, mode) => (mode === 'health' ? HEALTH_PIN(a.healthScore) : STATUS[a.status]?.pin)

export default function AssetMap({ assets, mode = 'status', height = '100%', interactive = true, fit = true }) {
  const { theme } = useTheme()
  const points = assets.map((a) => [a.location.lat, a.location.lng])
  const ring = theme === 'dark' ? '#0d1015' : '#fff'
  return (
    <MapContainer
      center={points[0] ?? MAP_CENTER} zoom={interactive ? 13 : 15} maxZoom={16} preferCanvas scrollWheelZoom={interactive}
      dragging={interactive} zoomControl={interactive} style={{ height, width: '100%' }}
    >
      <TileLayer key={theme} url={TILES[theme]} attribution={ATTRIBUTION} />
      {fit && <FitBounds points={points} />}
      {assets.map((a) => {
        const big = ['BRIDGE', 'WATER_PUMP', 'PUBLIC_BUILDING', 'FEEDER_PILLAR'].includes(a.category)
        // Assets knocked out by an upstream failure get a dashed amber ring
        const style = a.impactedBy
          ? { color: IMPACT_RING, weight: 3, dashArray: '3 3', fillColor: pinColor(a, mode), fillOpacity: 0.95 }
          : { color: ring, weight: 1.5, fillColor: pinColor(a, mode), fillOpacity: 0.95 }
        return (
          <CircleMarker key={a._id} center={[a.location.lat, a.location.lng]} radius={big ? 9 : a.impactedBy ? 7 : 6} pathOptions={style}>
            {interactive && (
              <Popup>
                <div className="min-w-[180px]">
                  <p className="font-mono text-xs text-ink-3">{a.assetCode} · {CATEGORIES[a.category]?.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">{a.name}</p>
                  <p className="mt-1.5 text-xs text-ink-2">
                    <span style={{ color: STATUS[a.status]?.pin }}>●</span> {STATUS[a.status]?.label} · Health {a.healthScore ?? '—'}
                  </p>
                  {a.impactedBy && (
                    <p className="mt-1.5 rounded bg-warn-bg px-2 py-1 text-xs font-medium text-warn">
                      ⚠ No service: {a.impactedBy.assetCode} is {a.impactedBy.status.replace('_', ' ').toLowerCase()}
                    </p>
                  )}
                  <Link to={`/assets/${a._id}`} className="mt-2 inline-block text-xs font-semibold text-brand-700">Open asset →</Link>
                </div>
              </Popup>
            )}
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
