/// <reference lib="webworker" />

import { sniffOoxml } from '@/lib/files/archive';
import { engineFor } from '@/lib/registry/engines';
import { installPolyfills } from './polyfills';
import { describeFailure } from '@/lib/registry/shared';
import type { Format, OutputFile } from '@/lib/registry/types';

installPolyfills();

export interface ConvertRequest {
  kind?: 'convert';
  jobId: string;
  file: File;
  from: Format;
  to: Format;
}

/**
 * Asks which of the OOXML formats an archive really is.
 *
 * Handled here because answering needs a zip library, and the worker already
 * has one. Doing it on the page would ship a second copy of JSZip to everyone
 * who drops an Office file.
 */
export interface DetectRequest {
  kind: 'detect';
  jobId: string;
  file: File;
}

export type WorkerRequest = ConvertRequest | DetectRequest;

export type ConvertResponse =
  | { jobId: string; result: { files: OutputFile[]; warnings?: string[] } }
  | { jobId: string; error: string }
  | { jobId: string; detected: Format | undefined; expanded?: number };

/**
 * Conversions run here so the page keeps responding while a large file is being
 * chewed on. Engines are reached through `engines.ts`, whose every entry is a
 * dynamic import — so the worker starts as a few kilobytes and only pulls in
 * the megabytes a particular pair actually needs.
 */
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const { jobId } = request;

  const reply = (message: ConvertResponse) => {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);
  };

  if (request.kind === 'detect') {
    try {
      const { format, expanded } = await sniffOoxml(request.file);
      reply({ jobId, detected: format, expanded });
    } catch {
      reply({ jobId, detected: undefined });
    }
    return;
  }

  const { file, from, to } = request;

  const load = engineFor(from, to);
  if (!load) {
    reply({ jobId, error: `Kiln cannot turn .${from} into .${to}.` });
    return;
  }

  try {
    const convert = await load();
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
