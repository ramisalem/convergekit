import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  getWikiLayoutClasses,
  shouldShowWikiTreeRail,
  shouldShowPageTocRail,
} from './wiki-layout-config'

const layoutConfigSource = readFileSync(new URL('./wiki-layout-config.ts', import.meta.url), 'utf8')
const globalsCssSource = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

describe('wiki-layout-config', () => {
  it('keeps both rails visible on desktop', () => {
    expect(shouldShowWikiTreeRail('desktop')).toBe(true)
    expect(shouldShowPageTocRail('desktop')).toBe(true)
  })

  it('hides the right TOC before the left wiki tree on intermediate widths', () => {
    expect(shouldShowWikiTreeRail('laptop')).toBe(true)
    expect(shouldShowPageTocRail('laptop')).toBe(false)
  })

  it('hides both rails on mobile', () => {
    expect(shouldShowWikiTreeRail('mobile')).toBe(false)
    expect(shouldShowPageTocRail('mobile')).toBe(false)
  })

  it('returns the wide docs-rail shell classes', () => {
    expect(getWikiLayoutClasses()).toEqual({
      shell: 'mx-auto flex max-w-[1600px] gap-0 px-4 xl:px-6',
      leftRail: 'wiki-left-rail w-[280px] xl:w-[320px] flex-shrink-0 py-8 pr-6 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto',
      contentWrap: 'min-w-0 flex-1 py-8 px-4 lg:px-6',
      articleRow: 'mx-auto flex max-w-6xl gap-8 xl:gap-10',
      article: 'min-w-0 flex-1 max-w-4xl',
      pageToc: 'wiki-page-toc-rail sticky top-20 h-[calc(100vh-5rem)] w-[220px] flex-shrink-0 overflow-y-auto pt-1',
    })
  })

  it('keeps the page TOC visually subordinate to the left docs rail', () => {
    expect(getWikiLayoutClasses().pageToc).toBe(
      'wiki-page-toc-rail sticky top-20 h-[calc(100vh-5rem)] w-[220px] flex-shrink-0 overflow-y-auto pt-1',
    )
  })

  it('uses local rail classes instead of hidden utilities so fumadocs CSS cannot override them', () => {
    expect(getWikiLayoutClasses().leftRail).toContain('wiki-left-rail')
    expect(getWikiLayoutClasses().pageToc).toContain('wiki-page-toc-rail')
    expect(getWikiLayoutClasses().leftRail).not.toContain('hidden')
    expect(getWikiLayoutClasses().pageToc).not.toContain('hidden')
    expect(globalsCssSource).toContain('.wiki-left-rail')
    expect(globalsCssSource).toContain('.wiki-page-toc-rail')
  })

  it('keeps rail class strings literal so build tooling can detect them during scanning', () => {
    expect(layoutConfigSource).not.toMatch(/leftRail:\s*`[^`]*\$\{/)
    expect(layoutConfigSource).not.toMatch(/WIKI_PAGE_TOC_CLASSES\s*=\s*`[^`]*\$\{/)
  })
})
