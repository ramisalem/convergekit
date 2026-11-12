type TocEntry = { slug: string }

/**
 * Give every section and page in a generated table of contents its own slug. The model is asked
 * for unique slugs but sometimes repeats one (a page named like its section), and wiki pages are
 * unique per repository and slug. The first use keeps the slug; later ones get -2, -3, ...
 */
export function withUniqueSlugs<P extends TocEntry, S extends TocEntry & { pages: P[] }>(toc: {
  sections: S[]
}): { sections: S[] } {
  const taken = new Set(toc.sections.flatMap((s) => [s.slug, ...s.pages.map((p) => p.slug)]))
  const used = new Set<string>()

  function claim(slug: string): string {
    if (!used.has(slug)) {
      used.add(slug)
      return slug
    }
    let n = 2
    while (used.has(`${slug}-${n}`) || taken.has(`${slug}-${n}`)) n++
    const unique = `${slug}-${n}`
    used.add(unique)
    return unique
  }

  return {
    sections: toc.sections.map((section) => ({
      ...section,
      slug: claim(section.slug),
      pages: section.pages.map((page) => ({ ...page, slug: claim(page.slug) })),
    })),
  }
}
