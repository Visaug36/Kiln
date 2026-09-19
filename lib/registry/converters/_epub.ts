import { changed, describeFailure, fail, lost, readArrayBuffer } from '../shared';
import type { ProgressFn, Warning } from '../types';
import { escapeXml } from './_odf';
import type { Block } from './_md';

/**
 * EPUB: a zip of XHTML with a manifest, which is close to what Recast already
 * handles — so the work here is the book-shaped part, not the markup.
 *
 * The part worth getting right on read is **order**. An EPUB's chapters are not
 * necessarily named or stored in reading order; the spine is the only thing
 * that says what follows what. Reading the archive's own file order produces a
 * book whose chapters are shuffled, and it looks perfectly fine until you read
 * it.
 */

export interface EpubRead {
  /** Every chapter's body, in spine order, concatenated. */
  html: string;
  chapters: number;
  title?: string;
  warnings: Warning[];
}

/** Resolves an href against the directory its manifest sits in. */
function resolve(base: string, href: string): string {
  const target = decodeURIComponent(href.split('#')[0] ?? '');
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const parts = `${dir}${target}`.split('/');
  const out: string[] = [];

  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

export async function readEpub(input: File, onProgress?: ProgressFn): Promise<EpubRead> {
  const buffer = await readArrayBuffer(input);
  const { default: JSZip } = await import('jszip');

  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (cause) {
    fail(describeFailure(cause, 'epub'));
  }

  // The container points at the package document; its path is not fixed.
  const container = zip.file('META-INF/container.xml');
  if (!container) {
    fail('This file has no META-INF/container.xml, so it is not a readable EPUB.');
  }
  const opfPath = /full-path="([^"]+)"/.exec(await container.async('string'))?.[1];
  if (!opfPath || !zip.file(opfPath)) {
    fail('This EPUB’s container does not point at a package file Recast can find.');
  }

  const opf = await zip.file(opfPath)!.async('string');
  const title = /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/.exec(opf)?.[1]?.trim();

  // id → href, so the spine's idrefs can be turned into paths.
  const manifest = new Map<string, { href: string; type: string }>();
  for (const item of opf.matchAll(/<item\b([^>]*)\/?>/g)) {
    const attrs = item[1] ?? '';
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    const href = /\bhref="([^"]+)"/.exec(attrs)?.[1];
    const type = /\bmedia-type="([^"]+)"/.exec(attrs)?.[1] ?? '';
    if (id && href) manifest.set(id, { href, type });
  }

  // Reading order, and the only place it is recorded. Falling back to the
  // manifest is a last resort for a malformed book: it is at least declared
  // order rather than whatever order the zip happens to store.
  const spine = [...opf.matchAll(/<itemref\b([^>]*)\/?>/g)]
    .map((match) => /\bidref="([^"]+)"/.exec(match[1] ?? '')?.[1])
    .filter((id): id is string => Boolean(id));

  const order = spine.length > 0 ? spine : [...manifest.keys()];
  const bodies: string[] = [];

  for (const [index, id] of order.entries()) {
    onProgress?.({
      phase: 'reading',
      unit: 'chapter',
      done: index + 1,
      total: order.length,
    });

    const item = manifest.get(id);
    if (!item) continue;
    if (!/x?html/.test(item.type) && !/\.x?html?$/i.test(item.href)) continue;

    const entry = zip.file(resolve(opfPath, item.href));
    if (!entry) continue;

    const xhtml = await entry.async('string');
    // A navigation document declares itself. Keeping it would put the table of
    // contents in the text as a duplicated list of chapter names.
    if (/epub:type="[^"]*\btoc\b/.test(xhtml)) continue;

    const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(xhtml)?.[1] ?? xhtml;
    if (body.trim()) bodies.push(body);
  }

  if (bodies.length === 0) {
    fail('No chapters could be read out of this EPUB.');
  }

  const names = Object.keys(zip.files);
  const warnings: Warning[] = [];
  const images = names.filter((n) => /\.(png|jpe?g|gif|svg|webp)$/i.test(n)).length;
  const fonts = names.filter((n) => /\.(ttf|otf|woff2?)$/i.test(n)).length;

  if (images > 0) {
    warnings.push(
      lost(
        `${images === 1 ? 'One image, probably the cover, was' : `${images} images, including the cover, were`} not carried over.`,
      ),
    );
  }
  // The text is all there; it is set differently. That is `changed`.
  if (fonts > 0) {
    warnings.push(changed('Embedded fonts and styling were dropped.'));
  }

  return { html: bodies.join('\n'), chapters: bodies.length, title, warnings };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface Chapter {
  title: string;
  blocks: Block[];
}

/**
 * Splits a document into chapters at every top-level heading.
 *
 * Anything before the first `#` becomes its own opening chapter rather than
 * being dropped — a document that starts with a paragraph is ordinary, and
 * losing it would be exactly the quiet data loss Recast treats as a bug.
 */
export function toChapters(blocks: Block[], fallbackTitle: string): Chapter[] {
  const chapters: Chapter[] = [];
  let current: Chapter | undefined;

  for (const block of blocks) {
    if (block.kind === 'heading' && block.level <= 1) {
      current = { title: block.text, blocks: [] };
      chapters.push(current);
      continue;
    }
    if (!current) {
      current = { title: fallbackTitle, blocks: [] };
      chapters.push(current);
    }
    current.blocks.push(block);
  }

  return chapters.filter((chapter) => chapter.title || chapter.blocks.length > 0);
}

/** One chapter's blocks as XHTML. Deliberately semantic and unstyled. */
function chapterBody(chapter: Chapter): string {
  const parts: string[] = [`<h1>${escapeXml(chapter.title)}</h1>`];
  const open: ('ol' | 'ul')[] = [];

  const closeTo = (depth: number) => {
    while (open.length > depth) parts.push(`</li></${open.pop()}>`);
  };

  for (const block of chapter.blocks) {
    if (block.kind !== 'bullet') closeTo(0);

    switch (block.kind) {
      case 'heading': {
        const level = Math.min(block.level, 6);
        parts.push(`<h${level}>${escapeXml(block.text)}</h${level}>`);
        break;
      }
      case 'bullet': {
        const tag = block.ordered ? 'ol' : 'ul';
        const depth = block.depth + 1;
        if (depth > open.length) {
          while (open.length < depth) {
            parts.push(`<${tag}><li>`);
            open.push(tag);
          }
        } else {
          closeTo(depth);
          parts.push('</li><li>');
        }
        parts.push(escapeXml(block.text));
        break;
      }
      case 'code':
        parts.push(`<pre><code>${escapeXml(block.text)}</code></pre>`);
        break;
      case 'quote':
        parts.push(`<blockquote><p>${escapeXml(block.text)}</p></blockquote>`);
        break;
      case 'table':
        parts.push('<table>');
        for (const row of block.rows) {
          parts.push(
            `<tr>${row.map((cell) => `<td>${escapeXml(cell)}</td>`).join('')}</tr>`,
          );
        }
        parts.push('</table>');
        break;
      case 'rule':
        parts.push('<hr/>');
        break;
      default:
        parts.push(`<p>${escapeXml(block.text)}</p>`);
        break;
    }
  }

  closeTo(0);
  return parts.join('\n');
}

function chapterDocument(chapter: Chapter): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>${escapeXml(chapter.title)}</title></head>
<body>
${chapterBody(chapter)}
</body>
</html>`;
}

/**
 * Writes a minimal but complete EPUB 3.
 *
 * "Minimal" here means every part the specification requires and nothing else:
 * the stored `mimetype` first in the archive, a container pointing at the
 * package document, a package carrying a unique identifier, a title and a
 * language, a spine listing the chapters in reading order, and a navigation
 * document — which EPUB 3 requires and which is what a reader builds its table
 * of contents from. The tests open the result back up and check each of those,
 * because a book a reader silently refuses looks exactly like one that works
 * until somebody tries to open it.
 */
export async function packEpub(chapters: Chapter[], title: string): Promise<ArrayBuffer> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  // Derived from the content, so converting the same file twice produces the
  // same book rather than a new one each time. Recast has no clock or randomness
  // it wants baked into an output file.
  const uid = `urn:uuid:${uuidFrom([title, ...chapters.map((c) => c.title)].join('\n'))}`;

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );

  const files = chapters.map((chapter, index) => ({
    id: `ch${index + 1}`,
    href: `ch${index + 1}.xhtml`,
    chapter,
  }));

  for (const file of files) {
    zip.file(`OEBPS/${file.href}`, chapterDocument(file.chapter));
  }

  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title></head>
<body>
<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${files.map((f) => `<li><a href="${f.href}">${escapeXml(f.chapter.title)}</a></li>`).join('\n')}
</ol></nav>
</body>
</html>`,
  );

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${uid}</dc:identifier>
<dc:title>${escapeXml(title)}</dc:title>
<dc:language>en</dc:language>
<meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${files.map((f) => `<item id="${f.id}" href="${f.href}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine>
${files.map((f) => `<itemref idref="${f.id}"/>`).join('\n')}
</spine>
</package>`,
  );

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

/** A stable identifier derived from the text. Not a security primitive. */
function uuidFrom(text: string): string {
  let a = 0x6d2b79f5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    a = Math.imul(a ^ text.charCodeAt(i), 2654435761) >>> 0;
    b = Math.imul(b + text.charCodeAt(i), 1597334677) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return `${hex(a)}-${hex(b).slice(0, 4)}-4${hex(b).slice(4, 7)}-8${hex(a).slice(1, 4)}-${hex(a ^ b)}${hex((a + b) >>> 0).slice(0, 4)}`;
}
