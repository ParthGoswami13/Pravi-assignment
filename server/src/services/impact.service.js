import { Asset, Relationship } from '../models/index.js'
import { DOWN_STATUSES } from '../constants.js'

// Breadth-first walk from a provider to everything that depends on it (depth-limited).
export function dependentsOf(rootId, rels, maxDepth = 3) {
  const out = new Map()
  for (const r of rels) {
    const k = String(r.source)
    if (!out.has(k)) out.set(k, [])
    out.get(k).push({ id: String(r.target), type: r.type })
  }
  const seen = new Set([String(rootId)])
  const result = []
  let frontier = [String(rootId)]
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next = []
    for (const id of frontier) {
      for (const e of out.get(id) ?? []) {
        if (seen.has(e.id)) continue
        seen.add(e.id)
        result.push({ id: e.id, depth, type: e.type })
        next.push(e.id)
      }
    }
    frontier = next
  }
  return result
}

// Would adding source -> target create a cycle? (true if source is already reachable from target)
export function createsCycle(sourceId, targetId, rels) {
  if (String(sourceId) === String(targetId)) return true
  return dependentsOf(targetId, rels, 50).some((d) => d.id === String(sourceId))
}

// Pure: which assets are impacted because an upstream provider is down?
export function computeImpact(assets, rels, maxDepth = 3) {
  const byId = new Map(assets.map((a) => [String(a._id), a]))
  const impacted = new Map() // assetId -> provider asset
  const groups = []
  for (const provider of assets.filter((a) => DOWN_STATUSES.includes(a.status))) {
    const affected = dependentsOf(provider._id, rels, maxDepth)
      .map((d) => ({ ...d, asset: byId.get(d.id) }))
      .filter((d) => d.asset && d.asset.status !== 'RETIRED')
    if (!affected.length) continue
    groups.push({ provider, affected: affected.map((d) => ({ ...d.asset, depth: d.depth, via: d.type })) })
    for (const d of affected) if (!impacted.has(d.id)) impacted.set(d.id, provider)
  }
  return { impacted, groups }
}

export async function loadImpact() {
  const [assets, rels] = await Promise.all([
    Asset.find().select('assetCode name status category ward location healthScore').lean(),
    Relationship.find().select('source target type').lean(),
  ])
  return computeImpact(assets, rels)
}
