import { code as streamdownCode } from '@streamdown/code'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readSource(url: URL) {
  return existsSync(url) ? readFileSync(url, 'utf8') : ''
}

const chatTabSource = readSource(new URL('./chat-tab.tsx', import.meta.url))
const chatSessionListSource = readSource(new URL('./chat-session-list.tsx', import.meta.url))
const chatSessionViewSource = readSource(new URL('./chat-session-view.tsx', import.meta.url))
const chatMessagePartsSource = readSource(new URL('./chat-message-parts.tsx', import.meta.url))
const chatActivityRailSource = readSource(new URL('./chat-activity-rail.tsx', import.meta.url))
const repositoryDetailPageSource = readSource(
  new URL('../../app/[locale]/repositories/[id]/page.tsx', import.meta.url),
)
const toolSource = readSource(new URL('../ai-elements/tool.tsx', import.meta.url))
const globalsCssSource = readSource(new URL('../../app/globals.css', import.meta.url))

describe('chat layout contract', () => {
  it('matches the mockup three-column chat shell with a persistent activity rail', () => {
    expect(chatTabSource).toContain('chat-pane-grid')
    expect(chatTabSource).toContain("gridTemplateColumns: '260px minmax(0,1fr) 260px'")
    expect(chatTabSource).not.toContain("gridTemplateColumns: '260px minmax(0,1fr) 320px'")
    expect(chatTabSource).toContain('h-[calc(100vh_-_16rem)]')
    expect(chatTabSource).toContain('min-h-[640px]')
    expect(chatTabSource).toContain('w-full')
    expect(chatTabSource).toContain('chat-center-column')
    expect(chatTabSource).toContain('flex h-full min-h-0 w-full overflow-hidden')
    expect(chatTabSource).not.toContain('max-w-[48rem]')
    expect(chatTabSource).not.toContain('max-w-[88rem]')
    expect(chatTabSource).not.toContain('mx-auto grid h-[640px]')
    expect(chatTabSource).not.toContain('gap-3.5')
    expect(chatTabSource).toContain('justify-center overflow-hidden px-5')
    expect(chatTabSource).toContain('<ChatActivityRail snapshot={activitySnapshot} />')
    expect(chatTabSource).not.toContain('No sources yet')
    expect(chatTabSource).not.toContain('2xl:flex')
    expect(chatSessionListSource).toContain('h-full min-h-0 min-w-0')
    expect(chatSessionListSource).toContain('chat-session-rail')
    expect(chatSessionListSource).toContain('Sessions')
    expect(chatSessionListSource).toContain('border-l-2')
    expect(chatSessionListSource).toContain('border-b border-[var(--convergekit-line-2)]')
    expect(chatSessionListSource).not.toContain('md:w-72')
    expect(chatSessionListSource).toContain('overflow-y-auto')
    expect(chatSessionListSource).not.toContain('overflow-x-auto')
    expect(chatSessionViewSource).toContain('min-w-0')
    expect(chatSessionViewSource).toContain('overflow-hidden')
    expect(chatSessionViewSource).toContain(
      '<Conversation className="min-h-0 min-w-0 flex-1">',
    )
    expect(chatSessionViewSource).toContain('aria-busy')
    expect(chatSessionViewSource).toContain('cursor-not-allowed')
    expect(chatActivityRailSource).toContain('Search agent activity')
    expect(chatActivityRailSource).toContain('chat-activity-rail')
    expect(chatActivityRailSource).toContain('buildChatActivityRailItems')
    expect(chatActivityRailSource).toContain('toolCount')
  })

  it('wraps long chat content inside the transcript pane', () => {
    expect(chatSessionViewSource).toContain('[overflow-wrap:anywhere]')
    expect(chatSessionViewSource).toContain('[&_pre]:overflow-x-auto')
  })

  it('lets the chat workspace grow with wider and taller browser windows', () => {
    expect(repositoryDetailPageSource).toContain(
      'repository-detail-workspace-frame mx-auto w-full max-w-[1500px] px-5 py-8',
    )
    expect(repositoryDetailPageSource).toContain('repository-detail-chrome')
    expect(repositoryDetailPageSource).toContain('repository-detail-tab-frame')
    expect(repositoryDetailPageSource).not.toContain('max-w-none px-0 pb-0')
    expect(repositoryDetailPageSource).not.toContain('repository-detail-rail-chrome')
    expect(repositoryDetailPageSource).not.toContain('isWorkspaceCanvasTab')
    expect(repositoryDetailPageSource).not.toContain('isPinnedSideRailTab')
    expect(chatTabSource).toContain('h-[calc(100vh_-_16rem)]')
    expect(chatTabSource).not.toContain('grid h-[640px]')
    expect(chatTabSource).not.toContain('max-h-[calc(100vh_-_230px)]')
    expect(chatTabSource).toContain('min-h-[640px]')
    expect(chatTabSource).not.toContain("maxHeight: '780px'")
    expect(chatSessionViewSource).toContain('max-w-[78%]')
  })

  it('keeps the repository header title anchored to the left of the detail canvas', () => {
    expect(repositoryDetailPageSource).toContain('repository-detail-header-grid')
    expect(repositoryDetailPageSource).toContain(
      'repository-detail-header-grid mt-4 grid w-full items-start gap-4 text-left',
    )
    expect(repositoryDetailPageSource).not.toContain(
      'repository-detail-header-grid mt-4 grid w-full grid-cols-1',
    )
    expect(repositoryDetailPageSource).toContain('justify-self-start')
    expect(repositoryDetailPageSource).toContain('md:justify-self-end')
    expect(repositoryDetailPageSource).not.toContain('md:grid-cols-[minmax(0,1fr)_auto]')
    expect(globalsCssSource).toContain('.repository-detail-header-grid')
    expect(globalsCssSource).toContain('grid-template-columns: minmax(0, 1fr) auto')
  })

  it('makes the wiki action prominent inside pinned-rail repository chrome', () => {
    expect(repositoryDetailPageSource).toContain('repository-detail-view-wiki')
    expect(repositoryDetailPageSource).toContain(
      'bg-[var(--convergekit-ink)] px-4 text-sm font-semibold text-white',
    )
    expect(repositoryDetailPageSource).not.toContain(
      'border border-[var(--convergekit-line)] bg-white px-3 text-sm font-medium text-[var(--convergekit-ink-2)]',
    )
  })

  it('places the empty chat prompt near the composer', () => {
    expect(chatSessionViewSource).toContain('chat-empty-state')
    expect(chatSessionViewSource).toContain('justify-end')
    expect(chatSessionViewSource).toContain('pb-6')
    expect(chatSessionViewSource).not.toContain('items-center justify-center text-center')
  })

  it('moves reasoning and tool calls into the right activity rail', () => {
    expect(chatSessionViewSource).toContain('onActivitySnapshotChange')
    expect(chatSessionViewSource).toContain('activitySnapshot')
    expect(chatSessionViewSource).toContain('getActivityParts(latestAssistantMessage)')
    expect(chatSessionViewSource).not.toContain('<ChatActivity')
    expect(chatSessionViewSource).not.toContain('<ChatReasoning')
    expect(chatSessionViewSource).not.toContain('<ChatTools')
    expect(chatActivityRailSource).toContain('buildChatActivityRailItems')
    expect(chatActivityRailSource).toContain('Sparkles')
    expect(chatActivityRailSource).toContain('FileCode2')
    expect(chatActivityRailSource).toContain('tools')
  })

  it('uses prompt-kit status labels for core tool states', () => {
    expect(toolSource).toContain('"input-streaming": "Processing"')
    expect(toolSource).toContain('"input-available": "Ready"')
    expect(toolSource).toContain('"output-available": "Completed"')
    expect(toolSource).toContain('"output-error": "Error"')
  })

  it('gives user and assistant turns visible boundaries', () => {
    expect(chatSessionViewSource).toContain('Colab Ai Hub')
    expect(chatSessionViewSource).toContain('You')
    expect(chatSessionViewSource).toContain('rounded-[14px_14px_4px_14px]')
    expect(chatSessionViewSource).toContain('bg-[var(--convergekit-ink)] text-white')
    expect(chatSessionViewSource).toContain('Colab Ai Hub ·')
    expect(chatSessionViewSource).toContain('bg-gradient-to-br')
  })

  it('surfaces interrupted streams inside the assistant turn', () => {
    expect(chatSessionViewSource).toContain('isInterruptedAssistantMessage')
    expect(chatSessionViewSource).toContain("t('responseInterrupted')")
  })

  it('styles code reference anchors as compact pills', () => {
    expect(chatSessionViewSource).toContain('linkCodeReferences(content)')
    expect(chatSessionViewSource).toContain('extractCodeReferences(content)')
    expect(chatSessionViewSource).toContain('Sources ·')
    expect(chatSessionViewSource).toContain('chat-response')
    expect(chatSessionViewSource).toContain('chat-source-pill')
    expect(globalsCssSource).toContain(".chat-response a[href^='#code-reference-']")
    expect(globalsCssSource).toContain('.chat-response :not(pre) > code')
    expect(globalsCssSource).toContain('font-family:')
    expect(globalsCssSource).toContain('ui-monospace')
  })

  it('aligns markdown lists inside assistant responses', () => {
    expect(globalsCssSource).toContain('.chat-response ul,')
    expect(globalsCssSource).toContain('.chat-response ol')
    expect(globalsCssSource).toContain('.chat-response li {')
    expect(globalsCssSource).toContain('list-style-position: outside')
    expect(globalsCssSource).toContain('padding-left: 1.25rem')
    expect(globalsCssSource).toContain('padding-left: 0.25rem')
    expect(globalsCssSource).toContain('.chat-response li > p')
  })

  it('keeps assistant markdown headings on a compact chat scale', () => {
    expect(globalsCssSource).toContain('.chat-response h1,')
    expect(globalsCssSource).toContain('.chat-response h6')
    expect(globalsCssSource).toContain('font-size: 1.08rem')
    expect(globalsCssSource).toContain('line-height: 1.4')
    expect(globalsCssSource).toContain('letter-spacing: 0')
    expect(globalsCssSource).toContain('.chat-response h1:first-child')
  })

  it('keeps code blocks quiet inside chat responses', () => {
    expect(globalsCssSource).toContain(".chat-response [data-streamdown='code-block']")
    expect(globalsCssSource).toContain(".chat-response [data-streamdown='code-block-header']")
    expect(globalsCssSource).toMatch(
      /\.chat-response\s+\[data-streamdown='code-block'\]\s+>\s+div:has\(>\s+\[data-streamdown='code-block-actions'\]\)/,
    )
    expect(globalsCssSource).toContain(".chat-response [data-streamdown='code-block-actions']")
    expect(globalsCssSource).toContain(".chat-response [data-streamdown='code-block-body']")
    expect(globalsCssSource).toContain('display: none !important')
    expect(globalsCssSource).toContain('position: absolute')
    expect(globalsCssSource).toContain('border: 0 !important')
    expect(globalsCssSource).toContain('box-shadow: none')
  })

  it('keeps code blocks syntax highlighted and horizontally scrollable', () => {
    expect(globalsCssSource).toContain('overflow-x: auto !important')
    expect(globalsCssSource).toContain('max-width: 100%')
    expect(globalsCssSource).toContain('width: max-content')
    expect(globalsCssSource).toContain('min-width: 100%')
    expect(globalsCssSource).toContain('white-space: pre')
    expect(globalsCssSource).toContain('overflow-wrap: normal')
    expect(globalsCssSource).toContain('word-break: normal')
    expect(globalsCssSource).toContain(".chat-response [data-streamdown='code-block-body'] span")
    expect(globalsCssSource).toContain('color: var(--sdm-c, inherit)')
  })

  it('keeps Ruby syntax highlighting available for chat code blocks', async () => {
    const highlighted = await new Promise<ReturnType<typeof streamdownCode.highlight>>(
      (resolve) => {
        const immediate = streamdownCode.highlight(
          {
            code: "def call\n  puts 'hello'\nend",
            language: 'ruby',
            themes: ['github-light', 'github-dark'],
          },
          resolve,
        )

        if (immediate) {
          resolve(immediate)
        }
      },
    )

    expect(streamdownCode.supportsLanguage('ruby')).toBe(true)
    expect(
      highlighted?.tokens
        .flat()
        .some(
          (token) =>
            'htmlStyle' in token &&
            typeof token.htmlStyle === 'object' &&
            token.htmlStyle !== null &&
            'color' in token.htmlStyle,
        ),
    ).toBe(true)
  })

  it('does not present unknown message counts as zero', () => {
    expect(chatSessionListSource).not.toContain('{session.messageCount ?? 0} messages')
    expect(chatSessionListSource).toContain("typeof session.messageCount === 'number'")
  })
})
