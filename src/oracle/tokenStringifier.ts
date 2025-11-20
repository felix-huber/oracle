/**
 * Convert the various request/body shapes we pass to tokenizers into a single string.
 * Keeps behaviour conservative (joins with newlines) and ignores any non-text fields.
 */
export function stringifyTokenizerInput(input: unknown): string {
  if (typeof input === 'string') return input;

  if (Array.isArray(input)) {
    return input
      .map((item) => stringifyTokenizerInput(item))
      .filter((segment) => segment.length > 0)
      .join('\n\n');
  }

  if (input && typeof input === 'object') {
    // Common shapes: { content: [...] }, { text: string }, { instructions: string }
    if ('text' in input && typeof (input as { text?: unknown }).text === 'string') {
      return (input as { text: string }).text;
    }
    if ('content' in input) {
      return stringifyTokenizerInput((input as { content?: unknown }).content);
    }
    if ('instructions' in input && typeof (input as { instructions?: unknown }).instructions === 'string') {
      return (input as { instructions: string }).instructions;
    }
    // Fall back to stringifying leaf values.
    return Object.values(input as Record<string, unknown>)
      .map((value) => stringifyTokenizerInput(value))
      .filter((segment) => segment.length > 0)
      .join('\n\n');
  }

  if (input == null) return '';
  return String(input);
}
