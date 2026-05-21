export type WikiViewportTier = 'desktop' | 'laptop' | 'mobile'

type WikiLayoutClasses = {
  shell: string
  leftRail: string
  contentWrap: string
  articleRow: string
  article: string
  pageToc: string
}

type WikiLayoutContract = {
  classes: WikiLayoutClasses
  rails: {
    leftRail: {
      visibleFrom: WikiRailBreakpoint
    }
    pageToc: {
      visibleFrom: WikiRailBreakpoint
    }
  }
}

type WikiRailBreakpoint = 'md' | 'xl'

const WIKI_RAIL_BREAKPOINT_ORDER: readonly WikiRailBreakpoint[] = ['md', 'xl']

const WIKI_LAYOUT_BREAKPOINTS = {
  leftRailVisibleFrom: 'md',
  pageTocVisibleFrom: 'xl',
} as const satisfies {
  leftRailVisibleFrom: WikiRailBreakpoint
  pageTocVisibleFrom: WikiRailBreakpoint
}

const WIKI_LEFT_RAIL_CLASSES = 'wiki-left-rail w-[260px] flex-shrink-0 overflow-y-auto border-r border-[var(--convergekit-line)] px-[14px] py-5'
const WIKI_PAGE_TOC_CLASSES = 'wiki-page-toc-rail w-[240px] flex-shrink-0 overflow-y-auto border-l border-[var(--convergekit-line)] px-[22px] py-8'

const WIKI_VIEWPORT_TIER_BREAKPOINTS = {
  mobile: null,
  laptop: WIKI_LAYOUT_BREAKPOINTS.leftRailVisibleFrom,
  desktop: WIKI_LAYOUT_BREAKPOINTS.pageTocVisibleFrom,
} as const satisfies Record<WikiViewportTier, WikiRailBreakpoint | null>

const WIKI_LAYOUT_CONTRACT = {
  classes: {
    shell: 'wiki-reader-shell flex h-[calc(100vh-3.5rem)] bg-[var(--convergekit-bg)]',
    leftRail: WIKI_LEFT_RAIL_CLASSES,
    contentWrap: 'min-w-0 flex-1',
    articleRow: 'flex h-full min-h-0',
    article: 'wiki-reader-article min-w-0 flex-1 overflow-y-auto px-5 py-8 lg:px-14',
    pageToc: WIKI_PAGE_TOC_CLASSES,
  },
  rails: {
    leftRail: {
      visibleFrom: WIKI_LAYOUT_BREAKPOINTS.leftRailVisibleFrom,
    },
    pageToc: {
      visibleFrom: WIKI_LAYOUT_BREAKPOINTS.pageTocVisibleFrom,
    },
  },
} as const satisfies WikiLayoutContract

function shouldShowRail(
  tier: WikiViewportTier,
  visibleFrom: WikiRailBreakpoint,
) {
  const tierBreakpoint = WIKI_VIEWPORT_TIER_BREAKPOINTS[tier]
  if (tierBreakpoint === null) return false

  return WIKI_RAIL_BREAKPOINT_ORDER.indexOf(tierBreakpoint) >= WIKI_RAIL_BREAKPOINT_ORDER.indexOf(visibleFrom)
}

export function getWikiLayoutClasses() {
  return WIKI_LAYOUT_CONTRACT.classes
}

export function shouldShowWikiTreeRail(tier: WikiViewportTier) {
  return shouldShowRail(tier, WIKI_LAYOUT_CONTRACT.rails.leftRail.visibleFrom)
}

export function shouldShowPageTocRail(tier: WikiViewportTier) {
  return shouldShowRail(tier, WIKI_LAYOUT_CONTRACT.rails.pageToc.visibleFrom)
}
