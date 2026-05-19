export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--convergekit-bg-2)] px-6 text-center">
      <div className="max-w-[720px]">
        <span className="mx-auto grid h-8 w-8 place-items-center rounded-md bg-[var(--convergekit-ink)] text-xs font-bold text-white">
          CK
        </span>
        <p className="mt-4 text-sm font-semibold text-[var(--convergekit-ink-3)]">ConvergeKit</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal text-[var(--convergekit-ink)]">
          Bring product intent, code reality, and agent context together.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[var(--convergekit-ink-3)]">
          Align product teams, engineers, and AI agents around what the code actually does.
        </p>
      </div>
    </main>
  )
}
