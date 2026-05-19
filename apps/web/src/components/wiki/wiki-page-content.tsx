'use client'

import type { EvidenceSourceMetadata } from '@/lib/api-client'
import dynamic from 'next/dynamic'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import { CitationBadge } from './citation-badge'
import { pathFromCitation } from './evidence-authority'
import remarkGfm from 'remark-gfm'
import { normalizeWikiMarkdown } from './normalize-wiki-markdown'

const MermaidDiagram = dynamic(
  () => import('./mermaid-diagram').then((m) => m.MermaidDiagram),
  { ssr: false },
)

interface Props {
  content: string
  /** Base path for relative wiki page links (e.g. "/en/repositories/abc/wiki") */
  wikiBasePath?: string
  sourceFileMetadata?: EvidenceSourceMetadata[]
}

export function WikiPageContent({ content, wikiBasePath, sourceFileMetadata }: Props) {
  const normalizedContent = normalizeWikiMarkdown(content)
  const metadataByPath = new Map((sourceFileMetadata ?? []).map((item) => [item.path, item]))

  return (
    <div className="wiki-content max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1({ children }) {
            return <h1 className="text-2xl font-bold tracking-tight text-neutral-900 mt-0 mb-4">{children}</h1>
          },
          h2({ children }) {
            return <h2 className="text-lg font-semibold text-neutral-900 mt-10 mb-4 border-b border-neutral-200 pb-2">{children}</h2>
          },
          h3({ children }) {
            return <h3 className="text-base font-medium text-neutral-800 mt-8 mb-3">{children}</h3>
          },
          p({ children }) {
            return <p className="text-sm leading-relaxed text-neutral-700 my-3">{children}</p>
          },
          ul({ children }) {
            return <ul className="my-3 space-y-1 list-disc pl-5">{children}</ul>
          },
          ol({ children }) {
            return <ol className="my-3 space-y-1 list-decimal pl-5">{children}</ol>
          },
          li({ children }) {
            return <li className="text-sm text-neutral-700">{children}</li>
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
            return <blockquote className="border-l-4 border-neutral-200 pl-4 italic text-neutral-500 my-4">{children}</blockquote>
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
              <a href={resolvedHref} className="text-neutral-900 underline underline-offset-2 hover:opacity-70">
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
