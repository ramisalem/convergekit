import { extname } from 'node:path'
import { chunkCode, chunkMarkdown, chunkConfig, chunkText } from '@convergekit/ai'
import type { CodeChunk } from '@convergekit/ai'

// DB schema only accepts these 6 chunk types — section/config map to block.
type DBChunkType = 'function' | 'class' | 'method' | 'module' | 'block' | 'comment'

export interface DocumentChunk {
  content: string
  startLine: number
  endLine: number
  chunkType: DBChunkType
}

function toDBChunkType(t: CodeChunk['chunkType']): DBChunkType {
  if (t === 'section' || t === 'config') return 'block'
  return t
}

/**
 * Route a document to the appropriate chunker based on file extension and
 * detected programming language, returning chunks compatible with the DB schema.
 */
export function chunkDocument(
  filePath: string,
  content: string,
  programmingLanguage: string | null,
): DocumentChunk[] {
  const ext = extname(filePath).toLowerCase()

  let raw: CodeChunk[]

  if (ext === '.md' || ext === '.mdx' || ext === '.rst') {
    raw = chunkMarkdown(content)
  } else if (ext === '.json') {
    raw = chunkConfig(content, 'json')
  } else if (ext === '.yaml' || ext === '.yml') {
    raw = chunkConfig(content, 'yaml')
  } else if (ext === '.toml') {
    raw = chunkConfig(content, 'toml')
  } else if (programmingLanguage) {
    raw = chunkCode(content, programmingLanguage)
  } else {
    raw = chunkText(content)
  }

  return raw.map((c) => ({
    content: c.content,
    startLine: c.startLine,
    endLine: c.endLine,
    chunkType: toDBChunkType(c.chunkType),
  }))
}
