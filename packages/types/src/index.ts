// Shared domain types — expanded as the schema is defined in packages/db

export type Provider = 'github' | 'gitlab' | 'bitbucket'

export type JobStatus = 'pending' | 'processing' | 'done' | 'failed'

export type QueueName =
  | 'repository-analysis'
  | 'incremental-update'
  | 'translation'
  | 'mind-map'

export interface RepositoryJob {
  repositoryId: string
  branchId: string
  cloneUrl: string
  provider: Provider
}

export interface TranslationJob {
  documentId: string
  targetLanguage: string
}

export interface MindMapJob {
  repositoryId: string
  branchId: string
}

export * from './schemas.js'
