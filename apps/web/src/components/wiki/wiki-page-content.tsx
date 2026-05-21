'use client'

import type { EvidenceSourceMetadata } from '@/lib/api-client'
import dynamic from 'next/dynamic'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import { CitationBadge } from './citation-badge'
import { pathFromCitation } from './evidence-authority'
import remarkGfm from 'remark-gfm'
import { normalizeWikiMarkdown } from './normalize-wiki-markdown'
import type { RelatedPageLink } from './related-pages'

const MermaidDiagram = dynamic(
  () => import('./mermaid-diagram').then((m) => m.MermaidDiagram),
  { ssr: false },
)

interface Props {
  content: string
  /** Base path for relative wiki page links (e.g. "/en/repositories/abc/wiki") */
  wikiBasePath?: string
  sourceFileMetadata?: EvidenceSourceMetadata[]
  relatedPages?: RelatedPageLink[]
}

export function WikiPageContent({ content, wikiBasePath, sourceFileMetadata, relatedPages = [] }: Props) {
  const normalizedContent = normalizeWikiMarkdown(content, relatedPages)
  const metadataByPath = new Map((sourceFileMetadata ?? []).map((item) => [item.path, item]))

  return (
    <div className="wiki-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1({ children }) {
            return <h1 className="mb-1.5 mt-0 text-[32px] font-semibold leading-[1.15] tracking-normal text-[var(--convergekit-ink)]">{children}</h1>
          },
          h2({ children }) {
            return <h2 className="mb-2.5 mt-8 text-[22px] font-semibold leading-[1.25] tracking-normal text-[var(--convergekit-ink)]">{children}</h2>
          },
          h3({ children }) {
            return <h3 className="mb-1.5 mt-6 text-base font-semibold leading-snug text-[var(--convergekit-ink)]">{children}</h3>
          },
          p({ children }) {
            return <p className="my-3 text-[15.5px] leading-[1.55] text-[var(--convergekit-ink-2)]">{children}</p>
          },
          ul({ children }) {
            return <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>
          },
          ol({ children }) {
            return <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>
          },
          li({ children }) {
            return <li className="text-[15px] leading-[1.55] text-[var(--convergekit-ink-2)]">{children}</li>
          },
          table({ children }) {
            return (
              <div className="my-4 overflow-x-auto rounded-md border border-neutral-200">
                <table className="min-w-full text-sm">{children}</table>
              </div>
            )
          },
          thead({ children }) {
            return <thead className="bg-neutral-100">{children}</thead>
          },
          th({ children }) {
            return <th className="px-4 py-2.5 text-left text-xs font-bold text-neutral-700 uppercase tracking-wide border-b border-neutral-200">{children}</th>
          },
          td({ children }) {
            return <td className="px-4 py-2.5 text-sm text-neutral-700 border-b border-neutral-100">{children}</td>
          },
          blockquote({ children }) {
            return <blockquote className="my-4 rounded-r-md border-l-[3px] border-[var(--convergekit-line-strong)] bg-[var(--convergekit-bg-2)] px-3.5 py-1 text-[var(--convergekit-ink-2)]">{children}</blockquote>
          },
          a({ href, children }) {
            // Detect citation pattern: [file.ext:line-line]() produces href="" with matching text
            // react-markdown passes children as React nodes; extract text content
            const text = String(
              Array.isArray(children)
                ? children.map((c) => (typeof c === 'string' ? c : '')).join('')
                : children ?? '',
            )
            if ((!href || href === '') && /^.+:\d+(?:-\d+)?$/.test(text)) {
              return <CitationBadge citation={text} metadata={metadataByPath.get(pathFromCitation(text)) ?? null} />
            }
            // Resolve relative wiki page slugs (no protocol, no slash, no dot)
            const resolvedHref =
              wikiBasePath && href && !href.startsWith('http') && !href.startsWith('/') && !href.includes('.')
                ? `${wikiBasePath}/${href}`
                : href
            return (
              <a href={resolvedHref} className="text-[var(--convergekit-ink)] underline underline-offset-2 hover:opacity-70">
                {children}
              </a>
            )
          },
          code({ children, className }) {
            const language = className?.replace('language-', '') ?? ''
            const isBlock = Boolean(className)

            if (language === 'mermaid') {
              return <MermaidDiagram chart={String(children as string).trim()} />
            }

            if (isBlock) {
              return (
                <pre className="my-4 overflow-x-auto rounded-lg bg-neutral-900 border border-neutral-800 p-4 text-xs leading-relaxed font-mono">
                  <code className="text-neutral-100">{children}</code>
                </pre>
              )
            }

            return (
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-800 border border-neutral-200">
                {children}
              </code>
            )
          },
          hr() {
            return <hr className="my-6 border-neutral-200" />
          },
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}
