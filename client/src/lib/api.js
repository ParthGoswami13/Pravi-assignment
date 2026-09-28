export class ApiError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('pravi:unauthorized'))
    const detail = data.details?.[0]?.message
    throw new ApiError(res.status, detail ? `${data.error}: ${detail}` : data.error || 'Request failed', data.details)
  }
  return data
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
}

export const qs = (obj) => {
  const p = new URLSearchParams()
  Object.entries(obj).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && p.set(k, v))
  const s = p.toString()
  return s ? `?${s}` : ''
}
