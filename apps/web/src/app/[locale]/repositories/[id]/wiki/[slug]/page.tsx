import { SourceFilesAccordion } from '@/components/wiki/source-files-accordion'
import { getWikiLayoutClasses } from '@/components/wiki/wiki-layout-config'
import { WikiPageContent } from '@/components/wiki/wiki-page-content'
import { WikiToc } from '@/components/wiki/wiki-toc'
import type { WikiSection } from '@/lib/api-client'
import { getApiBaseUrl } from '@/lib/runtime-urls'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const API_URL = getApiBaseUrl()
const GENERATED_SOURCE_DETAILS_RE = /\s*<details>\s*<summary>Relevant source files<\/summary>[\s\S]*?<\/details>\s*/i
const FIRST_H2_RE = /^##\s+/m

interface Props {
  params: Promise<{ id: string; slug: string; locale: string }>
}

async function fetchWikiPage(repositoryId: string, slug: string, locale: string) {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  let res: Response
  try {
    res = await fetch(`${API_URL}/api/wiki/${repositoryId}/pages/${slug}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
  } catch {
    return null
  }

  if (res.status === 401) redirect(`/${locale}/auth/sign-in`)
  if (res.status === 404) return null
  if (!res.ok) return null
  return { status: res.status, data: await res.json() }
}

async function fetchWikiPages(repositoryId: string, locale: string) {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  let res: Response
  try {
    res = await fetch(`${API_URL}/api/wiki/${repositoryId}/pages`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    })
  } catch {
    return null
  }

  if (res.status === 401) redirect(`/${locale}/auth/sign-in`)
  if (!res.ok) return null
  return res.json() as Promise<{ sections: WikiSection[] }>
}

function splitWikiContentForSourceAccordion(content: string) {
  const contentWithoutGeneratedSources = content.replace(GENERATED_SOURCE_DETAILS_RE, '\n\n')
  const firstH2Match = contentWithoutGeneratedSources.match(FIRST_H2_RE)
  if (firstH2Match?.index == null) {
    return {
      intro: contentWithoutGeneratedSources,
      body: '',
    }
  }

  return {
    intro: contentWithoutGeneratedSources.slice(0, firstH2Match.index).trimEnd(),
    body: contentWithoutGeneratedSources.slice(firstH2Match.index).trimStart(),
  }
}

export default async function WikiPageView({ params }: Props) {
  const { id, slug, locale } = await params
  const [result, pagesResult] = await Promise.all([
    fetchWikiPage(id, slug, locale),
    fetchWikiPages(id, locale),
  ])

  if (!result) notFound()

  // Still generating — show a loading state
  if (result.status === 202) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-700 mb-4" />
        <p className="text-sm text-neutral-500">This page is still being generated…</p>
        <p className="mt-1 text-xs text-neutral-400">Refresh in a moment to check progress.</p>
      </div>
    )
  }

  const page = result.data.page

  if (!page) notFound()

  if (page.status === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium text-red-600">This page failed to generate.</p>
        <p className="mt-1 text-xs text-neutral-500">
          The AI was unable to write content for this topic.
        </p>
      </div>
    )
  }

  const layoutClasses = getWikiLayoutClasses()
  const relatedPages = (pagesResult?.sections ?? []).flatMap((section) => {
    const donePages = section.pages.filter((relatedPage) => relatedPage.status === 'done')
    const firstRelatedPage = donePages.find((relatedPage) => relatedPage.slug !== page.slug) ?? donePages[0]

    return [
      ...(firstRelatedPage ? [{ title: section.title, slug: firstRelatedPage.slug }] : []),
      ...donePages
        .filter((relatedPage) => relatedPage.slug !== page.slug)
        .map((relatedPage) => ({ title: relatedPage.title, slug: relatedPage.slug })),
    ]
  })
  const splitContent = splitWikiContentForSourceAccordion(page.content)

  return (
    <div className={layoutClasses.articleRow}>
      <article className={layoutClasses.article} data-wiki-content="">
        {splitContent.intro && (
          <WikiPageContent
            content={splitContent.intro}
            wikiBasePath={`/${locale}/repositories/${id}/wiki`}
            sourceFileMetadata={page.sourceFileMetadata ?? undefined}
            relatedPages={relatedPages}
          />
        )}
        <SourceFilesAccordion
          sourceFiles={page.sourceFiles ?? null}
          sourceFileMetadata={page.sourceFileMetadata ?? null}
        />
        {splitContent.body && (
          <WikiPageContent
            content={splitContent.body}
            wikiBasePath={`/${locale}/repositories/${id}/wiki`}
            sourceFileMetadata={page.sourceFileMetadata ?? undefined}
            relatedPages={relatedPages}
          />
        )}
      </article>

      <aside className={layoutClasses.pageToc}>
        <WikiToc contentSelector="[data-wiki-content]" />
      </aside>
    </div>
  )
}
