'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Loader, Zap } from 'lucide-react'
import { settingsApi, type AiSettingsDraft, type ConnectionTestResult } from '@/lib/api-client'

type Results = Record<string, ConnectionTestResult>

const SERVICES: { key: string; label: string; description: string }[] = [
  {
    key: 'embedding',
    label: 'Embedding model',
    description: 'Code chunk embeddings for search',
  },
  {
    key: 'llm',
    label: 'Language model',
    description: 'Wiki & mind map generation',
  },
]

function StatusIcon({ state }: { state: 'idle' | 'loading' | 'ok' | 'error' }) {
  if (state === 'loading') return <Loader className="h-4 w-4 animate-spin text-neutral-400" />
  if (state === 'ok') return <CheckCircle className="h-4 w-4 text-green-500" />
  if (state === 'error') return <XCircle className="h-4 w-4 text-red-500" />
  return <div className="h-4 w-4 rounded-full border-2 border-neutral-200" />
}

export function ConnectionTest({ draftSettings }: { draftSettings?: AiSettingsDraft }) {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Results | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  async function runTest() {
    setLoading(true)
    setResults(null)
    setTestError(null)
    try {
      const { results } = await settingsApi.testConnections(draftSettings)
      setResults(results)
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Failed to run test')
    } finally {
      setLoading(false)
    }
  }

  function getState(key: string): 'idle' | 'loading' | 'ok' | 'error' {
    if (loading) return 'loading'
    if (!results) return 'idle'
    return results[key]?.ok ? 'ok' : 'error'
  }

  const allOk = results && Object.values(results).every((r) => r.ok)
  const anyFailed = results && Object.values(results).some((r) => !r.ok)

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          Verify that the embedding model and language model are reachable before indexing.
        </p>
        <button
          onClick={runTest}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0 ml-4"
        >
          <Zap className="h-3.5 w-3.5" />
          {loading ? 'Testing…' : 'Run test'}
        </button>
      </div>

      <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
        {SERVICES.map(({ key, label, description }) => {
          const result = results?.[key]
          const state = getState(key)
          return (
            <div key={key} className="flex items-center gap-4 px-4 py-3">
              <StatusIcon state={state} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800">{label}</p>
                <p className="text-xs text-neutral-500">{description}</p>
              </div>
              {result && (
                <div className="text-right shrink-0">
                  {result.ok ? (
                    <span className="text-xs text-green-600 font-medium">
                      {result.dimensions ? `${result.dimensions} dims · ` : ''}
                      {result.latencyMs}ms
                    </span>
                  ) : (
                    <span className="text-xs text-red-500 max-w-[200px] truncate block" title={result.error}>
                      {result.error ?? 'Failed'}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {testError && (
        <p className="text-sm text-red-600">{testError}</p>
      )}

      {allOk && (
        <p className="text-sm text-green-700 font-medium">All connections healthy.</p>
      )}
      {anyFailed && (
        <p className="text-sm text-amber-700">
          Some connections failed. Check that your selected provider, models, endpoint, and API key are configured correctly.
        </p>
      )}
    </div>
  )
}
