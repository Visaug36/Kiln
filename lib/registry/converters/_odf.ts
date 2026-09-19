import { describeFailure, fail, lost, readArrayBuffer } from '../shared';
import type { Format, Warning } from '../types';
import { MAX_LIST_DEPTH } from './_md';
import type { Deck, Slide } from './_slides';
import type { Block } from './_md';

/**
 * OpenDocument: the container, the reader and the writer.
 *
 * ODT, ODS and ODP are the same archive with a different `mimetype` and a
 * different root element inside `content.xml`, so the parts that open and build
 * the package live here once. There is no browser-sized OpenDocument library,
 * and there does not need to be — the markup Recast reads and writes is a small,
 * regular subset, handled the same way `_docx.ts` and `_pptx.ts` handle theirs.
 *
 * ODT is the **sibling of DOCX** and is deliberately built to meet it: the
 * reader turns OpenDocument markup into the same HTML shape mammoth produces
 * and hands it to `htmlToBlocks`, so both formats lose and report exactly the
 * same things at exactly the same layer. A bug fixed in one is fixed in both.
 * The same goes for ODS beside XLSX and ODP beside PPTX.
 */

export const ODF_MIME: Record<'odt' | 'ods' | 'odp', string> = {
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
};

/** Which OpenDocument kind an archive holds, read from its own `mimetype`. */
export function odfKindOf(mimetype: string): Format | undefined {
  const trimmed = mimetype.trim();
  for (const [format, mime] of Object.entries(ODF_MIME)) {
    if (trimmed === mime) return format as Format;
  }
  // Templates carry the same body under `…-template`.
  if (trimmed.startsWith('application/vnd.oasis.opendocument.text')) return 'odt';
  if (trimmed.startsWith('application/vnd.oasis.opendocument.spreadsheet')) return 'ods';
  if (trimmed.startsWith('application/vnd.oasis.opendocument.presentation')) return 'odp';
  return undefined;
}

export interface OdfPackage {
  content: string;
  /** Files in the archive, so the reader can say what it is leaving behind. */
  names: string[];
}

export async function readOdf(input: File, kind: Format): Promise<OdfPackage> {
  const buffer = await readArrayBuffer(input);
  const { default: JSZip } = await import('jszip');

  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (cause) {
    fail(describeFailure(cause, kind));
  }

  const entry = zip.file('content.xml');
  if (!entry) {
    fail(
      `This file has no content.xml inside, so it is not really an OpenDocument file however it is named.`,
    );
  }

  return { content: await entry.async('string'), names: Object.keys(zip.files) };
}

/** Images and objects live outside the text, so nothing below can carry them. */
export function describeOdfMedia(names: string[]): Warning[] {
  const warnings: Warning[] = [];
  const pictures = names.filter(
    (n) => /^(Pictures|media)\//i.test(n) && !n.endsWith('/'),
  ).length;
  const objects = new Set(
    names
      .map((n) => /^(Object [^/]+|ObjectReplacements)\//i.exec(n)?.[0])
      .filter((n): n is string => Boolean(n)),
  ).size;

  if (pictures > 0) {
    warnings.push(
      lost(
        `${pictures === 1 ? 'An image was' : `${pictures} images were`} not carried over — only text converts.`,
      ),
    );
  }
  if (objects > 0) {
    warnings.push(
      lost(
        `${objects === 1 ? 'An embedded object — a chart or a formula — was' : `${objects} embedded objects, such as charts or formulas, were`} not carried over.`,
      ),
    );
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Reading: OpenDocument text into the HTML shape `htmlToBlocks` already knows
// ---------------------------------------------------------------------------

/**
 * What ends an OpenDocument element name.
 *
 * `\b` is wrong here and wrong in a way that looks right. OpenDocument names
 * share prefixes — `text:list` and `text:list-item`, `table:table` and
 * `table:table-row` — and a hyphen is a word boundary, so `/<text:list\b/`
 * matches `<text:list-item>` happily. That rewrote every list item as a new
 * list and every table row and cell as a new table, which flattened every list
 * in a document into loose paragraphs and produced tables nested three deep.
 * Nothing threw; the output simply came out wrong.
 */
const END = '(?=[\\s/>])';

interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  fixed?: boolean;
}

/**
 * Emphasis in OpenDocument is a style name, not a tag.
 *
 * `<text:span text:style-name="T3">` is bold only because `T3` is declared bold
 * somewhere above it. Resolving that map is what lets `odt → md` honour its
 * promise that emphasis carries over; without it every span is just text.
 */
function textStyles(xml: string): Map<string, TextStyle> {
  const styles = new Map<string, TextStyle>();

  const pattern =
    /<style:style\b[^>]*style:name="([^"]+)"[^>]*style:family="text"[^>]*>([\s\S]*?)<\/style:style>/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    const body = match[2] ?? '';
    styles.set(match[1]!, {
      bold: /fo:font-weight="(bold|[6-9]00)"/.test(body),
      italic: /fo:font-style="(italic|oblique)"/.test(body),
      fixed: /style:font-name="[^"]*(Mono|Courier)/i.test(body),
    });
  }

  return styles;
}

/** Which list styles are numbered rather than bulleted. */
function orderedListStyles(xml: string): Set<string> {
  const ordered = new Set<string>();
  const pattern =
    /<text:list-style\b[^>]*style:name="([^"]+)"[^>]*>([\s\S]*?)<\/text:list-style>/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    if (/<text:list-level-style-number\b/.test(match[2] ?? '')) ordered.add(match[1]!);
  }
  return ordered;
}

export interface OdfTextRead {
  html: string;
  warnings: Warning[];
}

/**
 * OpenDocument text markup rewritten as the HTML `htmlToBlocks` consumes.
 *
 * Deliberately a translation rather than a parser: every structure Recast carries
 * — headings, paragraphs, lists at any depth, tables, emphasis, links — has an
 * exact HTML counterpart, and handing the result to the layer DOCX already uses
 * means the two formats cannot drift apart in what they drop or what they say
 * about it. Anything this does not translate stays in the stream as an unknown
 * tag, where `htmlToBlocks`'s stranded-text check finds it and reports the
 * words rather than losing them quietly.
 */
export function odfTextToHtml(content: string): OdfTextRead {
  const spans = textStyles(content);
  const ordered = orderedListStyles(content);
  const warnings: Warning[] = [];

  const body = /<office:text[^>]*>([\s\S]*)<\/office:text>/.exec(content)?.[1] ?? '';
  if (!body.trim()) {
    fail('There is no text in this document — it may hold only images or shapes.');
  }

  let html = body;

  // Notes and comments are real content that Recast has nowhere to put. Counted
  // before they are removed, so the person is told rather than left guessing.
  const notes = (html.match(new RegExp(`<text:note${END}`, 'g')) ?? []).length;
  const comments = (html.match(new RegExp(`<office:annotation${END}`, 'g')) ?? []).length;
  if (notes > 0) {
    warnings.push(
      lost(
        `${notes === 1 ? 'One footnote or endnote was' : `${notes} footnotes or endnotes were`} dropped — Recast writes a single flow of text with nowhere to put them.`,
      ),
    );
  }
  if (comments > 0) {
    warnings.push(
      lost(
        `${comments === 1 ? 'One comment was' : `${comments} comments were`} dropped.`,
      ),
    );
  }

  html = html
    .replace(/<text:note[\s>][\s\S]*?<\/text:note>/g, '')
    .replace(/<office:annotation[\s>][\s\S]*?<\/office:annotation>/g, '')
    .replace(/<text:tracked-changes[\s>][\s\S]*?<\/text:tracked-changes>/g, '')
    .replace(/<text:sequence-decls[\s>][\s\S]*?<\/text:sequence-decls>/g, '')
    // Structural markers with no text in them at all.
    .replace(/<text:soft-page-break\s*\/?>/g, '')
    .replace(/<\/?text:(bookmark|bookmark-start|bookmark-end)[^>]*>/g, '')
    // A frame wraps a picture or a text box. Unwrapped rather than removed, so
    // that a text box's words carry through instead of vanishing with it.
    .replace(/<\/?draw:(frame|text-box|custom-shape|g)[^>]*>/g, '')
    .replace(/<draw:(image|object|object-ole|plugin)[^>]*\/?>/g, '')
    .replace(/<\/draw:(image|object|object-ole|plugin)>/g, '');

  // Headings carry their level as an attribute; the closing tag does not, so
  // the whole element is rewritten at once. `text:h` cannot nest.
  html = html.replace(
    new RegExp(`<text:h${END}([^>]*)>([\\s\\S]*?)<\\/text:h>`, 'g'),
    (_match, attrs: string, inner: string) => {
      const level = Math.min(
        Number(/text:outline-level="(\d+)"/.exec(attrs)?.[1] ?? 1),
        6,
      );
      return `<h${level}>${inner}</h${level}>`;
    },
  );

  // List items before lists, and cells before tables: see `END`. Doing it the
  // other way round rewrote every `<text:list-item>` as a fresh `<ul>`, which
  // flattened every list in the document into loose paragraphs.
  html = html
    .replace(new RegExp(`<text:list-(item|header)${END}[^>]*>`, 'g'), '<li>')
    .replace(/<\/text:list-(item|header)>/g, '</li>')
    .replace(/<text:number[\s>][\s\S]*?<\/text:number>/g, '');

  // Lists nest, so open and close tags are paired with a stack rather than a
  // non-greedy match — which would close an outer list at the first inner
  // `</text:list>` and flatten everything after it.
  const open: ('ol' | 'ul')[] = [];
  html = html.replace(
    new RegExp(`<text:list${END}([^>]*?)(\\/?)>|<\\/text:list>`, 'g'),
    (match, attrs: string, selfClose: string) => {
      if (match.startsWith('</')) return `</${open.pop() ?? 'ul'}>`;
      const style = /text:style-name="([^"]+)"/.exec(attrs ?? '')?.[1];
      const tag = style && ordered.has(style) ? 'ol' : 'ul';
      if (selfClose) return `<${tag}></${tag}>`;
      open.push(tag);
      return `<${tag}>`;
    },
  );

  html = html
    .replace(/<\/?table:table-header-rows[^>]*>/g, '')
    .replace(new RegExp(`<table:table-row${END}[^>]*>`, 'g'), '<tr>')
    .replace(/<\/table:table-row>/g, '</tr>')
    // Spans are carried onto the cell so the merged-cell warning fires here
    // exactly as it does for Word.
    .replace(
      new RegExp(`<table:table-cell${END}([^>]*?)(\\/?)>`, 'g'),
      (_m, attrs: string, selfClose: string) => {
        const cols = /table:number-columns-spanned="(\d+)"/.exec(attrs)?.[1];
        const rows = /table:number-rows-spanned="(\d+)"/.exec(attrs)?.[1];
        const span =
          `${cols && cols !== '1' ? ` colspan="${cols}"` : ''}` +
          `${rows && rows !== '1' ? ` rowspan="${rows}"` : ''}`;
        return selfClose ? `<td${span}></td>` : `<td${span}>`;
      },
    )
    .replace(/<\/table:table-cell>/g, '</td>')
    // A covered cell is the empty space under a span, not a cell of its own.
    .replace(/<\/?table:covered-table-cell[^>]*>/g, '')
    .replace(/<table:table-column[^>]*\/?>/g, '')
    .replace(new RegExp(`<table:table${END}[^>]*>`, 'g'), '<table>')
    .replace(/<\/table:table>/g, '</table>');

  html = html
    .replace(new RegExp(`<text:a${END}([^>]*)>`, 'g'), (_m, attrs: string) => {
      const href = /xlink:href="([^"]*)"/.exec(attrs)?.[1] ?? '';
      return `<a href="${href}">`;
    })
    .replace(/<\/text:a>/g, '</a>')
    .replace(/<text:line-break\s*\/?>/g, '<br>')
    .replace(/<text:tab\s*\/?>/g, ' ')
    .replace(new RegExp(`<text:s${END}([^>]*)\\/?>`, 'g'), (_m, attrs: string) =>
      ' '.repeat(Math.min(Number(/text:c="(\d+)"/.exec(attrs)?.[1] ?? 1), 40)),
    );

  html = rewriteSpans(html, spans);

  // Quotations and code are paragraph styles, not tags. Rewritten last, so that
  // a `<text:p>` inside a list item or a table cell has already been placed.
  html = html.replace(
    new RegExp(`<text:p${END}([^>]*)>([\\s\\S]*?)<\\/text:p>`, 'g'),
    (_m, attrs: string, inner: string) => {
      const style = /text:style-name="([^"]+)"/.exec(attrs)?.[1] ?? '';
      if (/^(Quotations?|Quote)/i.test(style)) return `<blockquote>${inner}</blockquote>`;
      if (/^(Preformatted|Source_20_Text|Code)/i.test(style))
        return `<pre>${inner}</pre>`;
      return `<p>${inner}</p>`;
    },
  );

  return { html, warnings };
}

/**
 * Rewrites `<text:span>` and its closing tag in one pass, with a stack.
 *
 * It has to be one pass. Rewriting the opening tags first leaves nothing for a
 * second pass to read: a closing tag carries no style name, so by the time it
 * is reached the only record of what was opened is gone, and every
 * `</text:span>` closes as a bare `</span>` — leaving `<strong>` and `<em>`
 * open to the end of the document.
 */
function rewriteSpans(html: string, spans: Map<string, TextStyle>): string {
  const stack: string[] = [];

  return html.replace(
    new RegExp(`<text:span${END}([^>]*)>|<\\/text:span>`, 'g'),
    (match, attrs?: string) => {
      if (match.startsWith('</')) return stack.pop() ?? '</span>';

      const style = spans.get(/text:style-name="([^"]+)"/.exec(attrs ?? '')?.[1] ?? '');
      if (!style) {
        stack.push('</span>');
        return '<span>';
      }
      if (style.fixed) {
        stack.push('</span></code>');
        return '<code><span>';
      }
      stack.push(`</span>${style.italic ? '</em>' : ''}${style.bold ? '</strong>' : ''}`);
      return `${style.bold ? '<strong>' : ''}${style.italic ? '<em>' : ''}<span>`;
    },
  );
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Text with the line breaks and tabs OpenDocument spells as elements. */
function odfText(text: string): string {
  return escapeXml(text)
    .replace(/\n/g, '<text:line-break/>')
    .replace(/\t/g, '<text:tab/>');
}

const CONTENT_NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"',
].join(' ');

/**
 * Recast's block list as the body of an OpenDocument text document.
 *
 * Numbering is the one place this does *not* mirror the DOCX writer. Recast's
 * other writers draw the ordinal themselves, from the shared `listCounter`;
 * OpenDocument numbers from the list style, and gets "1, 1, 2" for a list with
 * a nested one in it from the nesting alone — provided the parent's
 * `<text:list>` stays open across the child, which is what the stack below is
 * for. Writing an ordinal here as well would print it twice.
 */
export function blocksToOdfText(blocks: Block[]): string {
  const parts: string[] = [];
  let listDepth = -1;

  const closeLists = (to: number) => {
    while (listDepth > to) {
      parts.push('</text:list-item></text:list>');
      listDepth -= 1;
    }
  };

  for (const block of blocks) {
    // A list ends where a block of any other kind begins.
    if (block.kind !== 'bullet') closeLists(-1);

    switch (block.kind) {
      case 'heading':
        parts.push(
          `<text:h text:style-name="Heading_20_${Math.min(block.level, 6)}" text:outline-level="${Math.min(block.level, 6)}">${odfText(block.text)}</text:h>`,
        );
        break;

      case 'bullet': {
        const depth = Math.min(block.depth, MAX_LIST_DEPTH);
        const style = block.ordered ? 'RecastNumbering' : 'RecastBullets';

        if (depth > listDepth) {
          while (listDepth < depth) {
            parts.push(`<text:list text:style-name="${style}"><text:list-item>`);
            listDepth += 1;
          }
        } else {
          closeLists(depth);
          parts.push('</text:list-item><text:list-item>');
        }

        parts.push(`<text:p text:style-name="Standard">${odfText(block.text)}</text:p>`);
        break;
      }

      case 'code':
        for (const line of block.text.split('\n')) {
          parts.push(
            `<text:p text:style-name="Preformatted_20_Text">${odfText(line)}</text:p>`,
          );
        }
        break;

      case 'quote':
        parts.push(
          `<text:p text:style-name="Quotations">${odfText(block.text)}</text:p>`,
        );
        break;

      case 'table': {
        const columns = Math.max(...block.rows.map((row) => row.length), 1);
        parts.push(
          `<table:table table:name="Table${parts.length}"><table:table-column table:number-columns-repeated="${columns}"/>`,
        );
        for (const row of block.rows) {
          parts.push('<table:table-row>');
          for (let i = 0; i < columns; i += 1) {
            parts.push(
              `<table:table-cell office:value-type="string"><text:p>${odfText(row[i] ?? '')}</text:p></table:table-cell>`,
            );
          }
          parts.push('</table:table-row>');
        }
        parts.push('</table:table>');
        break;
      }

      case 'rule':
        parts.push('<text:p text:style-name="Horizontal_20_Line"/>');
        break;

      default:
        parts.push(`<text:p text:style-name="Standard">${odfText(block.text)}</text:p>`);
        break;
    }
  }

  closeLists(-1);
  // The `<office:text>` wrapper is not decoration: it is what marks the body as
  // a text document rather than a sheet or a deck, and it is what every reader,
  // Recast's own included, looks for first.
  return `<office:text>${parts.join('')}</office:text>`;
}

/** The list and paragraph styles the writers above refer to by name. */
const AUTOMATIC_STYLES = `<office:automatic-styles>
<text:list-style style:name="RecastBullets">${[0, 1, 2, 3, 4, 5]
  .map(
    (level) =>
      `<text:list-level-style-bullet text:level="${level + 1}" text:bullet-char="•"><style:list-level-properties text:space-before="${0.25 + level * 0.25}in" text:min-label-width="0.25in"/></text:list-level-style-bullet>`,
  )
  .join('')}</text:list-style>
<text:list-style style:name="RecastNumbering">${[0, 1, 2, 3, 4, 5]
  .map(
    (level) =>
      `<text:list-level-style-number text:level="${level + 1}" style:num-format="1" style:num-suffix="."><style:list-level-properties text:space-before="${0.25 + level * 0.25}in" text:min-label-width="0.25in"/></text:list-level-style-number>`,
  )
  .join('')}</text:list-style>
</office:automatic-styles>`;

/**
 * A presentation needs a master page, and a text document needs a page size.
 *
 * LibreOffice will open a deck with no master page, but it opens it with no
 * slide area either — every frame lands outside the page and the deck appears
 * blank. The landscape layout below is what makes a written `.odp` look like a
 * deck when someone actually opens it.
 */
const PAGE_STYLES = (kind: 'odt' | 'ods' | 'odp') =>
  kind === 'odp'
    ? `<office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="28cm" fo:page-height="15.75cm" style:print-orientation="landscape" fo:margin="0cm"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles>`
    : `<office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin="2cm"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="PM1"/></office:master-styles>`;

const STYLES_XML = (
  kind: 'odt' | 'ods' | 'odp',
) => `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${CONTENT_NS} office:version="1.3">
<office:styles>
<style:style style:name="Standard" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.1in"/></style:style>
${[1, 2, 3, 4, 5, 6]
  .map(
    (level) =>
      `<style:style style:name="Heading_20_${level}" style:display-name="Heading ${level}" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0.18in" fo:margin-bottom="0.08in"/><style:text-properties fo:font-size="${22 - level * 2}pt" fo:font-weight="bold"/></style:style>`,
  )
  .join('')}
<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="0.4in"/><style:text-properties fo:font-style="italic"/></style:style>
<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties style:font-name="Courier New" fo:font-size="10pt"/></style:style>
<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:border-bottom="0.5pt solid #000000" fo:margin-top="0.1in" fo:margin-bottom="0.1in"/></style:style>
</office:styles>
${PAGE_STYLES(kind)}
</office:document-styles>`;

const MANIFEST = (mime: string) => `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:media-type="${mime}"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

const META = (title: string) => `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${CONTENT_NS} xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3">
<office:meta><dc:title>${escapeXml(title)}</dc:title><meta:generator xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0">Recast</meta:generator></office:meta>
</office:document-meta>`;

/**
 * Packs an OpenDocument file.
 *
 * `mimetype` must be the archive's **first** entry and must be stored
 * uncompressed — that is what lets a reader identify the package from the first
 * bytes without unzipping it, and it is how Recast's own detection recognises the
 * file coming back in. JSZip writes entries in the order they were added, so
 * the order of the calls below is load-bearing.
 */
export async function packOdf(
  kind: 'odt' | 'ods' | 'odp',
  bodyXml: string,
  title: string,
): Promise<ArrayBuffer> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  zip.file('mimetype', ODF_MIME[kind], { compression: 'STORE' });
  zip.file('META-INF/manifest.xml', MANIFEST(ODF_MIME[kind]));
  zip.file('meta.xml', META(title));
  zip.file('styles.xml', STYLES_XML(kind));
  zip.file(
    'content.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${CONTENT_NS} office:version="1.3">${AUTOMATIC_STYLES}<office:body>${bodyXml}</office:body></office:document-content>`,
  );

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

// ---------------------------------------------------------------------------
// Presentations
// ---------------------------------------------------------------------------

/** Text out of an OpenDocument fragment, one line per paragraph. */
function odfLines(xml: string): string[] {
  const lines: string[] = [];

  for (const match of xml.matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)) {
    const line = (match[1] ?? '')
      .replace(/<text:line-break\s*\/?>/g, ' ')
      .replace(/<text:s\b[^>]*\/?>/g, ' ')
      .replace(/<text:tab\s*\/?>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) lines.push(line);
  }

  return lines;
}

/**
 * Slide text out of an OpenDocument presentation.
 *
 * The sibling of `readPptx`, and text-only for the same reason: what a deck is
 * *for* is its layout, and there is no browser-sized library that can rebuild
 * one. The title is the frame OpenDocument marks as the title where there is
 * one, rather than "whatever came first" — a deck whose title box sits below
 * its body in the file would otherwise get its title and its first bullet
 * swapped, which reads perfectly plausibly and is wrong.
 */
export function odfPresentationToSlides(content: string): Slide[] {
  const body =
    /<office:presentation\b[^>]*>([\s\S]*)<\/office:presentation>/.exec(content)?.[1] ??
    '';

  const pages = [...body.matchAll(/<draw:page\b[^>]*>([\s\S]*?)<\/draw:page>/g)];
  const slides: Slide[] = [];

  for (const [index, page] of pages.entries()) {
    let xml = page[1] ?? '';

    const notesXml = /<presentation:notes\b[^>]*>([\s\S]*?)<\/presentation:notes>/.exec(
      xml,
    );
    xml = xml.replace(/<presentation:notes\b[\s\S]*?<\/presentation:notes>/g, '');

    // A frame declares what it holds. Where one says "title", that is the
    // title, wherever it sits in the file.
    const titleFrame =
      /<draw:frame\b[^>]*presentation:class="(?:title|subtitle)"[^>]*>([\s\S]*?)<\/draw:frame>/.exec(
        xml,
      );
    const titleLines = titleFrame ? odfLines(titleFrame[1] ?? '') : [];

    const rest = titleFrame ? xml.replace(titleFrame[0], '') : xml;
    const restLines = odfLines(rest);

    const title = titleLines[0] ?? restLines[0] ?? '';
    const bodyLines = titleFrame
      ? [...titleLines.slice(1), ...restLines]
      : restLines.slice(1);

    slides.push({
      index: index + 1,
      title,
      body: bodyLines,
      notes: notesXml ? odfLines(notesXml[1] ?? '') : [],
    });
  }

  if (slides.length === 0) {
    fail('No slides were found in this file. It may be damaged, or not really an ODP.');
  }
  if (slides.every((slide) => !slide.title && slide.body.length === 0)) {
    fail(
      'These slides have no text on them — only images or shapes, which Recast cannot read.',
    );
  }

  return slides;
}

/** Recast's slides as the body of an OpenDocument presentation. */
export function slidesToOdfPresentation(slides: Deck[]): string {
  const parts: string[] = ['<office:presentation>'];

  for (const [index, slide] of slides.entries()) {
    parts.push(
      `<draw:page draw:name="page${index + 1}" draw:master-page-name="Default">`,
    );

    if (slide.title) {
      parts.push(
        '<draw:frame presentation:class="title" draw:layer="layout" svg:x="1.4cm" svg:y="0.8cm" svg:width="25.2cm" svg:height="2.6cm">' +
          `<draw:text-box><text:p>${odfText(slide.title)}</text:p></draw:text-box></draw:frame>`,
      );
    }

    if (slide.bullets.length > 0) {
      const body = slide.bullets
        .map(
          ({ text, depth }) =>
            `${'<text:list text:style-name="RecastBullets"><text:list-item>'.repeat(Math.min(depth, MAX_LIST_DEPTH) + 1)}<text:p>${odfText(text)}</text:p>${'</text:list-item></text:list>'.repeat(Math.min(depth, MAX_LIST_DEPTH) + 1)}`,
        )
        .join('');

      parts.push(
        `<draw:frame presentation:class="outline" draw:layer="layout" svg:x="1.4cm" svg:y="${slide.title ? '4.0' : '1.4'}cm" svg:width="25.2cm" svg:height="${slide.title ? '10.5' : '13.1'}cm">` +
          `<draw:text-box>${body}</draw:text-box></draw:frame>`,
      );
    }

    parts.push('</draw:page>');
  }

  parts.push('</office:presentation>');
  return parts.join('');
}
