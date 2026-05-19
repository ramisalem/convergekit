'use client'

import { repositoriesApi } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import type { RepositoryGuideSummary } from '@convergekit/types'
import { Settings } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { EvidenceChip, StackedTierBar } from '@/components/ui/evidence-chip'
import {
  getAdvancedSettingsHref,
  getEvidenceLabelTone,
  getRepoGuideViewState,
  shouldShowMetadataRefreshHint,
} from './repo-guide-tab-state'

type Props = {
  repositoryId: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  jobId?: string | null
  queue?: string | null
}

type GuideArea = RepositoryGuideSummary['areas'][number]
type QuestionStarter = RepositoryGuideSummary['questionStarters'][number]
type EvidenceTier = GuideArea['evidenceShare'][number]['tier']
type EvidenceLabel = RepositoryGuideSummary['evidenceTotals'][number]['label']

const EVIDENCE_LABEL_TIERS: Record<EvidenceLabel, EvidenceTier> = {
  Code: 'A',
  Tests: 'B',
  Docs: 'C',
  'Design/History': 'D',
}

export function RepoGuideTab({ repositoryId, status }: Props) {
  const t = useTranslations('repositoryDetail.repoGuide')
  const locale = useLocale()
  const [guide, setGuide] = useState<RepositoryGuideSummary | null>(null)
  const [loading, setLoading] = useState(true)
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

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-semibold text-[var(--convergekit-ink)]">{t('headline')}</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--convergekit-ink-3)]">
          {t('headlineDescription')}
        </p>
      </header>

      {shouldShowMetadataRefreshHint(guide.metadataStatus) && (
        <div className="rounded-[var(--convergekit-radius-lg)] border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          {t('metadataRefreshing')}
        </div>
      )}

      <CoveragePanel guide={guide} showComputingHint={viewState === 'computing-areas'} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
        <HowToReadPanel />
        <PhrasingTip />
      </div>

      <CoachingPanel starters={guide.questionStarters} />

      <AdvancedSettingsFooter locale={locale} repositoryId={repositoryId} />
    </div>
  )
}

function AdvancedSettingsFooter({
  locale,
  repositoryId,
}: {
  locale: string
  repositoryId: string
}) {
  const t = useTranslations('repositoryDetail.repoGuide')

  return (
    <div className="flex flex-col gap-3 rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="min-w-0 text-[var(--convergekit-ink-3)]">{t('advancedSettingsHint')}</p>
      <a
        href={getAdvancedSettingsHref(locale, repositoryId)}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--convergekit-line)] bg-white px-3 py-1.5 font-medium text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-3)]"
      >
        <Settings className="h-3.5 w-3.5" />
        {t('advancedSettingsAction')}
      </a>
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

function CoveragePanel({
  guide,
  showComputingHint,
}: {
  guide: RepositoryGuideSummary
  showComputingHint: boolean
}) {
  const t = useTranslations('repositoryDetail.repoGuide')

  return (
    <section className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--convergekit-ink)]">
            {t('coverageTitle')}
          </h3>
          <p className="mt-1 text-sm text-[var(--convergekit-ink-3)]">
            {t('coverageDescription')}
          </p>
        </div>
        {showComputingHint && (
          <div className="rounded-full border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-3)] px-3 py-1 text-xs font-medium text-[var(--convergekit-ink-3)]">
            {t('computingAreas')}
          </div>
        )}
      </div>

      {showComputingHint && (
        <p className="mt-3 text-sm text-[var(--convergekit-ink-3)]">{t('computingAreasDescription')}</p>
      )}

      <div className="mt-4 space-y-4">
        {guide.areas.map((area) => (
          <div key={area.name}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-[var(--convergekit-ink-2)]">{area.name}</span>
              <span className="text-[var(--convergekit-ink-3)]">{area.confidenceLabel}</span>
            </div>
            <EvidenceStack area={area} />
          </div>
        ))}
      </div>
    </section>
  )
}

function EvidenceStack({ area }: { area: GuideArea }) {
  const shares = area.evidenceShare.filter((share) => share.fileCount > 0)
  if (shares.length === 0) return <div className="h-1.5 rounded-full bg-[var(--convergekit-bg-3)]" />

  return (
    <StackedTierBar
      tiers={Object.fromEntries(shares.map((share) => [share.tier, share.fileCount]))}
    />
  )
}

function HowToReadPanel() {
  const t = useTranslations('repositoryDetail.repoGuide')
  const rows = [
    {
      label: t('currentBehavior'),
      evidence: t('currentBehaviorEvidence'),
      tone: getEvidenceLabelTone('Code'),
    },
    {
      label: t('setupDeploy'),
      evidence: t('setupDeployEvidence'),
      tone: getEvidenceLabelTone('Docs'),
    },
    {
      label: t('whyHistory'),
      evidence: t('whyHistoryEvidence'),
      tone: getEvidenceLabelTone('Design/History'),
    },
    {
      label: t('skippedNoise'),
      evidence: t('skippedNoiseEvidence'),
      tone: 'border-neutral-200 bg-neutral-50 text-neutral-500',
    },
  ]

  return (
    <section className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white p-4">
      <h3 className="text-base font-semibold text-[var(--convergekit-ink)]">{t('howToReadTitle')}</h3>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-[var(--convergekit-ink-2)]">{row.label}</span>
            <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', row.tone)}>
              {row.evidence}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function PhrasingTip() {
  const t = useTranslations('repositoryDetail.repoGuide')
  return (
    <section className="rounded-[var(--convergekit-radius-lg)] border border-blue-100 bg-blue-50 p-4">
      <p className="text-sm leading-6 text-blue-800">{t('tip')}</p>
    </section>
  )
}

function CoachingPanel({ starters }: { starters: QuestionStarter[] }) {
  if (starters.length === 0) return null
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {starters.map((starter) => (
        <CoachingCard key={`${starter.intent}-${starter.examplePrompt}`} starter={starter} />
      ))}
    </section>
  )
}

function CoachingCard({ starter }: { starter: QuestionStarter }) {
  return (
    <div className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white p-4">
      <h4 className="text-sm font-semibold text-[var(--convergekit-ink)]">{starter.title}</h4>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {starter.evidenceLabels.map((label) => (
          <EvidenceChip key={label} tier={EVIDENCE_LABEL_TIERS[label]}>
            {label}
          </EvidenceChip>
        ))}
      </div>
      <p className="mt-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
        "{starter.examplePrompt}"
      </p>
    </div>
  )
}
