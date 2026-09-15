import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
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

afterEach(() => {
  cleanup();
});
