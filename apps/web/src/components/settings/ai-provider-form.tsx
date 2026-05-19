'use client'

import { useState, useTransition, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import {
  settingsApi,
  type AIProvider,
  type AiSettings,
  type AiSettingsDraft,
  type CategorizedModels,
} from '@/lib/api-client'

const PROVIDERS: AIProvider[] = ['lmstudio', 'openrouter', 'anthropic', 'openai']
const NO_KEY_PROVIDERS: AIProvider[] = ['lmstudio']

interface Props {
  initial: AiSettings
  hasIndexedRepos?: boolean
  onDraftChange?: (draft: AiSettingsDraft) => void
}

type ModelState = { embedding: string[]; chat: string[] }

/** For OpenRouter: all known model IDs for validation (embedding + chat combined) */
type AllModels = Set<string>

/** Keys for per-provider model fields in AiSettings */
function modelKeys(provider: AIProvider) {
  const prefixMap: Record<AIProvider, string> = {
    lmstudio: 'lmStudio',
    openrouter: 'openrouter',
    anthropic: 'anthropic',
    openai: 'openai',
  }
  const p = prefixMap[provider]
  return {
    chat: `${p}ChatModel` as keyof AiSettings,
    mindmap: `${p}MindmapModel` as keyof AiSettings,
    embedding: `${p}EmbeddingModel` as keyof AiSettings,
  }
}

function endpointKey(provider: AIProvider): keyof AiSettings | null {
  if (provider === 'openrouter') return 'openrouterEndpoint'
  if (provider === 'openai') return 'openaiEndpoint'
  return null
}

export function AiProviderForm({ initial, hasIndexedRepos = false, onDraftChange }: Props) {
  const t = useTranslations('settings.aiProvider')
  const [settings, setSettings] = useState<AiSettings>(initial)
  const [provider, setProvider] = useState<AIProvider>(initial.provider)
  const [loaded, setLoaded] = useState(false)

  // Per-provider model selections
  const keys = modelKeys(provider)
  const [chatModel, setChatModel] = useState((initial[keys.chat] as string) ?? '')
  const [mindmapModel, setMindmapModel] = useState((initial[keys.mindmap] as string) ?? '')
  const [embeddingModel, setEmbeddingModel] = useState(
    (initial[keys.embedding] as string) ?? '',
  )

  // Endpoint (openrouter / openai only)
  const epKey = endpointKey(provider)
  const [endpoint, setEndpoint] = useState(epKey ? ((initial[epKey] as string) ?? '') : '')

  // API key
  const [apiKey, setApiKey] = useState('')

  // Available models from fetch
  const [models, setModels] = useState<ModelState>({ embedding: [], chat: [] })
  const [allKnownModels, setAllKnownModels] = useState<AllModels>(new Set())
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelError, setModelError] = useState<string | null>(null)
  const [validationWarnings, setValidationWarnings] = useState<Record<string, string>>({})

  // Form state
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [isPending, startTransition] = useTransition()
  const [showEmbeddingWarning, setShowEmbeddingWarning] = useState(false)
  const pendingSaveRef = useRef<(() => void) | null>(null)

  // Track the initial saved state for dirty detection
  const [savedState, setSavedState] = useState(initial)

  // Fetch actual settings client-side (SSR fetch may fail due to cookie forwarding)
  useEffect(() => {
    if (loaded) return
    void settingsApi.getAi().then((data) => {
      setSettings(data)
      setSavedState(data)
      setProvider(data.provider)
      const k = modelKeys(data.provider)
      setChatModel((data[k.chat] as string) ?? '')
      setMindmapModel((data[k.mindmap] as string) ?? '')
      setEmbeddingModel((data[k.embedding] as string) ?? '')
      const ep = endpointKey(data.provider)
      setEndpoint(ep ? ((data[ep] as string) ?? '') : '')
      setLoaded(true)
    }).catch(() => {
      setLoaded(true)
    })
  }, [loaded])

  const isDirty =
    provider !== savedState.provider ||
    apiKey !== '' ||
    chatModel !== ((savedState[modelKeys(provider).chat] as string) ?? '') ||
    mindmapModel !== ((savedState[modelKeys(provider).mindmap] as string) ?? '') ||
    embeddingModel !== ((savedState[modelKeys(provider).embedding] as string) ?? '') ||
    (epKey ? endpoint !== ((savedState[epKey] as string) ?? '') : false)

  // ── Model fetching ──────────────────────────────────────────────────────────

  const fetchModelsForProvider = useCallback(
    async (p: AIProvider) => {
      setLoadingModels(true)
      setModelError(null)
      try {
        let data: CategorizedModels
        switch (p) {
          case 'lmstudio':
            data = await settingsApi.getLmStudioModels()
            break
          case 'openrouter':
            data = await settingsApi.getOpenRouterModels()
            break
          case 'anthropic':
            data = await settingsApi.getAnthropicModels()
            break
          case 'openai':
            data = await settingsApi.getOpenAiModels()
            break
        }
        if (data.error) setModelError(data.error)
        setModels({ embedding: data.embedding, chat: data.chat })
        if (p === 'openrouter') {
          setAllKnownModels(new Set([...data.embedding, ...data.chat]))
        }
      } catch {
        setModelError(t('fetchError'))
        setModels({ embedding: [], chat: [] })
      } finally {
        setLoadingModels(false)
      }
    },
    [t],
  )

  // Auto-fetch on provider change (if no key needed or key exists)
  useEffect(() => {
    const needsKey = !NO_KEY_PROVIDERS.includes(provider)
    if (!needsKey || settings.hasApiKey) {
      void fetchModelsForProvider(provider)
    }
  }, [provider, settings.hasApiKey, fetchModelsForProvider])

  // Restore model selections when switching providers
  useEffect(() => {
    const k = modelKeys(provider)
    setChatModel((settings[k.chat] as string) ?? '')
    setMindmapModel((settings[k.mindmap] as string) ?? '')
    setEmbeddingModel((settings[k.embedding] as string) ?? '')
    const ep = endpointKey(provider)
    setEndpoint(ep ? ((settings[ep] as string) ?? '') : '')
  }, [provider, settings])

  useEffect(() => {
    if (!onDraftChange) return

    onDraftChange({
      provider,
      apiKey: apiKey || undefined,
      lmStudioChatModel: provider === 'lmstudio' ? (chatModel || null) : settings.lmStudioChatModel,
      lmStudioMindmapModel: provider === 'lmstudio' ? (mindmapModel || null) : settings.lmStudioMindmapModel,
      lmStudioEmbeddingModel: provider === 'lmstudio' ? (embeddingModel || null) : settings.lmStudioEmbeddingModel,
      openrouterChatModel: provider === 'openrouter' ? (chatModel || null) : settings.openrouterChatModel,
      openrouterMindmapModel: provider === 'openrouter' ? (mindmapModel || null) : settings.openrouterMindmapModel,
      openrouterEmbeddingModel: provider === 'openrouter' ? (embeddingModel || null) : settings.openrouterEmbeddingModel,
      openrouterEndpoint: provider === 'openrouter' ? (endpoint || null) : settings.openrouterEndpoint,
      anthropicChatModel: provider === 'anthropic' ? (chatModel || null) : settings.anthropicChatModel,
      anthropicMindmapModel: provider === 'anthropic' ? (mindmapModel || null) : settings.anthropicMindmapModel,
      anthropicEmbeddingModel: provider === 'anthropic' ? (embeddingModel || null) : settings.anthropicEmbeddingModel,
      openaiChatModel: provider === 'openai' ? (chatModel || null) : settings.openaiChatModel,
      openaiMindmapModel: provider === 'openai' ? (mindmapModel || null) : settings.openaiMindmapModel,
      openaiEmbeddingModel: provider === 'openai' ? (embeddingModel || null) : settings.openaiEmbeddingModel,
      openaiEndpoint: provider === 'openai' ? (endpoint || null) : settings.openaiEndpoint,
    })
  }, [apiKey, chatModel, embeddingModel, endpoint, mindmapModel, onDraftChange, provider, settings])

  // ── Save ────────────────────────────────────────────────────────────────────

  function doSave() {
    setStatus('saving')
    startTransition(async () => {
      try {
        const k = modelKeys(provider)
        const payload: Parameters<typeof settingsApi.updateAi>[0] = {
          provider,
          [k.chat]: chatModel || null,
          [k.mindmap]: mindmapModel || null,
          [k.embedding]: embeddingModel || null,
        }
        if (apiKey) payload.apiKey = apiKey
        const ep = endpointKey(provider)
        if (ep) {
          ;(payload as Record<string, unknown>)[ep] = endpoint || null
        }
        const updated = await settingsApi.updateAi(payload)
        setSettings(updated)
        setSavedState(updated)
        setApiKey('')
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2000)
        // Re-fetch models if we just saved a new key
        const needsKey = !NO_KEY_PROVIDERS.includes(provider)
        if (needsKey && updated.hasApiKey) {
          void fetchModelsForProvider(provider)
        }
      } catch {
        setStatus('idle')
      }
    })
  }

  function validateOpenRouterModels(): Record<string, string> {
    if (provider !== 'openrouter' || allKnownModels.size === 0) return {}
    const warnings: Record<string, string> = {}
    if (embeddingModel && !allKnownModels.has(embeddingModel)) {
      warnings.embedding = `"${embeddingModel}" not found in OpenRouter model list`
    }
    if (chatModel && !allKnownModels.has(chatModel)) {
      warnings.chat = `"${chatModel}" not found in OpenRouter model list`
    }
    if (mindmapModel && !allKnownModels.has(mindmapModel)) {
      warnings.mindmap = `"${mindmapModel}" not found in OpenRouter model list`
    }
    return warnings
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    // Validate OpenRouter model names
    const warnings = validateOpenRouterModels()
    setValidationWarnings(warnings)

    // Check if embedding model changed and user has indexed repos
    const k = modelKeys(provider)
    const savedEmbedding = (savedState[k.embedding] as string) ?? ''
    if (
      hasIndexedRepos &&
      embeddingModel !== savedEmbedding &&
      embeddingModel !== ''
    ) {
      pendingSaveRef.current = doSave
      setShowEmbeddingWarning(true)
      return
    }
    doSave()
  }

  async function handleClearKey() {
    setStatus('saving')
    try {
      const updated = await settingsApi.updateAi({ provider, clearApiKey: true })
      setSettings(updated)
      setSavedState(updated)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('idle')
    }
  }

  const saveLabel =
    status === 'saving' ? t('saving') : status === 'saved' ? t('saved') : t('save')

  const needsKey = !NO_KEY_PROVIDERS.includes(provider)
  const canFetchModels = !needsKey || settings.hasApiKey
  const showEndpoint = provider === 'openrouter' || provider === 'openai'

  return (
    <>
      <form onSubmit={handleSave}>
        {/* Provider selector */}
        <div className="space-y-3 px-6 py-5">
          <p className="text-xs font-medium text-neutral-500">{t('providerLabel')}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={[
                  'rounded-lg border px-4 py-3 text-left transition-colors',
                  provider === p
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400',
                ].join(' ')}
              >
                <span className="block text-sm font-medium">{t(`providers.${p}`)}</span>
                <span
                  className={[
                    'block mt-0.5 text-xs',
                    provider === p ? 'text-neutral-300' : 'text-neutral-400',
                  ].join(' ')}
                >
                  {t(`providerDescriptions.${p}`)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-neutral-100" />

        {/* API key — hidden for local providers */}
        {needsKey && (
          <>
            <div className="px-6 py-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-neutral-500">{t('apiKeyLabel')}</p>
                {settings.hasApiKey && settings.maskedApiKey && (
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-neutral-400">
                      {settings.maskedApiKey}
                    </span>
                    <span className="text-xs text-neutral-400">{t('storedSecurely')}</span>
                    <button
                      type="button"
                      onClick={handleClearKey}
                      className="text-xs text-red-500 hover:text-red-700 transition-colors"
                    >
                      {t('clearKey')}
                    </button>
                  </div>
                )}
              </div>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  settings.hasApiKey ? '••••••••••••••••••••••••' : t('apiKeyPlaceholder')
                }
                autoComplete="off"
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-mono text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none transition-colors"
              />
            </div>
            <div className="border-t border-neutral-100" />
          </>
        )}

        {/* Endpoint — openrouter and openai */}
        {showEndpoint && (
          <>
            <div className="px-6 py-5 space-y-3">
              <p className="text-xs font-medium text-neutral-500">{t('endpointLabel')}</p>
              <input
                type="url"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder={
                  provider === 'openrouter'
                    ? t('endpointPlaceholder')
                    : t('openaiEndpointPlaceholder')
                }
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-mono text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none transition-colors"
              />
            </div>
            <div className="border-t border-neutral-100" />
          </>
        )}

        {/* Model configuration */}
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-neutral-500">{t('modelConfig')}</p>
            <button
              type="button"
              onClick={() => fetchModelsForProvider(provider)}
              disabled={loadingModels || !canFetchModels}
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={['h-3 w-3', loadingModels ? 'animate-spin' : ''].join(' ')}
              />
              {t('refreshModels')}
            </button>
          </div>

          {/* Loading state */}
          {loadingModels && (
            <p className="text-xs text-neutral-400">
              {provider === 'lmstudio' ? t('detectingModels') : t('fetchingModels')}
            </p>
          )}

          {/* Error state */}
          {modelError && !loadingModels && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-amber-700">{modelError}</p>
                <button
                  type="button"
                  onClick={() => fetchModelsForProvider(provider)}
                  className="mt-1 text-xs font-medium text-amber-700 underline hover:text-amber-900"
                >
                  {t('retry')}
                </button>
              </div>
            </div>
          )}

          {/* Embedding model */}
          <div className="space-y-1.5">
            <label className="text-xs text-neutral-500">{t('embeddingModelLabel')}</label>
            {provider === 'openrouter' ? (
              <input
                type="text"
                value={embeddingModel}
                onChange={(e) => { setEmbeddingModel(e.target.value); setValidationWarnings((w) => ({ ...w, embedding: '' })) }}
                placeholder="nomic-embed-code"
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-mono text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none transition-colors"
              />
            ) : (
              <ModelSelect
                value={embeddingModel}
                onChange={setEmbeddingModel}
                options={models.embedding}
                placeholder="nomic-embed-code"
                disabled={loadingModels}
              />
            )}
            <p className="text-xs text-neutral-400">{t('embeddingModelHint')}</p>
            {validationWarnings.embedding && (
              <p className="text-xs text-amber-600">{validationWarnings.embedding}</p>
            )}
            {!loadingModels && provider !== 'openrouter' && models.embedding.length === 0 && models.chat.length > 0 && (
              <p className="text-xs text-amber-600">{t('noEmbeddingModels')}</p>
            )}
          </div>

          {/* Chat model */}
          <div className="space-y-1.5">
            <label className="text-xs text-neutral-500">{t('chatModelLabel')}</label>
            {provider === 'openrouter' ? (
              <input
                type="text"
                value={chatModel}
                onChange={(e) => { setChatModel(e.target.value); setValidationWarnings((w) => ({ ...w, chat: '' })) }}
                placeholder="anthropic/claude-sonnet-4-5"
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-mono text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none transition-colors"
              />
            ) : (
              <ModelSelect
                value={chatModel}
                onChange={setChatModel}
                options={models.chat}
                placeholder={
                  provider === 'lmstudio'
                    ? (process.env.NEXT_PUBLIC_LM_STUDIO_CHAT_MODEL ?? 'qwen/qwen3.5-9b')
                    : provider === 'anthropic'
                      ? 'claude-sonnet-4-6'
                      : 'gpt-4o'
                }
                disabled={loadingModels}
              />
            )}
            <p className="text-xs text-neutral-400">{t('chatModelHint')}</p>
            {validationWarnings.chat && (
              <p className="text-xs text-amber-600">{validationWarnings.chat}</p>
            )}
          </div>

          {/* Wiki / mindmap model */}
          <div className="space-y-1.5">
            <label className="text-xs text-neutral-500">{t('mindmapModelLabel')}</label>
            {provider === 'openrouter' ? (
              <input
                type="text"
                value={mindmapModel}
                onChange={(e) => { setMindmapModel(e.target.value); setValidationWarnings((w) => ({ ...w, mindmap: '' })) }}
                placeholder="anthropic/claude-haiku-4-5"
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-mono text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none transition-colors"
              />
            ) : (
              <ModelSelect
                value={mindmapModel}
                onChange={setMindmapModel}
                options={models.chat}
                placeholder={
                  provider === 'lmstudio'
                    ? (process.env.NEXT_PUBLIC_LM_STUDIO_MINDMAP_MODEL ?? 'qwen/qwen3.5-9b')
                    : provider === 'anthropic'
                      ? 'claude-haiku-4-5-20251001'
                      : 'gpt-4o-mini'
                }
                disabled={loadingModels}
              />
            )}
            <p className="text-xs text-neutral-400">{t('mindmapModelHint')}</p>
            {validationWarnings.mindmap && (
              <p className="text-xs text-amber-600">{validationWarnings.mindmap}</p>
            )}
          </div>
        </div>

        <div className="border-t border-neutral-100" />

        {/* Save */}
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            {isDirty && status === 'idle' && (
              <p className="text-xs text-amber-600">{t('unsavedChanges')}</p>
            )}
            {status === 'saved' && (
              <p className="text-xs text-green-600">{t('settingsSaved')}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={isPending || status === 'saving' || !isDirty}
            className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-60"
          >
            {saveLabel}
          </button>
        </div>
      </form>

      {/* Embedding model change warning dialog */}
      {showEmbeddingWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">
                  {t('embeddingWarningTitle')}
                </h3>
                <p className="mt-2 text-sm text-neutral-600">{t('embeddingWarningBody')}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowEmbeddingWarning(false)
                  pendingSaveRef.current = null
                }}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                {t('embeddingWarningCancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEmbeddingWarning(false)
                  pendingSaveRef.current?.()
                  pendingSaveRef.current = null
                }}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 transition-colors"
              >
                {t('embeddingWarningConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Model select ─────────────────────────────────────────────────────────────

function ModelSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
  disabled?: boolean
}) {
  if (options.length > 0) {
    return (
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 focus:border-neutral-400 focus:bg-white focus:outline-none transition-colors disabled:opacity-50"
      >
        <option value="">{placeholder} (default)</option>
        {options.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-mono text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none transition-colors disabled:opacity-50"
    />
  )
}
