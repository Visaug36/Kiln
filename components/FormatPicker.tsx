'use client';

import { useRef } from 'react';
import type { Format } from '@/lib/registry';

interface FormatPickerProps {
  /** The currently chosen target. */
  value: Format;
  /** Every target the registry offers for this source format. */
  options: readonly Format[];
  onChange: (format: Format) => void;
  /** Accessible name for the group, e.g. "Convert report.docx to". */
  label: string;
  disabled?: boolean;
}

/**
 * A radio group of target formats, sourced entirely from the registry. A format
 * with no converter is never rendered here — there are no disabled options.
 */
export default function FormatPicker({
  value,
  options,
  onChange,
  label,
  disabled = false,
}: FormatPickerProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function move(index: number, delta: number) {
    if (options.length === 0) return;
    const next = (index + delta + options.length) % options.length;
    const target = options[next];
    if (!target) return;
    onChange(target);
    refs.current[next]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(index, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(index, -1);
        break;
      default:
        break;
    }
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((format, index) => {
        const selected = format === value;
        return (
          <button
            key={format}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`.${format}`}
            disabled={disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(format)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={[
              'recast-motion rounded-control border px-2.5 py-1 font-mono text-[13px] leading-5',
              'disabled:cursor-not-allowed disabled:opacity-50',
              selected
                ? 'border-separator bg-fill text-label'
                : 'border-transparent text-secondary hover:text-label',
            ].join(' ')}
          >
            .{format}
          </button>
        );
      })}
    </div>
  );
}
