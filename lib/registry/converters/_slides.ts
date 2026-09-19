import { changed, lost } from '../shared';
import type { Warning } from '../types';
import { MAX_LIST_DEPTH } from './_md';
import type { Block } from './_md';

/**
 * What every deck reduces to, and what every deck is built from.
 *
 * PPTX and ODP are siblings: two archives holding the same idea in different
 * XML. Their readers are necessarily separate, but everything after the reader
 * — how a slide becomes Markdown, how it becomes plain text, how Markdown
 * becomes slides — lives here once, so a fix to one deck format cannot leave
 * the other behind. That has been the single commonest bug in this codebase.
 */
export interface Slide {
  index: number;
  /** The slide's title, where the file says which text that is. */
  title: string;
  /** Everything else on the slide, in reading order. */
  body: string[];
  notes: string[];
}

/** A deck as plain text: one block per slide, numbered. */
export function slidesToText(slides: Slide[]): string {
  return slides
    .map((slide) => {
      const lines = [`Slide ${slide.index}`];
      if (slide.title) lines.push(slide.title);
      lines.push(...slide.body);
      if (slide.notes.length > 0) lines.push('', 'Notes:', ...slide.notes);
      return lines.join('\n');
    })
    .join('\n\n');
}

/** A deck as Markdown: a heading per slide, its text beneath, notes quoted. */
export function slidesToMarkdown(slides: Slide[]): string {
  return slides
    .map((slide) => {
      const parts = [`## ${slide.title || `Slide ${slide.index}`}`];
      if (slide.body.length > 0) {
        parts.push('', ...slide.body.map((line) => `- ${line}`));
      }
      if (slide.notes.length > 0) {
        parts.push('', ...slide.notes.map((line) => `> ${line}`));
      }
      return parts.join('\n');
    })
    .join('\n\n');
}

export interface Line {
  text: string;
  /** Nesting level, so a sub-point sits under its parent rather than beside it. */
  depth: number;
}

export interface Deck {
  title: string;
  bullets: Line[];
}

/**
 * Splits a block list into slides, one per top-level heading.
 *
 * This is the whole reason `md → pptx` exists while `docx → pptx` does not: a
 * Markdown heading is an explicit statement of where one slide ends and the
 * next begins. Prose carries no such marker, and inventing them is writing
 * rather than converting.
 */
export function toSlides(blocks: Block[]): Deck[] {
  const slides: Deck[] = [];
  let current: Deck | undefined;

  const open = (title: string) => {
    current = { title, bullets: [] };
    slides.push(current);
  };

  for (const block of blocks) {
    if (block.kind === 'heading' && block.level <= 1) {
      open(block.text);
      continue;
    }
    if (!current) open('');

    switch (block.kind) {
      case 'heading':
      case 'paragraph':
      case 'quote':
        current!.bullets.push({ text: block.text, depth: 0 });
        break;
      case 'bullet':
        current!.bullets.push({
          text: block.text,
          depth: Math.min(block.depth, MAX_LIST_DEPTH),
        });
        break;
      case 'code':
        for (const line of block.text.split('\n').filter(Boolean)) {
          current!.bullets.push({ text: line, depth: 0 });
        }
        break;
      case 'table':
        for (const row of block.rows) {
          current!.bullets.push({ text: row.join(' — '), depth: 0 });
        }
        break;
      default:
        break;
    }
  }

  return slides.filter((slide) => slide.title || slide.bullets.length > 0);
}

/** The notes a written deck carries, whatever format it is written in. */
export function deckWarnings(source: string, slides: Deck[]): Warning[] {
  const warnings: Warning[] = [];

  // "In the Markdown" is only ever read by somebody who dropped Markdown. No
  // reader can put an image here: `Block` has no image kind, so nothing
  // `blocksToMarkdown` writes matches this pattern, and a routed deck reaches
  // this line with the images already reported gone by its first step. If a
  // reader ever starts emitting `![]()`, this sentence needs rewriting too.
  if (/!\[[^\]]*\]\([^)]*\)/.test(source)) {
    warnings.push(lost('Images in the Markdown were not carried onto the slides.'));
  }

  const long = slides.filter((slide) => slide.bullets.length > 12).length;
  if (long > 0) {
    // No advice here on purpose. This used to end "split those headings up",
    // which is addressed to whoever wrote the Markdown — and on all nine pairs
    // routed into a deck, that is Recast, from a document the reader never saw
    // as headings at all. The outcome is true from every direction.
    warnings.push(
      changed(
        `${long} slide${long === 1 ? ' has' : 's have'} more than 12 bullets and will run off the bottom.`,
      ),
    );
  }

  return warnings;
}
