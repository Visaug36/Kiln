import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import { installPolyfills } from '@/lib/workers/polyfills';

installPolyfills();

/**
 * jsdom's Blob and File are missing `arrayBuffer()`, and its `slice()` returns
 * an object without it either — so every engine, which reads its input as bytes,
 * would fail in tests for a reason that has nothing to do with the engine.
 * Node's own implementations are spec-complete, so the tests use those.
 */
Object.defineProperty(globalThis, 'Blob', { value: NodeBlob, writable: true });
Object.defineProperty(globalThis, 'File', { value: NodeFile, writable: true });

/**
 * The CJK faces are fetched from Recast's own origin at conversion time. jsdom has
 * no server behind that URL, so the same files the build copies into `out/` are
 * served straight off disk. `fontRequests` lets a test assert that a document
 * with no CJK in it never asks for one.
 */
export const fontRequests: string[] = [];

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const name = String(input instanceof Request ? input.url : input)
    .split('/')
    .pop()!;
  fontRequests.push(name);

  const bytes = readFileSync(join(process.cwd(), 'public', 'fonts', name));
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}) as unknown as typeof fetch;

afterEach(() => {
  cleanup();
  fontRequests.length = 0;
});
