import { PageHeader } from '@/components/ui/page-header'
import { SettingsClient } from '@/components/settings/settings-client'
import { SettingsTabs } from '@/components/settings/settings-tabs'
import { SignOutButton } from '@/components/sign-out-button'
import type { AccessPolicySettings, AiSettings } from '@/lib/api-client'
import { getApiBaseUrl } from '@/lib/runtime-urls'
import { getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const API_URL = getApiBaseUrl()

const DEFAULT_SETTINGS: AiSettings = {
  provider: 'lmstudio',
  hasApiKey: false,
  maskedApiKey: null,
  lmStudioChatModel: null,
  lmStudioMindmapModel: null,
  lmStudioEmbeddingModel: null,
  openrouterChatModel: null,
  openrouterMindmapModel: null,
  openrouterEmbeddingModel: null,
  openrouterEndpoint: null,
  anthropicChatModel: null,
  anthropicMindmapModel: null,
  anthropicEmbeddingModel: null,
  openaiChatModel: null,
  openaiMindmapModel: null,
  openaiEmbeddingModel: null,
  openaiEndpoint: null,
}

const DEFAULT_ACCESS_POLICY: AccessPolicySettings = {
  allowedEmailDomain: null,
  allowedGitHubOrg: null,
  allowedRepositoryHost: 'github.com',
  editable: false,
}

async function fetchAiSettings(): Promise<AiSettings> {
  const cookieStore = await cookies()
  try {
    const res = await fetch(`${API_URL}/api/settings/ai`, {
      headers: { cookie: cookieStore.toString() },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error('failed')
    return res.json()
  } catch {
    return DEFAULT_SETTINGS
  }
}

async function fetchAccessPolicy(): Promise<AccessPolicySettings> {
  const cookieStore = await cookies()
  try {
    const res = await fetch(`${API_URL}/api/settings/access-policy`, {
      headers: { cookie: cookieStore.toString() },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error('failed')
    return res.json()
  } catch {
    return DEFAULT_ACCESS_POLICY
  }
}

async function hasAnyIndexedRepos(): Promise<boolean> {
  const cookieStore = await cookies()
  try {
    const res = await fetch(`${API_URL}/api/repositories`, {
      headers: { cookie: cookieStore.toString() },
      cache: 'no-store',
    })
    if (!res.ok) return false
    const data = (await res.json()) as { repositories: { status: string }[] }
    return data.repositories.some((r) => r.status === 'done')
  } catch {
    return false
  }
}

export default async function SettingsPage() {
  const cookieStore = await cookies()
  let currentUserId: string | null = null
  try {
    const meRes = await fetch(`${API_URL}/api/me`, {
      headers: { cookie: cookieStore.toString() },
      cache: 'no-store',
    })
    if (meRes.ok) {
      const { user } = await meRes.json()
      if (user.role !== 'admin') redirect('/')
      currentUserId = user.id
    }
  } catch {
    // If /api/me fails, let the page render (auth middleware will handle it)
  }

  const [t, aiSettings, accessPolicy, hasIndexedRepos] = await Promise.all([
    getTranslations('settings'),
    fetchAiSettings(),
    fetchAccessPolicy(),
    hasAnyIndexedRepos(),
  ])

  return (
    <div className="mx-auto max-w-[72rem] space-y-6 px-5 py-8">
      <PageHeader eyebrow="Admin" title={t('title')} description={t('description')} />

      <SettingsTabs
        currentUserId={currentUserId}
        accessPolicy={accessPolicy}
        aiPanel={
          <div className="space-y-6">
            <SettingsClient
              initial={aiSettings}
              hasIndexedRepos={hasIndexedRepos}
              aiProviderTitle={t('aiProvider.title')}
              aiProviderDescription={t('aiProvider.description')}
              connectionTestTitle="Connection test"
              connectionTestDescription="Check that the current provider settings are reachable."
            />

            <section className="overflow-hidden rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm">
              <div className="border-b border-[var(--convergekit-line-2)] px-6 py-4">
                <h2 className="text-sm font-semibold text-[var(--convergekit-ink)]">{t('account')}</h2>
              </div>
              <div className="flex items-center justify-between px-6 py-5">
                <div>
                  <p className="text-sm font-medium text-[var(--convergekit-ink)]">
                    {t('signedInWith')} GitHub
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--convergekit-ink-3)]">
                    {t('signOutDescription')}
                  </p>
                </div>
                <SignOutButton label={t('signOut')} />
              </div>
            </section>
          </div>
        }
      />
    </div>
  )
}
