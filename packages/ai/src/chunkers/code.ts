import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChunkType = 'function' | 'class' | 'method' | 'module' | 'block' | 'comment' | 'section' | 'config'

export interface CodeChunk {
  content: string
  startLine: number
  endLine: number
  chunkType: ChunkType
}

// ─── Windowed fallback ────────────────────────────────────────────────────────

const WINDOW_LINES = 50
const OVERLAP_LINES = 5

function windowedChunks(lines: string[]): CodeChunk[] {
  const chunks: CodeChunk[] = []
  let start = 0
  while (start < lines.length) {
    const end = Math.min(start + WINDOW_LINES - 1, lines.length - 1)
    chunks.push({
      content: lines.slice(start, end + 1).join('\n'),
      startLine: start,
      endLine: end,
      chunkType: 'block',
    })
    if (end >= lines.length - 1) break
    start = end - OVERLAP_LINES + 1
  }
  return chunks
}

// ─── Language configuration ───────────────────────────────────────────────────

interface LanguageConfig {
  getGrammar: () => unknown
  nodeTypes: Record<string, ChunkType>
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  typescript: {
    getGrammar: () => (require('tree-sitter-typescript') as { typescript: unknown }).typescript,
    nodeTypes: {
      function_declaration: 'function',
      class_declaration: 'class',
      method_definition: 'method',
      abstract_method_signature: 'method',
    },
  },
  tsx: {
    getGrammar: () => (require('tree-sitter-typescript') as { tsx: unknown }).tsx,
    nodeTypes: {
      function_declaration: 'function',
      class_declaration: 'class',
      method_definition: 'method',
    },
  },
  javascript: {
    getGrammar: () => require('tree-sitter-javascript'),
    nodeTypes: {
      function_declaration: 'function',
      class_declaration: 'class',
      method_definition: 'method',
    },
  },
  jsx: {
    getGrammar: () => require('tree-sitter-javascript'),
    nodeTypes: {
      function_declaration: 'function',
      class_declaration: 'class',
      method_definition: 'method',
    },
  },
  python: {
    getGrammar: () => require('tree-sitter-python'),
    nodeTypes: {
      function_definition: 'function',
      class_definition: 'class',
      decorated_definition: 'function',
    },
  },
  go: {
    getGrammar: () => require('tree-sitter-go'),
    nodeTypes: {
      function_declaration: 'function',
      method_declaration: 'method',
      type_declaration: 'class',
    },
  },
  rust: {
    getGrammar: () => require('tree-sitter-rust'),
    nodeTypes: {
      function_item: 'function',
      struct_item: 'class',
      impl_item: 'class',
      trait_item: 'class',
      enum_item: 'class',
    },
  },
  java: {
    getGrammar: () => require('tree-sitter-java'),
    nodeTypes: {
      method_declaration: 'method',
      class_declaration: 'class',
      interface_declaration: 'class',
      constructor_declaration: 'function',
    },
  },
}

// ─── Tree-sitter parsing ──────────────────────────────────────────────────────

interface SyntaxNode {
  type: string
  startPosition: { row: number; column: number }
  endPosition: { row: number; column: number }
  childCount: number
  child(index: number): SyntaxNode | null
}

function collectChunks(
  node: SyntaxNode,
  nodeTypes: Record<string, ChunkType>,
  lines: string[],
  chunks: CodeChunk[],
): void {
  const chunkType = nodeTypes[node.type]
  if (chunkType) {
    const startLine = node.startPosition.row
    const endLine = node.endPosition.row
    chunks.push({
      content: lines.slice(startLine, endLine + 1).join('\n'),
      startLine,
      endLine,
      chunkType,
    })
    // Do not recurse into matched nodes to avoid duplicate nested chunks
    return
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child) collectChunks(child, nodeTypes, lines, chunks)
  }
}

function parseWithTreeSitter(
  content: string,
  config: LanguageConfig,
  lines: string[],
): CodeChunk[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Parser = require('tree-sitter') as any
  const parser = new Parser()
  parser.setLanguage(config.getGrammar())
  const tree = parser.parse(content)
  const chunks: CodeChunk[] = []
  collectChunks(tree.rootNode as SyntaxNode, config.nodeTypes, lines, chunks)
  return chunks
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Split source code into semantic chunks using tree-sitter AST parsing.
 * Extracts top-level function, class, and method declarations as discrete chunks.
 * Falls back to a line-windowed splitter for unsupported languages.
 */
export function chunkCode(content: string, language: string | null): CodeChunk[] {
  const lines = content.split('\n')

  if (!language) return windowedChunks(lines)

  const config = LANGUAGE_CONFIGS[language.toLowerCase()]
  if (!config) return windowedChunks(lines)

  try {
    const chunks = parseWithTreeSitter(content, config, lines)
    // If tree-sitter found nothing (e.g. parse failed silently), fall back
    return chunks.length > 0 ? chunks : windowedChunks(lines)
  } catch {
    return windowedChunks(lines)
  }
}
