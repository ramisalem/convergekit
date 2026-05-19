import type { EvidenceSourceMetadata } from '@/lib/api-client'

export function pathFromCitation(citation: string) {
  return citation.replace(/:\d+(?:-\d+)?$/, '')
}

export function getAuthorityLabel(tier: EvidenceSourceMetadata['evidenceTier']) {
  switch (tier) {
    case 'A':
      return 'Code'
    case 'B':
      return 'Tests'
    case 'C':
      return 'Docs'
    case 'D':
      return 'Design/History'
    default:
      return 'Source'
  }
}

export function getAuthorityTone(
  meta: Pick<EvidenceSourceMetadata, 'evidenceTier' | 'evidenceAlignmentStatus'>,
) {
  if (meta.evidenceAlignmentStatus === 'stale') return 'border-orange-200 bg-orange-50 text-orange-700'
  if (meta.evidenceAlignmentStatus === 'conflicts') return 'border-red-200 bg-red-50 text-red-700'
  if (meta.evidenceAlignmentStatus === 'aligned') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
  switch (meta.evidenceTier) {
    case 'A':
      return 'border-blue-200 bg-blue-50 text-blue-700'
    case 'B':
      return 'border-green-200 bg-green-50 text-green-700'
    case 'C':
      return 'border-slate-200 bg-slate-50 text-slate-600'
    case 'D':
      return 'border-violet-200 bg-violet-50 text-violet-700'
    default:
      return 'border-neutral-200 bg-neutral-100 text-neutral-600'
  }
}
