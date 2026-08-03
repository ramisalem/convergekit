import { ConvergeKitLogoMark } from '@/components/convergekit-logo'

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--convergekit-bg-2)] px-6 text-center">
      <div className="max-w-[720px]">
        <ConvergeKitLogoMark className="mx-auto h-10 w-10" title="Colab Ai Hub" />
        <p className="mt-4 text-sm font-semibold text-[var(--convergekit-ink-3)]">Colab Ai Hub</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal text-[var(--convergekit-ink)]">
          The shared source of truth for product, engineering, and AI agents.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[var(--convergekit-ink-3)]">
          Understand what the code actually does, why decisions were made, and where work should
          happen next.
        </p>
      </div>
    </main>
  )
}
