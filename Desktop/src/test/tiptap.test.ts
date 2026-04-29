import { describe, it, expect } from 'vitest'
import { extractText, extractTags, getPreview, wordCount, searchNotes, extractPlainText } from '@notepro/shared'

describe('TipTap Utils', () => {
  const sampleTipTapContent = JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '这是第一段文字，包含#工作 和#灵感 标签' }
        ]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '第二段内容，有一些#代码 内容' }
        ]
      }
    ]
  })

  describe('extractText', () => {
    it('should extract plain text from TipTap JSON', () => {
      const text = extractText(sampleTipTapContent)
      expect(text).toContain('这是第一段文字')
      expect(text).toContain('第二段内容')
    })

    it('should return empty string for invalid JSON', () => {
      const text = extractText('invalid json')
      expect(text).toBe('')
    })

    it('should return empty string for empty content', () => {
      const text = extractText('')
      expect(text).toBe('')
    })
  })

  describe('extractTags', () => {
    it('should extract all tags from content', () => {
      const tags = extractTags(sampleTipTapContent)
      expect(tags).toContain('工作')
      expect(tags).toContain('灵感')
      expect(tags).toContain('代码')
    })

    it('should return empty array for invalid JSON', () => {
      const tags = extractTags('invalid')
      expect(tags).toEqual([])
    })

    it('should not extract partial tags', () => {
      const content = JSON.stringify({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '#测试 #测试用例' }] }
        ]
      })
      const tags = extractTags(content)
      expect(tags).toContain('测试')
      expect(tags).toContain('测试用例')
    })
  })

  describe('getPreview', () => {
    it('should extract preview text up to maxLength', () => {
      const preview = getPreview(sampleTipTapContent, 20)
      expect(preview.length).toBeLessThanOrEqual(20)
      expect(preview).toContain('这是第一段')
    })

    it('should use default maxLength of 80', () => {
      const preview = getPreview(sampleTipTapContent)
      expect(preview.length).toBeLessThanOrEqual(80)
    })

    it('should return empty string for invalid JSON', () => {
      const preview = getPreview('invalid')
      expect(preview).toBe('')
    })
  })

  describe('wordCount', () => {
    it('should count words correctly', () => {
      const count = wordCount(sampleTipTapContent)
      expect(count).toBeGreaterThan(0)
    })

    it('should return 0 for invalid JSON', () => {
      const count = wordCount('invalid')
      expect(count).toBe(0)
    })

    it('should not count whitespace', () => {
      const content = JSON.stringify({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'a b c' }] }
        ]
      })
      const count = wordCount(content)
      expect(count).toBe(3)
    })
  })

  describe('searchNotes', () => {
    it('should find matching text', () => {
      const found = searchNotes(sampleTipTapContent, '第一段')
      expect(found).toBe(true)
    })

    it('should be case insensitive', () => {
      const found = searchNotes(sampleTipTapContent, '第一段文字')
      expect(found).toBe(true)
    })

    it('should return false for non-matching text', () => {
      const found = searchNotes(sampleTipTapContent, '不存在的内容')
      expect(found).toBe(false)
    })

    it('should return false for invalid JSON', () => {
      const found = searchNotes('invalid', 'test')
      expect(found).toBe(false)
    })
  })

  describe('extractPlainText', () => {
    it('should extract text with newlines', () => {
      const text = extractPlainText(sampleTipTapContent)
      expect(text).toContain('\n')
    })

    it('should return empty string for invalid JSON', () => {
      const text = extractPlainText('invalid')
      expect(text).toBe('')
    })
  })
})