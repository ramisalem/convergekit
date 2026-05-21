'use client'

import { useEffect, useRef, useState } from 'react'
import { Maximize2, X } from 'lucide-react'

interface Props {
  chart: string
}

let mermaidId = 0

export function MermaidDiagram({ chart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [svg, setSvg] = useState<string | null>(null)
  const idRef = useRef(`mermaid-${++mermaidId}`)

  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' })
        const { svg: rendered } = await mermaid.render(idRef.current, chart)
        if (!cancelled) setSvg(rendered)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render diagram')
      }
    }

    void render()
    return () => { cancelled = true }
  }, [chart])

  useEffect(() => {
    if (!expanded) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [expanded])

  if (error) {
    return (
      <div className="my-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-xs text-neutral-500 font-mono whitespace-pre-wrap">{chart}</p>
        <p className="mt-2 text-xs text-red-500">Diagram rendering failed: {error}</p>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="my-4 flex items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
      </div>
    )
  }

  return (
    <>
      <div
        ref={containerRef}
        aria-label="Open diagram"
        className="mermaid-diagram-frame group relative my-4 cursor-zoom-in overflow-x-auto rounded-md border border-neutral-200 bg-white p-4 text-center"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setExpanded(true)
          }
        }}
      >
        <div dangerouslySetInnerHTML={{ __html: svg }} />
        <span
          aria-hidden="true"
          className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--convergekit-line)] bg-white text-[var(--convergekit-ink-3)] opacity-0 shadow-sm transition group-hover:opacity-100 group-focus:opacity-100"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </span>
      </div>

      {expanded && (
        <div
          aria-label="Expanded Mermaid diagram"
          aria-modal="true"
          className="mermaid-diagram-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          onClick={() => setExpanded(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-[var(--convergekit-line)] bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-[var(--convergekit-line)] px-4">
              <p className="text-sm font-semibold text-[var(--convergekit-ink)]">Diagram</p>
              <button
                type="button"
                aria-label="Close diagram"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--convergekit-ink-3)] hover:bg-[var(--convergekit-bg-3)] hover:text-[var(--convergekit-ink)]"
                onClick={() => setExpanded(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div
              className="mermaid-diagram-expanded flex-1 overflow-auto p-6"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      )}
    </>
  )
}
