'use client'

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { ConvergeKitLogoMark } from '@/components/convergekit-logo'
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { chatApi, type ChatMessage } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { FileCode2, Send } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EMPTY_CHAT_ACTIVITY_SNAPSHOT,
  type ChatActivitySnapshot,
} from './chat-activity-rail'
import { extractCodeReferences, linkCodeReferences } from './chat-code-references'
import type { CodeReference } from './chat-code-references'
import { mergeChatActivityParts, toInitialChatMessages } from './chat-history-state'
import { getActivityParts, getMessageContent } from './chat-message-activity'

type Props = {
  repositoryId: string
  activeSessionId: string | null
  initialMessages: ChatMessage[]
  onActivitySnapshotChange: (snapshot: ChatActivitySnapshot) => void
  onSessionCreated: (repositoryId: string, sessionId: string) => void
  onSessionUpdated: (repositoryId: string) => void
}

const assistantMessageClassName =
  'min-w-0 max-w-full w-full bg-transparent px-0 py-0 text-[13.5px] leading-[1.55] text-[var(--convergekit-ink)] [overflow-wrap:anywhere]'
const userMessageClassName =
  'max-w-[78%] rounded-[14px_14px_4px_14px] border border-[var(--convergekit-ink)] bg-[var(--convergekit-ink)] text-white px-[14px] py-2.5 text-[13.5px] leading-[1.5] shadow-sm'
const assistantResponseClassName = [
  'chat-response max-w-full break-words [overflow-wrap:anywhere]',
  '[&_pre]:overflow-x-auto',
].join(' ')

function getInitialMessagesFingerprint(activeSessionId: string | null, messages: ChatMessage[]) {
  return JSON.stringify({
    sessionId: activeSessionId,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    })),
  })
}

function hasAssistantActivity(messages: ReturnType<typeof toInitialChatMessages>) {
  return messages.some(
    (message) => message.role === 'assistant' && getActivityParts(message).length > 0,
  )
}

function getActivitySnapshotSignature(snapshot: ChatActivitySnapshot) {
  const activitySignature = snapshot.activityParts
    .map((part) =>
      part.type === 'tool'
        ? `${part.id}:${part.tool.toolName}:${part.tool.state}`
        : `${part.id}:${part.text}`,
    )
    .join('|')
  const sourceSignature = snapshot.sources.map((source) => source.reference).join('|')

  return `${snapshot.isStreaming}:${snapshot.toolCount}:${activitySignature}:${sourceSignature}`
}

function AssistantSources({ sources }: { sources: CodeReference[] }) {
  if (sources.length === 0) {
    return null
  }

  return (
    <div className="mt-3 rounded-lg border border-[var(--convergekit-line)] bg-[var(--convergekit-bg-2)] px-3 py-2.5">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--convergekit-ink-3)]">
        Sources · {sources.length}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <a
            key={source.reference}
            className="chat-source-pill"
            href={source.href}
            title={source.reference}
          >
            <FileCode2 className="h-3 w-3 shrink-0" />
            <span className="max-w-56 truncate">{source.path}</span>
            {source.lineRange ? (
              <span className="chat-source-line-range">{source.lineRange}</span>
            ) : null}
          </a>
        ))}
      </div>
    </div>
  )
}

export function ChatSessionView({
  repositoryId,
  activeSessionId,
  initialMessages,
  onActivitySnapshotChange,
  onSessionCreated,
  onSessionUpdated,
}: Props) {
  const t = useTranslations('repositoryDetail.chat')
  const [input, setInput] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const initialMessagesFingerprint = useMemo(
    () => getInitialMessagesFingerprint(activeSessionId, initialMessages),
    [activeSessionId, initialMessages],
  )
  const lastAppliedFingerprint = useRef(initialMessagesFingerprint)
  const initialChatMessages = useMemo(
    () => toInitialChatMessages(initialMessages),
    [initialMessages],
  )
  const activitySourceMessages = useRef(initialChatMessages)
  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: activeSessionId ? { sessionId: activeSessionId, repositoryId } : { repositoryId },
      }),
    [activeSessionId, repositoryId],
  )

  const { error, messages, sendMessage, setMessages, status, stop } = useChat({
    transport: chatTransport,
    messages: initialChatMessages,
    onFinish: () => onSessionUpdated(repositoryId),
  })

  const isGenerating = status === 'submitted' || status === 'streaming'
  const isBusy = submitting || isGenerating
  const examples = [t('example1'), t('example2'), t('example3')]
  const latestAssistantMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]

      if (message?.role === 'assistant') {
        return message
      }
    }

    return null
  }, [messages])
  const activitySnapshot = useMemo((): ChatActivitySnapshot => {
    if (!latestAssistantMessage) {
      return EMPTY_CHAT_ACTIVITY_SNAPSHOT
    }

    const content = getMessageContent(latestAssistantMessage)
    const activityParts = getActivityParts(latestAssistantMessage)

    return {
      activityParts: getActivityParts(latestAssistantMessage),
      isStreaming: isGenerating,
      sources: extractCodeReferences(content),
      toolCount: activityParts.filter((part) => part.type === 'tool').length,
    }
  }, [isGenerating, latestAssistantMessage])
  const activitySnapshotSignature = useMemo(
    () => getActivitySnapshotSignature(activitySnapshot),
    [activitySnapshot],
  )
  const publishedActivitySnapshotSignature = useRef('')

  useEffect(() => {
    const mergedMessages = mergeChatActivityParts(messages, activitySourceMessages.current)

    if (mergedMessages !== messages) {
      activitySourceMessages.current = mergedMessages
      setMessages(mergedMessages)
      return
    }

    if (hasAssistantActivity(messages)) {
      activitySourceMessages.current = messages
    }
  }, [messages, setMessages])

  useEffect(() => {
    if (activitySnapshotSignature === publishedActivitySnapshotSignature.current) {
      return
    }

    publishedActivitySnapshotSignature.current = activitySnapshotSignature
    onActivitySnapshotChange(activitySnapshot)
  }, [activitySnapshot, activitySnapshotSignature, onActivitySnapshotChange])

  useEffect(() => {
    if (initialMessagesFingerprint === lastAppliedFingerprint.current) {
      return
    }

    if (isGenerating) {
      return
    }

    const mergedMessages = mergeChatActivityParts(
      initialChatMessages,
      activitySourceMessages.current,
    )
    activitySourceMessages.current = mergedMessages
    setMessages(mergedMessages)
    lastAppliedFingerprint.current = initialMessagesFingerprint
  }, [initialChatMessages, initialMessagesFingerprint, isGenerating, setMessages])

  async function handlePromptSubmit(message: PromptInputMessage) {
    const text = message.text.trim()

    if (!text || isBusy) {
      return
    }

    setSubmitError(null)
    setInput('')
    setSubmitting(true)

    try {
      let sessionId = activeSessionId
      let createdSessionId: string | null = null

      if (!sessionId) {
        const { session } = await chatApi.createSession(repositoryId)
        sessionId = session.id
        createdSessionId = session.id
      }

      await sendMessage({ text }, { body: { sessionId, repositoryId } })

      if (createdSessionId) {
        onSessionCreated(repositoryId, createdSessionId)
      }

      onSessionUpdated(repositoryId)
    } catch {
      setInput(text)
      setSubmitError(t('messageError'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleSuggestionClick(suggestion: string) {
    setSubmitError(null)
    setInput(suggestion)
  }

  function handleInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setSubmitError(null)
    setInput(event.currentTarget.value)
  }

  const displayedError = submitError ?? (error ? t('messageError') : null)

  return (
    <section
      aria-busy={isBusy}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--convergekit-radius-lg)] border border-[var(--convergekit-line)] bg-white shadow-sm"
    >
      <Conversation className="min-h-0 min-w-0 flex-1">
        <ConversationContent
          className={
            messages.length === 0 ? 'h-full gap-4 px-6 py-5' : 'min-h-full gap-[18px] px-6 pb-3 pt-5'
          }
        >
          {messages.length === 0 ? (
            <div className="chat-empty-state mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-end pb-6 text-center">
              <p className="text-sm font-semibold">{t('title')}</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('description')}</p>
              <div className="mt-5 w-full max-w-2xl overflow-visible px-4">
                <Suggestions className="w-full flex-wrap justify-center">
                  {examples.map((example) => (
                    <Suggestion
                      key={example}
                      onClick={handleSuggestionClick}
                      suggestion={example}
                    />
                  ))}
                </Suggestions>
              </div>
            </div>
          ) : (
            messages.map((message, index) => {
              const content = getMessageContent(message)
              const isAssistant = message.role === 'assistant'
              const isInterruptedAssistantMessage =
                isAssistant && Boolean(error) && status === 'error' && index === messages.length - 1
              const linkedContent = isAssistant ? linkCodeReferences(content) : content
              const sources = isAssistant ? extractCodeReferences(content) : []

              return (
                <Message
                  key={message.id}
                  from={message.role}
                  className={isAssistant ? 'max-w-full' : 'max-w-[78%]'}
                >
                  <div
                    className={
                      isAssistant
                        ? 'flex items-center gap-2 px-1 text-xs font-medium text-[var(--convergekit-ink-3)]'
                        : 'px-1 text-right text-xs font-medium text-[var(--convergekit-ink-3)]'
                    }
                  >
                    {isAssistant ? (
                      <>
                        <ConvergeKitLogoMark className="h-[22px] w-[22px] bg-gradient-to-br" />
                        <span>Colab Ai Hub · Claude Sonnet 4.5</span>
                      </>
                    ) : (
                      'You'
                    )}
                  </div>
                  <MessageContent
                    className={isAssistant ? assistantMessageClassName : userMessageClassName}
                  >
                    {isAssistant ? (
                      <>
                        {content ? (
                          <MessageResponse className={assistantResponseClassName}>
                            {linkedContent}
                          </MessageResponse>
                        ) : null}
                        {isInterruptedAssistantMessage ? (
                          <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                            {t('responseInterrupted')}
                          </p>
                        ) : null}
                        <AssistantSources sources={sources} />
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {content}
                      </p>
                    )}
                  </MessageContent>
                </Message>
              )
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t border-[var(--convergekit-line)] bg-[var(--convergekit-bg)] px-4 pb-3.5 pt-3">
        {displayedError ? <p className="mb-2 text-sm text-destructive">{displayedError}</p> : null}

        <PromptInput
          className="w-full rounded-[10px] border border-[var(--convergekit-line-strong)] bg-[var(--convergekit-bg)] shadow-none"
          onSubmit={handlePromptSubmit}
        >
          <PromptInputTextarea
            className={cn(
              'max-h-36 min-h-0 flex-1 py-1 text-[13.5px] leading-[1.5]',
              isBusy && 'cursor-not-allowed opacity-60',
            )}
            disabled={isBusy}
            onChange={handleInputChange}
            placeholder={t('placeholder')}
            value={input}
          />
          <div className="flex shrink-0 items-center gap-2 py-2 pl-2 pr-2">
            <span className="hidden text-[11px] text-[var(--convergekit-ink-4)] sm:inline">
              ↩ to send
            </span>
            <PromptInputSubmit
              className="h-7 gap-1.5 rounded-md px-2.5 text-xs"
              disabled={!isGenerating && (submitting || !input.trim())}
              onStop={stop}
              size="sm"
              status={status}
            >
              <Send className="h-3 w-3" />
              <span>{isGenerating ? 'Stop' : 'Send'}</span>
            </PromptInputSubmit>
          </div>
        </PromptInput>
      </div>
    </section>
  )
}
