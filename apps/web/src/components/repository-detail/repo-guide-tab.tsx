'use client'

import { AlignmentChip, EvidenceChip, StackedTierBar } from '@/components/ui/evidence-chip'
import { repositoriesApi } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import type { RepositoryGuideSummary } from '@convergekit/types'
import { Download, Info, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { getRepoGuideViewState, shouldShowMetadataRefreshHint } from './repo-guide-tab-state'

type Props = {
  repositoryId: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  jobId?: string | null
  queue?: string | null
}

type BaseGuideArea = RepositoryGuideSummary['areas'][number]
type EvidenceTier = BaseGuideArea['evidenceShare'][number]['tier']
type EvidenceLabel = RepositoryGuideSummary['questionStarters'][number]['evidenceLabels'][number]
type GuideArea = BaseGuideArea & {
  pathHint?: string | null
}
type QuestionCard = {
  alignment: 'ok' | 'stale' | 'conflict'
  confidence: number
  primaryTier: EvidenceTier
  question: string
  rationale: string
  route: string
  sources: Array<{
    count: number
    label: string
    tier: EvidenceTier
  }>
}
type GuideWithDesignFields = RepositoryGuideSummary & {
  areas: GuideArea[]
  questionCards?: QuestionCard[]
}

const EVIDENCE_LABEL_TIERS: Record<EvidenceLabel, EvidenceTier> = {
  Code: 'A',
  Tests: 'B',
  Docs: 'C',
  'Design/History': 'D',
}

const TIER_LABELS: Record<EvidenceTier, string> = {
  A: 'Code',
  B: 'Tests',
  C: 'Docs',
  D: 'Design / History',
}

const ALIGNMENT_LABELS: Record<QuestionCard['alignment'], string> = {
  ok: 'Aligned',
  stale: 'Stale',
  conflict: 'Conflicting',
}

const CONFIDENCE_SCORES: Record<GuideArea['confidenceLabel'], number> = {
  'Very strong': 5,
  Strong: 4,
  'Mixed with docs': 3,
  'Gated history': 2,
  Limited: 1,
}

const CONFIDENCE_TONES: Record<GuideArea['confidenceLabel'], string> = {
  'Very strong':
    'border-[var(--convergekit-align-ok-bd)]/25 bg-[var(--convergekit-align-ok-bg)] text-[var(--convergekit-align-ok-fg)]',
  Strong:
    'border-[var(--convergekit-align-ok-bd)]/25 bg-[var(--convergekit-align-ok-bg)] text-[var(--convergekit-align-ok-fg)]',
  'Mixed with docs':
    'border-[var(--convergekit-auth-c-bd)]/25 bg-[var(--convergekit-auth-c-bg)] text-[var(--convergekit-auth-c-fg)]',
  'Gated history':
    'border-[var(--convergekit-align-stale-bd)]/25 bg-[var(--convergekit-align-stale-bg)] text-[var(--convergekit-align-stale-fg)]',
  Limited: 'border-[var(--convergekit-line)] bg-[var(--convergekit-bg-3)] text-[var(--convergekit-ink-3)]',
}

export function RepoGuideTab({ repositoryId, status }: Props) {
  const t = useTranslations('repositoryDetail.repoGuide')
  const [guide, setGuide] = useState<RepositoryGuideSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    repositoriesApi
      .getGuide(repositoryId)
      .then(({ guide }) => {
        if (!cancelled) setGuide(guide)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load repo guide')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [repositoryId])

  const viewState = useMemo(() => {
    if (!guide) return status === 'failed' ? 'failed' : 'preparing'
    return getRepoGuideViewState({
      repositoryStatus: status,
      guideStatus: guide.status,
      areaSource: guide.areaSource,
      mindMapStatus: guide.mindMapStatus,
    })
  }, [guide, status])

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    try {
      const { guide } = await repositoriesApi.getGuide(repositoryId)
      setGuide(guide)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh repo guide')
    } finally {
      setRefreshing(false)
    }
  }

  function handleExport() {
    if (!guide) return
    const blob = new Blob([JSON.stringify(guide, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `repo-guide-${repositoryId}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (loading)
    return <GuideLoading title={t('preparingTitle')} description={t('preparingDescription')} />

  if (error || viewState === 'failed') {
    return (
      <div className="rounded-[var(--convergekit-radius-lg)] border border-red-100 bg-red-50 p-4 text-sm text-red-700">
        {error ?? t('preparingDescription')}
      </div>
    )
  }

  if (!guide || viewState === 'preparing') {
    return <GuideLoading title={t('preparingTitle')} description={t('preparingDescription')} />
  }

  const designGuide = guide as GuideWithDesignFields

  return (
    <div className="flex h-full min-h-[min(720px,calc(100vh-18rem))] w-full flex-col gap-3.5 py-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-normal text-[var(--convergekit-ink)]">
            Repo Guide
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-[var(--convergekit-ink-3)]">
            Two lenses on the same evidence - coverage by area, and what the repo can answer with
            confidence.
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-xs font-medium text-[var(--convergekit-ink-2)] shadow-sm transition-colors hover:bg-[var(--convergekit-bg-3)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Re-rank
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-3 text-xs font-medium text-[var(--convergekit-ink-2)] shadow-sm transition-colors hover:bg-[var(--convergekit-bg-3)]"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </header>

      {shouldShowMetadataRefreshHint(guide.metadataStatus) && (
        <div className="rounded-[var(--convergekit-radius-lg)] border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          {t('metadataRefreshing')}
        </div>
      )}

      <div
        className="grid h-[min(680px,calc(100vh-20rem))] min-h-[520px] min-w-0 grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 34rem), 1fr))' }}
      >
        <CurrentRepoGuide guide={designGuide} showComputingHint={viewState === 'computing-areas'} />
        <ProposedRepoGuide cards={getQuestionCardsForGuide(designGuide)} />
      </div>

      <div className="flex items-start gap-3 rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white px-4 py-3 text-[13px] leading-5 text-[var(--convergekit-ink-2)] shadow-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--convergekit-ink-3)]" />
        <p>
          <strong className="font-semibold text-[var(--convergekit-ink)]">Reading both:</strong>{' '}
          Coverage shows where the index is densest. Questions shows what users can actually ask
          with confidence - the same evidence, projected onto questions instead of folders.
        </p>
      </div>
    </div>
  )
}

function GuideLoading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-center gap-4 rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white p-5">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--convergekit-line)] border-t-[var(--convergekit-ink)]" />
      <div>
        <h3 className="text-sm font-semibold text-[var(--convergekit-ink)]">{title}</h3>
        <p className="mt-1 text-sm text-[var(--convergekit-ink-3)]">{description}</p>
      </div>
    </div>
  )
}

function CurrentRepoGuide({
  guide,
  showComputingHint,
}: {
  guide: GuideWithDesignFields
  showComputingHint: boolean
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--convergekit-line)] px-4 py-3.5">
        <div className="min-w-0">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--convergekit-ink-4)]">
            Current
          </div>
          <h3 className="text-base font-semibold text-[var(--convergekit-ink)]">
            Coverage by repository area
          </h3>
          <p className="mt-1 text-xs leading-5 text-[var(--convergekit-ink-3)]">
            Shows where evidence is strong, ranked by the mind-map.
          </p>
        </div>
        {showComputingHint && (
          <span className="rounded-full border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-3)] px-2.5 py-1 text-[11px] font-medium text-[var(--convergekit-ink-3)]">
            Computing areas
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <TierLegend />

        {guide.areas.length === 0 ? (
          <p className="mt-4 rounded-md border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-2)] px-3 py-2 text-sm text-[var(--convergekit-ink-3)]">
            No repository areas are ready yet.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3.5">
            {guide.areas.map((area) => (
              <AreaCoverageRow key={area.name} area={area} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function AreaCoverageRow({ area }: { area: GuideArea }) {
  const shares = area.evidenceShare.filter((share) => share.fileCount > 0)
  const pathHint = area.pathHint ?? area.primaryQuestionIntents.join(' / ')

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-[var(--convergekit-ink)]">
            {area.name}
          </div>
          <div className="truncate font-mono text-[11px] text-[var(--convergekit-ink-4)]">
            {pathHint || 'path unavailable'}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex h-[22px] shrink-0 items-center rounded-full border px-2 text-[11.5px] font-medium',
            CONFIDENCE_TONES[area.confidenceLabel],
          )}
        >
          {area.confidenceLabel.toLowerCase()} confidence
        </span>
      </div>
      <StackedTierBar
        tiers={Object.fromEntries(area.evidenceShare.map((share) => [share.tier, share.fileCount]))}
      />
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[var(--convergekit-ink-4)]">
        {shares.length === 0 ? (
          <span>No evidence files</span>
        ) : (
          shares.map((share) => (
            <span key={share.tier}>
              {share.tier} {share.percentage}%
            </span>
          ))
        )}
      </div>
    </div>
  )
}

function getQuestionCardsForGuide(guide: GuideWithDesignFields): QuestionCard[] {
  if (guide.questionCards?.length) return guide.questionCards

  return guide.questionStarters.map((starter) => {
    const matchedArea = starter.generatedFromArea
      ? guide.areas.find((area) => area.name === starter.generatedFromArea)
      : guide.areas[0]
    const confidence = matchedArea ? CONFIDENCE_SCORES[matchedArea.confidenceLabel] : 2
    const primaryTier = EVIDENCE_LABEL_TIERS[starter.evidenceLabels[0] ?? 'Code']
    const route = starter.evidenceLabels.join(' + ')

    return {
      alignment:
        confidence <= 1 ? 'conflict' : primaryTier === 'D' || confidence <= 2 ? 'stale' : 'ok',
      confidence,
      primaryTier,
      question: starter.examplePrompt,
      rationale: matchedArea
        ? `${matchedArea.name} is the strongest current area for ${starter.title.toLowerCase()} questions.`
        : starter.title,
      route,
      sources: starter.evidenceLabels.map((label) => ({
        count: 1,
        label,
        tier: EVIDENCE_LABEL_TIERS[label],
      })),
    }
  })
}

function ProposedRepoGuide({ cards }: { cards: QuestionCard[] }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--convergekit-line)] px-4 py-3.5">
        <div className="min-w-0">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--convergekit-ink)]">
            Question-first
          </div>
          <h3 className="text-base font-semibold text-[var(--convergekit-ink)]">
            What we can answer with high confidence
          </h3>
          <p className="mt-1 text-xs leading-5 text-[var(--convergekit-ink-3)]">
            Cards rank questions by evidence strength, primary tier, and alignment.
          </p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto p-4">
        {cards.length === 0 ? (
          <p className="rounded-md border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-2)] px-3 py-2 text-sm text-[var(--convergekit-ink-3)]">
            Question routes will appear when evidence is ready.
          </p>
        ) : (
          cards.map((card) => <QuestionConfidenceCard key={card.question} card={card} />)
        )}
      </div>
    </section>
  )
}

function QuestionConfidenceCard({ card }: { card: QuestionCard }) {
  return (
    <article className="rounded-[10px] border border-[var(--convergekit-line)] bg-[var(--convergekit-bg)] p-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <ConfidenceMeter value={card.confidence} tier={card.primaryTier} />
            <span className="min-w-0 truncate text-[11.5px] font-medium text-[var(--convergekit-ink-3)]">
              {card.confidence}/5 · routed via {card.route}
            </span>
            <span className="ml-auto shrink-0">
              <AlignmentChip alignment={card.alignment}>
                {ALIGNMENT_LABELS[card.alignment]}
              </AlignmentChip>
            </span>
          </div>
          <h4 className="text-sm font-semibold tracking-normal text-[var(--convergekit-ink)]">
            {card.question}
          </h4>
          <p className="mt-1 text-[12.5px] leading-5 text-[var(--convergekit-ink-3)]">
            {card.rationale}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {card.sources.map((source) => (
              <EvidenceChip key={`${source.tier}-${source.label}`} tier={source.tier}>
                <span className="text-[10px] font-semibold opacity-65">{source.tier}</span>
                <span>{source.label}</span>
                {source.count > 1 && <span className="opacity-50">x{source.count}</span>}
              </EvidenceChip>
            ))}
          </div>
        </div>
      </div>
    </article>
  )
}

function ConfidenceMeter({ value, tier }: { value: number; tier: EvidenceTier }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {[1, 2, 3, 4, 5].map((segment) => (
        <span
          key={segment}
          className={cn(
            'h-1.5 w-4 rounded-full bg-[var(--convergekit-bg-3)]',
            segment <= value && confidenceSegmentClass(tier),
          )}
        />
      ))}
    </div>
  )
}

function TierLegend() {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-2 text-[11.5px] text-[var(--convergekit-ink-3)]">
      {(['A', 'B', 'C', 'D'] as const).map((tier) => (
        <span key={tier} className="inline-flex items-center gap-1.5">
          <span className={cn('h-[9px] w-[9px] rounded-[2px]', tierDotClass(tier))} />
          Tier {tier} · {TIER_LABELS[tier]}
        </span>
      ))}
    </div>
  )
}

function confidenceSegmentClass(tier: EvidenceTier) {
  return {
    A: 'bg-[var(--convergekit-auth-a-bd)]',
    B: 'bg-[var(--convergekit-auth-b-bd)]',
    C: 'bg-[var(--convergekit-auth-c-bd)]',
    D: 'bg-[var(--convergekit-auth-d-bd)]',
  }[tier]
}

function tierDotClass(tier: EvidenceTier) {
  return {
    A: 'bg-[var(--convergekit-auth-a-bd)]',
    B: 'bg-[var(--convergekit-auth-b-bd)]',
    C: 'bg-[var(--convergekit-auth-c-bd)]',
    D: 'bg-[var(--convergekit-auth-d-bd)]',
  }[tier]
}
