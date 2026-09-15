/// <reference lib="webworker" />

import { find } from '@/lib/registry';
import { installPolyfills } from './polyfills';
import { describeFailure } from '@/lib/registry/shared';
import type { Format, OutputFile } from '@/lib/registry/types';

installPolyfills();

export interface ConvertRequest {
  jobId: string;
  file: File;
  from: Format;
  to: Format;
}

export type ConvertResponse =
  | { jobId: string; result: { files: OutputFile[]; warnings?: string[] } }
  | { jobId: string; error: string };

/**
 * Conversions run here so the page keeps responding while a large file is being
 * chewed on. Engines are reached through the registry's `load()`, which is a
 * dynamic import — so the worker starts as a few kilobytes and only pulls in the
 * megabytes a particular pair actually needs.
 */
self.onmessage = async (event: MessageEvent<ConvertRequest>) => {
  const { jobId, file, from, to } = event.data;

  const reply = (message: ConvertResponse) => {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
  };

  const converter = find(from, to);
  if (!converter) {
    reply({ jobId, error: `Kiln cannot turn .${from} into .${to}.` });
    return;
  }

  try {
    const convert = await converter.load();
    const result = await convert(file);

    if (!result.files || result.files.length === 0) {
      reply({ jobId, error: 'The conversion produced nothing. The file may be empty.' });
      return;
    }

    reply({ jobId, result: { files: result.files, warnings: result.warnings } });
  } catch (cause) {
    // The interface only ever sees a sentence. The real error goes to the
    // console, where a developer can find it — it never leaves the browser,
    // and it is the only way to diagnose a bad conversion after the fact.
    console.error(`[kiln] ${from} → ${to} failed`, cause);
    reply({ jobId, error: describeFailure(cause, from) });
  }
};
