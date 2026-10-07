import type { WhiteboardView } from '@dev-plumbing/core/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../api/client';
import { DefenseBody, type DefenseMode } from './DefensePage';
import { defense, practice, view } from './testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('../visual/testkit')).routerMock(navigate));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The page in Practice, so a rating or a tick shows up the way it does in the app: through the page's data. */
function show(v: WhiteboardView = view()) {
  const whiteboard = vi.spyOn(api, 'whiteboard').mockResolvedValue(v);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const page = (mode: DefenseMode) => (
    <QueryClientProvider client={client}>
      <DefenseBody repo="acme-app" project="restock" mode={mode} />
    </QueryClientProvider>
  );
  const { rerender } = render(page('practice'));
  return { whiteboard, switchTo: (mode: DefenseMode) => rerender(page(mode)) };
}

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');
const card = () => screen.getByTestId('flashcard');
const RATED = { ratings: { q1: 'could', q2: 'shaky', q3: 'couldnt' } as const, readiness: 25, counts: { could: 1, shaky: 1, couldnt: 1, unrated: 0, ticked: 0, checklist: 4 } };

describe('Practice', () => {
  it('shows how ready you are, the counts, and the first card with its answer and its ratings hidden', async () => {
    show(view({ practice: practice({ ratings: { q1: 'could', q2: 'shaky' }, ticks: ['k1', 'k2'], readiness: 50, counts: { could: 1, shaky: 1, couldnt: 0, unrated: 1, ticked: 2, checklist: 4 } }) }));
    expect((await screen.findByTestId('readiness')).textContent).toBe('Readiness 50%');
    const meter = screen.getByRole('progressbar', { name: 'Readiness' });
    expect(meter.getAttribute('aria-valuenow')).toBe('50');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect((meter.firstElementChild as HTMLElement).className).toContain('bg-moss');
    expect(meter.className).toContain('bg-selection');
    expect(screen.getByTestId('practice-counts').textContent).toBe("1 could explain · 1 shaky · 0 couldn't · 1 not yet");
    expect(card().textContent).toContain('Card 1 of 3');
    expect(within(card()).getByRole('heading').textContent).toBe('What happens if the job runs twice?');
    expect(within(card()).queryByTestId('flashcard-answer')).toBeNull();
    // You rate yourself after you've seen the answer.
    expect(within(card()).queryByRole('group', { name: 'Your rating' })).toBeNull();
    // Study's parts aren't shown in Practice.
    expect(screen.queryByTestId('defense-section-summary')).toBeNull();
  });

  it('Show answer reveals the answer, how sure it is, and the ratings', async () => {
    show(view({ practice: practice({ ratings: { q1: 'could' } }) }));
    fireEvent.click(await screen.findByTestId('show-answer'));
    const answer = screen.getByTestId('flashcard-answer');
    expect(answer.textContent).toBe('Every reminder goes out again, so it needs a sent marker. Inferred');
    expect(within(answer).getByText('Inferred').className).toContain('text-ink-2');
    expect(screen.queryByTestId('show-answer')).toBeNull();
    expect(pressed('Could explain it')).toBe('true');
    expect(pressed('Shaky')).toBe('false');
    expect(pressed("Couldn't")).toBe('false');
  });

  it('moves between cards with Previous and Next, without wrapping, and hides each answer again', async () => {
    show();
    const previous = (await screen.findByRole('button', { name: 'Previous' })) as HTMLButtonElement;
    const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('show-answer'));
    fireEvent.click(next);
    expect(card().textContent).toContain('Card 2 of 3');
    expect(card().textContent).toContain('Where is a reminder recorded?');
    expect(screen.queryByTestId('flashcard-answer')).toBeNull();
    fireEvent.click(next);
    expect(card().textContent).toContain('Card 3 of 3');
    expect(next.disabled).toBe(true);
    fireEvent.click(previous);
    expect(card().textContent).toContain('Card 2 of 3');
  });

  it('saves a rating, shows the new readiness straight away, and moves to the next card', async () => {
    const { whiteboard } = show();
    const rate = vi.spyOn(api, 'ratePractice').mockResolvedValue(practice({ ratings: { q1: 'could' }, readiness: 17, counts: { could: 1, shaky: 0, couldnt: 0, unrated: 2, ticked: 0, checklist: 4 } }));
    fireEvent.click(await screen.findByTestId('show-answer'));
    fireEvent.click(screen.getByRole('button', { name: 'Could explain it' }));
    await waitFor(() => expect(rate).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', questionId: 'q1', rating: 'could' }));
    await waitFor(() => expect(screen.getByTestId('readiness').textContent).toBe('Readiness 17%'));
    expect(screen.getByTestId('practice-counts').textContent).toBe("1 could explain · 0 shaky · 0 couldn't · 2 not yet");
    expect(card().textContent).toContain('Card 2 of 3');
    expect(screen.queryByTestId('flashcard-answer')).toBeNull();
    // The first card keeps it.
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByTestId('show-answer'));
    expect(pressed('Could explain it')).toBe('true');
    expect(screen.getByRole('button', { name: 'Could explain it' }).className).toContain('text-moss');
    expect(whiteboard).toHaveBeenCalledTimes(1);
  });

  it('stays on the last card once it is rated, showing the rating', async () => {
    show();
    vi.spyOn(api, 'ratePractice').mockResolvedValue(practice({ ratings: { q3: 'shaky' }, readiness: 8, counts: { could: 0, shaky: 1, couldnt: 0, unrated: 2, ticked: 0, checklist: 4 } }));
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByTestId('show-answer'));
    fireEvent.click(screen.getByRole('button', { name: 'Shaky' }));
    await waitFor(() => expect(pressed('Shaky')).toBe('true'));
    expect(card().textContent).toContain('Card 3 of 3');
  });

  it('clears a rating when you choose it again, and stays on the card', async () => {
    show(view({ practice: practice({ ratings: { q1: 'shaky' }, readiness: 8, counts: { could: 0, shaky: 1, couldnt: 0, unrated: 2, ticked: 0, checklist: 4 } }) }));
    const rate = vi.spyOn(api, 'ratePractice').mockResolvedValue(practice());
    fireEvent.click(await screen.findByTestId('show-answer'));
    fireEvent.click(screen.getByRole('button', { name: 'Shaky' }));
    await waitFor(() => expect(rate).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', questionId: 'q1', rating: null }));
    await waitFor(() => expect(pressed('Shaky')).toBe('false'));
    expect(card().textContent).toContain('Card 1 of 3');
  });

  it('works from the keyboard: Space or Enter shows the answer, 1 to 3 rate it, and the arrows move', async () => {
    show();
    const rate = vi.spyOn(api, 'ratePractice').mockResolvedValue(practice({ ratings: { q1: 'shaky' }, readiness: 8, counts: { could: 0, shaky: 1, couldnt: 0, unrated: 2, ticked: 0, checklist: 4 } }));
    await screen.findByTestId('flashcard');
    // A rating key does nothing until the answer shows.
    fireEvent.keyDown(window, { key: '2' });
    expect(rate).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.getByTestId('flashcard-answer')).toBeTruthy();
    fireEvent.keyDown(window, { key: '2' });
    await waitFor(() => expect(rate).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', questionId: 'q1', rating: 'shaky' }));
    await waitFor(() => expect(card().textContent).toContain('Card 2 of 3'));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByTestId('flashcard-answer')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(card().textContent).toContain('Card 3 of 3');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(card().textContent).toContain('Card 3 of 3');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(card().textContent).toContain('Card 2 of 3');
    // Typing a question to Claude is typing, not practising.
    fireEvent.click(within(card()).getByTestId('ask-claude'));
    fireEvent.keyDown(within(card()).getByLabelText('Your question'), { key: ' ' });
    expect(screen.queryByTestId('flashcard-answer')).toBeNull();
  });

  it("narrows the deck to the cards rated shaky or couldn't, fixed while the switch is on", async () => {
    show(view({ practice: practice(RATED) }));
    const only = await screen.findByRole('switch', { name: "Only shaky and couldn't" });
    expect(only.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(only);
    expect(only.getAttribute('aria-checked')).toBe('true');
    expect(card().textContent).toContain('Card 1 of 2');
    expect(card().textContent).toContain('Where is a reminder recorded?');
    // Rating it Could explain it moves on, but doesn't take it out of the deck.
    vi.spyOn(api, 'ratePractice').mockResolvedValue(practice({ ...RATED, ratings: { ...RATED.ratings, q2: 'could' } }));
    fireEvent.click(screen.getByTestId('show-answer'));
    fireEvent.click(screen.getByRole('button', { name: 'Could explain it' }));
    await waitFor(() => expect(card().textContent).toContain('Card 2 of 2'));
    expect(card().textContent).toContain('Who can change the lead time?');
    // It leaves at the next toggle.
    fireEvent.click(only);
    expect(card().textContent).toContain('Card 1 of 3');
    fireEvent.click(only);
    expect(card().textContent).toContain('Card 1 of 1');
  });

  it("says so when nothing is rated shaky or couldn't", async () => {
    show();
    fireEvent.click(await screen.findByRole('switch', { name: "Only shaky and couldn't" }));
    expect(screen.getByText("Nothing rated shaky or couldn't.")).toBeTruthy();
    expect(screen.queryByTestId('flashcard')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('keeps the card and the switch when you go to Study and back', async () => {
    const { switchTo } = show(view({ practice: practice(RATED) }));
    fireEvent.click(await screen.findByRole('switch', { name: "Only shaky and couldn't" }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(card().textContent).toContain('Card 2 of 2');
    switchTo('study');
    expect(await screen.findByTestId('study')).toBeTruthy();
    switchTo('practice');
    expect((await screen.findByTestId('flashcard')).textContent).toContain('Card 2 of 2');
    expect(screen.getByRole('switch', { name: "Only shaky and couldn't" }).getAttribute('aria-checked')).toBe('true');
  });

  it('ticks a checklist line, and counts it', async () => {
    show();
    const tick = vi.spyOn(api, 'tickPractice').mockResolvedValue(practice({ ticks: ['k2'], readiness: 13, counts: { could: 0, shaky: 0, couldnt: 0, unrated: 3, ticked: 1, checklist: 4 } }));
    const checklist = await screen.findByTestId('defense-checklist');
    expect(checklist.textContent).toContain('0 of 4 ticked');
    const box = within(checklist).getByRole('checkbox', { name: 'I can explain the data flow.' }) as HTMLInputElement;
    fireEvent.click(box);
    await waitFor(() => expect(tick).toHaveBeenCalledWith('acme-app', 'restock', { defenseId: 'w-1', checklistId: 'k2', ticked: true }));
    await waitFor(() => expect(checklist.textContent).toContain('1 of 4 ticked'));
    expect(box.checked).toBe(true);
    expect(screen.getByTestId('readiness').textContent).toBe('Readiness 13%');
  });

  it('says why a rating was refused', async () => {
    show();
    vi.spyOn(api, 'ratePractice').mockRejectedValue(new ApiError(409, 'The Whiteboard Defense changed since this page loaded. Reload it.', null));
    fireEvent.click(await screen.findByTestId('show-answer'));
    fireEvent.click(screen.getByRole('button', { name: "Couldn't" }));
    expect((await screen.findByRole('alert')).textContent).toBe('The Whiteboard Defense changed since this page loaded. Reload it.');
    expect(card().textContent).toContain('Card 1 of 3');
  });

  it('asks Claude about a card', async () => {
    show();
    fireEvent.click(within(await screen.findByTestId('flashcard')).getByTestId('ask-claude'));
    expect(within(card()).getByLabelText('Your question')).toBeTruthy();
  });

  it('says when the defense has no questions', async () => {
    show(view({ defense: defense({ questions: [] }), practice: practice({ counts: { could: 0, shaky: 0, couldnt: 0, unrated: 0, ticked: 0, checklist: 4 } }) }));
    expect(await screen.findByText('No questions in this defense.')).toBeTruthy();
    expect(screen.queryByTestId('flashcard')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByTestId('defense-checklist')).toBeTruthy();
  });

  it('leaves a focused control alone: Space or Enter on Next moves, and Space on the switch toggles it', async () => {
    show(view({ practice: practice(RATED) }));
    const next = await screen.findByRole('button', { name: 'Next' });
    next.focus();
    fireEvent.keyDown(next, { key: 'Enter' });
    fireEvent.keyDown(next, { key: ' ' });
    expect(screen.queryByTestId('flashcard-answer')).toBeNull();
    // The browser turns Enter or Space on a button into a click.
    fireEvent.click(next);
    expect(card().textContent).toContain('Card 2 of 3');
    expect(screen.queryByTestId('flashcard-answer')).toBeNull();
    const only = screen.getByRole('switch', { name: "Only shaky and couldn't" });
    only.focus();
    fireEvent.keyDown(only, { key: ' ' });
    expect(screen.queryByTestId('flashcard-answer')).toBeNull();
    fireEvent.click(only);
    expect(only.getAttribute('aria-checked')).toBe('true');
  });

  it('holds the card and the deck while a rating is saving, then moves on in the same deck', async () => {
    show(view({ practice: practice(RATED) }));
    let done!: (p: ReturnType<typeof practice>) => void;
    vi.spyOn(api, 'ratePractice').mockReturnValue(new Promise((r) => (done = r)));
    const only = await screen.findByRole('switch', { name: "Only shaky and couldn't" });
    fireEvent.click(only);
    fireEvent.click(screen.getByTestId('show-answer'));
    fireEvent.click(screen.getByRole('button', { name: 'Could explain it' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(true);
    expect((only as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(only);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(card().textContent).toContain('Card 1 of 2');
    expect(only.getAttribute('aria-checked')).toBe('true');
    done(practice({ ...RATED, ratings: { ...RATED.ratings, q2: 'could' } }));
    await waitFor(() => expect(card().textContent).toContain('Card 2 of 2'));
    expect(card().textContent).toContain('Who can change the lead time?');
  });
});
