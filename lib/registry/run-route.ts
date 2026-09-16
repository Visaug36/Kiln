import { engineFor } from './engines';
import { MIME } from './shared';
import type { ConversionResult, Format, OutputFile, Route } from './types';

/** An intermediate result handed to the next step as if it had been dropped. */
function asFile(output: OutputFile, to: Format): File {
  return new File([output.blob], output.filename, { type: MIME[to] });
}

/**
 * Runs a route: one converter, or two with the first one's output fed into the
 * second.
 *
 * The hand-off is a **real file**, not a shortcut through a shared object. That
 * is what makes a two-step pair honest — the second engine sees exactly what a
 * person would have got had they run the two conversions themselves, with no
 * structure smuggled across that the intermediate format cannot express. It is
 * also what makes the merged caveats true rather than optimistic.
 *
 * A step that produces several files — a workbook becoming one CSV per sheet —
 * has the next step run over each of them, so the shape of the output follows
 * the document rather than the plumbing.
 */
export async function runRoute(route: Route, input: File): Promise<ConversionResult> {
  const labelled = route.steps.length > 1;
  const warnings: string[] = [];
  let files: File[] = [input];

  for (const step of route.steps) {
    const load = engineFor(step.from, step.to);
    if (!load) {
      throw new Error(`no engine for ${step.from} → ${step.to}`);
    }

    const convert = await load();
    const produced: File[] = [];

    for (const file of files) {
      const result = await convert(file);

      for (const warning of result.warnings ?? []) {
        // Which step lost what matters when there are two of them: "images were
        // dropped" reads very differently depending on where it happened.
        warnings.push(labelled ? `.${step.from} → .${step.to}: ${warning}` : warning);
      }
      for (const output of result.files) produced.push(asFile(output, step.to));
    }

    if (produced.length === 0) {
      throw new Error(`${step.from} → ${step.to} produced nothing`);
    }
    files = produced;
  }

  return {
    files: files.map((file) => ({ blob: file, filename: file.name })),
    warnings: warnings.length ? warnings : undefined,
  };
}
