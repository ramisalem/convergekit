export function getApiBaseUrl() {
  if (typeof window !== 'undefined') return ''
  return process.env.SERVER_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001'
}

export function getWebBaseUrl() {
  if (typeof window !== 'undefined') return window.location.origin
  return process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:4000'
}
