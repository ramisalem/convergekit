/**
 * The conventions a factory hub uses to record state on GitHub.
 *
 * Feature issues carry one `stage:*` label, optional `waiting:*` labels, and a status block
 * in their body. Ticket PRs carry a `factory:*` review label and a verdict comment. These
 * constants are the single place the module names them.
 */

export const FACTORY_STAGES = [
  'idea',
  'grill',
  'tasks',
  'design',
  'implement',
  'qa',
  'demo',
] as const
export type FactoryStage = (typeof FACTORY_STAGES)[number]

export const STAGE_LABEL_PREFIX = 'stage:'
export const WAITING_LABELS = { owner: 'waiting:owner', qa: 'waiting:qa' } as const
export type FactoryWaitingOn = keyof typeof WAITING_LABELS

export const REVIEW_LABELS = {
  running: 'factory:running',
  pass: 'factory:pass',
  fail: 'factory:fail',
  skipped: 'factory:skipped',
} as const
export type FactoryReviewState = keyof typeof REVIEW_LABELS

export const MARKERS = {
  statusStart: '<!-- factory-status:start -->',
  statusEnd: '<!-- factory-status:end -->',
  qaGuideStart: '<!-- qa-guide:start -->',
  qaGuideEnd: '<!-- qa-guide:end -->',
  /** `<!-- factory-verdict: pass|fail head=<sha> -->` */
  verdict: /<!-- factory-verdict: ([a-z]+) head=([0-9a-f]+) -->/g,
} as const

/** Hub files, relative to the hub repo root. */
export const HUB_PATHS = {
  repoList: 'kit/docs/factory/repos.txt',
  profilesDir: 'profiles',
} as const

/** Profile files are named after the repo, without the owner: `profiles/<name>.md`. */
export function profilePathFor(fullName: string): string {
  const name = fullName.split('/')[1] ?? fullName
  return `${HUB_PATHS.profilesDir}/${name}.md`
}

export function stageFromLabels(labels: readonly string[]): FactoryStage | null {
  for (const label of labels) {
    if (!label.startsWith(STAGE_LABEL_PREFIX)) continue
    const stage = label.slice(STAGE_LABEL_PREFIX.length)
    if ((FACTORY_STAGES as readonly string[]).includes(stage)) return stage as FactoryStage
  }
  return null
}
