function normalizeApiBaseUrl(url: string) {
  const trimmed = url.replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed
}

export function getApiBaseUrl() {
  if (typeof window !== 'undefined') return ''
  const configuredUrl = process.env.SERVER_API_URL ?? process.env.NEXT_PUBLIC_API_URL
  return configuredUrl ? normalizeApiBaseUrl(configuredUrl) : 'http://localhost:4001'
}

export function getWebBaseUrl() {
  if (typeof window !== 'undefined') return window.location.origin
  return process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:4000'
}
