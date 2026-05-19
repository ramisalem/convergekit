import { db, userInvitations } from '@convergekit/db'
import { and, eq, isNull } from 'drizzle-orm'

type AccountCreateData = {
  providerId?: string
  userId?: string
}

export const WORKFORCE_SAML_PROVIDER_ID = 'workforce-saml'

export async function completePendingInvitesForLinkedAccount(accountData: AccountCreateData) {
  if (accountData.providerId !== WORKFORCE_SAML_PROVIDER_ID || !accountData.userId) return

  const completedInvites = await db
    .update(userInvitations)
    .set({ usedAt: new Date() })
    .where(and(eq(userInvitations.userId, accountData.userId), isNull(userInvitations.usedAt)))
    .returning({ id: userInvitations.id })

  if (completedInvites.length === 0) return

  console.info({
    event: 'auth.saml.linked',
    userId: accountData.userId,
  })

  console.info({
    event: 'auth.saml.invite_completed',
    userId: accountData.userId,
    reason: 'completed_by_workforce_saml_sign_in',
  })
}
