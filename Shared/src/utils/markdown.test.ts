import { describe, it, expect } from 'vitest'
import { importMarkdownToNote, parseMarkdown, noteToMarkdown } from './markdown'

describe('parseMarkdown', () => {
  describe('title extraction', () => {
    it('extracts title from first H1 heading', () => {
      const result = parseMarkdown('# My Title\n\nSome content')
      expect(result.title).toBe('My Title')
    })

    it('uses first non-empty line as title when no heading', () => {
      const result = parseMarkdown('My Title\n\nSome content')
      expect(result.title).toBe('My Title')
    })

    it('returns empty title for empty input', () => {
      const result = parseMarkdown('')
      expect(result.title).toBe('')
    })
  })

  describe('tag extraction', () => {
    it('extracts tags from Tags: line with #tag format', () => {
      const result = parseMarkdown('# Title\n\nTags: #work #project #ideas\n\nContent')
      expect(result.tags).toEqual(['work', 'project', 'ideas'])
    })

    it('extracts tags from 标签: line with #tag format', () => {
      const result = parseMarkdown('# Title\n\n标签: #工作 #项目\n\nContent')
      expect(result.tags).toEqual(['工作', '项目'])
    })

    it('extracts tags from comma-separated format', () => {
      const result = parseMarkdown('# Title\n\nTags: work, project, ideas\n\nContent')
      expect(result.tags).toEqual(['work', 'project', 'ideas'])
    })

    it('extracts tags from Chinese comma-separated format', () => {
      const result = parseMarkdown('# Title\n\n标签：工作，项目，想法\n\nContent')
      expect(result.tags).toEqual(['工作', '项目', '想法'])
    })

    it('returns empty tags when no Tags line', () => {
      const result = parseMarkdown('# Title\n\nJust content')
      expect(result.tags).toEqual([])
    })
  })

  describe('heading parsing', () => {
    it('parses H1 heading', () => {
      const result = parseMarkdown('Title line\n\n# Heading 1')
      const doc = JSON.parse(result.content)
      expect(doc.content[0]).toEqual({
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Heading 1' }],
      })
    })

    it('parses H2 heading', () => {
      const result = parseMarkdown('Title\n\n## Heading 2')
      const doc = JSON.parse(result.content)
      expect(doc.content[0]).toEqual({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Heading 2' }],
      })
    })

    it('parses H3 heading', () => {
      const result = parseMarkdown('Title\n\n### Heading 3')
      const doc = JSON.parse(result.content)
      expect(doc.content[0]).toEqual({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Heading 3' }],
      })
    })
  })

  describe('paragraph parsing', () => {
    it('parses a simple paragraph', () => {
      const result = parseMarkdown('Title\n\nHello world')
      const doc = JSON.parse(result.content)
      expect(doc.content[0]).toEqual({
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello world' }],
      })
    })

    it('joins consecutive lines into one paragraph', () => {
      const result = parseMarkdown('Title\n\nLine one\nLine two')
      const doc = JSON.parse(result.content)
      expect(doc.content[0]).toEqual({
        type: 'paragraph',
        content: [{ type: 'text', text: 'Line one Line two' }],
      })
    })
  })

  describe('bullet list parsing', () => {
    it('parses bullet list with - prefix', () => {
      const result = parseMarkdown('Title\n\n- Item 1\n- Item 2\n- Item 3')
      const doc = JSON.parse(result.content)
      expect(doc.content[0].type).toBe('bulletList')
      expect(doc.content[0].content).toHaveLength(3)
      expect(doc.content[0].content[0]).toEqual({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }],
      })
    })

    it('parses bullet list with * prefix', () => {
      const result = parseMarkdown('Title\n\n* Item A\n* Item B')
      const doc = JSON.parse(result.content)
      expect(doc.content[0].type).toBe('bulletList')
      expect(doc.content[0].content).toHaveLength(2)
    })
  })

  describe('ordered list parsing', () => {
    it('parses ordered list', () => {
      const result = parseMarkdown('Title\n\n1. First\n2. Second\n3. Third')
      const doc = JSON.parse(result.content)
      expect(doc.content[0].type).toBe('orderedList')
      expect(doc.content[0].content).toHaveLength(3)
      expect(doc.content[0].content[0]).toEqual({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }],
      })
    })
  })

  describe('task list parsing', () => {
    it('parses unchecked task items', () => {
      const result = parseMarkdown('Title\n\n- [ ] Todo 1\n- [ ] Todo 2')
      const doc = JSON.parse(result.content)
      expect(doc.content[0].type).toBe('taskList')
      expect(doc.content[0].content[0]).toEqual({
        type: 'taskItem',
        attrs: { checked: false },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Todo 1' }] }],
      })
    })

    it('parses checked task items', () => {
      const result = parseMarkdown('Title\n\n- [x] Done 1\n- [ ] Todo 2')
      const doc = JSON.parse(result.content)
      expect(doc.content[0].content[0].attrs.checked).toBe(true)
      expect(doc.content[0].content[1].attrs.checked).toBe(false)
    })
  })

  describe('blockquote parsing', () => {
    it('parses single-line blockquote', () => {
      const result = parseMarkdown('Title\n\n> This is a quote')
      const doc = JSON.parse(result.content)
      expect(doc.content[0].type).toBe('blockquote')
      expect(doc.content[0].content[0]).toEqual({
        type: 'paragraph',
        content: [{ type: 'text', text: 'This is a quote' }],
      })
    })

    it('parses multi-line blockquote', () => {
      const result = parseMarkdown('Title\n\n> Line 1\n> Line 2')
      const doc = JSON.parse(result.content)
      expect(doc.content[0].type).toBe('blockquote')
      expect(doc.content[0].content).toHaveLength(2)
    })
  })

  describe('code block parsing', () => {
    it('parses code block with language', () => {
      const result = parseMarkdown('Title\n\n```typescript\nconst x = 1;\n```')
      const doc = JSON.parse(result.content)
      expect(doc.content[0]).toEqual({
        type: 'codeBlock',
        attrs: { language: 'typescript' },
        content: [{ type: 'text', text: 'const x = 1;' }],
      })
    })

    it('parses code block without language', () => {
      const result = parseMarkdown('Title\n\n```\nsome code\n```')
      const doc = JSON.parse(result.content)
      expect(doc.content[0].attrs.language).toBe('')
    })

    it('parses multi-line code block', () => {
      const result = parseMarkdown('Title\n\n```js\nline1\nline2\nline3\n```')
      const doc = JSON.parse(result.content)
      expect(doc.content[0].content[0].text).toBe('line1\nline2\nline3')
    })
  })

  describe('horizontal rule parsing', () => {
    it('parses --- as horizontal rule', () => {
      const result = parseMarkdown('Title\n\n---')
      const doc = JSON.parse(result.content)
      expect(doc.content[0]).toEqual({ type: 'horizontalRule' })
    })

    it('parses *** as horizontal rule', () => {
      const result = parseMarkdown('Title\n\n***')
      const doc = JSON.parse(result.content)
      expect(doc.content[0]).toEqual({ type: 'horizontalRule' })
    })

    it('parses ___ as horizontal rule', () => {
      const result = parseMarkdown('Title\n\n___')
      const doc = JSON.parse(result.content)
      expect(doc.content[0]).toEqual({ type: 'horizontalRule' })
    })
  })

  describe('image parsing', () => {
    it('parses image with alt text', () => {
      const result = parseMarkdown('Title\n\n![My Image](https://example.com/img.png)')
      const doc = JSON.parse(result.content)
      expect(doc.content[0]).toEqual({
        type: 'image',
        attrs: { src: 'https://example.com/img.png', alt: 'My Image' },
      })
    })

    it('parses image without alt text', () => {
      const result = parseMarkdown('Title\n\n![](./local/image.jpg)')
      const doc = JSON.parse(result.content)
      expect(doc.content[0]).toEqual({
        type: 'image',
        attrs: { src: './local/image.jpg' },
      })
    })
  })

  describe('inline marks', () => {
    it('parses bold text', () => {
      const result = parseMarkdown('Title\n\nThis is **bold** text')
      const doc = JSON.parse(result.content)
      const para = doc.content[0]
      expect(para.content).toEqual([
        { type: 'text', text: 'This is ' },
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' text' },
      ])
    })

    it('parses italic text', () => {
      const result = parseMarkdown('Title\n\nThis is *italic* text')
      const doc = JSON.parse(result.content)
      const para = doc.content[0]
      expect(para.content).toEqual([
        { type: 'text', text: 'This is ' },
        { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
        { type: 'text', text: ' text' },
      ])
    })

    it('parses inline code', () => {
      const result = parseMarkdown('Title\n\nUse `console.log` here')
      const doc = JSON.parse(result.content)
      const para = doc.content[0]
      expect(para.content).toEqual([
        { type: 'text', text: 'Use ' },
        { type: 'text', text: 'console.log', marks: [{ type: 'code' }] },
        { type: 'text', text: ' here' },
      ])
    })

    it('parses strikethrough text', () => {
      const result = parseMarkdown('Title\n\nThis is ~~deleted~~ text')
      const doc = JSON.parse(result.content)
      const para = doc.content[0]
      expect(para.content).toEqual([
        { type: 'text', text: 'This is ' },
        { type: 'text', text: 'deleted', marks: [{ type: 'strike' }] },
        { type: 'text', text: ' text' },
      ])
    })

    it('parses multiple inline marks in one line', () => {
      const result = parseMarkdown('Title\n\n**bold** and *italic* and `code`')
      const doc = JSON.parse(result.content)
      const para = doc.content[0]
      expect(para.content).toEqual([
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' and ' },
        { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
        { type: 'text', text: ' and ' },
        { type: 'text', text: 'code', marks: [{ type: 'code' }] },
      ])
    })

    it('parses inline marks in headings', () => {
      const result = parseMarkdown('Title\n\n## A **bold** heading')
      const doc = JSON.parse(result.content)
      expect(doc.content[0].content).toEqual([
        { type: 'text', text: 'A ' },
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' heading' },
      ])
    })

    it('parses inline marks in list items', () => {
      const result = parseMarkdown('Title\n\n- A **bold** item')
      const doc = JSON.parse(result.content)
      const listItem = doc.content[0].content[0]
      expect(listItem.content[0].content).toEqual([
        { type: 'text', text: 'A ' },
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' item' },
      ])
    })
  })

  describe('TipTap JSON structure', () => {
    it('produces valid doc wrapper', () => {
      const result = parseMarkdown('# Title\n\nContent')
      const doc = JSON.parse(result.content)
      expect(doc.type).toBe('doc')
      expect(Array.isArray(doc.content)).toBe(true)
    })

    it('produces empty doc for empty body', () => {
      const result = parseMarkdown('# Title')
      const doc = JSON.parse(result.content)
      expect(doc).toEqual({ type: 'doc', content: [] })
    })
  })

  describe('complex documents', () => {
    it('parses a full document with mixed content', () => {
      const md = `# My Note

Tags: #work #important

## Introduction

This is a **bold** statement.

- Item 1
- Item 2

1. First
2. Second

> A wise quote

\`\`\`python
print("hello")
\`\`\`

---

![photo](./photo.png)`

      const result = parseMarkdown(md)
      expect(result.title).toBe('My Note')
      expect(result.tags).toEqual(['work', 'important'])

      const doc = JSON.parse(result.content)
      expect(doc.type).toBe('doc')

      // Verify we have all the expected node types
      const types = doc.content.map((n: { type: string }) => n.type)
      expect(types).toContain('heading')
      expect(types).toContain('paragraph')
      expect(types).toContain('bulletList')
      expect(types).toContain('orderedList')
      expect(types).toContain('blockquote')
      expect(types).toContain('codeBlock')
      expect(types).toContain('horizontalRule')
      expect(types).toContain('image')
    })
  })
})

describe('noteToMarkdown', () => {
  function makeNote(content: object, title = '', tags: string[] = []) {
    return {
      id: 'test-id',
      title,
      content: JSON.stringify(content),
      tags,
      folderId: null,
      pinned: false,
      favorited: false,
      locked: false,
      hidden: false,
      deletedAt: null,
      createdAt: 0,
      updatedAt: 0,
    }
  }

  describe('note metadata', () => {
    it('includes title as H1 heading', () => {
      const note = makeNote({ type: 'doc', content: [] }, 'My Title')
      const md = noteToMarkdown(note)
      expect(md).toMatch(/^# My Title\n/)
    })

    it('includes tags line', () => {
      const note = makeNote({ type: 'doc', content: [] }, 'Title', ['work', 'ideas'])
      const md = noteToMarkdown(note)
      expect(md).toContain('Tags: #work #ideas')
    })

    it('omits title line when title is empty', () => {
      const note = makeNote({ type: 'doc', content: [] }, '')
      const md = noteToMarkdown(note)
      expect(md).not.toMatch(/^#/)
    })

    it('omits tags line when no tags', () => {
      const note = makeNote({ type: 'doc', content: [] }, 'Title', [])
      const md = noteToMarkdown(note)
      expect(md).not.toContain('Tags:')
    })
  })

  describe('headings', () => {
    it('renders H1', () => {
      const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Heading One' }] }] }
      const note = makeNote(doc)
      expect(noteToMarkdown(note)).toContain('# Heading One')
    })

    it('renders H2', () => {
      const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading Two' }] }] }
      const note = makeNote(doc)
      expect(noteToMarkdown(note)).toContain('## Heading Two')
    })

    it('renders H3', () => {
      const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Heading Three' }] }] }
      const note = makeNote(doc)
      expect(noteToMarkdown(note)).toContain('### Heading Three')
    })

    it('renders heading with inline marks', () => {
      const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'A ' }, { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }, { type: 'text', text: ' heading' }] }] }
      const note = makeNote(doc)
      expect(noteToMarkdown(note)).toContain('## A **bold** heading')
    })
  })

  describe('paragraphs', () => {
    it('renders a simple paragraph', () => {
      const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }] }
      const note = makeNote(doc)
      expect(noteToMarkdown(note)).toContain('Hello world')
    })

    it('renders multiple paragraphs separated by blank lines', () => {
      const doc = { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('First\n\nSecond')
    })
  })

  describe('bullet lists', () => {
    it('renders bullet list items', () => {
      const doc = { type: 'doc', content: [{ type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] }] },
      ] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('- Item 1\n- Item 2')
    })

    it('renders nested bullet lists with indentation', () => {
      const doc = { type: 'doc', content: [{ type: 'bulletList', content: [
        { type: 'listItem', content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] },
          { type: 'bulletList', content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Child' }] }] },
          ] },
        ] },
      ] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('- Parent\n  - Child')
    })
  })

  describe('ordered lists', () => {
    it('renders ordered list with numbers', () => {
      const doc = { type: 'doc', content: [{ type: 'orderedList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Third' }] }] },
      ] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('1. First\n2. Second\n3. Third')
    })
  })

  describe('task lists', () => {
    it('renders unchecked task items', () => {
      const doc = { type: 'doc', content: [{ type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Todo 1' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Todo 2' }] }] },
      ] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('- [ ] Todo 1\n- [ ] Todo 2')
    })

    it('renders checked task items', () => {
      const doc = { type: 'doc', content: [{ type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Done' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Not done' }] }] },
      ] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('- [x] Done\n- [ ] Not done')
    })
  })

  describe('blockquotes', () => {
    it('renders single-line blockquote', () => {
      const doc = { type: 'doc', content: [{ type: 'blockquote', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A quote' }] },
      ] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('> A quote')
    })

    it('renders multi-paragraph blockquote', () => {
      const doc = { type: 'doc', content: [{ type: 'blockquote', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Line 1' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Line 2' }] },
      ] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('> Line 1')
      expect(md).toContain('> Line 2')
    })
  })

  describe('code blocks', () => {
    it('renders code block with language', () => {
      const doc = { type: 'doc', content: [{ type: 'codeBlock', attrs: { language: 'typescript' }, content: [{ type: 'text', text: 'const x = 1;' }] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('```typescript\nconst x = 1;\n```')
    })

    it('renders code block without language', () => {
      const doc = { type: 'doc', content: [{ type: 'codeBlock', attrs: { language: '' }, content: [{ type: 'text', text: 'some code' }] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('```\nsome code\n```')
    })

    it('renders multi-line code block', () => {
      const doc = { type: 'doc', content: [{ type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'line1\nline2\nline3' }] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('```js\nline1\nline2\nline3\n```')
    })
  })

  describe('horizontal rules', () => {
    it('renders horizontal rule', () => {
      const doc = { type: 'doc', content: [{ type: 'horizontalRule' }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('---')
    })
  })

  describe('images', () => {
    it('renders image with alt text', () => {
      const doc = { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://example.com/img.png', alt: 'My Image' } }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('![My Image](https://example.com/img.png)')
    })

    it('renders image without alt text', () => {
      const doc = { type: 'doc', content: [{ type: 'image', attrs: { src: './local/image.jpg', alt: '' } }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('![](./local/image.jpg)')
    })
  })

  describe('hard breaks', () => {
    it('renders hard break as newline within paragraph', () => {
      const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'Line 1' },
        { type: 'hardBreak' },
        { type: 'text', text: 'Line 2' },
      ] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('Line 1\nLine 2')
    })
  })

  describe('inline marks', () => {
    it('renders bold text', () => {
      const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'This is ' },
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' text' },
      ] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('This is **bold** text')
    })

    it('renders italic text', () => {
      const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'This is ' },
        { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
        { type: 'text', text: ' text' },
      ] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('This is *italic* text')
    })

    it('renders strikethrough text', () => {
      const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'This is ' },
        { type: 'text', text: 'deleted', marks: [{ type: 'strike' }] },
        { type: 'text', text: ' text' },
      ] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('This is ~~deleted~~ text')
    })

    it('renders inline code', () => {
      const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'Use ' },
        { type: 'text', text: 'console.log', marks: [{ type: 'code' }] },
        { type: 'text', text: ' here' },
      ] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('Use `console.log` here')
    })

    it('renders multiple marks in one paragraph', () => {
      const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' and ' },
        { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
      ] }] }
      const note = makeNote(doc)
      const md = noteToMarkdown(note)
      expect(md).toContain('**bold** and *italic*')
    })
  })

  describe('complex documents', () => {
    it('renders a full document with mixed content', () => {
      const doc = { type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Introduction' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'A ' }, { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }, { type: 'text', text: ' statement.' }] },
        { type: 'bulletList', content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] }] },
        ] },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A wise quote' }] }] },
        { type: 'codeBlock', attrs: { language: 'python' }, content: [{ type: 'text', text: 'print("hello")' }] },
        { type: 'horizontalRule' },
        { type: 'image', attrs: { src: './photo.png', alt: 'photo' } },
      ] }
      const note = makeNote(doc, 'My Note', ['work', 'important'])
      const md = noteToMarkdown(note)

      expect(md).toContain('# My Note')
      expect(md).toContain('Tags: #work #important')
      expect(md).toContain('## Introduction')
      expect(md).toContain('A **bold** statement.')
      expect(md).toContain('- Item 1\n- Item 2')
      expect(md).toContain('> A wise quote')
      expect(md).toContain('```python\nprint("hello")\n```')
      expect(md).toContain('---')
      expect(md).toContain('![photo](./photo.png)')
    })

    it('handles empty content gracefully', () => {
      const note = makeNote({ type: 'doc', content: [] }, 'Empty Note')
      const md = noteToMarkdown(note)
      expect(md).toContain('# Empty Note')
    })

    it('handles invalid JSON content gracefully', () => {
      const note = {
        id: 'test-id',
        title: 'Bad Content',
        content: 'not valid json{{{',
        tags: [],
        folderId: null,
        pinned: false,
        favorited: false,
        locked: false,
        hidden: false,
        deletedAt: null,
        createdAt: 0,
        updatedAt: 0,
      }
      const md = noteToMarkdown(note)
      expect(md).toContain('# Bad Content')
      // Should not throw
    })

    it('handles null/empty content', () => {
      const note = {
        id: 'test-id',
        title: 'No Content',
        content: '',
        tags: [],
        folderId: null,
        pinned: false,
        favorited: false,
        locked: false,
        hidden: false,
        deletedAt: null,
        createdAt: 0,
        updatedAt: 0,
      }
      const md = noteToMarkdown(note)
      expect(md).toContain('# No Content')
    })
  })
})

describe('importMarkdownToNote', () => {
  it('returns a complete Note object', () => {
    const note = importMarkdownToNote('# Test Note\n\nTags: #tag1 #tag2\n\nContent here')
    expect(note.id).toBeDefined()
    expect(note.title).toBe('Test Note')
    expect(note.tags).toEqual(['tag1', 'tag2'])
    expect(note.content).toBeDefined()
    expect(note.folderId).toBeNull()
    expect(note.pinned).toBe(false)
    expect(note.favorited).toBe(false)
    expect(note.locked).toBe(false)
    expect(note.hidden).toBe(false)
    expect(note.deletedAt).toBeNull()
    expect(note.createdAt).toBeGreaterThan(0)
    expect(note.updatedAt).toBeGreaterThan(0)
  })

  it('assigns folderId when provided', () => {
    const note = importMarkdownToNote('# Test\n\nContent', 'folder-123')
    expect(note.folderId).toBe('folder-123')
  })

  it('generates unique IDs for each import', () => {
    const note1 = importMarkdownToNote('# Note 1')
    const note2 = importMarkdownToNote('# Note 2')
    expect(note1.id).not.toBe(note2.id)
  })

  it('parses content as valid JSON', () => {
    const note = importMarkdownToNote('# Title\n\nSome paragraph')
    const doc = JSON.parse(note.content)
    expect(doc.type).toBe('doc')
    expect(doc.content[0].type).toBe('paragraph')
  })
})
