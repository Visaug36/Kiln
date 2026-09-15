import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture } from '@/test/fixtures';
import { useJobs } from '@/lib/jobs/store';
import { resetWorker } from '@/lib/jobs/runner';
import { sniffOoxml } from '@/lib/files/archive';
import Home from './page';

/**
 * Identifying a dropped Office file now happens in the worker, so that the
 * page never ships a zip library. jsdom has no Worker, so this stands in and
 * answers with the real sniffing code.
 */
class DetectWorker {
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  addEventListener(type: string, handler: (event: unknown) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: (event: unknown) => void) {
    this.listeners.get(type)?.delete(handler);
  }

  async postMessage(request: { kind?: string; jobId: string; file: File }) {
    if (request.kind !== 'detect') return;
    const detected = await sniffOoxml(request.file);
    for (const handler of this.listeners.get('message') ?? []) {
      handler({ data: { jobId: request.jobId, detected } });
    }
  }

  terminate() {}
}

/** Detection now reads bytes, so every drop settles asynchronously. */
async function dropFiles(container: HTMLElement, files: File[]) {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error('no file input');
  fireEvent.change(input, { target: { files } });
  await waitFor(() =>
    expect(useJobs.getState().jobs.length + errorCount()).toBeGreaterThan(0),
  );
}

function errorCount() {
  return screen.queryAllByText(/Kiln cannot read|old binary Office|ZIP archive/).length;
}

beforeEach(() => {
  vi.stubGlobal('Worker', DetectWorker as unknown as typeof Worker);
  resetWorker();
  useJobs.getState().clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetWorker();
});

describe('the screen', () => {
  it('shows the hero and the privacy promise', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { name: 'Drop a document' })).toBeInTheDocument();
    expect(screen.getByText('Files never leave your browser')).toBeInTheDocument();
    expect(
      screen.getByText('PDF · DOCX · PPTX · XLSX · CSV · MD · TXT · RTF'),
    ).toBeInTheDocument();
  });

  it('has no job list until a file arrives', () => {
    render(<Home />);
    expect(screen.queryByRole('region', { name: 'Conversions' })).not.toBeInTheDocument();
  });
});

describe('dropping a file', () => {
  it('creates a row whose picker offers exactly the registry targets', async () => {
    const { container } = render(<Home />);
    await dropFiles(container, [fixture('sample.docx')]);

    const picker = await screen.findByRole('radiogroup', {
      name: 'Convert sample.docx to',
    });
    const options = within(picker)
      .getAllByRole('radio')
      .map((node) => node.textContent);

    expect(options).toEqual(['.pdf', '.md', '.txt', '.rtf']);
  });

  it('changes the target when another format is chosen', async () => {
    const { container } = render(<Home />);
    await dropFiles(container, [fixture('sample.docx')]);

    fireEvent.click(await screen.findByRole('radio', { name: '.txt' }));

    expect(useJobs.getState().jobs[0]?.to).toBe('txt');
  });

  it('shows the caveat for a lossy pair', async () => {
    const { container } = render(<Home />);
    await dropFiles(container, [fixture('sample.pdf')]);

    expect(
      await screen.findByText(/Headings are inferred from type size/),
    ).toBeInTheDocument();
  });

  it('accepts the spreadsheet and slide formats end to end', async () => {
    const { container } = render(<Home />);
    await dropFiles(container, [fixture('sample.xlsx'), fixture('sample.pptx')]);

    await waitFor(() => expect(useJobs.getState().jobs).toHaveLength(2));
    expect(useJobs.getState().jobs.map((j) => j.from)).toEqual(['xlsx', 'pptx']);
  });
});

describe('reading the bytes rather than the name', () => {
  it('routes a mislabelled file by its contents and says so', async () => {
    const { container } = render(<Home />);
    // A workbook someone renamed to .docx: both are ZIPs, so only the
    // content-type map inside can tell them apart.
    await dropFiles(container, [fixture('sample.xlsx', 'budget.docx')]);

    await waitFor(() => expect(useJobs.getState().jobs).toHaveLength(1));
    expect(useJobs.getState().jobs[0]?.from).toBe('xlsx');

    expect(await screen.findByText(/its contents are XLSX/)).toBeInTheDocument();
  });

  it('names the old binary .doc problem specifically', async () => {
    const { container } = render(<Home />);
    await dropFiles(container, [fixture('actually-a-doc.docx')]);

    expect(await screen.findByText(/old binary Office file/i)).toBeInTheDocument();
    expect(useJobs.getState().jobs).toEqual([]);
  });

  it('explains a file it cannot read, without creating a row', async () => {
    const { container } = render(<Home />);
    await dropFiles(container, [new File(['x'], 'budget.xyz')]);

    expect(await screen.findByText(/Kiln cannot read budget\.xyz/)).toBeInTheDocument();
    expect(useJobs.getState().jobs).toEqual([]);
  });
});

describe('the unsupported list', () => {
  it('is reachable from the row and names the missing pairs', async () => {
    const { container } = render(<Home />);
    await dropFiles(container, [fixture('sample.pdf')]);

    const link = await screen.findByRole('button', {
      name: /Some formats aren’t available for PDF/,
    });
    expect(link).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(link);

    expect(link).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/\.pdf → \.docx/)).toBeInTheDocument();
    expect(screen.getByText(/records where glyphs sit on a page/)).toBeInTheDocument();
  });

  it('says nothing for a format with no missing targets', async () => {
    const { container } = render(<Home />);
    await dropFiles(container, [fixture('sample.txt')]);

    await waitFor(() => expect(useJobs.getState().jobs).toHaveLength(1));
    expect(
      screen.queryByRole('button', { name: /aren’t available/ }),
    ).not.toBeInTheDocument();
  });
});
