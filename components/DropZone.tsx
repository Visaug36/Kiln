'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  children: React.ReactNode;
}

/**
 * The drop target is the whole page, not the framed region. The frame is an
 * affordance — it shows where to aim and what a drag will do — but a document
 * dropped anywhere in the viewport is accepted. Clicking or pressing the frame
 * opens the file picker instead.
 */
export default function DropZone({ onFiles, children }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // Drag events fire per element, so a plain boolean flickers on child
  // boundaries. Counting enter/leave pairs keeps the state steady.
  const depth = useRef(0);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onFiles(Array.from(list));
    },
    [onFiles],
  );

  useEffect(() => {
    function onDragEnter(event: DragEvent) {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    }

    function onDragOver(event: DragEvent) {
      if (!event.dataTransfer?.types.includes('Files')) return;
      // Without this the browser navigates to the dropped file.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }

    function onDragLeave() {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    }

    function onDrop(event: DragEvent) {
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      handleFiles(event.dataTransfer?.files ?? null);
    }

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleFiles]);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.md,.markdown,.txt,.text,.rtf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          handleFiles(event.target.files);
          // Reset so choosing the same file twice still fires a change.
          event.target.value = '';
        }}
      />
      <button
        type="button"
        data-testid="drop-region"
        data-dragging={dragging ? 'true' : 'false'}
        aria-label="Choose a document to convert, or drop one anywhere on the page"
        onClick={() => inputRef.current?.click()}
        className={[
          'kiln-motion block w-full rounded-drop border border-dashed bg-surface',
          'px-6 py-12 text-center shadow-kiln sm:px-10 sm:py-16',
          dragging ? 'kiln-dropzone--active' : 'border-separator hover:border-tertiary',
        ].join(' ')}
      >
        {children}
      </button>
    </>
  );
}
