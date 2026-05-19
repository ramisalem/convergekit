'use client'

import { useState } from 'react'
import { AiProviderForm } from '@/components/settings/ai-provider-form'
import { ConnectionTest } from '@/components/settings/connection-test'
import type { AiSettings, AiSettingsDraft } from '@/lib/api-client'

interface Props {
  initial: AiSettings
  hasIndexedRepos?: boolean
  aiProviderTitle: string
  aiProviderDescription: string
  connectionTestTitle: string
  connectionTestDescription: string
}

function toDraftSettings(settings: AiSettings): AiSettingsDraft {
  return {
    provider: settings.provider,
    lmStudioChatModel: settings.lmStudioChatModel,
    lmStudioMindmapModel: settings.lmStudioMindmapModel,
    lmStudioEmbeddingModel: settings.lmStudioEmbeddingModel,
    openrouterChatModel: settings.openrouterChatModel,
    openrouterMindmapModel: settings.openrouterMindmapModel,
    openrouterEmbeddingModel: settings.openrouterEmbeddingModel,
    openrouterEndpoint: settings.openrouterEndpoint,
    anthropicChatModel: settings.anthropicChatModel,
    anthropicMindmapModel: settings.anthropicMindmapModel,
    anthropicEmbeddingModel: settings.anthropicEmbeddingModel,
    openaiChatModel: settings.openaiChatModel,
    openaiMindmapModel: settings.openaiMindmapModel,
    openaiEmbeddingModel: settings.openaiEmbeddingModel,
    openaiEndpoint: settings.openaiEndpoint,
  }
}

export function SettingsClient({
  initial,
  hasIndexedRepos = false,
  aiProviderTitle,
  aiProviderDescription,
  connectionTestTitle,
  connectionTestDescription,
}: Props) {
  const [draftSettings, setDraftSettings] = useState<AiSettingsDraft>(toDraftSettings(initial))

  return (
    <>
      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-sm font-semibold">{aiProviderTitle}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">{aiProviderDescription}</p>
        </div>
        <AiProviderForm
          initial={initial}
          hasIndexedRepos={hasIndexedRepos}
          onDraftChange={setDraftSettings}
        />
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-sm font-semibold">{connectionTestTitle}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">{connectionTestDescription}</p>
        </div>
        <ConnectionTest draftSettings={draftSettings} />
      </section>
    </>
  )
}
