import { describe, expect, it } from 'vitest'
import { getDocumentCodeLanguage } from './document-code-language'

describe('getDocumentCodeLanguage', () => {
  it('uses the indexed programming language when Shiki supports it', () => {
    expect(
      getDocumentCodeLanguage({
        path: 'src/lib/api-client.ts',
        programmingLanguage: 'typescript',
      }),
    ).toBe('typescript')
  })

  it('prefers path-specific React and MDX languages over generic indexed labels', () => {
    expect(
      getDocumentCodeLanguage({
        path: 'src/components/App.tsx',
        programmingLanguage: 'typescript',
      }),
    ).toBe('tsx')
    expect(
      getDocumentCodeLanguage({
        path: 'src/components/App.jsx',
        programmingLanguage: 'javascript',
      }),
    ).toBe('jsx')
    expect(
      getDocumentCodeLanguage({
        path: 'docs/intro.mdx',
        programmingLanguage: 'markdown',
      }),
    ).toBe('mdx')
  })

  it('normalizes common language aliases before highlighting', () => {
    expect(getDocumentCodeLanguage({ path: 'Gemfile', programmingLanguage: 'rb' })).toBe('ruby')
    expect(getDocumentCodeLanguage({ path: 'scripts/setup.sh', programmingLanguage: 'sh' })).toBe(
      'shell',
    )
    expect(getDocumentCodeLanguage({ path: 'app/models/user.cs', programmingLanguage: 'c#' })).toBe(
      'csharp',
    )
  })

  it('falls back to the selected file path when the document language is unset', () => {
    expect(getDocumentCodeLanguage({ path: 'app/controllers/users_controller.rb' })).toBe('ruby')
    expect(getDocumentCodeLanguage({ path: 'package.json' })).toBe('json')
    expect(getDocumentCodeLanguage({ path: 'docker-compose.yml' })).toBe('yaml')
  })

  it('returns null for unknown file types so the raw viewer can remain available', () => {
    expect(getDocumentCodeLanguage({ path: 'docs/notes.unknown' })).toBeNull()
  })
})
