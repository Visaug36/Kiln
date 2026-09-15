import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../lib/registry/converters/_md';
import { htmlToBlocks } from '../lib/registry/converters/_docx';

describe('nested list probe', () => {
  it('ordered nested list - symptom case', async () => {
    const md = `1. one\n    1. one-a\n2. two\n`;
    const blocks = await parseMarkdown(md);
    console.log('ORDERED:', JSON.stringify(blocks, null, 2));
  });

  it('bullet nested list - symptom case', async () => {
    const md = `- outer\n    - inner\n- after\n`;
    const blocks = await parseMarkdown(md);
    console.log('BULLET:', JSON.stringify(blocks, null, 2));
  });

  it('html equivalent for comparison', () => {
    const html = '<ol><li>one<ol><li>one-a</li></ol></li><li>two</li></ol>';
    const blocks = htmlToBlocks(html);
    console.log('HTML ORDERED:', JSON.stringify(blocks, null, 2));
  });

  it('mixed nesting: ul inside ol', async () => {
    const md = `1. one\n    - one-a\n2. two\n`;
    const blocks = await parseMarkdown(md);
    console.log('MIXED ol>ul:', JSON.stringify(blocks, null, 2));
  });

  it('mixed nesting: ol inside ul', async () => {
    const md = `- one\n    1. one-a\n- two\n`;
    const blocks = await parseMarkdown(md);
    console.log('MIXED ul>ol:', JSON.stringify(blocks, null, 2));
  });

  it('deep nesting', async () => {
    const md = `1. one\n    1. one-a\n        1. one-a-i\n2. two\n`;
    const blocks = await parseMarkdown(md);
    console.log('DEEP:', JSON.stringify(blocks, null, 2));
  });

  it('flat list unchanged', async () => {
    const md = `1. one\n2. two\n3. three\n`;
    const blocks = await parseMarkdown(md);
    console.log('FLAT:', JSON.stringify(blocks, null, 2));
  });

  it('item with emphasis', async () => {
    const md = `1. **one** and *two*\n    1. one-a\n2. two\n`;
    const blocks = await parseMarkdown(md);
    console.log('EMPHASIS:', JSON.stringify(blocks, null, 2));
  });
});
