import { getWebBaseUrl } from '@/lib/runtime-urls'
import { BookOpen } from 'lucide-react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const WEB_URL = getWebBaseUrl()

interface Props {
  params: Promise<{ id: string; locale: string }>
}

async function fetchWikiPages(repositoryId: string, locale: string) {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  let res: Response
  try {
    res = await fetch(`${WEB_URL}/api/wiki/${repositoryId}/pages`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
  } catch {
    return null
  }

  if (res.status === 401) redirect(`/${locale}/auth/sign-in`)
  if (!res.ok) return null
  return res.json() as Promise<{
    sections: Array<{ slug: string; pages: Array<{ slug: string; status: string }> }>
  }>
}

export default async function WikiIndexPage({ params }: Props) {
  const { id, locale } = await params
  const data = await fetchWikiPages(id, locale)

  // Redirect to the first done child page
  if (data?.sections) {
    for (const section of data.sections) {
      const firstDone = section.pages.find((p) => p.status === 'done')
      if (firstDone) {
        redirect(`/${locale}/repositories/${id}/wiki/${firstDone.slug}`)
      }
    }
    // If pages exist but none are done yet, redirect to the first one regardless
    const firstPage = data.sections[0]?.pages[0]
    if (firstPage) {
      redirect(`/${locale}/repositories/${id}/wiki/${firstPage.slug}`)
    }
  }

  // No wiki pages yet
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <BookOpen className="h-10 w-10 text-neutral-200 mb-4" />
      <h2 className="text-base font-semibold text-neutral-700">Wiki not yet generated</h2>
      <p className="mt-1.5 max-w-sm text-sm text-neutral-500">
        Wiki pages are generated automatically after indexing completes. Re-index the repository to
        trigger generation.
      </p>
      <a
        href={`/${locale}/repositories/${id}`}
        className="mt-6 inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
      >
        Back to repository
      </a>
    </div>
  )
}
