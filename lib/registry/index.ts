/**
 * The registry: what Kiln converts, and how it gets there.
 *
 * The interface reads this and nothing else, so the format picker updates on
 * its own when an edge is declared. Three pieces sit behind it:
 *
 * - `table.ts` — the **edges**, one declared converter each.
 * - `routing.ts` — turns a requested pair into a **route** of one or two edges.
 * - `unsupported.ts` — the pairs Kiln refuses, whatever route could reach them.
 *
 * Nothing here reaches an `import()`. This module is imported by the page, and
 * a dynamic import in it makes the bundler emit a chunk for every engine.
 */
export type {
  ConversionResult,
  ConvertFn,
  Converter,
  Family,
  Fidelity,
  Format,
  OutputFile,
  Route,
} from './types';

export { FAMILY, FORMATS, FORMAT_LABEL, familyOf } from './formats';
export { converters } from './table';
export { allRoutes, edge, find, targetsFor } from './routing';
export {
  isUnsupported,
  unsupported,
  unsupportedFor,
  unsupportedGroupsFor,
  type UnsupportedGroup,
  type UnsupportedPair,
} from './unsupported';
