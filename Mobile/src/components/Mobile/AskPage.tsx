import { useState, useRef, useEffect } from 'react'
import { useStore } from '../../store'
import { askNotes, isAIConfigured } from '../../lib/ai'

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

interface Props {
  onBack: () => void
  onGoToAISettings: () => void
}

const SUGGESTIONS = [
  '我最近在思考什么？',
  '上周记了哪些工作相关的内容？',
  '我有哪些关于产品的想法？',
  '帮我总结今天的记录',
]

export default function AskPage({ onBack, onGoToAISettings }: Props) {
  const { state } = useStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const configured = isAIConfigured()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (question: string) => {
    if (!question.trim() || loading) return
    setInput('')
    setLoading(true)

    const userMsg: Message = { role: 'user', content: question }
    const assistantMsg: Message = { role: 'assistant', content: '', streaming: true }
    setMessages(prev => [...prev, userMsg, assistantMsg])

    try {
      await askNotes(question, state.notes, (chunk) => {
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last.role !== 'assistant') return prev
          return [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
        })
      })
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last.role !== 'assistant') return prev
        return [...prev.slice(0, -1), { ...last, streaming: false }]
      })
    } catch (e: any) {
      setMessages(prev => [...prev.slice(0, -1), {
        role: 'assistant',
        content: e?.message?.includes('未配置') ? '请先配置 AI' : '出错了，请重试',
      }])
    } finally {
      setLoading(false)
    }
  }

  if (!configured) {
    return (
      <div className="page">
        <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--text-tertiary)', cursor: 'pointer' }}>←</button>
          <span className="page-title">问笔记</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', gap: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🤖</div>
          <div style={{ fontSize: 16, color: 'var(--text-secondary)', fontFamily: 'var(--font-serif)', letterSpacing: 1 }}>
            需要先配置 AI
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)', lineHeight: 1.6 }}>
            配置 MiniMax 或 OpenRouter 后，就可以用自然语言问你的笔记了
          </div>
          <button
            onClick={onGoToAISettings}
            style={{
              marginTop: 8, padding: '12px 28px',
              border: 'none', borderRadius: 8,
              background: 'var(--ink)', color: 'var(--bg-primary)',
              fontFamily: 'var(--font-sans)', fontSize: 14, cursor: 'pointer',
            }}
          >
            去配置
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* 顶部 */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--text-tertiary)', cursor: 'pointer' }}>←</button>
        <span className="page-title">问笔记</span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-num)', marginLeft: 'auto' }}>
          {state.notes.length} 条笔记
        </span>
      </div>

      {/* 对话区 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px' }}>
        {messages.length === 0 ? (
          <div style={{ paddingTop: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--text-faint)', fontFamily: 'var(--font-sans)', marginBottom: 16 }}>
              试试问：
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    padding: '12px 14px', textAlign: 'left',
                    border: '1px solid var(--border-light)',
                    borderRadius: 8, background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)',
                    fontSize: 14, cursor: 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} style={{
              marginBottom: 16,
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: msg.role === 'user' ? 'var(--ink)' : 'var(--bg-elevated)',
                color: msg.role === 'user' ? 'var(--bg-primary)' : 'var(--text-primary)',
                fontSize: 14,
                fontFamily: 'var(--font-sans)',
                lineHeight: 1.6,
                border: msg.role === 'assistant' ? '1px solid var(--border-light)' : 'none',
                whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
                {msg.streaming && (
                  <span style={{ display: 'inline-block', width: 6, height: 14, background: 'var(--accent)', marginLeft: 2, animation: 'blink 0.8s infinite', verticalAlign: 'middle' }} />
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入框 */}
      <div style={{
        padding: '8px 16px',
        background: 'var(--bg-elevated)',
        borderTop: '1px solid var(--border-light)',
        display: 'flex', gap: 8, alignItems: 'center',
        paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
          placeholder="问你的笔记…"
          style={{
            flex: 1, padding: '10px 14px',
            border: '1px solid var(--border-light)',
            borderRadius: 20, background: 'var(--bg-primary)',
            color: 'var(--text-primary)', fontSize: 14,
            fontFamily: 'var(--font-sans)', outline: 'none',
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || loading}
          style={{
            width: 40, height: 40, borderRadius: '50%',
            border: 'none',
            background: input.trim() && !loading ? 'var(--ink)' : 'var(--bg-secondary)',
            color: input.trim() && !loading ? 'var(--bg-primary)' : 'var(--text-faint)',
            fontSize: 16, cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s', flexShrink: 0,
          }}
        >
          ↑
        </button>
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
