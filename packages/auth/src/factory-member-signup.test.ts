import { resolveFactoryConfig } from '@convergekit/config/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFactoryMemberCheck,
  createGitHubLoginMemory,
  GITHUB_LOGIN_TTL_MS,
} from './factory-member-signup.js'

const enabled = (memberSignup: string) =>
  resolveFactoryConfig({
    FACTORY_ENABLED: 'true',
    FACTORY_HUB_REPO: 'acme/factory-hub',
    FACTORY_ACCESS_REPO: 'acme/team',
    FACTORY_GITHUB_TOKEN: 'ghp_service',
    FACTORY_MEMBER_SIGNUP: memberSignup,
  })

let clock = 0
let logins: ReturnType<typeof createGitHubLoginMemory>
let github: { isCollaborator: ReturnType<typeof vi.fn> }

beforeEach(() => {
  clock = 0
  logins = createGitHubLoginMemory(() => clock)
  github = { isCollaborator: vi.fn(async (_repo: string, login: string) => login === 'pat') }
})

const verified = { email: 'Pat@Example.com', emailVerified: true }

describe('createGitHubLoginMemory', () => {
  it('hands a login back once, matching the email case-insensitively', () => {
    logins.remember('Pat@Example.com', 'pat')
    expect(logins.take('pat@example.com')).toBe('pat')
    expect(logins.take('pat@example.com')).toBeNull()
  })

  it('forgets a login after the time limit', () => {
    logins.remember('pat@example.com', 'pat')
    clock += GITHUB_LOGIN_TTL_MS
    expect(logins.take('pat@example.com')).toBeNull()
  })
})

describe('createFactoryMemberCheck', () => {
  it('lets a collaborator on the access repo sign up', async () => {
    const check = createFactoryMemberCheck({ config: enabled('true'), github, logins })
    logins.remember('pat@example.com', 'pat')
    await expect(check(verified)).resolves.toBe(true)
    expect(github.isCollaborator).toHaveBeenCalledWith('acme/team', 'pat')
  })

  it('refuses someone who is not a collaborator', async () => {
    const check = createFactoryMemberCheck({ config: enabled('true'), github, logins })
    logins.remember('pat@example.com', 'stranger')
    await expect(check(verified)).resolves.toBe(false)
  })

  it('is off unless FACTORY_MEMBER_SIGNUP is true', async () => {
    const check = createFactoryMemberCheck({ config: enabled('false'), github, logins })
    logins.remember('pat@example.com', 'pat')
    await expect(check(verified)).resolves.toBe(false)
    expect(github.isCollaborator).not.toHaveBeenCalled()
  })

  it('is off when the factory is off', async () => {
    const check = createFactoryMemberCheck({ config: { enabled: false }, github: null, logins })
    await expect(check(verified)).resolves.toBe(false)
  })

  it('refuses an unverified email or an unknown login', async () => {
    const check = createFactoryMemberCheck({ config: enabled('true'), github, logins })
    logins.remember('pat@example.com', 'pat')
    await expect(check({ ...verified, emailVerified: false })).resolves.toBe(false)
    await expect(check({ email: 'other@example.com', emailVerified: true })).resolves.toBe(false)
    expect(github.isCollaborator).not.toHaveBeenCalled()
  })

  it('fails closed when GitHub errors', async () => {
    const warn = vi.fn()
    github.isCollaborator.mockRejectedValueOnce(new Error('502'))
    const check = createFactoryMemberCheck({ config: enabled('true'), github, logins, warn })
    logins.remember('pat@example.com', 'pat')
    await expect(check(verified)).resolves.toBe(false)
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'factory_member_signup_check_failed', login: 'pat' }),
    )
  })
})
