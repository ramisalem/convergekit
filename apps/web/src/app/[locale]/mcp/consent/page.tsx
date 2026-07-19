import { ConsentCard } from '@/components/mcp/consent-card'

export default async function McpConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>
}) {
  const { request } = await searchParams
  return (
    <div className="grid min-h-[calc(100vh-52px)] place-items-center px-6 py-12">
      <ConsentCard request={request ?? ''} />
    </div>
  )
}
