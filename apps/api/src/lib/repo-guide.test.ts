import { describe, expect, it } from 'vitest'
import {
  buildQuestionStarters,
  computeAreaIntents,
  getAreaConfidenceLabel,
  pickStrongestArea,
  resolveGuideFiles,
  resolveMindMapStatus,
  type GuideAreaInput,
  type MindMapQueueLike,
} from './repo-guide.js'

const area = (overrides: Partial<GuideAreaInput>): GuideAreaInput => ({
  name: 'Auth',
  files: [],
  mindMapName: null,
  mindMapDescription: null,
  ...overrides,
})

describe('computeAreaIntents', () => {
  it('uses Tier A role share for api_schema instead of all files', () => {
    const intents = computeAreaIntents(
      area({
        files: [
          { path: 'src/routes/users.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'src/routes/auth.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'README.md', evidenceTier: 'C', evidenceKind: 'readme' },
          { path: 'docs/setup.md', evidenceTier: 'C', evidenceKind: 'setup_doc' },
          { path: 'docs/deploy.md', evidenceTier: 'C', evidenceKind: 'setup_doc' },
          { path: 'docs/runbook.md', evidenceTier: 'C', evidenceKind: 'setup_doc' },
        ],
      }),
    )

    expect(intents[0]).toBe('api_schema')
    expect(intents).toContain('current_code')
  })

  it('classifies mostly route and migration evidence as api_schema', () => {
    const intents = computeAreaIntents(
      area({
        files: [
          { path: 'src/routes/users.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'src/routes/auth.ts', evidenceTier: 'A', evidenceKind: 'code' },
          {
            path: 'db/migrations/001_create_users.sql',
            evidenceTier: 'A',
            evidenceKind: 'migration',
          },
        ],
      }),
    )

    expect(intents).toContain('api_schema')
  })

  it('does not add operational or troubleshooting for token evidence below thresholds', () => {
    const intents = computeAreaIntents(
      area({
        files: [
          { path: 'src/app.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'src/service.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'src/domain.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'src/auth.test.ts', evidenceTier: 'B', evidenceKind: 'test' },
          { path: 'README.md', evidenceTier: 'C', evidenceKind: 'readme' },
          { path: 'src/one.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'src/two.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'src/three.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'src/four.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'src/five.ts', evidenceTier: 'A', evidenceKind: 'code' },
        ],
      }),
    )

    expect(intents).toEqual(['current_code'])
  })

  it('orders specific intents before current_code and caps to three intents', () => {
    const intents = computeAreaIntents(
      area({
        name: 'Auth design',
        mindMapName: 'Auth design',
        files: [
          { path: 'src/routes/auth.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'src/models/auth.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'src/errors/auth-error.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'config/auth.yml', evidenceTier: 'A', evidenceKind: 'config' },
          { path: 'infra/auth/main.tf', evidenceTier: 'A', evidenceKind: 'infra' },
          { path: 'src/auth.test.ts', evidenceTier: 'B', evidenceKind: 'test' },
          { path: 'docs/setup-auth.md', evidenceTier: 'C', evidenceKind: 'setup_doc' },
          { path: 'docs/adr/auth.md', evidenceTier: 'D', evidenceKind: 'adr' },
        ],
      }),
    )

    expect(intents).toEqual(['api_schema', 'troubleshooting', 'operational'])
  })

  it('requires explicit historical signal before returning historical', () => {
    expect(
      computeAreaIntents(
        area({
          files: [{ path: 'docs/random-note.md', evidenceTier: 'D', evidenceKind: 'design_doc' }],
          mindMapName: 'Random notes',
        }),
      ),
    ).not.toContain('historical')

    expect(
      computeAreaIntents(
        area({
          files: [{ path: 'docs/adr/auth-design.md', evidenceTier: 'D', evidenceKind: 'adr' }],
          mindMapName: 'Authentication design decision history',
        }),
      ),
    ).toContain('historical')
  })

  it('does not treat generic mind-map design, plan, or why words as historical intent', () => {
    const genericSignals = [
      {
        mindMapName: 'Design system',
        mindMapDescription: 'Reusable UI primitives',
        evidenceKind: 'design_doc',
        path: 'docs/design-system.md',
      },
      {
        mindMapName: 'Performance',
        mindMapDescription: 'Query plan analysis',
        evidenceKind: 'plan',
        path: 'docs/query-plan.md',
      },
      {
        mindMapName: 'Retry behavior',
        mindMapDescription: 'Explains why cache retries happen',
        evidenceKind: 'design_doc',
        path: 'docs/retries.md',
      },
    ] as const

    for (const signal of genericSignals) {
      expect(
        computeAreaIntents(
          area({
            files: [
              {
                path: signal.path,
                evidenceTier: 'D',
                evidenceKind: signal.evidenceKind,
              },
            ],
            mindMapName: signal.mindMapName,
            mindMapDescription: signal.mindMapDescription,
          }),
        ),
      ).not.toContain('historical')
    }
  })

  it('accepts explicit mind-map rationale and decision phrases as historical intent', () => {
    expect(
      computeAreaIntents(
        area({
          files: [{ path: 'docs/adr/auth.md', evidenceTier: 'D', evidenceKind: 'adr' }],
          mindMapName: 'Authentication decision records',
        }),
      ),
    ).toContain('historical')

    expect(
      computeAreaIntents(
        area({
          files: [
            { path: 'docs/auth-rationale.md', evidenceTier: 'D', evidenceKind: 'design_doc' },
          ],
          mindMapName: 'Authentication',
          mindMapDescription: 'Why was this designed this way?',
        }),
      ),
    ).toContain('historical')
  })

  it('uses path historical signals only for non-mind-map fallback areas', () => {
    expect(
      computeAreaIntents(
        area({
          name: 'Authentication',
          files: [{ path: 'docs/adr/auth.md', evidenceTier: 'D', evidenceKind: 'adr' }],
          mindMapName: 'Authentication',
          mindMapDescription: 'Login and sessions',
        }),
      ),
    ).not.toContain('historical')

    expect(
      computeAreaIntents(
        area({
          name: 'docs',
          files: [{ path: 'docs/adr/auth.md', evidenceTier: 'D', evidenceKind: 'adr' }],
        }),
      ),
    ).toContain('historical')

    expect(
      computeAreaIntents(
        area({
          name: 'docs',
          files: [
            { path: 'docs/superpowers/plans/auth.md', evidenceTier: 'D', evidenceKind: 'plan' },
          ],
        }),
      ),
    ).toContain('historical')
  })
})

describe('pickStrongestArea', () => {
  it('uses historicalTiers for historical starter selection', () => {
    const codeHeavy = area({
      name: 'Code heavy',
      files: [
        { path: 'src/a.ts', evidenceTier: 'A', evidenceKind: 'code' },
        { path: 'src/b.ts', evidenceTier: 'A', evidenceKind: 'code' },
      ],
    })
    const designHeavy = area({
      name: 'Design heavy',
      files: [
        { path: 'docs/adr/a.md', evidenceTier: 'D', evidenceKind: 'adr' },
        { path: 'docs/adr/b.md', evidenceTier: 'D', evidenceKind: 'adr' },
      ],
    })

    expect(pickStrongestArea([codeHeavy, designHeavy], 'historical')?.name).toBe('Design heavy')
  })
})

describe('buildQuestionStarters', () => {
  it('generates repository-neutral prompts from areas', () => {
    const starters = buildQuestionStarters([
      area({
        name: 'Authentication',
        files: [{ path: 'src/auth.ts', evidenceTier: 'A', evidenceKind: 'code' }],
      }),
    ])

    expect(starters[0].examplePrompt).toContain('Authentication')
    expect(starters[0].examplePrompt).not.toContain('employee onboarding')
    expect(starters[0].examplePrompt).not.toContain('benefits sync')
  })

  it('uses the approved evidence-targeting prompt templates', () => {
    const starters = buildQuestionStarters([
      area({
        name: 'Authentication',
        files: [
          { path: 'src/auth.ts', evidenceTier: 'A', evidenceKind: 'code' },
          { path: 'docs/adr/auth.md', evidenceTier: 'D', evidenceKind: 'adr' },
        ],
        mindMapName: 'Authentication design decision',
      }),
    ])

    expect(starters.find((starter) => starter.intent === 'current_code')?.examplePrompt).toBe(
      'Where is Authentication implemented, and which files prove it?',
    )
    expect(starters.find((starter) => starter.intent === 'historical')?.examplePrompt).toBe(
      'Why was Authentication designed this way? Separate current code from design or history docs.',
    )
  })
})

describe('resolveGuideFiles', () => {
  it('classifies null evidence metadata by path and marks the guide as refreshing', () => {
    const result = resolveGuideFiles([
      { path: 'src/auth.ts', evidenceTier: null, evidenceKind: null },
      { path: 'docs/superpowers/plans/auth.md', evidenceTier: null, evidenceKind: null },
      { path: 'docs/generated/openapi.md', evidenceTier: null, evidenceKind: null },
    ])

    expect(result.metadataStatus).toBe('refreshing')
    expect(result.files).toEqual([
      { path: 'src/auth.ts', evidenceTier: 'A', evidenceKind: 'code' },
      { path: 'docs/superpowers/plans/auth.md', evidenceTier: 'D', evidenceKind: 'plan' },
    ])
  })

  it('does not keep metadata refreshing for null hard-skip rows', () => {
    const result = resolveGuideFiles([
      { path: '__mindmap__', evidenceTier: null, evidenceKind: null },
      { path: 'public/css/bootstrap.min.css', evidenceTier: null, evidenceKind: null },
      { path: 'docs/generated/openapi.md', evidenceTier: null, evidenceKind: null },
      { path: 'src/auth.ts', evidenceTier: 'A', evidenceKind: 'code' },
    ])

    expect(result.metadataStatus).toBe('ready')
    expect(result.files).toEqual([{ path: 'src/auth.ts', evidenceTier: 'A', evidenceKind: 'code' }])
  })
})

describe('resolveMindMapStatus', () => {
  function queueWithJobs(
    jobsByState: Partial<
      Record<
        'active' | 'waiting' | 'delayed' | 'prioritized' | 'failed',
        Array<{ id: string; repositoryId?: string; branchId?: string }>
      >
    >,
  ): MindMapQueueLike {
    return {
      async getJobs(states) {
        return states.flatMap((state) =>
          (jobsByState[state] ?? []).map((job) => ({
            id: job.id,
            data: {
              repositoryId: job.repositoryId,
              branchId: job.branchId,
            },
          })),
        )
      },
    }
  }

  it('reports done when the mind-map document exists', async () => {
    await expect(
      resolveMindMapStatus({
        repositoryId: 'repo-1',
        branchId: 'branch-1',
        repositoryStatus: 'done',
        hasMindMapDoc: true,
        mindMapQueue: queueWithJobs({}),
      }),
    ).resolves.toBe('done')
  })

  it('surfaces retained failed mind-map jobs for indexed repositories', async () => {
    await expect(
      resolveMindMapStatus({
        repositoryId: 'repo-1',
        branchId: 'branch-1',
        repositoryStatus: 'done',
        hasMindMapDoc: false,
        mindMapQueue: queueWithJobs({
          failed: [{ id: 'mind-1', repositoryId: 'repo-1', branchId: 'branch-1' }],
        }),
      }),
    ).resolves.toBe('failed')
  })

  it('reports processing when a mind-map job is active', async () => {
    await expect(
      resolveMindMapStatus({
        repositoryId: 'repo-1',
        branchId: 'branch-1',
        repositoryStatus: 'done',
        hasMindMapDoc: false,
        mindMapQueue: queueWithJobs({
          active: [{ id: 'mind-1', repositoryId: 'repo-1', branchId: 'branch-1' }],
        }),
      }),
    ).resolves.toBe('processing')
  })
})

describe('getAreaConfidenceLabel', () => {
  it('labels Tier D-only areas as gated history', () => {
    expect(
      getAreaConfidenceLabel(
        area({
          files: [{ path: 'docs/adr/a.md', evidenceTier: 'D', evidenceKind: 'adr' }],
        }),
      ),
    ).toBe('Gated history')
  })
})
