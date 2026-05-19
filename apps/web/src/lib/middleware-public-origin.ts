type PublicOriginInput = {
  configuredWebUrl?: string
  forwardedHost?: string | null
  forwardedProto?: string | null
  requestOrigin: string
}

export function resolvePublicOrigin(input: PublicOriginInput) {
  if (input.configuredWebUrl) {
    return new URL(input.configuredWebUrl).origin
  }

  if (input.forwardedHost) {
    return `${input.forwardedProto || 'https'}://${input.forwardedHost}`
  }

  return input.requestOrigin
}

export function rewriteRedirectLocation(input: { location: string; publicOrigin: string }) {
  if (input.location.startsWith('/')) return input.location

  const locationUrl = new URL(input.location)

  return new URL(`${locationUrl.pathname}${locationUrl.search}${locationUrl.hash}`, input.publicOrigin)
    .toString()
}
