import { ConnectInstructions } from '@/components/mcp/connect-instructions'
import { ConnectedAgentsPanel } from '@/components/mcp/connected-agents-panel'

export default function ConnectedAgentsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <ConnectInstructions />
      <ConnectedAgentsPanel />
    </div>
  )
}
