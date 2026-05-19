import type { AccessPolicySettings } from '@/lib/api-client'

type Props = {
  policy: AccessPolicySettings
}

export function AccessPolicyPanel({ policy }: Props) {
  const rows = [
    {
      label: 'Allowed email domain',
      value: policy.allowedEmailDomain ?? 'Not restricted',
      restricted: Boolean(policy.allowedEmailDomain),
    },
    {
      label: 'Allowed GitHub organization',
      value: policy.allowedGitHubOrg ?? 'Not restricted',
      restricted: Boolean(policy.allowedGitHubOrg),
    },
    {
      label: 'Allowed repository host',
      value: policy.allowedRepositoryHost,
      restricted: true,
    },
  ]

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-neutral-200 px-6 py-4">
        <h2 className="text-sm font-semibold">Access policy</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Deployment configuration that controls who can sign in and which repositories can be
          indexed.
        </p>
      </div>
      <dl className="divide-y divide-neutral-100">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 px-6 py-4 sm:grid-cols-[220px_1fr] sm:gap-4">
            <dt className="text-sm font-medium text-neutral-700">{row.label}</dt>
            <dd
              className={
                row.restricted ? 'font-mono text-sm text-neutral-900' : 'text-sm text-neutral-500'
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-neutral-100 bg-neutral-50 px-6 py-4">
        <p className="text-xs text-neutral-500">
          These values are read-only in ConvergeKit. Change them through deployment configuration.
        </p>
      </div>
    </section>
  )
}
