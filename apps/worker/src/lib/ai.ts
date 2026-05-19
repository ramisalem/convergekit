import {
  getAiSettingsForRepo,
  updateBranchEmbeddingProfile,
  type Branch,
} from '@convergekit/db'
import {
  decryptApiKey,
  embeddingProfilesMatch,
  probeEmbeddingProfile,
  resolveEmbeddingProfile,
  type EmbeddingModelOptions,
  type EmbeddingProfile,
  type ModelOptions,
} from '@convergekit/ai'

function mapRepoAiSettings(
  repositoryId: string,
): Promise<Awaited<ReturnType<typeof getAiSettingsForRepo>>> {
  return getAiSettingsForRepo(repositoryId)
}

export async function getModelOptionsForRepo(repositoryId: string): Promise<ModelOptions | undefined> {
  const aiSettings = await mapRepoAiSettings(repositoryId)
  if (!aiSettings) return undefined

  return {
    provider: aiSettings.provider,
    apiKey: aiSettings.encryptedApiKey
      ? decryptApiKey(aiSettings.encryptedApiKey, process.env.BETTER_AUTH_SECRET ?? '')
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

export async function getEmbeddingOptionsForRepo(repositoryId: string): Promise<EmbeddingModelOptions | undefined> {
  const modelOptions = await getModelOptionsForRepo(repositoryId)
  return getEmbeddingOptionsFromModelOptions(modelOptions)
}

export function getEmbeddingOptionsFromModelOptions(modelOptions?: ModelOptions): EmbeddingModelOptions | undefined {
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

type BranchEmbeddingColumns = Pick<
  Branch,
  'embeddingProvider' | 'embeddingModel' | 'embeddingDimensions' | 'embeddingEndpoint'
>

export function getStoredEmbeddingProfile(branch?: BranchEmbeddingColumns | null): EmbeddingProfile | null {
  if (
    !branch?.embeddingProvider
    || !branch.embeddingModel
    || !branch.embeddingDimensions
  ) {
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

export function assertBranchEmbeddingCompatibility(
  branch: BranchEmbeddingColumns,
  options?: EmbeddingModelOptions,
): EmbeddingProfile | null {
  const storedProfile = getStoredEmbeddingProfile(branch)
  if (!storedProfile) return null

  const currentProfile = resolveEmbeddingProfile(options)
  if (!embeddingProfilesMatch(storedProfile, currentProfile)) {
    throw new Error(buildEmbeddingCompatibilityMessage(storedProfile))
  }

  return storedProfile
}

export async function captureBranchEmbeddingProfile(
  branchId: string,
  options?: EmbeddingModelOptions,
): Promise<EmbeddingProfile> {
  const profile = await probeEmbeddingProfile(options)

  await updateBranchEmbeddingProfile(branchId, {
    embeddingProvider: profile.provider,
    embeddingModel: profile.model,
    embeddingDimensions: profile.dimensions,
    embeddingEndpoint: profile.endpoint,
    embeddingProfileCapturedAt: new Date(),
  })

  return profile
}
