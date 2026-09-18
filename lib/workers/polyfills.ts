/**
 * Very new platform methods that pdfjs 6 calls unconditionally.
 *
 * Without these, every PDF conversion dies with "Promise.try is not a function"
 * or "hashOriginal.toHex is not a function" — on any browser older than roughly
 * Chrome 140 / Safari 18.2 / Firefox 134, which is a large share of real users.
 * Recast would have no way to explain that, so it would just look broken.
 *
 * Both gaps were found because the test runner (Node 22) has the same holes.
 * Each is installed only when missing, so a modern engine keeps its native one.
 */

type PromiseWithTry = {
  try?: <T>(
    fn: (...args: unknown[]) => T | PromiseLike<T>,
    ...args: unknown[]
  ) => Promise<T>;
};

type HexCapableUint8Array = {
  toHex?: () => string;
  toBase64?: () => string;
};

const HEX = '0123456789abcdef';

export function installPolyfills(): void {
  const promiseCtor = Promise as unknown as PromiseWithTry;

  if (typeof promiseCtor.try !== 'function') {
    promiseCtor.try = function <T>(
      fn: (...args: unknown[]) => T | PromiseLike<T>,
      ...args: unknown[]
    ): Promise<T> {
      return new Promise<T>((resolve) => resolve(fn(...args)));
    };
  }

  const bytes = Uint8Array.prototype as unknown as HexCapableUint8Array;

  if (typeof bytes.toHex !== 'function') {
    bytes.toHex = function (this: Uint8Array): string {
      let out = '';
      for (const byte of this) {
        out += HEX[byte >> 4]! + HEX[byte & 15]!;
      }
      return out;
    };
  }

  if (typeof bytes.toBase64 !== 'function') {
    bytes.toBase64 = function (this: Uint8Array): string {
      let binary = '';
      for (const byte of this) binary += String.fromCharCode(byte);

      if (typeof btoa === 'function') return btoa(binary);
      // Node without a DOM: Buffer is the only encoder available.
      return Buffer.from(this).toString('base64');
    };
  }
}
