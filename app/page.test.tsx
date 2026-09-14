import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useJobs } from '@/lib/jobs/store';
import Home from './page';

function dropFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error('no file input');
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  useJobs.getState().clear();
});

describe('the screen', () => {
  it('shows the hero and the privacy promise', () => {
    render(<Home />);

    expect(screen.getByRole('heading', { name: 'Drop a document' })).toBeInTheDocument();
    expect(screen.getByText('Files never leave your browser')).toBeInTheDocument();
    expect(screen.getByText('PDF · DOCX · MD · TXT · RTF')).toBeInTheDocument();
  });

  it('has no job list until a file arrives', () => {
    render(<Home />);
    expect(screen.queryByRole('region', { name: 'Conversions' })).not.toBeInTheDocument();
  });
});

describe('dropping a file', () => {
  it('creates a row whose picker offers exactly the registry targets', () => {
    const { container } = render(<Home />);
    dropFile(container, new File(['x'], 'report.docx'));

    const picker = screen.getByRole('radiogroup', { name: 'Convert report.docx to' });
    const options = within(picker)
      .getAllByRole('radio')
      .map((node) => node.textContent);

    expect(options).toEqual(['.pdf', '.md', '.txt']);
    expect(screen.getByText(/report\.docx/)).toBeInTheDocument();
  });

  it('changes the target when another format is chosen', () => {
    const { container } = render(<Home />);
    dropFile(container, new File(['x'], 'report.docx'));

    fireEvent.click(screen.getByRole('radio', { name: '.txt' }));

    expect(useJobs.getState().jobs[0]?.to).toBe('txt');
  });

  it('shows the caveat for a lossy pair', () => {
    const { container } = render(<Home />);
    dropFile(container, new File(['x'], 'paper.pdf'));

    expect(screen.getByText(/Headings are inferred from type size/)).toBeInTheDocument();
  });

  it('explains a file it cannot read, without creating a row', () => {
    const { container } = render(<Home />);
    dropFile(container, new File(['x'], 'budget.xlsx'));

    expect(screen.getByText(/Kiln cannot read budget\.xlsx/)).toBeInTheDocument();
    expect(useJobs.getState().jobs).toEqual([]);
  });
});

describe('starting a conversion', () => {
  it('reports the stub engine message', async () => {
    const { container } = render(<Home />);
    dropFile(container, new File(['x'], 'notes.md'));

    fireEvent.click(screen.getByRole('button', { name: 'Convert notes.md to .pdf' }));

    await waitFor(() => expect(screen.getByText('Failed')).toBeInTheDocument());
    expect(screen.getByText('Not implemented')).toBeInTheDocument();
    expect(useJobs.getState().jobs[0]?.state).toBe('failed');
  });
});
