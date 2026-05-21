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

  it('returns the mockup wiki reader shell classes', () => {
    expect(getWikiLayoutClasses()).toEqual({
      shell: 'wiki-reader-shell flex h-[calc(100vh-3.5rem)] bg-[var(--convergekit-bg)]',
      leftRail: 'wiki-left-rail w-[260px] flex-shrink-0 overflow-y-auto border-r border-[var(--convergekit-line)] px-[14px] py-5',
      contentWrap: 'min-w-0 flex-1',
      articleRow: 'flex h-full min-h-0',
      article: 'wiki-reader-article min-w-0 flex-1 overflow-y-auto px-5 py-8 lg:px-14',
      pageToc: 'wiki-page-toc-rail w-[240px] flex-shrink-0 overflow-y-auto border-l border-[var(--convergekit-line)] px-[22px] py-8',
    })
  })

  it('keeps the page TOC visually subordinate to the left docs rail', () => {
    expect(getWikiLayoutClasses().pageToc).toBe(
      'wiki-page-toc-rail w-[240px] flex-shrink-0 overflow-y-auto border-l border-[var(--convergekit-line)] px-[22px] py-8',
    )
  })

  it('uses local rail classes instead of hidden utilities so fumadocs CSS cannot override them', () => {
    expect(getWikiLayoutClasses().leftRail).toContain('wiki-left-rail')
    expect(getWikiLayoutClasses().pageToc).toContain('wiki-page-toc-rail')
    expect(getWikiLayoutClasses().leftRail).not.toContain('hidden')
    expect(getWikiLayoutClasses().pageToc).not.toContain('hidden')
    expect(globalsCssSource).toContain('.wiki-left-rail')
    expect(globalsCssSource).toContain('.wiki-page-toc-rail')
    expect(globalsCssSource).toContain('.wiki-reader-article > *')
  })

  it('centers the reading column while keeping text left aligned inside it', () => {
    expect(globalsCssSource).toContain('margin-left: auto;')
    expect(globalsCssSource).toContain('margin-right: auto;')
    expect(globalsCssSource).toContain('text-align: left;')
  })

  it('keeps rail class strings literal so build tooling can detect them during scanning', () => {
    expect(layoutConfigSource).not.toMatch(/leftRail:\s*`[^`]*\$\{/)
    expect(layoutConfigSource).not.toMatch(/WIKI_PAGE_TOC_CLASSES\s*=\s*`[^`]*\$\{/)
  })
})
