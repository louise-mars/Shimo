import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import VoiceInput from '../components/VoiceInput'

// Mock SpeechRecognition
class MockSpeechRecognition {
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onend: (() => void) | null = null

  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
}

describe('VoiceInput', () => {
  let mockRecognition: MockSpeechRecognition

  beforeEach(() => {
    vi.useFakeTimers()
    mockRecognition = new MockSpeechRecognition()

    // Set up Web Speech API mock on window
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: vi.fn(() => mockRecognition),
      writable: true,
      configurable: true,
    })

    // Mock navigator.permissions
    Object.defineProperty(navigator, 'permissions', {
      value: {
        query: vi.fn().mockResolvedValue({
          state: 'prompt',
          addEventListener: vi.fn(),
        }),
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    // Clean up
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      writable: true,
      configurable: true,
    })
  })

  // Requirement 20.1: Display microphone button when Web Speech API is available
  it('displays microphone button when Web Speech API is available', () => {
    const onText = vi.fn()
    render(<VoiceInput onText={onText} />)

    const button = screen.getByRole('button', { name: '语音输入 (zh-CN)' })
    expect(button).toBeInTheDocument()
  })

  // Requirement 20.5: Hide button when Web Speech API is not available
  it('hides button when Web Speech API is not available', () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'SpeechRecognition', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    const onText = vi.fn()
    const { container } = render(<VoiceInput onText={onText} />)
    expect(container.innerHTML).toBe('')
  })

  // Requirement 20.2: Start continuous zh-CN recognition on click
  it('starts continuous zh-CN recognition when microphone button is clicked', async () => {
    const onText = vi.fn()
    render(<VoiceInput onText={onText} />)

    const button = screen.getByRole('button', { name: '语音输入 (zh-CN)' })
    await act(async () => {
      fireEvent.click(button)
    })

    expect(mockRecognition.lang).toBe('zh-CN')
    expect(mockRecognition.continuous).toBe(true)
    expect(mockRecognition.interimResults).toBe(true)
    expect(mockRecognition.start).toHaveBeenCalled()
  })

  // Requirement 20.2: Display interim results in real-time
  it('displays interim transcription results in real-time', async () => {
    const onText = vi.fn()
    render(<VoiceInput onText={onText} />)

    const button = screen.getByRole('button', { name: '语音输入 (zh-CN)' })
    await act(async () => {
      fireEvent.click(button)
    })

    // Simulate interim result
    await act(async () => {
      mockRecognition.onresult?.({
        resultIndex: 0,
        results: [{
          0: { transcript: '你好世界' },
          isFinal: false,
          length: 1,
        }],
      })
    })

    expect(screen.getByText('你好世界')).toBeInTheDocument()
    expect(onText).not.toHaveBeenCalled()
  })

  // Requirement 20.3: Insert final text via onText callback
  it('calls onText with final transcription result', async () => {
    const onText = vi.fn()
    render(<VoiceInput onText={onText} />)

    const button = screen.getByRole('button', { name: '语音输入 (zh-CN)' })
    await act(async () => {
      fireEvent.click(button)
    })

    // Simulate final result
    await act(async () => {
      mockRecognition.onresult?.({
        resultIndex: 0,
        results: [{
          0: { transcript: '你好世界' },
          isFinal: true,
          length: 1,
        }],
      })
    })

    expect(onText).toHaveBeenCalledWith('你好世界')
  })

  // Requirement 20.4: Stop recording and return to idle
  it('stops recording when stop button is clicked', async () => {
    const onText = vi.fn()
    render(<VoiceInput onText={onText} />)

    // Start listening
    const button = screen.getByRole('button', { name: '语音输入 (zh-CN)' })
    await act(async () => {
      fireEvent.click(button)
    })

    // Now click stop
    const stopButton = screen.getByRole('button', { name: '点击停止语音输入' })
    await act(async () => {
      fireEvent.click(stopButton)
    })

    expect(mockRecognition.stop).toHaveBeenCalled()
  })

  // Requirement 20.6: 10-second silence timeout
  it('shows timeout error after 10 seconds of silence', async () => {
    const onText = vi.fn()
    render(<VoiceInput onText={onText} />)

    const button = screen.getByRole('button', { name: '语音输入 (zh-CN)' })
    await act(async () => {
      fireEvent.click(button)
    })

    // Advance time by 10 seconds
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })

    expect(screen.getByText('语音服务无响应，请检查网络连接后重试')).toBeInTheDocument()
  })

  // Requirement 20.7: Network error handling
  it('displays network error message when network is unavailable', async () => {
    const onText = vi.fn()
    render(<VoiceInput onText={onText} />)

    const button = screen.getByRole('button', { name: '语音输入 (zh-CN)' })
    await act(async () => {
      fireEvent.click(button)
    })

    // Simulate network error
    await act(async () => {
      mockRecognition.onerror?.({ error: 'network' })
    })

    expect(screen.getByText('语音识别需要网络连接，请检查网络后重试')).toBeInTheDocument()
  })

  // Requirement 20.5: Permission denied error state
  it('displays permission denied error when microphone access is denied', async () => {
    const onText = vi.fn()
    render(<VoiceInput onText={onText} />)

    const button = screen.getByRole('button', { name: '语音输入 (zh-CN)' })
    await act(async () => {
      fireEvent.click(button)
    })

    // Simulate permission denied error
    await act(async () => {
      mockRecognition.onerror?.({ error: 'not-allowed' })
    })

    expect(screen.getByText('麦克风权限被拒绝，请在浏览器设置中允许麦克风访问')).toBeInTheDocument()
  })

  // Requirement 20.5: Permission check via try-catch on start
  it('handles start failure gracefully with permission error', async () => {
    mockRecognition.start.mockImplementation(() => {
      throw new Error('Permission denied')
    })

    const onText = vi.fn()
    render(<VoiceInput onText={onText} />)

    const button = screen.getByRole('button', { name: '语音输入 (zh-CN)' })
    await act(async () => {
      fireEvent.click(button)
    })

    expect(screen.getByText('无法启动语音识别，请检查麦克风权限')).toBeInTheDocument()
  })

  // Requirement 20.6: Silence timer resets on receiving results
  it('resets silence timer when results are received', async () => {
    const onText = vi.fn()
    render(<VoiceInput onText={onText} />)

    const button = screen.getByRole('button', { name: '语音输入 (zh-CN)' })
    await act(async () => {
      fireEvent.click(button)
    })

    // Advance 8 seconds
    await act(async () => {
      vi.advanceTimersByTime(8_000)
    })

    // Receive an interim result — should reset the timer
    await act(async () => {
      mockRecognition.onresult?.({
        resultIndex: 0,
        results: [{
          0: { transcript: '测试' },
          isFinal: false,
          length: 1,
        }],
      })
    })

    // Advance another 8 seconds (total 16s from start, but only 8s since last result)
    await act(async () => {
      vi.advanceTimersByTime(8_000)
    })

    // Should NOT have timed out yet (only 8s since last result, need 10s)
    expect(screen.queryByText('语音服务无响应，请检查网络连接后重试')).not.toBeInTheDocument()

    // Advance 2 more seconds to hit the 10s mark since last result
    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })

    // Now it should timeout
    expect(screen.getByText('语音服务无响应，请检查网络连接后重试')).toBeInTheDocument()
  })

  it('button is disabled when disabled prop is true', () => {
    const onText = vi.fn()
    render(<VoiceInput onText={onText} disabled />)

    const button = screen.getByRole('button', { name: '语音输入 (zh-CN)' })
    expect(button).toBeDisabled()
  })
})
