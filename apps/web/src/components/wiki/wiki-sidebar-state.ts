export type SectionLike = {
  slug: string
  pages: Array<{ slug: string }>
}

export type OpenSectionsState = Record<string, boolean>

export function buildInitialOpenSections(sections: SectionLike[]): OpenSectionsState {
  return Object.fromEntries(sections.map((section) => [section.slug, true]))
}

export function syncOpenSections(
  current: OpenSectionsState,
  sections: SectionLike[],
): OpenSectionsState {
  const next = buildInitialOpenSections(sections)

  for (const slug of Object.keys(next)) {
    if (slug in current) {
      next[slug] = current[slug]
    }
  }

  return next
}

export function toggleOpenSection(
  current: OpenSectionsState,
  slug: string,
): OpenSectionsState {
  return {
    ...current,
    [slug]: !current[slug],
  }
}
