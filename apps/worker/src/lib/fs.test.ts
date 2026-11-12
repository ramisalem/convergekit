import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileContent } from './fs.js'

const text = 'aiohttp==3.10.11\r\nyarl==1.15.2\r\n'

describe('readFileContent', () => {
  let dir: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'convergekit-fs-'))
  })

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  async function readBytes(name: string, bytes: Buffer): Promise<string> {
    const path = join(dir, name)
    await writeFile(path, bytes)
    return readFileContent(path)
  }

  it('reads a UTF-8 file as is', async () => {
    expect(await readBytes('plain.txt', Buffer.from(text, 'utf8'))).toBe(text)
  })

  it('drops a UTF-8 byte order mark', async () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')])
    expect(await readBytes('bom.txt', bytes)).toBe(text)
  })

  it('decodes a UTF-16 little-endian file, as written by Windows PowerShell', async () => {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
    expect(await readBytes('utf16le.txt', bytes)).toBe(text)
  })

  it('decodes a UTF-16 big-endian file', async () => {
    const le = Buffer.from(text, 'utf16le')
    const be = Buffer.alloc(le.length)
    for (let i = 0; i < le.length; i += 2) {
      be[i] = le[i + 1]!
      be[i + 1] = le[i]!
    }
    expect(await readBytes('utf16be.txt', Buffer.concat([Buffer.from([0xfe, 0xff]), be]))).toBe(
      text,
    )
  })

  it('removes NUL characters, which Postgres text columns cannot store', async () => {
    const content = await readBytes('nul.txt', Buffer.from('a\u0000b\u0000c', 'utf8'))
    expect(content).toBe('abc')
  })
})
