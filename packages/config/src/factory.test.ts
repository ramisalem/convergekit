import { describe, expect, it } from 'vitest'
import { resolveFactoryConfig } from './factory.js'

describe('resolveFactoryConfig', () => {
  it('is off when FACTORY_ENABLED is not set', () => {
    expect(resolveFactoryConfig({})).toEqual({ enabled: false })
  })

  it('is off when FACTORY_ENABLED is false, even with other values set', () => {
    expect(
      resolveFactoryConfig({ FACTORY_ENABLED: 'false', FACTORY_HUB_REPO: 'acme/hub' }),
    ).toEqual({ enabled: false })
  })

  it('defaults the access repo to the hub repo', () => {
    expect(
      resolveFactoryConfig({
        FACTORY_ENABLED: 'true',
        FACTORY_HUB_REPO: 'acme/factory-hub',
        FACTORY_GITHUB_TOKEN: 'ghp_example',
        FACTORY_BOARD: '',
      }),
    ).toEqual({
      enabled: true,
      hubRepo: 'acme/factory-hub',
      accessRepo: 'acme/factory-hub',
      githubToken: 'ghp_example',
      webhookSecret: null,
      board: null,
      memberSignup: false,
      memberGroup: null,
    })
  })

  it('reads the group that new members join', () => {
    const base = {
      FACTORY_ENABLED: 'true',
      FACTORY_HUB_REPO: 'acme/factory-hub',
      FACTORY_GITHUB_TOKEN: 'ghp_example',
    }
    expect(resolveFactoryConfig({ ...base, FACTORY_MEMBER_GROUP: ' Team ' })).toMatchObject({
      memberGroup: 'Team',
    })
    expect(resolveFactoryConfig({ ...base, FACTORY_MEMBER_GROUP: '' })).toMatchObject({
      memberGroup: null,
    })
  })

  it('turns on member sign-up only when FACTORY_MEMBER_SIGNUP is true', () => {
    const base = {
      FACTORY_ENABLED: 'true',
      FACTORY_HUB_REPO: 'acme/factory-hub',
      FACTORY_GITHUB_TOKEN: 'ghp_example',
    }
    expect(resolveFactoryConfig({ ...base, FACTORY_MEMBER_SIGNUP: 'true' })).toMatchObject({
      memberSignup: true,
    })
    expect(resolveFactoryConfig({ ...base, FACTORY_MEMBER_SIGNUP: '' })).toMatchObject({
      memberSignup: false,
    })
    expect(() => resolveFactoryConfig({ ...base, FACTORY_MEMBER_SIGNUP: 'yes' })).toThrow(
      /FACTORY_MEMBER_SIGNUP/,
    )
  })

  it('accepts a separate access repo and board', () => {
    const config = resolveFactoryConfig({
      FACTORY_ENABLED: 'true',
      FACTORY_HUB_REPO: 'acme/factory-hub',
      FACTORY_ACCESS_REPO: 'acme/team',
      FACTORY_GITHUB_TOKEN: 'ghp_example',
      FACTORY_BOARD: 'https://github.com/users/acme/projects/1',
    })
    expect(config).toMatchObject({
      accessRepo: 'acme/team',
      board: 'https://github.com/users/acme/projects/1',
    })
  })

  it('refuses to turn on without a hub repo and token', () => {
    expect(() => resolveFactoryConfig({ FACTORY_ENABLED: 'true' })).toThrow(
      /FACTORY_HUB_REPO and FACTORY_GITHUB_TOKEN/,
    )
  })

  it('rejects a hub repo that is not owner/name', () => {
    expect(() =>
      resolveFactoryConfig({
        FACTORY_ENABLED: 'true',
        FACTORY_HUB_REPO: 'https://github.com/acme/hub',
        FACTORY_GITHUB_TOKEN: 'ghp_example',
      }),
    ).toThrow(/owner\/name/)
  })
})
