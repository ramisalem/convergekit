import type { EvidenceSourceMetadata } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Folder } from 'lucide-react'
import { getAuthorityLabel } from './evidence-authority'

interface Props {
  sourceFiles: string[] | null
  sourceFileMetadata?: EvidenceSourceMetadata[] | null
}

export function SourceFilesAccordion({ sourceFiles, sourceFileMetadata }: Props) {
  if (!sourceFiles || sourceFiles.length === 0) return null
  const metadataByPath = new Map((sourceFileMetadata ?? []).map((item) => [item.path, item]))
  const tierCounts = (sourceFileMetadata ?? []).reduce<Record<'A' | 'B' | 'C' | 'D', number>>(
    (counts, item) => {
      if (item.evidenceTier) counts[item.evidenceTier] += 1
      return counts
    },
    { A: 0, B: 0, C: 0, D: 0 },
  )

  return (
    <details open className="mb-6 rounded-[10px] border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-2)]">
      <summary className="flex cursor-default select-none items-center gap-2.5 px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--convergekit-ink-2)]">
        <Folder className="h-3.5 w-3.5 flex-shrink-0" />
        <span>Relevant source files · {sourceFiles.length}</span>
        <span className="ml-auto flex flex-wrap justify-end gap-1">
          {(['A', 'B', 'C', 'D'] as const).map((tier) => (
            tierCounts[tier] > 0 && (
              <span key={tier} className={cn('jw-chip', `auth-${tier}`)}>
                {tierCounts[tier]} {getAuthorityLabel(tier)}
              </span>
            )
          ))}
        </span>
      </summary>
      <div className="flex flex-col gap-1 px-3.5 pb-3.5 pt-2">
        <ul className="flex flex-col gap-1">
          {sourceFiles.map((file) => {
            const metadata = metadataByPath.get(file)
            const tier = metadata?.evidenceTier ?? null
            return (
              <li key={file} className={cn('jw-bar', tier ? `auth-${tier}` : 'auth-source')}>
                <span className="shrink-0 font-mono text-[10.5px] font-semibold opacity-70">
                  {tier ? `Tier ${tier}` : 'Source'}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--convergekit-ink-2)]">
                  {file}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </details>
  )
}
