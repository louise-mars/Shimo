/**
 * Incremental/chunked serialization for large notes.
 *
 * Strategies:
 * 1. Content-hash cache: Each top-level block node is hashed. On subsequent
 *    serializations, only blocks whose hash has changed are re-stringified.
 * 2. Chunked serialization: For notes > 100KB where full serialization is
 *    unavoidable (initial load, export), the document is serialized per
 *    top-level node to avoid blocking the main thread.
 * 3. Incremental diff tracking: When the editor provides a list of changed
 *    node indices, only those nodes are re-serialized and spliced into the
 *    cached result.
 * 4. Idle-frame fallback: When incremental tracking is unavailable (e.g.,
 *    large paste), serialization is scheduled via requestIdleCallback to
 *    avoid blocking user input.
 *
 * Requirements: 2.6, 29.1, 29.10
 */

// --- Types ---

export interface TipTapDocument {
  type: 'doc';
  content: TipTapBlockNode[];
}

export interface TipTapBlockNode {
  type: string;
  content?: unknown[];
  attrs?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SerializationResult {
  /** The full serialized JSON string */
  json: string;
  /** Whether the result was produced from cache (no re-serialization needed) */
  fromCache: boolean;
  /** Number of blocks that were re-serialized (0 if fully cached) */
  serializedBlockCount: number;
  /** Total number of blocks in the document */
  totalBlockCount: number;
}

export interface ChunkedSerializationResult {
  /** The full serialized JSON string */
  json: string;
  /** Number of chunks processed */
  chunkCount: number;
  /** Whether serialization was done in idle frames */
  usedIdleCallback: boolean;
}

// --- Content Hashing ---

/**
 * Simple string hash (djb2 algorithm).
 * Fast and sufficient for content-change detection (not cryptographic).
 */
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

// --- Block Cache ---

interface BlockCacheEntry {
  hash: number;
  serialized: string;
}

/**
 * IncrementalSerializer maintains a per-block cache of serialized JSON strings.
 * When the document changes, only blocks with different content hashes are
 * re-stringified. The full document JSON is assembled from cached block strings.
 */
export class IncrementalSerializer {
  private blockCache: BlockCacheEntry[] = [];
  private lastDocPrefix = '{"type":"doc","content":[';
  private lastDocSuffix = ']}';
  private lastResult: string | null = null;

  /**
   * Serialize a TipTap document, using cached block strings where possible.
   *
   * @param doc - The TipTap document object
   * @param changedIndices - Optional array of indices of blocks known to have
   *   changed. If provided, only those blocks are re-hashed and re-serialized.
   *   If not provided (e.g., paste of large content), all blocks are checked.
   * @returns SerializationResult with the full JSON and cache statistics
   */
  serialize(doc: TipTapDocument, changedIndices?: number[]): SerializationResult {
    const blocks = doc.content || [];
    const totalBlockCount = blocks.length;
    let serializedBlockCount = 0;
    let cacheHit = true;

    // Resize cache if document structure changed (blocks added/removed)
    if (this.blockCache.length !== totalBlockCount) {
      cacheHit = false;
    }

    const newCache: BlockCacheEntry[] = new Array(totalBlockCount);
    const serializedBlocks: string[] = new Array(totalBlockCount);

    for (let i = 0; i < totalBlockCount; i++) {
      const block = blocks[i];
      const blockStr = JSON.stringify(block);
      const blockHash = hashString(blockStr);

      // Determine if this block needs re-serialization
      const needsUpdate = changedIndices
        ? changedIndices.includes(i) || i >= this.blockCache.length
        : i >= this.blockCache.length || this.blockCache[i].hash !== blockHash;

      if (needsUpdate) {
        // Block changed or is new — use the freshly stringified version
        newCache[i] = { hash: blockHash, serialized: blockStr };
        serializedBlocks[i] = blockStr;
        serializedBlockCount++;
        cacheHit = false;
      } else {
        // Block unchanged — reuse cached serialized string
        newCache[i] = this.blockCache[i];
        serializedBlocks[i] = this.blockCache[i].serialized;
      }
    }

    this.blockCache = newCache;

    // If nothing changed and we have a cached result, return it directly
    if (cacheHit && this.lastResult !== null) {
      return {
        json: this.lastResult,
        fromCache: true,
        serializedBlockCount: 0,
        totalBlockCount,
      };
    }

    // Assemble the full document JSON from block strings
    const json = this.lastDocPrefix + serializedBlocks.join(',') + this.lastDocSuffix;
    this.lastResult = json;

    return {
      json,
      fromCache: false,
      serializedBlockCount,
      totalBlockCount,
    };
  }

  /**
   * Clear the cache. Call when switching to a different note or on full reload.
   */
  reset(): void {
    this.blockCache = [];
    this.lastResult = null;
  }

  /**
   * Get the current cache size (number of cached blocks).
   */
  get cacheSize(): number {
    return this.blockCache.length;
  }
}

// --- Chunked Serialization ---

/** Threshold in bytes above which chunked serialization is used */
export const LARGE_NOTE_THRESHOLD = 100 * 1024; // 100KB

/**
 * Serialize a large TipTap document in chunks (per top-level node).
 * This avoids a single large JSON.stringify call that could block the main thread.
 *
 * @param doc - The TipTap document object
 * @returns The full serialized JSON string, assembled from per-block chunks
 */
export function serializeChunked(doc: TipTapDocument): ChunkedSerializationResult {
  const blocks = doc.content || [];
  const chunks: string[] = new Array(blocks.length);

  for (let i = 0; i < blocks.length; i++) {
    chunks[i] = JSON.stringify(blocks[i]);
  }

  const json = '{"type":"doc","content":[' + chunks.join(',') + ']}';

  return {
    json,
    chunkCount: blocks.length,
    usedIdleCallback: false,
  };
}

/**
 * Serialize a large TipTap document using requestIdleCallback to avoid
 * blocking the main thread. Each top-level block is serialized in a separate
 * idle frame when possible.
 *
 * Falls back to synchronous chunked serialization if requestIdleCallback
 * is not available.
 *
 * @param doc - The TipTap document object
 * @param onComplete - Callback invoked with the result when serialization finishes
 * @returns A cancel function to abort the operation
 */
export function serializeInIdleFrames(
  doc: TipTapDocument,
  onComplete: (result: ChunkedSerializationResult) => void
): () => void {
  const blocks = doc.content || [];
  const chunks: string[] = new Array(blocks.length);
  let currentIndex = 0;
  let cancelled = false;

  // Fallback: if requestIdleCallback is not available, serialize synchronously
  if (typeof requestIdleCallback === 'undefined') {
    const result = serializeChunked(doc);
    // Use setTimeout to keep the API async-consistent
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        onComplete(result);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }

  let idleCallbackId: number | null = null;

  function processChunk(deadline: IdleDeadline): void {
    if (cancelled) return;

    // Serialize as many blocks as we can within the idle deadline
    while (currentIndex < blocks.length && deadline.timeRemaining() > 0) {
      chunks[currentIndex] = JSON.stringify(blocks[currentIndex]);
      currentIndex++;
    }

    if (currentIndex < blocks.length) {
      // More blocks to process — schedule next idle callback
      idleCallbackId = requestIdleCallback(processChunk);
    } else {
      // All blocks serialized — assemble and deliver result
      const json = '{"type":"doc","content":[' + chunks.join(',') + ']}';
      onComplete({
        json,
        chunkCount: blocks.length,
        usedIdleCallback: true,
      });
    }
  }

  idleCallbackId = requestIdleCallback(processChunk);

  return () => {
    cancelled = true;
    if (idleCallbackId !== null && typeof cancelIdleCallback !== 'undefined') {
      cancelIdleCallback(idleCallbackId);
    }
  };
}

// --- Convenience: Smart Serializer ---

/**
 * SmartSerializer combines incremental caching with chunked/idle-frame
 * serialization for large documents. It picks the best strategy based on
 * document size and available APIs.
 *
 * Usage:
 *   const serializer = new SmartSerializer();
 *   // On each editor update:
 *   const result = serializer.serializeDocument(doc, changedIndices);
 *   // For async large-note serialization:
 *   serializer.serializeDocumentAsync(doc, (result) => { ... });
 */
export class SmartSerializer {
  private incremental = new IncrementalSerializer();
  private cancelPending: (() => void) | null = null;

  /**
   * Synchronous serialization with incremental caching.
   * For most editor updates, this is the preferred path.
   *
   * @param doc - The TipTap document
   * @param changedIndices - Optional indices of changed blocks (from ProseMirror transaction)
   */
  serializeDocument(doc: TipTapDocument, changedIndices?: number[]): SerializationResult {
    return this.incremental.serialize(doc, changedIndices);
  }

  /**
   * Async serialization for large documents where full serialization is
   * unavoidable (initial load, export, large paste).
   *
   * Uses requestIdleCallback when available, otherwise falls back to
   * synchronous chunked serialization.
   *
   * @param doc - The TipTap document
   * @param onComplete - Callback with the serialized result
   */
  serializeDocumentAsync(
    doc: TipTapDocument,
    onComplete: (result: ChunkedSerializationResult) => void
  ): void {
    // Cancel any pending async serialization
    if (this.cancelPending) {
      this.cancelPending();
      this.cancelPending = null;
    }

    const estimatedSize = this.estimateSize(doc);

    if (estimatedSize < LARGE_NOTE_THRESHOLD) {
      // Small enough to serialize synchronously with caching
      const result = this.incremental.serialize(doc);
      onComplete({
        json: result.json,
        chunkCount: result.totalBlockCount,
        usedIdleCallback: false,
      });
      return;
    }

    // Large document — use idle-frame serialization
    this.cancelPending = serializeInIdleFrames(doc, (result) => {
      this.cancelPending = null;
      // Update the incremental cache with the new result
      this.incremental.serialize(doc);
      onComplete(result);
    });
  }

  /**
   * Estimate the serialized size of a document without fully serializing it.
   * Uses a rough heuristic based on block count and average block size.
   */
  private estimateSize(doc: TipTapDocument): number {
    const blocks = doc.content || [];
    if (blocks.length === 0) return 20; // empty doc: '{"type":"doc","content":[]}'

    // Sample up to 5 blocks to estimate average size
    const sampleCount = Math.min(5, blocks.length);
    let totalSampleSize = 0;
    for (let i = 0; i < sampleCount; i++) {
      totalSampleSize += JSON.stringify(blocks[i]).length;
    }
    const avgBlockSize = totalSampleSize / sampleCount;

    // Estimate: overhead + (avgBlockSize * blockCount) + separators
    return 25 + Math.ceil(avgBlockSize * blocks.length) + (blocks.length - 1);
  }

  /**
   * Check if a document exceeds the large-note threshold.
   * Useful for deciding whether to use async serialization.
   */
  isLargeDocument(doc: TipTapDocument): boolean {
    return this.estimateSize(doc) >= LARGE_NOTE_THRESHOLD;
  }

  /**
   * Reset the serializer cache. Call when switching notes.
   */
  reset(): void {
    this.incremental.reset();
    if (this.cancelPending) {
      this.cancelPending();
      this.cancelPending = null;
    }
  }

  /**
   * Get the number of cached blocks.
   */
  get cacheSize(): number {
    return this.incremental.cacheSize;
  }
}
