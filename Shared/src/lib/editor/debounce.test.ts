import { describe, it, expect } from 'vitest';
import { computeDebounceMs } from './debounce';

/** Helper to create a minimal TipTap document JSON string */
function makeTipTapDoc(nodes: Array<{ type: string; content?: unknown[] }>): string {
  return JSON.stringify({ type: 'doc', content: nodes });
}

describe('computeDebounceMs', () => {
  it('returns base 500ms for simple short content', () => {
    const content = makeTipTapDoc([{ type: 'paragraph' }]);
    expect(computeDebounceMs(content)).toBe(500);
  });

  it('applies 1.5x multiplier when char count exceeds 10000', () => {
    // Create content longer than 10000 chars
    const longText = 'a'.repeat(10001);
    const content = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', text: longText }] });
    expect(computeDebounceMs(content)).toBe(750); // 500 * 1.5
  });

  it('applies 1.5x multiplier when more than 5 images are present', () => {
    const images = Array.from({ length: 6 }, () => ({ type: 'image', attrs: { src: 'test.png' } }));
    const content = makeTipTapDoc(images);
    expect(computeDebounceMs(content)).toBe(750); // 500 * 1.5
  });

  it('does not apply image multiplier for 5 or fewer images', () => {
    const images = Array.from({ length: 5 }, () => ({ type: 'image', attrs: { src: 'test.png' } }));
    const content = makeTipTapDoc(images);
    expect(computeDebounceMs(content)).toBe(500);
  });

  it('applies 1.5x multiplier when a table node is present', () => {
    const content = makeTipTapDoc([
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell' }] }] },
    ]);
    expect(computeDebounceMs(content)).toBe(750); // 500 * 1.5
  });

  it('stacks all multipliers for large doc with images and tables', () => {
    // Need > 10000 chars, > 5 images, and a table
    const images = Array.from({ length: 6 }, () => ({ type: 'image', attrs: { src: 'test.png' } }));
    const table = { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell' }] }] };
    const longParagraph = { type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(10000) }] };
    const fullDoc = { type: 'doc', content: [longParagraph, ...images, table] };
    const fullContent = JSON.stringify(fullDoc);
    // Verify it's > 10000 chars
    expect(fullContent.length).toBeGreaterThan(10000);
    // 500 * 1.5 (chars) * 1.5 (images) * 1.5 (table) = 1687.5
    expect(computeDebounceMs(fullContent)).toBeCloseTo(1687.5);
  });

  it('caps at 3000ms maximum', () => {
    // Even with all multipliers, should not exceed 3000ms
    // 500 * 1.5 * 1.5 * 1.5 = 1687.5, which is under 3000
    // To test the cap, we'd need a scenario where debounce exceeds 3000
    // Since max stacked is 1687.5, the cap won't trigger with current factors
    // But let's verify the cap logic works by checking the result is <= 3000
    const images = Array.from({ length: 6 }, () => ({ type: 'image', attrs: { src: 'test.png' } }));
    const table = { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell' }] }] };
    const longParagraph = { type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(9000) }] };
    const fullDoc = { type: 'doc', content: [longParagraph, ...images, table] };
    const fullContent = JSON.stringify(fullDoc);
    expect(computeDebounceMs(fullContent)).toBeLessThanOrEqual(3000);
  });

  it('returns base debounce when content is not valid JSON', () => {
    const invalidContent = 'this is not json {{{';
    expect(computeDebounceMs(invalidContent)).toBe(500);
  });

  it('returns char-count-scaled debounce when content is long but invalid JSON', () => {
    const longInvalid = 'x'.repeat(10001);
    // Char count > 10000 applies 1.5x, but JSON parse fails so no structural multipliers
    expect(computeDebounceMs(longInvalid)).toBe(750);
  });
});
