import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_INDEX_FILE_BYTES,
  classifyRepositoryFile,
  shouldSkipRepositoryDirectory,
  summarizeSkippedFiles,
} from './indexing-limits.js'

describe('classifyRepositoryFile', () => {
  it('classifies source files as Tier A current truth', () => {
    expect(classifyRepositoryFile('app/models/user.rb', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'code',
      searchByDefault: true,
    })
  })

  it('classifies tests as Tier B verification truth', () => {
    expect(classifyRepositoryFile('src/auth/login.test.ts', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'B',
      evidenceKind: 'test',
      searchByDefault: true,
    })
  })

  it('classifies README as Tier C operational truth', () => {
    expect(classifyRepositoryFile('README.md', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'C',
      evidenceKind: 'readme',
      searchByDefault: false,
    })
  })

  it('classifies design and plan docs as gated Tier D even when setup words match', () => {
    expect(
      classifyRepositoryFile('docs/superpowers/specs/setup-deploy-design.md', 2048),
    ).toMatchObject({
      index: true,
      evidenceTier: 'D',
      evidenceKind: 'design_doc',
      searchByDefault: false,
    })
  })

  it('handles precedence collisions deterministically', () => {
    expect(classifyRepositoryFile('docs/setup/auth.test.ts', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'B',
      evidenceKind: 'test',
    })
    expect(classifyRepositoryFile('docs/superpowers/plans/auth.test.ts', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'D',
      evidenceKind: 'plan',
    })
  })

  it('indexes allowed hidden operational files', () => {
    expect(classifyRepositoryFile('.github/workflows/test.yml', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'infra',
    })
    expect(classifyRepositoryFile('.devcontainer/devcontainer.json', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'infra',
    })
    expect(classifyRepositoryFile('.env.example', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'config',
    })
    expect(classifyRepositoryFile('.gitlab-ci.yml', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'infra',
    })
    expect(classifyRepositoryFile('.dockerignore', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'config',
    })
    expect(classifyRepositoryFile('.editorconfig', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'config',
    })
    expect(classifyRepositoryFile('.nvmrc', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'config',
    })
    expect(classifyRepositoryFile('.tool-versions', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'config',
    })
    expect(classifyRepositoryFile('.node-version', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'config',
    })
    expect(classifyRepositoryFile('.ruby-version', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'config',
    })
    expect(classifyRepositoryFile('.python-version', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'config',
    })
    expect(classifyRepositoryFile('.github/actions/setup/action.yml', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'infra',
    })
    expect(classifyRepositoryFile('.github/dependabot.yml', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'infra',
    })
    expect(classifyRepositoryFile('.github/CODEOWNERS', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'config',
    })
    expect(classifyRepositoryFile('terraform/main.tf', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'infra',
    })
    expect(classifyRepositoryFile('helm/values.yaml', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'infra',
    })
    expect(classifyRepositoryFile('infra/network/main.tf', 2048)).toMatchObject({
      index: true,
      evidenceTier: 'A',
      evidenceKind: 'infra',
    })
  })

  it('skips denied hidden and generated paths', () => {
    expect(shouldSkipRepositoryDirectory('.git')).toBe(true)
    expect(shouldSkipRepositoryDirectory('.github')).toBe(false)
    expect(shouldSkipRepositoryDirectory('.github/ISSUE_TEMPLATE')).toBe(true)
    expect(classifyRepositoryFile('coverage/index.html', 2048)).toMatchObject({
      index: false,
      reason: 'generated',
    })
    for (const path of [
      'docs/generated/openapi.md',
      'api-docs/generated/openapi.md',
      'site/index.html',
      'storybook-static/index.html',
      'typedoc/index.html',
      'jsdoc/index.html',
    ]) {
      expect(classifyRepositoryFile(path, 2048)).toMatchObject({
        index: false,
        reason: 'generated',
      })
    }
  })

  it('does not index arbitrary hidden files or unsupported files in allowed hidden directories', () => {
    expect(classifyRepositoryFile('.github/ISSUE_TEMPLATE/bug.md', 2048)).toMatchObject({
      index: false,
      reason: 'noise',
    })
    expect(classifyRepositoryFile('.github/workflows/logo.png', 2048)).toMatchObject({
      index: false,
      reason: 'unsupported-extension',
    })
  })

  it('skips oversized supported files before reading them into memory', () => {
    expect(
      classifyRepositoryFile('app/services/huge_export.rb', DEFAULT_MAX_INDEX_FILE_BYTES + 1),
    ).toEqual({
      index: false,
      reason: 'oversized',
      detail: `file is larger than ${DEFAULT_MAX_INDEX_FILE_BYTES} bytes`,
    })
  })
})

describe('summarizeSkippedFiles', () => {
  it('counts skipped files by reason', () => {
    expect(
      summarizeSkippedFiles([
        {
          path: 'coverage/index.html',
          reason: 'generated',
          detail: 'generated output',
          sizeBytes: 10,
        },
        {
          path: 'app/big.rb',
          reason: 'oversized',
          detail: 'file is larger than limit',
          sizeBytes: 30,
        },
      ]),
    ).toEqual({
      total: 2,
      byReason: {
        generated: 1,
        oversized: 1,
      },
    })
  })
})
