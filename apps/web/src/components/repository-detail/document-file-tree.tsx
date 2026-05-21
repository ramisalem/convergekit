'use client'

import type { DocumentPath } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  buildDocumentTree,
  filterDocumentTree,
  type DocumentTreeNode,
} from './document-file-tree-state'

type DocumentFileTreeProps = {
  documents: DocumentPath[]
  query: string
  selectedPath: string | null
  onSelect: (path: string) => void
}

type DocumentTreeItemProps = {
  node: DocumentTreeNode
  depth: number
  query: string
  selectedPath: string | null
  onSelect: (path: string) => void
}

function nodeContainsPath(node: DocumentTreeNode, selectedPath: string | null) {
  return Boolean(selectedPath && selectedPath.startsWith(`${node.path}/`))
}

function DocumentTreeItem({
  node,
  depth,
  query,
  selectedPath,
  onSelect,
}: DocumentTreeItemProps) {
  const [open, setOpen] = useState(depth < 2)
  const forceOpen = Boolean(query.trim()) || nodeContainsPath(node, selectedPath)
  const isOpen = forceOpen || open
  const paddingLeft = `${0.55 + depth * 0.9}rem`

  if (node.isDir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex w-full min-w-0 items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm text-[var(--convergekit-ink-2)] transition-colors hover:bg-[var(--convergekit-bg-2)]"
          style={{ paddingLeft }}
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--convergekit-ink-4)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--convergekit-ink-4)]" />
          )}
          {isOpen ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--convergekit-ink-3)]" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--convergekit-ink-3)]" />
          )}
          <span className="min-w-0 truncate font-medium">{node.name}</span>
        </button>
        {isOpen ? (
          <div>
            {node.children.map((child) => (
              <DocumentTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                query={query}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      className={cn(
        'flex w-full min-w-0 items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm transition-colors',
        selectedPath === node.path
          ? 'bg-[var(--convergekit-bg-3)] font-medium text-[var(--convergekit-ink)]'
          : 'text-[var(--convergekit-ink-3)] hover:bg-[var(--convergekit-bg-2)] hover:text-[var(--convergekit-ink)]',
      )}
      style={{ paddingLeft: `${0.55 + depth * 0.9 + 1.25}rem` }}
      title={node.path}
      aria-label={`Select ${node.path}`}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--convergekit-ink-4)]" />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      {node.programmingLanguage ? (
        <span className="shrink-0 text-[10.5px] text-[var(--convergekit-ink-4)]">
          {node.programmingLanguage}
        </span>
      ) : null}
    </button>
  )
}

export function DocumentFileTree({
  documents,
  query,
  selectedPath,
  onSelect,
}: DocumentFileTreeProps) {
  const tree = useMemo(() => buildDocumentTree(documents), [documents])
  const visibleTree = useMemo(() => filterDocumentTree(tree, query), [query, tree])

  if (visibleTree.length === 0) {
    return (
      <p className="px-2 py-2 text-xs text-[var(--convergekit-ink-4)]">
        No files match your search.
      </p>
    )
  }

  return (
    <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto" role="tree">
      {visibleTree.map((node) => (
        <DocumentTreeItem
          key={node.path}
          node={node}
          depth={0}
          query={query}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
