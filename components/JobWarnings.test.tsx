import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Warning } from '@/lib/registry/types';
import JobWarnings from './JobWarnings';

const lost = (message: string, step?: string): Warning => ({
  severity: 'lost',
  message,
  step,
});
const changed = (message: string, step?: string): Warning => ({
  severity: 'changed',
  message,
  step,
});
const note = (message: string, step?: string): Warning => ({
  severity: 'note',
  message,
  step,
});

describe('the warning hierarchy', () => {
  it('shows a lost warning without a disclosure to open', () => {
    render(<JobWarnings warnings={[lost('An image was not carried over.')]} />);

    expect(screen.getByText('An image was not carried over.')).toBeInTheDocument();
    // The one rule that matters: data gone is never behind a click.
    expect(document.querySelector('details')).toBeNull();
  });

  it('puts notes behind a closed disclosure', () => {
    render(
      <JobWarnings
        warnings={[note('Headings were inferred from type size.'), note('Two sheets.')]}
      />,
    );

    const details = document.querySelector('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByText('2 notes')).toBeInTheDocument();
  });

  it('counts one note in the singular', () => {
    render(<JobWarnings warnings={[note('Only one.')]} />);
    expect(screen.getByText('1 note')).toBeInTheDocument();
  });

  it('keeps lost out of the disclosure even when notes are present', () => {
    render(
      <JobWarnings
        warnings={[note('A note.'), lost('A footnote was dropped.'), note('Another.')]}
      />,
    );

    const details = document.querySelector('details');
    expect(details).not.toBeNull();
    expect(
      within(details as HTMLElement).queryByText('A footnote was dropped.'),
    ).toBeNull();
    expect(screen.getByText('A footnote was dropped.')).toBeInTheDocument();
  });

  it('groups five warnings from a routed pair under three headings', () => {
    // The case the hierarchy exists for: two engines both had something to say,
    // and an undifferentiated list of five sentences answers no question.
    render(
      <JobWarnings
        warnings={[
          lost('An image was not carried over.', '.odt → .md'),
          changed('2 table cells spanned more than one column.', '.odt → .md'),
          lost('One footnote or endnote was dropped.', '.odt → .md'),
          note('Headings were inferred from type size.', '.md → .pdf'),
          changed('Stylesheets were dropped.', '.md → .pdf'),
        ]}
      />,
    );

    expect(screen.getByText('Lost')).toBeInTheDocument();
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(screen.getByText('1 note')).toBeInTheDocument();

    // Two lost, two changed, one note — the note is the only one hidden.
    const details = document.querySelector('details') as HTMLElement;
    expect(within(details).getAllByRole('listitem')).toHaveLength(1);
  });

  it('names the step beside the sentence rather than inside it', () => {
    render(
      <JobWarnings warnings={[lost('An image was not carried over.', '.odt → .md')]} />,
    );

    // The sentence stays the sentence the engine wrote; the step sits beside it.
    expect(screen.getByText('.odt → .md')).toBeInTheDocument();
    expect(screen.getByText('An image was not carried over.')).toBeInTheDocument();
  });

  it('renders nothing at all when there are no warnings', () => {
    const { container } = render(<JobWarnings warnings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps both when two steps lose the same thing', () => {
    // Same sentence, different step. Both belong on the row, so neither may be
    // dropped by a key collision.
    render(
      <JobWarnings
        warnings={[
          lost('An image was not carried over.', '.odt → .md'),
          lost('An image was not carried over.', '.md → .pdf'),
        ]}
      />,
    );

    expect(screen.getAllByText('An image was not carried over.')).toHaveLength(2);
  });
});
