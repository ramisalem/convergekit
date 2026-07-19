import { expect } from 'vitest'

// Shared helpers for source-substring contract tests.
//
// Plain indexOf silently returns -1 for a deleted/renamed marker, which passes
// a `<` ordering comparison trivially (-1 < anything) and corrupts slice
// boundaries. Every ordering or slicing pin goes through these so a missing
// marker fails loudly instead of silently no-op-ing.

export function mustIndexOf(source: string, marker: string): number {
  const index = source.indexOf(marker)
  expect(index, `marker not found: ${marker}`).toBeGreaterThanOrEqual(0)
  return index
}

export function mustSlice(source: string, startMarker: string, endMarker?: string): string {
  const start = mustIndexOf(source, startMarker)
  if (endMarker === undefined) return source.slice(start)
  const end = mustIndexOf(source, endMarker)
  // A legitimate reorder that puts the end marker first would otherwise slice
  // to '' and fail every positive assertion with a misleading message.
  expect(
    end,
    `end marker '${endMarker}' appears before start marker '${startMarker}'`,
  ).toBeGreaterThan(start)
  return source.slice(start, end)
}
