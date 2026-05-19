import type { EvidenceSourceMetadata } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { FileCode2 } from 'lucide-react'
import { getAuthorityLabel, getAuthorityTone } from './evidence-authority'

interface Props {
  /** Full citation string, e.g. "src/auth/handler.ts:15-42" */
  citation: string
  metadata?: EvidenceSourceMetadata | null
}

export function CitationBadge({ citation, metadata }: Props) {
  // Extract just the filename + line range for compact display
  const lastSlash = citation.lastIndexOf('/')
  const short = lastSlash >= 0 ? citation.slice(lastSlash + 1) : citation

  return (
    <span
      title={citation}
      className="inline-flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600 border border-neutral-200"
    >
      <FileCode2 className="h-3 w-3 flex-shrink-0 text-neutral-400" />
      {short}
      {metadata && (
        <span className={cn('ml-1 rounded border px-1 py-0 text-[10px] font-medium', getAuthorityTone(metadata))}>
          {getAuthorityLabel(metadata.evidenceTier)}
        </span>
      )}
    </span>
  )
}
