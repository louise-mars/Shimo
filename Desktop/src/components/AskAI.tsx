import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import {
  isAIConfigured,
  loadAIConfig,
  getProviderBaseURL,
  assembleContext,
} from '@notepro/shared'
import AISetupWizard from './AISetupWizard'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  onClose: () => void
  onInsertToEditor?: (text: string) => void
}

const HISTORY_KEY = 'shimo-ask-history'
const MAX_HISTORY = 20

const SYSTEM_PROMPT_PREFIX = '你是拾墨的个人笔记助手，帮助用户回顾、整理和发现笔记中的内容。请用中文回答，简洁明了。'

function loadHistory(): Message[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(-MAX_HISTORY)
  } catch {
    return []
  }
}

function saveHistory(messages: Message[]): void {
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)))
}

export default function AskAI({ onClose, onInsertToEditor }: Props) {
  const { state } = useStore()
  const [question, setQuestion] = useState('')
  const [streamingAnswer, setStreamingAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [showWizard, setShowWizard] = useState(!isAIConfigured())
  const [history, setHistory] = useState<Message[]>(loadHistory)
  const [error, setError] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, streamingAnswer])

  // Show wizard if not configured
  if (showWizard) {
    return <AISetupWizard onComplete={() => setShowWizard(false)} onClose={onClose} />
  }

  const handleAsk = async () => {
    if (!question.trim() || loading) return
    const q = question.trim()
    setQuestion('')
    setLoading(true)
    setStreamingAnswer('')
    setError(null)

    const userMessage: Message = { role: 'user', content: q }
    const newHistory = [...history, userMessage]
    setHistory(newHistory)

    try {
      const config = loadAIConfig()
      if (!config?.apiKey) {
        setError('请先配置 AI 服务商')
        setShowWizard(true)
        setLoading(false)
        return
      }

      const baseURL = getProviderBaseURL(config.provider)

      // Build context from notes using shared assembleContext
      const { context } = assembleContext(q, state.notes)

      const systemPrompt = context
        ? `${SYSTEM_PROMPT_PREFIX}\n\n以下是用户的相关笔记内容：\n\n${context}\n\n请基于这些笔记回答用户的问题。如果笔记中没有相关信息，请如实告知。`
        : `${SYSTEM_PROMPT_PREFIX}\n\n用户目前没有相关笔记内容。请根据你的知识回答问题。`

      // Build messages array with system prompt and recent conversation history
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...newHistory.slice(-10).map(m => ({ role: m.role, content: m.content })),
      ]

      // Create abort controller for cancellation
      const abortController = new AbortController()
      abortRef.current = abortController

      const res = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model || 'MiniMax-Text-01',
          messages,
          stream: true,
          temperature: 0.5,
          max_tokens: 800,
        }),
        signal: abortController.signal,
      })

      if (!res.ok) {
        const statusText = res.statusText || `HTTP ${res.status}`
        setError(`AI 调用失败：${statusText}`)
        setLoading(false)
        return
      }

      // SSE streaming
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullAnswer = ''

      if (reader) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          // Keep the last incomplete line in buffer
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data: ')) continue
            const data = trimmed.slice(6)
            if (data === '[DONE]') break
            try {
              const json = JSON.parse(data)
              const delta = json.choices?.[0]?.delta?.content || ''
              if (delta) {
                fullAnswer += delta
                setStreamingAnswer(fullAnswer)
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }
      }

      // Save completed response to history
      const assistantMessage: Message = { role: 'assistant', content: fullAnswer }
      const updatedHistory = [...newHistory, assistantMessage]
      setHistory(updatedHistory)
      saveHistory(updatedHistory)
      setStreamingAnswer('')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled - don't show error
      } else {
        setError('AI 调用失败：' + (err instanceof Error ? err.message : '未知错误'))
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleClearHistory = () => {
    setHistory([])
    sessionStorage.removeItem(HISTORY_KEY)
  }

  const handleInsert = (content: string) => {
    if (onInsertToEditor) {
      onInsertToEditor(content)
    }
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 520, maxHeight: '80vh', background: 'var(--bg-elevated)',
        borderRadius: 14, border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        animation: 'fadeIn 150ms ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>
            问我的笔记
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {history.length > 0 && (
              <button
                onClick={handleClearHistory}
                title="清除对话"
                style={{
                  border: 'none', background: 'none', fontSize: 12,
                  color: 'var(--text-faint)', cursor: 'pointer',
                  padding: '4px 8px', borderRadius: 4,
                }}
              >
                清除
              </button>
            )}
            <button
              onClick={() => setShowWizard(true)}
              title="重新配置 AI"
              style={{
                border: 'none', background: 'none', fontSize: 14,
                color: 'var(--text-faint)', cursor: 'pointer',
              }}
            >
              ⚙
            </button>
            <button onClick={onClose} style={{
              border: 'none', background: 'none', fontSize: 18,
              color: 'var(--text-faint)', cursor: 'pointer',
            }}>✕</button>
          </div>
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', minHeight: 200 }}>
          {history.map((msg, i) => (
            <div key={i} style={{
              marginBottom: 12,
              textAlign: msg.role === 'user' ? 'right' : 'left',
            }}>
              <div style={{
                display: 'inline-block', maxWidth: '80%',
                padding: '8px 12px', borderRadius: 8,
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-secondary)',
                color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                fontSize: 13, fontFamily: 'var(--font-sans)', lineHeight: 1.6,
                whiteSpace: 'pre-wrap', position: 'relative',
              }}>
                {msg.content}
                {/* Insert to editor button for assistant messages */}
                {msg.role === 'assistant' && onInsertToEditor && (
                  <button
                    onClick={() => handleInsert(msg.content)}
                    title="插入到编辑器"
                    style={{
                      display: 'block', marginTop: 6,
                      border: 'none', background: 'var(--bg-elevated)',
                      color: 'var(--text-secondary)', fontSize: 11,
                      padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                    }}
                  >
                    📋 插入到笔记
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Streaming response */}
          {loading && streamingAnswer && (
            <div style={{ marginBottom: 12, textAlign: 'left' }}>
              <div style={{
                display: 'inline-block', maxWidth: '80%',
                padding: '8px 12px', borderRadius: 8,
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {streamingAnswer}
                <span style={{ opacity: 0.5, animation: 'blink 1s infinite' }}>▌</span>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {loading && !streamingAnswer && (
            <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>思考中…</div>
          )}

          {/* Error display */}
          {error && (
            <div style={{
              padding: '8px 12px', background: 'var(--error-bg, #fff0f0)',
              borderRadius: 8, fontSize: 12, color: 'var(--danger, #d32f2f)',
              marginBottom: 12,
            }}>
              {error}
            </div>
          )}

          {/* Empty state */}
          {!loading && history.length === 0 && !error && (
            <div style={{ color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              问任何关于你笔记的问题
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: 8 }}>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk() } }}
            placeholder="我最近在思考什么？"
            disabled={loading}
            style={{
              flex: 1, padding: '10px 14px', border: '1px solid var(--border-light)',
              borderRadius: 8, background: 'var(--bg-elevated)', color: 'var(--text-primary)',
              fontSize: 14, outline: 'none', fontFamily: 'var(--font-sans)',
              opacity: loading ? 0.6 : 1,
            }}
            autoFocus
          />
          {loading ? (
            <button onClick={handleStop} style={{
              padding: '10px 16px', background: 'var(--danger, #d32f2f)',
              color: 'white', border: 'none', borderRadius: 8,
              fontSize: 13, cursor: 'pointer',
            }}>停止</button>
          ) : (
            <button onClick={handleAsk} disabled={!question.trim()} style={{
              padding: '10px 16px',
              background: question.trim() ? 'var(--accent)' : 'var(--bg-secondary)',
              color: question.trim() ? 'white' : 'var(--text-faint)',
              border: 'none', borderRadius: 8, fontSize: 13,
              cursor: question.trim() ? 'pointer' : 'default',
            }}>发送</button>
          )}
        </div>
      </div>
    </div>
  )
}
