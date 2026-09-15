'use client';

import { useId, useState } from 'react';
import { unsupportedFor, type Format } from '@/lib/registry';

const LABEL: Record<Format, string> = {
  pdf: 'PDF',
  docx: 'DOCX',
  pptx: 'PPTX',
  xlsx: 'XLSX',
  csv: 'CSV',
  md: 'MD',
  txt: 'TXT',
  rtf: 'RTF',
};

/**
 * Says plainly which targets do not exist for this format, and why.
 *
 * Kiln's privacy promise and its limits are the same fact seen from two sides:
 * everything runs in the browser, so anything needing a rendering engine is out
 * of reach. Hiding that behind a disabled menu item or a "coming soon" would
 * make the promise look like marketing. There is no waitlist here on purpose.
 */
export default function UnsupportedNote({ from }: { from: Format }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const pairs = unsupportedFor(from);

  if (pairs.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="kiln-motion text-body text-secondary underline decoration-separator underline-offset-4 hover:text-label hover:decoration-secondary"
      >
        Some formats aren’t available for {LABEL[from]}.
      </button>

      <div id={panelId} hidden={!open} className="mt-2 max-w-prose">
        <ul className="space-y-2 border-l border-separator pl-3">
          {pairs.map((pair) => (
            <li key={`${pair.from}-${pair.to}`} className="text-body text-secondary">
              <span className="font-mono text-[13px] text-label">
                .{pair.from} → .{pair.to}
              </span>{' '}
              {pair.reason}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-body text-tertiary">
          Every conversion runs in your browser, so anything needing a full rendering
          engine is out of reach. That is the same constraint that keeps your files off
          the network.
        </p>
      </div>
    </div>
  );
}
