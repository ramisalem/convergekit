import { getWikiLayoutClasses } from '@/components/wiki/wiki-layout-config'
import { WikiSidebar } from '@/components/wiki/wiki-sidebar'
import { getApiBaseUrl } from '@/lib/runtime-urls'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { use } from 'react'

export const dynamic = 'force-dynamic'

const API_URL = getApiBaseUrl()

interface Props {
  children: React.ReactNode
  params: Promise<{ id: string; locale: string }>
}

async function fetchWithCookies<T>(url: string, locale: string): Promise<T | null> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  let res: Response
  try {
    res = await fetch(`${API_URL}${url}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
  } catch {
    return null
  }

  if (res.status === 401) redirect(`/${locale}/auth/sign-in`)
  if (!res.ok) return null
  return res.json() as Promise<T>
}

export default function WikiLayout({ children, params }: Props) {
  const { id, locale } = use(params)

  // Server-side data fetch — parallel
  // We use a simple inline approach to avoid client-side fetches in the layout
  return (
    <WikiLayoutInner repositoryId={id} locale={locale}>
      {children}
    </WikiLayoutInner>
  )
}

async function WikiLayoutInner({
  repositoryId,
  locale,
  children,
}: {
  repositoryId: string
  locale: string
  children: React.ReactNode
}) {
  const layoutClasses = getWikiLayoutClasses()
  const [repoData, wikiData] = await Promise.all([
    fetchWithCookies<{ repository: { name: string; status: string } }>(
      `/api/repositories/${repositoryId}`,
      locale,
    ),
    fetchWithCookies<{
      sections: Parameters<typeof WikiSidebar>[0]['sections']
      lastGeneratedAt: string | null
      commitSha: string | null
    }>(`/api/wiki/${repositoryId}/pages`, locale),
  ])

  const repoName = repoData?.repository?.name ?? repositoryId
  const sections = wikiData?.sections ?? []
  const lastGeneratedAt = wikiData?.lastGeneratedAt ?? null
  const commitSha = wikiData?.commitSha ?? null

  return (
    <div className={layoutClasses.shell}>
      <div className={layoutClasses.leftRail}>
        <WikiSidebar
          repoName={repoName}
          repositoryId={repositoryId}
          sections={sections}
          lastGeneratedAt={lastGeneratedAt}
          commitSha={commitSha}
        />
      </div>

      <div className={layoutClasses.contentWrap}>{children}</div>
    </div>
  )
}
