import { HeroCta } from '@/components/hero-cta'
import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'

const audienceCards = [
  { eyebrow: 'For product', titleKey: 'feature1Title', descKey: 'feature1Desc' },
  { eyebrow: 'For engineers', titleKey: 'feature2Title', descKey: 'feature2Desc' },
  { eyebrow: 'For agents', titleKey: 'feature3Title', descKey: 'feature3Desc' },
] as const

const workflowSteps = [
  { number: '01', titleKey: 'workflow1Title', descKey: 'workflow1Desc' },
  { number: '02', titleKey: 'workflow2Title', descKey: 'workflow2Desc' },
  { number: '03', titleKey: 'workflow3Title', descKey: 'workflow3Desc' },
] as const

export default function HomePage() {
  const t = useTranslations('home')

  return (
    <div className="flex flex-col">
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto w-full max-w-[1080px]">
          <div className="mx-auto mb-14 max-w-[720px] text-center">
            <div className="mb-[22px] inline-flex items-center gap-1.5 rounded-full border border-[var(--convergekit-line)] bg-white px-[11px] py-[5px] text-xs text-[var(--convergekit-ink-3)]">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {t('badge')}
            </div>
            <h1 className="m-0 text-[clamp(2.35rem,6vw,3.25rem)] font-semibold leading-[1.05] tracking-normal text-[var(--convergekit-ink)]">
              {t('headline')}
            </h1>
            <p className="mx-auto mt-4 max-w-[680px] text-[17px] leading-[1.55] text-[var(--convergekit-ink-3)]">
              {t('subheadline')}
            </p>
            <HeroCta getStarted={t('cta')} signIn={t('signInCta')} />
          </div>

          <div className="grid gap-3.5 md:grid-cols-3">
            {audienceCards.map(({ eyebrow, titleKey, descKey }) => (
              <div
                key={titleKey}
                className="rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white p-[22px]"
              >
                <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--convergekit-ink-4)]">
                  {eyebrow}
                </div>
                <h2 className="mb-1.5 text-[17px] font-semibold leading-snug text-[var(--convergekit-ink)]">
                  {t(titleKey)}
                </h2>
                <p className="text-[13.5px] leading-[1.5] text-[var(--convergekit-ink-3)]">
                  {t(descKey)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3.5 rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white p-6">
            <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--convergekit-ink-4)]">
              {t('workflowTitle')}
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {workflowSteps.map(({ number, titleKey, descKey }, index) => (
                <div key={titleKey} className="relative pl-1.5">
                  <div className="mb-2 font-mono text-[11px] text-[var(--convergekit-ink-4)]">
                    {number}
                  </div>
                  <h3 className="mb-1 text-[15px] font-semibold text-[var(--convergekit-ink)]">
                    {t(titleKey)}
                  </h3>
                  <p className="text-[13px] leading-[1.5] text-[var(--convergekit-ink-3)]">
                    {t(descKey)}
                  </p>
                  {index < 2 && (
                    <ChevronRight className="absolute right-[-12px] top-3 hidden h-3 w-3 text-[var(--convergekit-ink-4)] md:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
