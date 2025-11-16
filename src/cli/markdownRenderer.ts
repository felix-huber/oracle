import { Marked, Parser } from 'marked';
import TerminalRenderer from 'marked-terminal';

const terminalRenderer = new TerminalRenderer({
  reflowText: false,
  width: process.stdout.columns ? Math.max(20, process.stdout.columns - 2) : undefined,
  tab: 2,
});

const markedWithTerminal = new Marked();
const parser = new Parser(markedWithTerminal.defaults);
// Give terminal renderer a parser so its helpers (heading, link, etc.) can call parseInline.
(terminalRenderer as unknown as { parser: Parser }).parser = parser;
// Also set on the prototype so even if marked rebinds `this`, parser/options still exist.
(TerminalRenderer as unknown as { prototype: { parser?: Parser; options?: unknown } }).prototype.parser ??= parser;
(TerminalRenderer as unknown as { prototype: { parser?: Parser; options?: unknown } }).prototype.options ??=
  (terminalRenderer as unknown as { options?: unknown }).options;

// Marked v15 validates renderer keys; supply only the supported render functions.
const allowedKeys = [
  'code',
  'blockquote',
  'html',
  'heading',
  'hr',
  'list',
  'listitem',
  'checkbox',
  'paragraph',
  'table',
  'tablerow',
  'tablecell',
  'strong',
  'em',
  'codespan',
  'br',
  'del',
  'link',
  'image',
  'text',
];

const filteredRenderer: Record<string, unknown> = {};
for (const key of allowedKeys) {
  const fn = (terminalRenderer as unknown as Record<string, unknown>)[key];
  if (typeof fn === 'function') {
    filteredRenderer[key] = (fn as (...args: unknown[]) => unknown).bind(terminalRenderer);
  }
}
// Preserve renderer options (sanitize, reflowText, etc.) for marked-terminal helpers.
filteredRenderer.options = (terminalRenderer as unknown as { options?: unknown }).options ?? {};
// Attach parser helpers expected by marked-terminal during rendering.
filteredRenderer.parser = parser;

markedWithTerminal.use({ renderer: filteredRenderer });

/**
 * Render markdown to ANSI-colored text suitable for a TTY.
 */
export function renderMarkdownAnsi(markdown: string): string {
  return markedWithTerminal.parse(markdown) as string;
}
