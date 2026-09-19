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
    const { format, expanded } = await sniffOoxml(request.file);
    for (const handler of this.listeners.get('message') ?? []) {
      handler({ data: { jobId: request.jobId, detected: format, expanded } });
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
  return screen.queryAllByText(/Recast cannot read|old binary Office|ZIP archive/).length;
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
    // Derived from the registry, so it cannot fall behind the format list.
    expect(screen.getByText(/^PDF · DOCX · ODT · /)).toBeInTheDocument();
    expect(screen.getByText(/ · CSV · JSON$/)).toBeInTheDocument();
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

    // Routed targets are offered beside direct ones and look no different:
    // .odt and .epub are reached through Markdown, .pdf and .rtf directly.
    expect(options).toEqual(['.pdf', '.odt', '.rtf', '.html', '.epub', '.md', '.txt']);
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
      await screen.findByText(/Headings are ranked by type size/),
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

    expect(await screen.findByText(/Recast cannot read budget\.xyz/)).toBeInTheDocument();
    expect(useJobs.getState().jobs).toEqual([]);
  });
});

describe('the unsupported list', () => {
  it('is reachable from the row and names the missing pairs', async () => {
    const { container } = render(<Home />);
    await dropFiles(container, [fixture('sample.pdf')]);

    const link = await screen.findByRole('button', {
      name: /Some formats aren’t available for \.pdf/,
    });
    expect(link).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(link);

    expect(link).toHaveAttribute('aria-expanded', 'true');
    // One reason, covering every target it applies to, rather than the same
    // paragraph repeated once per pair.
    expect(screen.getByText(/\.pdf → \.pptx, \.odp/)).toBeInTheDocument();
    expect(screen.getByText(/deciding what deserves a slide/)).toBeInTheDocument();
  });

  it('lists only what is actually missing for the source', async () => {
    const { container } = render(<Home />);
    // Markdown reaches every text and slide format Recast knows. The only thing
    // it cannot become is a spreadsheet, and that is the only line shown.
    await dropFiles(container, [fixture('sample.md')]);

    const link = await screen.findByRole('button', {
      name: /Some formats aren’t available for \.md/,
    });
    fireEvent.click(link);

    // The disclosure names its own panel, which is the only way to tell these
    // apart from the format picker's list of offered targets.
    const panel = document.getElementById(link.getAttribute('aria-controls')!)!;
    expect(
      within(panel).getByText(/\.md → \.xlsx, \.ods, \.csv, \.json/),
    ).toBeInTheDocument();
    // Slides are offered for Markdown, so they are not among the refusals.
    expect(within(panel).queryByText(/\.pptx/)).not.toBeInTheDocument();
  });
});

describe('nothing on the page leads nowhere', () => {
  it('points the About link at a section that is really there', () => {
    render(<Home />);

    const about = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href') === '#about');

    expect(about).toBeDefined();
    // The one failure mode of an in-page anchor: it looks alive and moves the
    // reader nowhere. `verify:browser` checks this against the built site too.
    expect(document.getElementById('about')).not.toBeNull();
  });

  it('offers only the three destinations that exist', () => {
    render(<Home />);

    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => Boolean(href));

    // A language switcher and a conversion guide were both cut rather than
    // shipped dead. If either comes back, it comes back with a page behind it.
    expect(new Set(hrefs)).toEqual(
      new Set([
        '/matrix',
        '#about',
        'https://github.com/Visaug36/Recast',
        'https://github.com/Visaug36/Recast/issues',
      ]),
    );
  });
});
