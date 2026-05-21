import type { BundledLanguage } from 'shiki'

type DocumentLanguageInput = {
  path: string
  programmingLanguage?: string | null
}

const LANGUAGE_ALIASES: Record<string, BundledLanguage> = {
  bash: 'shell',
  c: 'c',
  'c#': 'csharp',
  cpp: 'cpp',
  csharp: 'csharp',
  css: 'css',
  go: 'go',
  html: 'html',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  kotlin: 'kotlin',
  lua: 'lua',
  markdown: 'markdown',
  md: 'markdown',
  mdx: 'mdx',
  php: 'php',
  py: 'python',
  python: 'python',
  r: 'r',
  rb: 'ruby',
  ruby: 'ruby',
  rust: 'rust',
  scala: 'scala',
  scss: 'scss',
  sh: 'shell',
  shell: 'shell',
  sql: 'sql',
  swift: 'swift',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  typescript: 'typescript',
  vue: 'vue',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'shell',
}

const EXTENSION_LANGUAGES: Record<string, BundledLanguage> = {
  '.bash': 'shell',
  '.c': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.cs': 'csharp',
  '.css': 'css',
  '.fish': 'shell',
  '.go': 'go',
  '.h': 'c',
  '.hpp': 'cpp',
  '.html': 'html',
  '.java': 'java',
  '.js': 'javascript',
  '.json': 'json',
  '.jsx': 'jsx',
  '.kt': 'kotlin',
  '.lua': 'lua',
  '.md': 'markdown',
  '.mdx': 'mdx',
  '.mjs': 'javascript',
  '.php': 'php',
  '.py': 'python',
  '.r': 'r',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.scala': 'scala',
  '.scss': 'scss',
  '.sh': 'shell',
  '.sql': 'sql',
  '.swift': 'swift',
  '.toml': 'toml',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.vue': 'vue',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.zsh': 'shell',
}

const FILE_NAME_LANGUAGES: Record<string, BundledLanguage> = {
  dockerfile: 'dockerfile',
  gemfile: 'ruby',
  makefile: 'makefile',
}

const PATH_SPECIFIC_LANGUAGES = new Set<BundledLanguage>(['jsx', 'mdx', 'tsx'])

function normalizeLanguage(value: string | null | undefined) {
  if (!value) return null
  return LANGUAGE_ALIASES[value.trim().toLowerCase()] ?? null
}

function getExtension(path: string) {
  const fileName = path.split('/').pop()?.toLowerCase() ?? path.toLowerCase()
  const dotIndex = fileName.lastIndexOf('.')

  if (dotIndex <= 0) {
    return null
  }

  return fileName.slice(dotIndex)
}

export function getDocumentCodeLanguage({
  path,
  programmingLanguage,
}: DocumentLanguageInput): BundledLanguage | null {
  const extension = getExtension(path)
  const extensionLanguage = extension ? EXTENSION_LANGUAGES[extension] ?? null : null

  if (extensionLanguage && PATH_SPECIFIC_LANGUAGES.has(extensionLanguage)) {
    return extensionLanguage
  }

  const normalizedLanguage = normalizeLanguage(programmingLanguage)

  if (normalizedLanguage) {
    return normalizedLanguage
  }

  const fileName = path.split('/').pop()?.toLowerCase() ?? path.toLowerCase()
  const namedLanguage = FILE_NAME_LANGUAGES[fileName]

  if (namedLanguage) {
    return namedLanguage
  }

  return extensionLanguage
}
