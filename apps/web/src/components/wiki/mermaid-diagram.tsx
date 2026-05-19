'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  chart: string
}

let mermaidId = 0

export function MermaidDiagram({ chart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
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
    <div
      ref={containerRef}
      className="my-4 overflow-x-auto rounded-md border border-neutral-200 bg-white p-4 text-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
