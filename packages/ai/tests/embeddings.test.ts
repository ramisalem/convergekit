import { describe, expect, it } from 'vitest'
import {
  buildEmbeddingCacheKey,
  embeddingProfilesMatch,
  resolveEmbeddingProfile,
} from '../src/embeddings.js'

describe('resolveEmbeddingProfile', () => {
  it('defaults to OpenRouter embeddings when no provider is configured', () => {
    expect(resolveEmbeddingProfile()).toEqual({
      provider: 'openrouter',
      model: 'openai/text-embedding-3-small',
      endpoint: 'https://openrouter.ai/api/v1',
    })
  })

  it('resolves OpenRouter embeddings to the configured endpoint and model', () => {
    const profile = resolveEmbeddingProfile({
      provider: 'openrouter',
      openrouterEmbeddingModel: 'openai/text-embedding-3-small',
      openrouterEndpoint: 'https://openrouter.ai/api/v1/',
    })

    expect(profile).toEqual({
      provider: 'openrouter',
      model: 'openai/text-embedding-3-small',
      endpoint: 'https://openrouter.ai/api/v1',
    })
  })
})

describe('embeddingProfilesMatch', () => {
  it('matches equivalent profiles even when endpoint slash differs', () => {
    expect(
      embeddingProfilesMatch(
        {
          provider: 'openrouter',
          model: 'openai/text-embedding-3-small',
          endpoint: 'https://openrouter.ai/api/v1/',
        },
        {
          provider: 'openrouter',
          model: 'openai/text-embedding-3-small',
          endpoint: 'https://openrouter.ai/api/v1',
        },
      ),
    ).toBe(true)
  })

  it('rejects profiles with different models', () => {
    expect(
      embeddingProfilesMatch(
        {
          provider: 'openai',
          model: 'text-embedding-3-small',
          endpoint: null,
        },
        {
          provider: 'openai',
          model: 'text-embedding-3-large',
          endpoint: null,
        },
      ),
    ).toBe(false)
  })
})

describe('buildEmbeddingCacheKey', () => {
  it('separates cached query embeddings by embedding profile', () => {
    const query = 'How does authentication work?'
    const small = buildEmbeddingCacheKey(query, {
      provider: 'openrouter',
      openrouterEmbeddingModel: 'openai/text-embedding-3-small',
      openrouterEndpoint: 'https://openrouter.ai/api/v1',
    })
    const large = buildEmbeddingCacheKey(query, {
      provider: 'openrouter',
      openrouterEmbeddingModel: 'openai/text-embedding-3-large',
      openrouterEndpoint: 'https://openrouter.ai/api/v1',
    })

    expect(small).not.toBe(large)
  })
})
