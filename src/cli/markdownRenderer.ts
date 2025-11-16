import MarkdownIt from 'markdown-it';
import markdownItTerminal from 'markdown-it-terminal';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

md.use(markdownItTerminal, {
  width: process.stdout.columns ? Math.max(20, process.stdout.columns - 2) : undefined,
  reflowText: false,
  forceHyperlinks: true,
});

/**
 * Render markdown to ANSI-colored text suitable for a TTY.
 */
export function renderMarkdownAnsi(markdown: string): string {
  return md.render(markdown);
}
