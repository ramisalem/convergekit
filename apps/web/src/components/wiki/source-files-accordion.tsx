import type { EvidenceSourceMetadata } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { FileCode2 } from 'lucide-react'
import { getAuthorityLabel, getAuthorityTone } from './evidence-authority'

interface Props {
  sourceFiles: string[] | null
  sourceFileMetadata?: EvidenceSourceMetadata[] | null
}

export function SourceFilesAccordion({ sourceFiles, sourceFileMetadata }: Props) {
  if (!sourceFiles || sourceFiles.length === 0) return null
  const metadataByPath = new Map((sourceFileMetadata ?? []).map((item) => [item.path, item]))

  return (
    <details className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-neutral-700 hover:text-neutral-900 select-none">
        Relevant source files
      </summary>
      <div className="border-t border-neutral-200 px-4 py-3">
        <ul className="space-y-1">
          {sourceFiles.map((file) => {
            const metadata = metadataByPath.get(file)
            return (
              <li key={file} className="flex items-center gap-2 text-xs font-mono text-neutral-600">
                <FileCode2 className="h-3.5 w-3.5 flex-shrink-0 text-neutral-400" />
                <span className="min-w-0 flex-1 truncate">{file}</span>
                {metadata && (
                  <span
                    className={cn(
                      'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium',
                      getAuthorityTone(metadata),
                    )}
                  >
                    {getAuthorityLabel(metadata.evidenceTier)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </details>
  )
}
