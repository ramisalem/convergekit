'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown } from 'lucide-react'
import { documentsApi } from '@/lib/api-client'
import type { DocumentPath } from '@/lib/api-client'

interface Props {
  repositoryId: string
}

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
  programmingLanguage?: string | null
}

function buildTree(docs: DocumentPath[]): TreeNode[] {
  const root: TreeNode[] = []

  for (const doc of docs) {
    const parts = doc.path.split('/')
    let nodes = root

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const path = parts.slice(0, i + 1).join('/')
      const isDir = i < parts.length - 1
      let node = nodes.find((n) => n.path === path)
      if (!node) {
        node = { name, path, isDir, children: [], programmingLanguage: isDir ? null : doc.programmingLanguage }
        nodes.push(node)
      }
      nodes = node.children
    }
  }

  return root
}

function TreeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2)

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-neutral-50 transition-colors text-left"
          style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
        >
          {open
            ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-neutral-400" />
            : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-neutral-400" />}
          {open
            ? <FolderOpen className="h-4 w-4 flex-shrink-0 text-amber-500" />
            : <Folder className="h-4 w-4 flex-shrink-0 text-amber-500" />}
          <span className="font-medium text-neutral-800">{node.name}</span>
        </button>
        {open && node.children.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-neutral-50 transition-colors"
      style={{ paddingLeft: `${0.75 + depth * 1 + 1.25}rem` }}
    >
      <FileText className="h-4 w-4 flex-shrink-0 text-neutral-400" />
      <span className="text-neutral-600">{node.name}</span>
      {node.programmingLanguage && (
        <span className="ml-auto text-xs text-neutral-400">{node.programmingLanguage}</span>
      )}
    </div>
  )
}

export function StructureTab({ repositoryId }: Props) {
  const t = useTranslations('repositoryDetail.structure')
  const [docs, setDocs] = useState<DocumentPath[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    documentsApi.list(repositoryId)
      .then(({ documents }) => setDocs(documents))
      .catch(() => setError(true))
  }, [repositoryId])

  const tree = useMemo(() => (docs ? buildTree(docs) : []), [docs])

  return (
    <div className="py-6">
      <p className="mb-4 text-sm text-neutral-500">{t('description')}</p>

      {error ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center">
          <p className="text-sm text-neutral-500">Failed to load file structure</p>
        </div>
      ) : docs === null ? (
        <div className="flex items-center justify-center rounded-lg border border-neutral-200 bg-white py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
        </div>
      ) : docs.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center">
          <p className="text-sm text-neutral-500">No files indexed yet</p>
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Files</span>
            <span className="text-xs text-neutral-400">{docs.length} files</span>
          </div>
          <div className="divide-y divide-neutral-50">
            {tree.map((node) => (
              <TreeItem key={node.path} node={node} depth={0} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
