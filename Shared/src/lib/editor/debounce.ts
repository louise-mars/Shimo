/**
 * Adaptive debounce computation for editor saves.
 *
 * Determines the debounce interval based on content complexity:
 * - Base: 500ms
 * - Character count > 10000: multiply by 1.5x
 * - More than 5 image nodes: multiply by 1.5x
 * - Any table nodes present: multiply by 1.5x
 * - All multipliers stack
 * - Capped at 3000ms maximum
 *
 * The content is expected to be stringified TipTap JSON.
 * Falls back to base debounce if parsing fails.
 */

const BASE_DEBOUNCE_MS = 500;
const SCALING_FACTOR = 1.5;
const MAX_DEBOUNCE_MS = 3000;
const CHAR_COUNT_THRESHOLD = 10000;
const IMAGE_COUNT_THRESHOLD = 5;

interface TipTapNode {
  type?: string;
  content?: TipTapNode[];
  [key: string]: unknown;
}

/**
 * Recursively count nodes of a given type in a TipTap document tree.
 */
function countNodesByType(node: TipTapNode, type: string): number {
  let count = 0;
  if (node.type === type) {
    count++;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      count += countNodesByType(child, type);
    }
  }
  return count;
}

/**
 * Check if a TipTap document tree contains any node of the given type.
 */
function hasNodeOfType(node: TipTapNode, type: string): boolean {
  if (node.type === type) {
    return true;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (hasNodeOfType(child, type)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Compute the debounce interval in milliseconds based on content complexity.
 *
 * @param content - Stringified TipTap JSON document
 * @returns Debounce interval in milliseconds (500–3000)
 */
export function computeDebounceMs(content: string): number {
  let debounce = BASE_DEBOUNCE_MS;

  // Character count complexity
  if (content.length > CHAR_COUNT_THRESHOLD) {
    debounce *= SCALING_FACTOR;
  }

  // Parse TipTap JSON for structural complexity
  try {
    const doc: TipTapNode = JSON.parse(content);

    // Image complexity: more than 5 image nodes
    const imageCount = countNodesByType(doc, 'image');
    if (imageCount > IMAGE_COUNT_THRESHOLD) {
      debounce *= SCALING_FACTOR;
    }

    // Table complexity: any table node present
    if (hasNodeOfType(doc, 'table')) {
      debounce *= SCALING_FACTOR;
    }
  } catch {
    // If parsing fails, return debounce based on char count only
  }

  return Math.min(debounce, MAX_DEBOUNCE_MS);
}
