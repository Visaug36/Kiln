import { fail } from '../shared';
import { escapeXml } from './_odf';

/**
 * HTML, which Recast has always spoken internally and now reads and writes.
 *
 * Every `docx → *` conversion already goes through HTML — mammoth produces it
 * and `htmlToBlocks` consumes it — so the format was half-supported before it
 * was declared. What was missing either side was a document wrapper: stripping
 * a real page down to the part Recast can carry, and putting a plain one back
 * together.
 */

export interface HtmlRead {
  /** The body, reduced to the elements the block layer understands. */
  html: string;
  warnings: string[];
}

/** Counts an element, singular or plural, in the interface's voice. */
function count(html: string, pattern: RegExp): number {
  return (html.match(pattern) ?? []).length;
}

/**
 * A page reduced to its content.
 *
 * Scripts, styles and anything whose value is its layout are removed here
 * rather than left for the block layer, because they are not *stranded* text —
 * Recast knows exactly what they are and that it cannot carry them, so they are
 * counted and named instead of being reported as words that got lost.
 */
export function readHtmlDocument(source: string): HtmlRead {
  return { html: reduceHtml(source), warnings: describeHtmlLosses(source) };
}

/**
 * Markup reduced to the elements the block layer understands.
 *
 * Separate from the warnings because EPUB chapters are XHTML and go through
 * exactly this reduction, while what an EPUB has to say about what it dropped
 * is about the book — its cover, its fonts — and is counted from the archive.
 * Running the whole of `readHtmlDocument` over each chapter would report the
 * same images twice, with two different numbers.
 */
export function reduceHtml(source: string): string {
  let html = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<(head|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, '')
    .replace(
      /<(img|picture|figure|iframe|embed|object|video|audio|canvas|input|button|select|textarea)\b[^>]*\/?>/gi,
      '',
    )
    .replace(
      /<\/(picture|figure|iframe|embed|object|video|audio|canvas|select|textarea|button)>/gi,
      '',
    );

  // The body is the content; everything outside it is chrome. A fragment with
  // no <body> at all is perfectly valid input and is taken whole.
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (body) html = body[1] ?? '';

  html = html
    // `htmlToBlocks` reads `<pre>`; a `<code>` inside one would otherwise be
    // rendered as inline code inside a code block.
    .replace(/<pre\b([^>]*)>\s*<code\b[^>]*>/gi, '<pre$1>')
    .replace(/<\/code>\s*<\/pre>/gi, '</pre>')
    .replace(/<(th)\b/gi, '<td')
    .replace(/<\/th>/gi, '</td>')
    // Grouping elements carry no meaning Recast can use, and their children do.
    .replace(/<\/?(section|article|main|header|footer|aside|nav|hgroup)\b[^>]*>/gi, '');

  html = paragraphsFromDivs(html);

  if (!/<[a-z]/i.test(html) && !html.trim()) {
    fail('There is no readable content in this HTML file.');
  }

  return html;
}

/** What a page held that Recast knows it cannot carry, named rather than lost. */
export function describeHtmlLosses(source: string): string[] {
  const warnings: string[] = [];

  const scripts = count(source, /<script\b/gi);
  const styles = count(source, /<style\b/gi) + count(source, /<link\b[^>]*stylesheet/gi);
  const images = count(source, /<img\b/gi) + count(source, /<picture\b/gi);
  const frames = count(source, /<iframe\b/gi) + count(source, /<embed\b/gi);
  const forms = count(source, /<form\b/gi);

  if (styles > 0) {
    warnings.push(
      'Stylesheets were dropped. Recast carries the structure of a page — headings, lists, tables and links — not how it looked.',
    );
  }
  if (images > 0) {
    warnings.push(
      `${images === 1 ? 'One image was' : `${images} images were`} not carried over.`,
    );
  }
  if (scripts > 0) {
    warnings.push(
      `${scripts === 1 ? 'One script was' : `${scripts} scripts were`} ignored, along with anything they would have put on the page.`,
    );
  }
  if (frames > 0) {
    warnings.push(
      `${frames === 1 ? 'An embedded frame was' : `${frames} embedded frames were`} dropped — their content lives in another file.`,
    );
  }
  if (forms > 0) {
    warnings.push(
      `${forms === 1 ? 'A form was' : `${forms} forms were`} dropped; the fields have nothing to submit to in a document.`,
    );
  }

  return warnings;
}

/**
 * Turns a `<div>` that holds only text into a paragraph.
 *
 * The block layer reads `<p>`, `<h1>` and so on, and reports whatever reached
 * no block as stranded words. That is the right behaviour for a caption or a
 * frame, and quite wrong for HTML, where a great deal of ordinary prose lives
 * in a bare `<div>` — a page built that way would convert to a warning and an
 * empty file.
 *
 * Innermost first: the pattern refuses to span another `<div>`, so repeating
 * until nothing changes unwraps from the inside out. A div holding block
 * elements is scaffolding and is unwrapped; one holding only text is a
 * paragraph and is relabelled as one.
 */
function paragraphsFromDivs(html: string): string {
  const BLOCK = /<(p|h[1-6]|ul|ol|li|table|tr|td|blockquote|pre|hr|dl|dt|dd)\b/i;
  let previous: string;
  let out = html;

  do {
    previous = out;
    out = out.replace(
      /<div\b[^>]*>((?:(?!<div\b)[\s\S])*?)<\/div>/gi,
      (_match, inner: string) => (BLOCK.test(inner) ? inner : `<p>${inner}</p>`),
    );
  } while (out !== previous);

  // A definition list is a list in everything but name.
  return out
    .replace(/<\/?dl\b[^>]*>/gi, '')
    .replace(/<(dt|dd)\b[^>]*>/gi, '<p>')
    .replace(/<\/(dt|dd)>/gi, '</p>');
}

/**
 * Markdown as a standalone HTML document.
 *
 * Rendered with `marked` rather than through Recast's block model, which is the
 * one place it is worth stepping outside: the block model deliberately does not
 * carry inline emphasis, and HTML is the one target that can express all of it
 * exactly. Going through blocks here would throw away bold, italics and links
 * that the source spells out and the target has tags for.
 */
export async function markdownToHtmlDocument(
  source: string,
  title: string,
): Promise<string> {
  const { marked } = await import('marked');
  const body = await marked.parse(source, { async: true, gfm: true });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(title)}</title>
</head>
<body>
${body.trim()}
</body>
</html>
`;
}
