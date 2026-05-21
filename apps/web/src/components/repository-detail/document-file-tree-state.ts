import type { DocumentPath } from '@/lib/api-client'

export type DocumentTreeNode = {
  name: string
  path: string
  isDir: boolean
  children: DocumentTreeNode[]
  programmingLanguage: string | null
}

function sortTree(nodes: DocumentTreeNode[]) {
  nodes.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  for (const node of nodes) {
    sortTree(node.children)
  }

  return nodes
}

export function buildDocumentTree(docs: DocumentPath[]): DocumentTreeNode[] {
  const root: DocumentTreeNode[] = []

  for (const doc of docs) {
    const parts = doc.path.split('/').filter(Boolean)
    let level = root

    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index]
      const path = parts.slice(0, index + 1).join('/')
      const isDir = index < parts.length - 1
      let node = level.find((candidate) => candidate.path === path)

      if (!node) {
        node = {
          children: [],
          isDir,
          name,
          path,
          programmingLanguage: isDir ? null : doc.programmingLanguage,
        }
        level.push(node)
      }

      level = node.children
    }
  }

  return sortTree(root)
}

export function filterDocumentTree(
  nodes: DocumentTreeNode[],
  query: string,
): DocumentTreeNode[] {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return nodes
  }

  return nodes.flatMap((node) => {
    if (!node.isDir) {
      return node.path.toLowerCase().includes(normalizedQuery) ? [node] : []
    }

    const children = filterDocumentTree(node.children, normalizedQuery)

    return children.length > 0
      ? [
          {
            ...node,
            children,
          },
        ]
      : []
  })
}
