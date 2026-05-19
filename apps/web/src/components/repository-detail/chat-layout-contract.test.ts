import { code as streamdownCode } from '@streamdown/code'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const chatTabSource = readFileSync(new URL('./chat-tab.tsx', import.meta.url), 'utf8')
const chatSessionListSource = readFileSync(
  new URL('./chat-session-list.tsx', import.meta.url),
  'utf8',
)
const chatSessionViewSource = readFileSync(
  new URL('./chat-session-view.tsx', import.meta.url),
  'utf8',
)
const chatMessagePartsSource = readFileSync(
  new URL('./chat-message-parts.tsx', import.meta.url),
  'utf8',
)
const repositoryDetailPageSource = readFileSync(
  new URL('../../app/[locale]/repositories/[id]/page.tsx', import.meta.url),
  'utf8',
)
const toolSource = readFileSync(new URL('../ai-elements/tool.tsx', import.meta.url), 'utf8')
const globalsCssSource = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

describe('chat layout contract', () => {
  it('keeps the desktop source rail stable and the streaming composer explicit', () => {
    expect(chatTabSource).toContain('overflow-hidden')
    expect(chatTabSource).toContain('lg:grid-cols-[260px_minmax(0,1fr)_320px]')
    expect(chatTabSource).toContain('min-w-0 overflow-hidden')
    expect(chatTabSource).toContain('No sources yet')
    expect(chatSessionListSource).toContain('shrink-0')
    expect(chatSessionListSource).toContain('md:w-72')
    expect(chatSessionViewSource).toContain('min-w-0')
    expect(chatSessionViewSource).toContain('overflow-hidden')
    expect(chatSessionViewSource).toContain('<Conversation className="min-h-0 flex-1">')
    expect(chatSessionViewSource).toContain('aria-busy')
    expect(chatSessionViewSource).toContain('cursor-not-allowed')
  })

  it('wraps long chat content inside the transcript pane', () => {
    expect(chatSessionViewSource).toContain('[overflow-wrap:anywhere]')
    expect(chatSessionViewSource).toContain('[&_pre]:overflow-x-auto')
  })

  it('lets the chat workspace grow with wider and taller browser windows', () => {
    expect(repositoryDetailPageSource).toContain(
      "effectiveActiveTab === 'chat' ? 'max-w-[88rem]' : 'max-w-[72rem]'",
    )
    expect(chatTabSource).toContain("height: 'calc(100vh - 230px)'")
    expect(chatTabSource).not.toContain("maxHeight: '780px'")
    expect(chatSessionViewSource).toContain('max-w-[min(100%,60rem)]')
  })

  it('places the empty chat prompt near the composer', () => {
    expect(chatSessionViewSource).toContain('chat-empty-state')
    expect(chatSessionViewSource).toContain('justify-end')
    expect(chatSessionViewSource).not.toContain('items-center justify-center text-center')
  })

  it('renders reasoning and tool calls as a prompt-kit style activity timeline', () => {
    expect(chatSessionViewSource).toContain('ChatActivity')
    expect(chatSessionViewSource).not.toContain('<ChatReasoning')
    expect(chatSessionViewSource).not.toContain('<ChatTools')
    expect(chatMessagePartsSource).toContain('ChainOfThought')
    expect(chatMessagePartsSource).toContain('ChainOfThoughtStep')
    expect(chatMessagePartsSource).toContain('Search Agent Activity')
    expect(chatMessagePartsSource).toContain('ActivityStepList')
    expect(chatMessagePartsSource).toContain('ActivityStepItem')
    expect(chatMessagePartsSource).toContain('aria-label={`Step ${stepNumber}`}')
    expect(chatMessagePartsSource).toContain('ToolInput')
    expect(chatMessagePartsSource).toContain('ToolOutput')
  })

  it('uses prompt-kit status labels for core tool states', () => {
    expect(toolSource).toContain('"input-streaming": "Processing"')
    expect(toolSource).toContain('"input-available": "Ready"')
    expect(toolSource).toContain('"output-available": "Completed"')
    expect(toolSource).toContain('"output-error": "Error"')
  })

  it('gives user and assistant turns visible boundaries', () => {
    expect(chatSessionViewSource).toContain('ConvergeKit')
    expect(chatSessionViewSource).toContain('You')
    expect(chatSessionViewSource).toContain('border-[var(--convergekit-line)] bg-white')
    expect(chatSessionViewSource).toContain('bg-[var(--convergekit-ink)] text-white')
  })

  it('surfaces interrupted streams inside the assistant turn', () => {
    expect(chatSessionViewSource).toContain('isInterruptedAssistantMessage')
    expect(chatSessionViewSource).toContain("t('responseInterrupted')")
  })

  it('styles code reference anchors as compact pills', () => {
    expect(chatSessionViewSource).toContain('linkCodeReferences(content)')
    expect(chatSessionViewSource).toContain('extractCodeReferences(content)')
    expect(chatSessionViewSource).toContain('Sources:')
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
