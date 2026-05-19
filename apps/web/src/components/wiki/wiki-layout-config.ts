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

const WIKI_LEFT_RAIL_CLASSES = 'wiki-left-rail w-[280px] xl:w-[320px] flex-shrink-0 py-8 pr-6 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto'
const WIKI_PAGE_TOC_CLASSES = 'wiki-page-toc-rail sticky top-20 h-[calc(100vh-5rem)] w-[220px] flex-shrink-0 overflow-y-auto pt-1'

const WIKI_VIEWPORT_TIER_BREAKPOINTS = {
  mobile: null,
  laptop: WIKI_LAYOUT_BREAKPOINTS.leftRailVisibleFrom,
  desktop: WIKI_LAYOUT_BREAKPOINTS.pageTocVisibleFrom,
} as const satisfies Record<WikiViewportTier, WikiRailBreakpoint | null>

const WIKI_LAYOUT_CONTRACT = {
  classes: {
    shell: 'mx-auto flex max-w-[1600px] gap-0 px-4 xl:px-6',
    leftRail: WIKI_LEFT_RAIL_CLASSES,
    contentWrap: 'min-w-0 flex-1 py-8 px-4 lg:px-6',
    articleRow: 'mx-auto flex max-w-6xl gap-8 xl:gap-10',
    article: 'min-w-0 flex-1 max-w-4xl',
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
