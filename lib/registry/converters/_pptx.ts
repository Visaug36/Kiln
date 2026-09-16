import { describeFailure, fail, readArrayBuffer } from '../shared';
import type { Slide } from './_slides';

export type { Slide } from './_slides';

export interface PptxRead {
  slides: Slide[];
  warnings: string[];
}

/** `slide12.xml` sorts after `slide2.xml` as a string; order by the number. */
function slideNumber(path: string): number {
  return Number(/slide(\d+)\.xml$/.exec(path)?.[1] ?? 0);
}

/**
 * Finds a slide's notes through its relationships file.
 *
 * Notes are numbered independently of slides: a deck where only slide 5 has
 * notes stores them as `notesSlide1.xml`. Pairing them by number therefore
 * attaches one slide's notes to a different slide — silently, and with the
 * text looking perfectly plausible where it lands. Only the slide's own
 * `_rels` says which notes file is actually its own.
 */
async function notesFor(
  zip: import('jszip'),
  slidePath: string,
): Promise<string | undefined> {
  const name = slidePath.split('/').pop();
  const relsPath = `ppt/slides/_rels/${name}.rels`;
  const rels = zip.file(relsPath);
  if (!rels) return undefined;

  const xml = await rels.async('string');
  const target = /Target="([^"]*notesSlide\d+\.xml)"/.exec(xml)?.[1];
  if (!target) return undefined;

  // Targets are relative to ppt/slides/, e.g. "../notesSlides/notesSlide2.xml".
  const resolved = target.replace(/^\.\.\//, 'ppt/').replace(/^(?!ppt\/)/, 'ppt/slides/');
  return zip.file(resolved) ? resolved : undefined;
}

/** Pulls the text out of `<a:t>` runs, which is where PPTX keeps it. */
function textRuns(xml: string): string[] {
  const runs: string[] = [];
  // Paragraph boundaries matter: two runs in one <a:p> are one bullet.
  for (const paragraph of xml.split('</a:p>')) {
    const parts = [...paragraph.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
      decodeXml(m[1] ?? ''),
    );
    const line = parts.join('').replace(/\s+/g, ' ').trim();
    if (line) runs.push(line);
  }
  return runs;
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

/**
 * Reads slide text straight out of the archive.
 *
 * There is no browser-sized library that parses PPTX, and there does not need
 * to be: the text lives in `ppt/slides/slideN.xml` as `<a:t>` runs, which is
 * exactly and only what Kiln carries out of a deck. Anything about how the deck
 * *looks* is out of reach, which is why every `pptx → *` pair is lossy.
 */
export async function readPptx(input: File): Promise<PptxRead> {
  const buffer = await readArrayBuffer(input);
  const { default: JSZip } = await import('jszip');

  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (cause) {
    fail(describeFailure(cause, 'pptx'));
  }

  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  if (slidePaths.length === 0) {
    fail('No slides were found in this file. It may be damaged, or not really a PPTX.');
  }

  const slides: Slide[] = [];

  for (const [index, path] of slidePaths.entries()) {
    const xml = await zip.file(path)!.async('string');
    const runs = textRuns(xml);

    const notesPath = await notesFor(zip, path);
    const notesFile = notesPath ? zip.file(notesPath) : null;
    const notes = notesFile ? textRuns(await notesFile.async('string')) : [];

    slides.push({
      index: index + 1,
      title: runs[0] ?? '',
      body: runs.slice(1),
      // The notes pane repeats the slide number as its own run; drop it.
      notes: notes.filter((n) => n !== String(index + 1)),
    });
  }

  const warnings: string[] = [];
  const names = Object.keys(zip.files);
  const media = names.filter(
    (n) => n.startsWith('ppt/media/') && !n.endsWith('/'),
  ).length;
  const charts = names.filter(
    (n) => n.startsWith('ppt/charts/') && !n.endsWith('/'),
  ).length;

  if (media > 0) {
    warnings.push(
      `${media === 1 ? 'One image or video was' : `${media} images or videos were`} not carried over — only slide text converts.`,
    );
  }
  if (charts > 0) {
    warnings.push(
      `${charts === 1 ? 'A chart was' : `${charts} charts were`} not carried over.`,
    );
  }
  if (slides.every((s) => !s.title && s.body.length === 0)) {
    fail(
      'These slides have no text on them — only images or shapes, which Kiln cannot read.',
    );
  }

  return { slides, warnings };
}
