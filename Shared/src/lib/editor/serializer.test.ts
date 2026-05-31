import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hashString,
  IncrementalSerializer,
  SmartSerializer,
  serializeChunked,
  serializeInIdleFrames,
  LARGE_NOTE_THRESHOLD,
  TipTapDocument,
  TipTapBlockNode,
} from './serializer';

// --- Helpers ---

function makeDoc(blocks: TipTapBlockNode[]): TipTapDocument {
  return { type: 'doc', content: blocks };
}

function makeParagraph(text: string): TipTapBlockNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function makeHeading(text: string, level = 1): TipTapBlockNode {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

function makeLargeBlock(charCount: number): TipTapBlockNode {
  return { type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(charCount) }] };
}

// --- hashString ---

describe('hashString', () => {
  it('returns a number for any string input', () => {
    expect(typeof hashString('hello')).toBe('number');
    expect(typeof hashString('')).toBe('number');
  });

  it('returns the same hash for the same string', () => {
    expect(hashString('test content')).toBe(hashString('test content'));
  });

  it('returns different hashes for different strings', () => {
    expect(hashString('hello')).not.toBe(hashString('world'));
  });

  it('handles empty string', () => {
    expect(hashString('')).toBe(5381); // djb2 initial value
  });

  it('handles unicode characters', () => {
    const hash = hashString('你好世界');
    expect(typeof hash).toBe('number');
    expect(hash).not.toBe(5381);
  });
});

// --- IncrementalSerializer ---

describe('IncrementalSerializer', () => {
  let serializer: IncrementalSerializer;

  beforeEach(() => {
    serializer = new IncrementalSerializer();
  });

  it('serializes a simple document correctly', () => {
    const doc = makeDoc([makeParagraph('hello')]);
    const result = serializer.serialize(doc);

    expect(result.json).toBe(JSON.stringify(doc));
    expect(result.fromCache).toBe(false);
    expect(result.totalBlockCount).toBe(1);
    expect(result.serializedBlockCount).toBe(1);
  });

  it('returns cached result when document has not changed', () => {
    const doc = makeDoc([makeParagraph('hello'), makeParagraph('world')]);

    const first = serializer.serialize(doc);
    const second = serializer.serialize(doc);

    expect(second.json).toBe(first.json);
    expect(second.fromCache).toBe(true);
    expect(second.serializedBlockCount).toBe(0);
  });

  it('only re-serializes changed blocks', () => {
    const doc1 = makeDoc([makeParagraph('hello'), makeParagraph('world')]);
    serializer.serialize(doc1);

    // Change only the second block
    const doc2 = makeDoc([makeParagraph('hello'), makeParagraph('changed')]);
    const result = serializer.serialize(doc2);

    expect(result.fromCache).toBe(false);
    expect(result.serializedBlockCount).toBe(1); // only 1 block changed
    expect(result.totalBlockCount).toBe(2);
    expect(result.json).toBe(JSON.stringify(doc2));
  });

  it('handles blocks being added', () => {
    const doc1 = makeDoc([makeParagraph('hello')]);
    serializer.serialize(doc1);

    const doc2 = makeDoc([makeParagraph('hello'), makeParagraph('new block')]);
    const result = serializer.serialize(doc2);

    expect(result.fromCache).toBe(false);
    expect(result.serializedBlockCount).toBe(1); // only the new block
    expect(result.totalBlockCount).toBe(2);
    expect(result.json).toBe(JSON.stringify(doc2));
  });

  it('handles blocks being removed', () => {
    const doc1 = makeDoc([makeParagraph('a'), makeParagraph('b'), makeParagraph('c')]);
    serializer.serialize(doc1);

    const doc2 = makeDoc([makeParagraph('a'), makeParagraph('c')]);
    const result = serializer.serialize(doc2);

    expect(result.fromCache).toBe(false);
    expect(result.json).toBe(JSON.stringify(doc2));
  });

  it('uses changedIndices to skip unchanged blocks', () => {
    const doc1 = makeDoc([makeParagraph('a'), makeParagraph('b'), makeParagraph('c')]);
    serializer.serialize(doc1);

    // Only index 1 changed
    const doc2 = makeDoc([makeParagraph('a'), makeParagraph('B'), makeParagraph('c')]);
    const result = serializer.serialize(doc2, [1]);

    expect(result.fromCache).toBe(false);
    expect(result.serializedBlockCount).toBe(1);
    expect(result.json).toBe(JSON.stringify(doc2));
  });

  it('handles empty document', () => {
    const doc = makeDoc([]);
    const result = serializer.serialize(doc);

    expect(result.json).toBe('{"type":"doc","content":[]}');
    expect(result.totalBlockCount).toBe(0);
    expect(result.serializedBlockCount).toBe(0);
  });

  it('reset clears the cache', () => {
    const doc = makeDoc([makeParagraph('hello')]);
    serializer.serialize(doc);
    expect(serializer.cacheSize).toBe(1);

    serializer.reset();
    expect(serializer.cacheSize).toBe(0);

    // After reset, all blocks are re-serialized
    const result = serializer.serialize(doc);
    expect(result.fromCache).toBe(false);
    expect(result.serializedBlockCount).toBe(1);
  });

  it('produces valid JSON output', () => {
    const doc = makeDoc([
      makeHeading('Title'),
      makeParagraph('Some content'),
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] },
    ]);
    const result = serializer.serialize(doc);

    const parsed = JSON.parse(result.json);
    expect(parsed.type).toBe('doc');
    expect(parsed.content).toHaveLength(3);
    expect(parsed.content[0].type).toBe('heading');
    expect(parsed.content[1].type).toBe('paragraph');
    expect(parsed.content[2].type).toBe('bulletList');
  });
});

// --- serializeChunked ---

describe('serializeChunked', () => {
  it('serializes a document into chunks per top-level node', () => {
    const doc = makeDoc([makeParagraph('a'), makeParagraph('b')]);
    const result = serializeChunked(doc);

    expect(result.json).toBe(JSON.stringify(doc));
    expect(result.chunkCount).toBe(2);
    expect(result.usedIdleCallback).toBe(false);
  });

  it('handles empty document', () => {
    const doc = makeDoc([]);
    const result = serializeChunked(doc);

    expect(result.json).toBe('{"type":"doc","content":[]}');
    expect(result.chunkCount).toBe(0);
  });

  it('produces identical output to JSON.stringify', () => {
    const doc = makeDoc([
      makeHeading('Test'),
      makeParagraph('Content here'),
      { type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'const x = 1;' }] },
    ]);
    const result = serializeChunked(doc);
    expect(result.json).toBe(JSON.stringify(doc));
  });
});

// --- serializeInIdleFrames ---

describe('serializeInIdleFrames', () => {
  it('falls back to sync serialization when requestIdleCallback is unavailable', () => {
    // In vitest/jsdom, requestIdleCallback is typically not available
    const originalRIC = globalThis.requestIdleCallback;
    // Ensure it's undefined for this test
    (globalThis as unknown as Record<string, unknown>).requestIdleCallback = undefined;

    const doc = makeDoc([makeParagraph('hello'), makeParagraph('world')]);
    const onComplete = vi.fn();

    serializeInIdleFrames(doc, onComplete);

    // Should not be called synchronously (uses setTimeout(0))
    expect(onComplete).not.toHaveBeenCalled();

    // Advance timers
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(onComplete).toHaveBeenCalledTimes(1);
        const result = onComplete.mock.calls[0][0];
        expect(result.json).toBe(JSON.stringify(doc));
        expect(result.chunkCount).toBe(2);
        // Restore
        (globalThis as unknown as Record<string, unknown>).requestIdleCallback = originalRIC;
        resolve();
      }, 10);
    });
  });

  it('can be cancelled before completion', () => {
    const originalRIC = globalThis.requestIdleCallback;
    (globalThis as unknown as Record<string, unknown>).requestIdleCallback = undefined;

    const doc = makeDoc([makeParagraph('hello')]);
    const onComplete = vi.fn();

    const cancel = serializeInIdleFrames(doc, onComplete);
    cancel();

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(onComplete).not.toHaveBeenCalled();
        (globalThis as unknown as Record<string, unknown>).requestIdleCallback = originalRIC;
        resolve();
      }, 10);
    });
  });

  it('uses requestIdleCallback when available', () => {
    const callbacks: Array<(deadline: IdleDeadline) => void> = [];
    const mockRIC = vi.fn((cb: (deadline: IdleDeadline) => void) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    const mockCIC = vi.fn();

    (globalThis as unknown as Record<string, unknown>).requestIdleCallback = mockRIC;
    (globalThis as unknown as Record<string, unknown>).cancelIdleCallback = mockCIC;

    const doc = makeDoc([makeParagraph('a'), makeParagraph('b'), makeParagraph('c')]);
    const onComplete = vi.fn();

    serializeInIdleFrames(doc, onComplete);

    expect(mockRIC).toHaveBeenCalledTimes(1);

    // Simulate idle callback with enough time to process all blocks
    const deadline: IdleDeadline = {
      timeRemaining: () => 50,
      didTimeout: false,
    };
    callbacks[0](deadline);

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.json).toBe(JSON.stringify(doc));
    expect(result.usedIdleCallback).toBe(true);

    // Cleanup
    delete (globalThis as unknown as Record<string, unknown>).requestIdleCallback;
    delete (globalThis as unknown as Record<string, unknown>).cancelIdleCallback;
  });
});

// --- SmartSerializer ---

describe('SmartSerializer', () => {
  let serializer: SmartSerializer;

  beforeEach(() => {
    serializer = new SmartSerializer();
  });

  it('uses incremental caching for normal documents', () => {
    const doc = makeDoc([makeParagraph('hello'), makeParagraph('world')]);

    const result1 = serializer.serializeDocument(doc);
    expect(result1.fromCache).toBe(false);
    expect(result1.json).toBe(JSON.stringify(doc));

    const result2 = serializer.serializeDocument(doc);
    expect(result2.fromCache).toBe(true);
  });

  it('detects large documents correctly', () => {
    // Create a document that exceeds 100KB
    const blocks: TipTapBlockNode[] = [];
    for (let i = 0; i < 20; i++) {
      blocks.push(makeLargeBlock(6000)); // 20 * 6000 = 120KB+
    }
    const doc = makeDoc(blocks);

    expect(serializer.isLargeDocument(doc)).toBe(true);
  });

  it('detects small documents correctly', () => {
    const doc = makeDoc([makeParagraph('small note')]);
    expect(serializer.isLargeDocument(doc)).toBe(false);
  });

  it('serializeDocumentAsync calls onComplete for small documents', () => {
    const doc = makeDoc([makeParagraph('hello')]);
    const onComplete = vi.fn();

    serializer.serializeDocumentAsync(doc, onComplete);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0].json).toBe(JSON.stringify(doc));
  });

  it('reset clears cache and cancels pending operations', () => {
    const doc = makeDoc([makeParagraph('hello')]);
    serializer.serializeDocument(doc);
    expect(serializer.cacheSize).toBe(1);

    serializer.reset();
    expect(serializer.cacheSize).toBe(0);
  });

  it('passes changedIndices to incremental serializer', () => {
    const doc1 = makeDoc([makeParagraph('a'), makeParagraph('b'), makeParagraph('c')]);
    serializer.serializeDocument(doc1);

    const doc2 = makeDoc([makeParagraph('a'), makeParagraph('B'), makeParagraph('c')]);
    const result = serializer.serializeDocument(doc2, [1]);

    expect(result.serializedBlockCount).toBe(1);
    expect(result.json).toBe(JSON.stringify(doc2));
  });
});

// --- LARGE_NOTE_THRESHOLD ---

describe('LARGE_NOTE_THRESHOLD', () => {
  it('is 100KB', () => {
    expect(LARGE_NOTE_THRESHOLD).toBe(100 * 1024);
  });
});
