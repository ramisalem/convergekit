import { describe, expect, it } from 'vitest'
import { buildDocumentTree, filterDocumentTree } from './document-file-tree-state'

const docs = [
  { path: 'src/components/Button.tsx', programmingLanguage: 'typescript' },
  { path: 'src/components/Button.test.tsx', programmingLanguage: 'typescript' },
  { path: 'src/app.ts', programmingLanguage: 'typescript' },
  { path: 'README.md', programmingLanguage: 'markdown' },
]

describe('document-file-tree-state', () => {
  it('builds a sorted folder-first tree from flat document paths', () => {
    expect(buildDocumentTree(docs)).toEqual([
      {
        children: [
          {
            children: [
              {
                children: [],
                isDir: false,
                name: 'Button.test.tsx',
                path: 'src/components/Button.test.tsx',
                programmingLanguage: 'typescript',
              },
              {
                children: [],
                isDir: false,
                name: 'Button.tsx',
                path: 'src/components/Button.tsx',
                programmingLanguage: 'typescript',
              },
            ],
            isDir: true,
            name: 'components',
            path: 'src/components',
            programmingLanguage: null,
          },
          {
            children: [],
            isDir: false,
            name: 'app.ts',
            path: 'src/app.ts',
            programmingLanguage: 'typescript',
          },
        ],
        isDir: true,
        name: 'src',
        path: 'src',
        programmingLanguage: null,
      },
      {
        children: [],
        isDir: false,
        name: 'README.md',
        path: 'README.md',
        programmingLanguage: 'markdown',
      },
    ])
  })

  it('keeps matching files and their ancestor folders when filtered', () => {
    const filtered = filterDocumentTree(buildDocumentTree(docs), 'button')

    expect(filtered).toEqual([
      {
        children: [
          {
            children: [
              expect.objectContaining({ name: 'Button.test.tsx' }),
              expect.objectContaining({ name: 'Button.tsx' }),
            ],
            isDir: true,
            name: 'components',
            path: 'src/components',
            programmingLanguage: null,
          },
        ],
        isDir: true,
        name: 'src',
        path: 'src',
        programmingLanguage: null,
      },
    ])
  })

  it('returns the full tree for blank search text', () => {
    const tree = buildDocumentTree(docs)

    expect(filterDocumentTree(tree, '   ')).toBe(tree)
  })
})
