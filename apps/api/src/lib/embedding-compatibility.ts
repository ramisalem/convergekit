import {
  decryptApiKey,
  embeddingProfilesMatch,
  resolveEmbeddingProfile,
  type EmbeddingModelOptions,
  type EmbeddingProfile,
  type ModelOptions,
} from '@convergekit/ai'
import type { Branch, UserAiSettings } from '@convergekit/db'
import { getBranchByRepositoryId } from '@convergekit/db'
import { ConflictError } from '../errors.js'

const ENCRYPTION_SECRET = process.env.BETTER_AUTH_SECRET ?? ''

type BranchEmbeddingColumns = Pick<
  Branch,
  | 'embeddingProvider'
  | 'embeddingModel'
  | 'embeddingDimensions'
  | 'embeddingEndpoint'
  | 'embeddingProfileCapturedAt'
>

export function getModelOptionsFromAiSettings(
  aiSettings?: UserAiSettings | null,
): ModelOptions | undefined {
  if (!aiSettings) return undefined

  return {
    provider: aiSettings.provider,
    apiKey: aiSettings.encryptedApiKey
      ? decryptApiKey(aiSettings.encryptedApiKey, ENCRYPTION_SECRET)
      : '',
    lmStudioChatModel: aiSettings.lmStudioChatModel,
    lmStudioMindmapModel: aiSettings.lmStudioMindmapModel,
    lmStudioEmbeddingModel: aiSettings.lmStudioEmbeddingModel,
    openrouterChatModel: aiSettings.openrouterChatModel,
    openrouterMindmapModel: aiSettings.openrouterMindmapModel,
    openrouterEmbeddingModel: aiSettings.openrouterEmbeddingModel,
    openrouterEndpoint: aiSettings.openrouterEndpoint,
    anthropicChatModel: aiSettings.anthropicChatModel,
    anthropicMindmapModel: aiSettings.anthropicMindmapModel,
    anthropicEmbeddingModel: aiSettings.anthropicEmbeddingModel,
    openaiChatModel: aiSettings.openaiChatModel,
    openaiMindmapModel: aiSettings.openaiMindmapModel,
    openaiEmbeddingModel: aiSettings.openaiEmbeddingModel,
    openaiEndpoint: aiSettings.openaiEndpoint,
  }
}

export function getEmbeddingOptionsFromAiSettings(
  aiSettings?: UserAiSettings | null,
): EmbeddingModelOptions | undefined {
  const modelOptions = getModelOptionsFromAiSettings(aiSettings)
  if (!modelOptions) return undefined

  return {
    provider: modelOptions.provider,
    apiKey: modelOptions.apiKey,
    lmStudioEmbeddingModel: modelOptions.lmStudioEmbeddingModel,
    openrouterEmbeddingModel: modelOptions.openrouterEmbeddingModel,
    openrouterEndpoint: modelOptions.openrouterEndpoint,
    anthropicEmbeddingModel: modelOptions.anthropicEmbeddingModel,
    openaiEmbeddingModel: modelOptions.openaiEmbeddingModel,
    openaiEndpoint: modelOptions.openaiEndpoint,
  }
}

export function getEmbeddingOptionsForProfile(
  aiSettings: UserAiSettings | null | undefined,
  profile: EmbeddingProfile | null | undefined,
): EmbeddingModelOptions | undefined {
  const options = getEmbeddingOptionsFromAiSettings(aiSettings)
  if (!profile) return options

  return {
    ...options,
    provider: profile.provider,
    lmStudioEmbeddingModel:
      profile.provider === 'lmstudio' ? profile.model : options?.lmStudioEmbeddingModel,
    openrouterEmbeddingModel:
      profile.provider === 'openrouter' ? profile.model : options?.openrouterEmbeddingModel,
    openrouterEndpoint:
      profile.provider === 'openrouter' ? profile.endpoint : options?.openrouterEndpoint,
    anthropicEmbeddingModel:
      profile.provider === 'anthropic' ? profile.model : options?.anthropicEmbeddingModel,
    openaiEmbeddingModel:
      profile.provider === 'openai' ? profile.model : options?.openaiEmbeddingModel,
    openaiEndpoint: profile.provider === 'openai' ? profile.endpoint : options?.openaiEndpoint,
  }
}

export function getStoredEmbeddingProfile(
  branch?: BranchEmbeddingColumns | null,
): EmbeddingProfile | null {
  if (!branch?.embeddingProvider || !branch.embeddingModel || !branch.embeddingDimensions) {
    return null
  }

  return {
    provider: branch.embeddingProvider,
    model: branch.embeddingModel,
    dimensions: branch.embeddingDimensions,
    endpoint: branch.embeddingEndpoint ?? null,
  }
}

export function buildEmbeddingCompatibilityMessage(profile: EmbeddingProfile): string {
  return `This repository was indexed with ${profile.model} (${profile.dimensions} dims) via ${profile.provider}. Switch back to that embedding model or reindex the repository.`
}

export async function getRepositoryEmbeddingState(
  repositoryId: string,
  aiSettings?: UserAiSettings | null,
) {
  const branch = await getBranchByRepositoryId(repositoryId)
  const storedProfile = getStoredEmbeddingProfile(branch)

  if (!storedProfile) {
    return {
      branch,
      storedProfile: null,
      compatibility: null,
      currentProfile: resolveEmbeddingProfile(getEmbeddingOptionsFromAiSettings(aiSettings)),
    }
  }

  const currentProfile = resolveEmbeddingProfile(getEmbeddingOptionsFromAiSettings(aiSettings))
  const compatible = embeddingProfilesMatch(storedProfile, currentProfile)

  return {
    branch,
    storedProfile,
    currentProfile,
    compatibility: {
      compatible,
      message: compatible ? null : buildEmbeddingCompatibilityMessage(storedProfile),
    },
  }
}

export async function assertRepositoryEmbeddingCompatibility(
  repositoryId: string,
  aiSettings?: UserAiSettings | null,
) {
  const state = await getRepositoryEmbeddingState(repositoryId, aiSettings)
  if (state.storedProfile && state.compatibility && !state.compatibility.compatible) {
    throw new ConflictError(
      state.compatibility.message ?? buildEmbeddingCompatibilityMessage(state.storedProfile),
    )
  }
  return state
}
