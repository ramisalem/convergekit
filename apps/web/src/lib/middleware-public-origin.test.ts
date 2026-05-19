import { describe, expect, it } from 'vitest'

import { resolvePublicOrigin, rewriteRedirectLocation } from './middleware-public-origin'

describe('middleware public-origin redirects', () => {
  it('prefers the configured public web origin over the internal Next.js port', () => {
    expect(
      resolvePublicOrigin({
        configuredWebUrl: 'https://convergekit-dev.local',
        forwardedHost: 'convergekit-dev.local',
        forwardedProto: 'https',
        requestOrigin: 'http://convergekit-dev.local:4000',
      }),
    ).toBe('https://convergekit-dev.local')
  })

  it('falls back to forwarded host and proto when no public web URL is configured', () => {
    expect(
      resolvePublicOrigin({
        forwardedHost: 'convergekit-dev.local',
        forwardedProto: 'https',
        requestOrigin: 'http://convergekit-dev.local:4000',
      }),
    ).toBe('https://convergekit-dev.local')
  })

  it('rewrites next-intl locale redirects away from the internal web container port', () => {
    expect(
      rewriteRedirectLocation({
        location: 'http://convergekit-dev.local:4000/en/settings',
        publicOrigin: 'https://convergekit-dev.local',
      }),
    ).toBe('https://convergekit-dev.local/en/settings')
  })

  it('keeps relative redirect locations relative', () => {
    expect(
      rewriteRedirectLocation({
        location: '/en/settings',
        publicOrigin: 'https://convergekit-dev.local',
      }),
    ).toBe('/en/settings')
  })
})
