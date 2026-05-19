'use client'

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
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
import { FileCode2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { extractCodeReferences, linkCodeReferences } from './chat-code-references'
import { mergeChatActivityParts, toInitialChatMessages } from './chat-history-state'
import { getActivityParts, getMessageContent } from './chat-message-activity'
import { ChatActivity } from './chat-message-parts'

type Props = {
  repositoryId: string
  activeSessionId: string | null
  initialMessages: ChatMessage[]
  onSessionCreated: (repositoryId: string, sessionId: string) => void
  onSessionUpdated: (repositoryId: string) => void
}

const assistantMessageClassName =
  'min-w-0 max-w-full w-full rounded-lg border border-[var(--convergekit-line)] bg-white px-4 py-4 shadow-sm [overflow-wrap:anywhere]'
const userMessageClassName =
  'max-w-full rounded-lg border border-[var(--convergekit-ink)] bg-[var(--convergekit-ink)] text-white px-4 py-3 shadow-sm'
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

export function ChatSessionView({
  repositoryId,
  activeSessionId,
  initialMessages,
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
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white"
    >
      <Conversation className="min-h-0 flex-1">
        <ConversationContent
          className={
            messages.length === 0 ? 'h-full gap-4 px-5 py-5' : 'min-h-full gap-4 px-5 py-5'
          }
        >
          {messages.length === 0 ? (
            <div className="chat-empty-state mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-end pb-8 text-center">
              <p className="text-sm font-semibold">{t('title')}</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('description')}</p>
              <div className="mt-5 w-full max-w-2xl overflow-hidden">
                <Suggestions className="justify-center">
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
              const isStreamingMessage =
                isAssistant && status === 'streaming' && index === messages.length - 1
              const isInterruptedAssistantMessage =
                isAssistant && Boolean(error) && status === 'error' && index === messages.length - 1
              const linkedContent = isAssistant ? linkCodeReferences(content) : content
              const sources = isAssistant ? extractCodeReferences(content) : []

              return (
                <Message
                  key={message.id}
                  from={message.role}
                  className={isAssistant ? 'max-w-[min(100%,60rem)]' : 'max-w-[min(82%,36rem)]'}
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
                        <span className="grid h-5 w-5 place-items-center rounded bg-[var(--convergekit-ink)] text-[9px] font-bold text-white">
                          CK
                        </span>
                        <span>ConvergeKit</span>
                      </>
                    ) : (
                      'You'
                    )}
                  </div>
                  {sources.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs">
                      <span className="mr-0.5 font-medium text-muted-foreground">Sources:</span>
                      {sources.map((source) => (
                        <a
                          key={source.reference}
                          className="chat-source-pill"
                          href={source.href}
                          title={source.reference}
                        >
                          <FileCode2 className="h-3 w-3 shrink-0" />
                          <span className="max-w-64 truncate">{source.path}</span>
                          {source.lineRange ? (
                            <span className="chat-source-line-range">{source.lineRange}</span>
                          ) : null}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  <MessageContent
                    className={isAssistant ? assistantMessageClassName : userMessageClassName}
                  >
                    {isAssistant ? (
                      <>
                        <ChatActivity isStreaming={isStreamingMessage} message={message} />
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

      <div className="border-t border-[var(--convergekit-line)] bg-white p-4">
        {displayedError ? <p className="mb-2 text-sm text-destructive">{displayedError}</p> : null}

        <PromptInput className="shadow-sm" onSubmit={handlePromptSubmit}>
          <PromptInputTextarea
            className={cn('min-h-20', isBusy && 'cursor-not-allowed opacity-60')}
            disabled={isBusy}
            onChange={handleInputChange}
            placeholder={t('placeholder')}
            value={input}
          />
          <div className="flex items-end p-2">
            <PromptInputSubmit
              disabled={!isGenerating && (submitting || !input.trim())}
              onStop={stop}
              status={status}
            />
          </div>
        </PromptInput>
      </div>
    </section>
  )
}
