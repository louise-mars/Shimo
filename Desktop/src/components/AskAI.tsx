import { useState, useRef } from 'react'
import { useStore } from '../store'

interface Props { onClose: () => void }

export default function AskAI({ onClose }: Props) {
  const { state } = useStore()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>(() => {
    try { return JSON.parse(sessionStorage.getItem('shimo-ask-history') || '[]') } catch { return [] }
  })
  const answerRef = useRef<HTMLDivElement>(null)

  const handleAsk = async () => {
    if (!question.trim() || loading) return
    const q = question.trim()
    setQuestion('')
    setLoading(true)
    setAnswer('')

    const newHistory = [...history, { role: 'user' as const, content: q }]
    setHistory(newHistory)

    try {
      const config = JSON.parse(localStorage.getItem('shimo-ai-config') || '{}')
      if (!config.apiKey) { setAnswer('请先在设置中配置 AI'); setLoading(false); return }

      const providerURLs: Record<string, string> = {
        minimax: 'https://api.minimaxi.chat/v1',
        kimi: 'https://api.moonshot.cn/v1',
        glm: 'https://open.bigmodel.cn/api/paas/v4',
        qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        openrouter: 'https://openrouter.ai/api/v1',
      }
      const baseURL = providerURLs[config.provider] || providerURLs.openrouter

      // Build context from notes
      const notes = state.notes.filter(n => !n.deletedAt)
      const qLower = q.toLowerCase()
      const relevant = notes
        .filter(n => {
          const text = [n.title, n.tags.join(' ')].join(' ').toLowerCase()
          return qLower.split(/\s+/).some(w => w.length > 1 && text.includes(w))
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 10)

      const context = (relevant.length > 0 ? relevant : notes.slice(0, 10))
        .map(n => {
          const date = new Date(n.updatedAt).toLocaleDateString('zh-CN')
          return `[${date}] ${n.title || '无标题'}: ${n.content.slice(0, 200)}`
        })
        .join('\n\n')

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: `你是用户的私人笔记助手。以下是用户的笔记内容：\n\n${context}\n\n请基于这些笔记回答用户的问题。回答要简洁，用中文。` },
        ...newHistory.slice(-10),
      ]

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
      })

      if (!res.ok) { setAnswer('AI 调用失败：' + res.statusText); setLoading(false); return }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let full = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
          for (const line of lines) {
            const data = line.slice(6)
            if (data === '[DONE]') break
            try {
              const json = JSON.parse(data)
              const delta = json.choices?.[0]?.delta?.content || ''
              full += delta
              setAnswer(full)
            } catch { /* skip */ }
          }
        }
      }

      setHistory([...newHistory, { role: 'assistant', content: full }])
      sessionStorage.setItem('shimo-ask-history', JSON.stringify([...newHistory, { role: 'assistant', content: full }].slice(-20)))
    } catch (err) {
      setAnswer('AI 调用失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setLoading(false)
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
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-light)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>问我的笔记</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, color: 'var(--text-faint)', cursor: 'pointer' }}>✕</button>
        </div>

        {/* 对话区 */}
        <div ref={answerRef} style={{ flex: 1, overflow: 'auto', padding: '16px 20px', minHeight: 200 }}>
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
                whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && answer && (
            <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {answer}
            </div>
          )}
          {loading && !answer && (
            <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>思考中…</div>
          )}
          {!loading && history.length === 0 && (
            <div style={{ color: 'var(--text-faint)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              问任何关于你笔记的问题
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: 8 }}>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAsk()}
            placeholder="我最近在思考什么？"
            style={{
              flex: 1, padding: '10px 14px', border: '1px solid var(--border-light)',
              borderRadius: 8, background: 'var(--bg-elevated)', color: 'var(--text-primary)',
              fontSize: 14, outline: 'none', fontFamily: 'var(--font-sans)',
            }}
            autoFocus
          />
          <button onClick={handleAsk} disabled={!question.trim() || loading} style={{
            padding: '10px 16px', background: question.trim() ? 'var(--accent)' : 'var(--bg-secondary)',
            color: question.trim() ? 'white' : 'var(--text-faint)',
            border: 'none', borderRadius: 8, fontSize: 13, cursor: question.trim() ? 'pointer' : 'default',
          }}>发送</button>
        </div>
      </div>
    </div>
  )
}