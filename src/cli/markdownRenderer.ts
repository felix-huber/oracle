import MarkdownIt from 'markdown-it';
import markdownItTerminal from 'markdown-it-terminal';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

// Use markdown-it-terminal for ANSI output, then override crashy rules.
md.use(markdownItTerminal, {
  width: process.stdout.columns ? Math.max(20, process.stdout.columns - 2) : undefined,
  reflowText: false,
  forceHyperlinks: true,
});

// markdown-it-terminal defines blockquote_open/close without args; override to avoid
// ReferenceError: tokens is not defined.
md.renderer.rules.blockquote_open = () => '> ';
md.renderer.rules.blockquote_close = () => '\n';

const fallbackMd = new MarkdownIt({ html: false, linkify: true, typographer: true });

export function renderMarkdownAnsi(markdown: string): string {
  try {
    return stripHtml(md.render(markdown));
  } catch (_error) {
    // Fallback to plain markdown-it rendering if the terminal plugin misbehaves.
    return stripHtml(fallbackMd.render(markdown));
  }
}

function stripHtml(input: string): string {
  // Remove tags
  let out = input.replace(/<\/?[^>]+>/g, '');
  // Decode a few common entities
  out = out
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
  return out;
}
