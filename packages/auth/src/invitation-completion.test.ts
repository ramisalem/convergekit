import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  returning: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}))

vi.mock('@convergekit/db', () => ({
  db: {
    update: vi.fn(() => ({ set: mocks.set })),
  },
  userInvitations: {
    id: 'userInvitations.id',
    userId: 'userInvitations.userId',
    usedAt: 'userInvitations.usedAt',
  },
}))

mocks.where.mockReturnValue({ returning: mocks.returning })
mocks.set.mockReturnValue({ where: mocks.where })

vi.mock('drizzle-orm', () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => ({ eq: values }),
  isNull: (value: unknown) => ({ isNull: value }),
}))

const { completePendingInvitesForLinkedAccount } = await import('./invitation-completion.js')
const { db } = await import('@convergekit/db')

describe('completePendingInvitesForLinkedAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.returning.mockResolvedValue([])
    mocks.where.mockReturnValue({ returning: mocks.returning })
    mocks.set.mockReturnValue({ where: mocks.where })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does nothing for non-workforce providers', async () => {
    await completePendingInvitesForLinkedAccount({ providerId: 'github', userId: 'user-1' })
    expect(db.update).not.toHaveBeenCalled()
  })

  it('does not emit state-change events when no pending invite is completed', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    await completePendingInvitesForLinkedAccount({
      providerId: 'workforce-saml',
      userId: 'user-1',
    })

    expect(db.update).toHaveBeenCalled()
    expect(mocks.returning).toHaveBeenCalledWith({ id: 'userInvitations.id' })
    expect(info).not.toHaveBeenCalled()
  })

  it('marks unused invite tokens used for SAML-linked accounts and logs the completed state change', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    mocks.returning.mockResolvedValue([{ id: 'invite-1' }])

    await completePendingInvitesForLinkedAccount({ providerId: 'workforce-saml', userId: 'user-1' })

    expect(db.update).toHaveBeenCalled()
    expect(mocks.set).toHaveBeenCalledWith({ usedAt: expect.any(Date) })
    expect(mocks.where).toHaveBeenCalled()
    expect(mocks.returning).toHaveBeenCalledWith({ id: 'userInvitations.id' })
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.saml.linked', userId: 'user-1' }),
    )
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.saml.invite_completed',
        reason: 'completed_by_workforce_saml_sign_in',
        userId: 'user-1',
      }),
    )
  })
})
