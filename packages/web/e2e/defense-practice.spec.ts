import { expect, test, type Page } from '@playwright/test';
import { defenseInput, importProject, writeDefense } from './claude';
import { noSideScroll } from './env';

/** The first four of the rules file's 20 checklist lines, which the service copies into every defense. */
const LINES = ['I can explain the purpose.', 'I can draw the system flow.', 'I understand the important data.', 'I know the source of truth for important state.'];

/** Rates card 1 Could explain it with a click, and card 2 Shaky with the keys, and ticks the first four checklist lines. */
async function practise(page: Page) {
  const card = page.getByTestId('flashcard');
  await expect(card).toContainText('Card 1 of 3');
  // The ratings come with the answer.
  await expect(card.getByRole('button', { name: 'Could explain it' })).toHaveCount(0);
  await card.getByTestId('show-answer').click();
  await expect(card).toContainText('Every reminder goes out again, so it needs a sent marker.');
  await card.getByRole('button', { name: 'Could explain it' }).click();
  // A rating moves to the next card. Space shows its answer, and 2 rates it Shaky.
  await expect(card).toContainText('Card 2 of 3');
  await expect(card.getByTestId('flashcard-answer')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(card.getByTestId('flashcard-answer')).toContainText('In the reminders table.');
  await page.keyboard.press('2');
  await expect(card).toContainText('Card 3 of 3');
  await page.keyboard.press('ArrowLeft');
  await expect(card).toContainText('Card 2 of 3');
  await page.keyboard.press('Enter');
  await expect(card.getByRole('button', { name: 'Shaky' })).toHaveAttribute('aria-pressed', 'true');
  const checklist = page.getByTestId('defense-checklist');
  for (const line of LINES) {
    await checklist.getByRole('checkbox', { name: line }).check();
    await expect(checklist.getByRole('checkbox', { name: line })).toBeChecked();
  }
}

test('Practice keeps your ratings and ticks, and a regenerated defense keeps what still applies', async ({ page }) => {
  const p = await importProject('def-practice', 'Defense practice');
  await writeDefense(p);
  await page.goto(`${p.url}/defense`);
  await page.getByRole('tab', { name: 'Practice' }).click();
  await expect(page).toHaveURL(new RegExp(`${p.url}/defense\\?mode=practice$`));
  await expect(page.getByTestId('readiness')).toHaveText('Readiness 0%');
  await expect(page.getByTestId('practice-counts')).toHaveText("0 could explain · 0 shaky · 0 couldn't · 3 not yet");

  await practise(page);
  // Half the cards, half the checklist: round(100 × ((1 + ½) / 3 + 4 / 20) / 2) = 35
  await expect(page.getByTestId('readiness')).toHaveText('Readiness 35%');
  await expect(page.getByRole('progressbar', { name: 'Readiness' })).toHaveAttribute('aria-valuenow', '35');
  await expect(page.getByTestId('practice-counts')).toHaveText("1 could explain · 1 shaky · 0 couldn't · 1 not yet");
  await expect(page.getByTestId('defense-checklist')).toContainText('4 of 20 ticked');

  // Only shaky and couldn't: the one card rated Shaky. Study and back keeps the switch and the card.
  const only = page.getByRole('switch', { name: "Only shaky and couldn't" });
  await only.click();
  const card = page.getByTestId('flashcard');
  await expect(card).toContainText('Card 1 of 1');
  await expect(card).toContainText('Where is a reminder recorded?');
  await page.getByRole('tab', { name: 'Study' }).click();
  // Study shows the ticks too, read-only.
  await expect(page.getByTestId('defense-checklist')).toContainText('4 of 20 ticked');
  await page.getByRole('tab', { name: 'Practice' }).click();
  await expect(card).toContainText('Card 1 of 1');
  await expect(only).toHaveAttribute('aria-checked', 'true');
  await only.click();
  await expect(card).toContainText('Card 1 of 3');

  // Everything is saved.
  await page.reload();
  await expect(page.getByTestId('readiness')).toHaveText('Readiness 35%');
  await card.getByTestId('show-answer').click();
  await expect(card.getByRole('button', { name: 'Could explain it' })).toHaveAttribute('aria-pressed', 'true');
  for (const line of LINES) await expect(page.getByTestId('defense-checklist').getByRole('checkbox', { name: line })).toBeChecked();

  // Regenerated with the same checklist and the second question asked another way: the ticks and the first card's
  // rating stay, and the changed card starts unrated.
  const input = defenseInput();
  input.questions[1].q = 'Where does a sent reminder get recorded?';
  await writeDefense(p, input);
  await expect(page.getByTestId('practice-counts')).toHaveText("1 could explain · 0 shaky · 0 couldn't · 2 not yet");
  // round(100 × (1 / 3 + 4 / 20) / 2) = 27
  await expect(page.getByTestId('readiness')).toHaveText('Readiness 27%');
  await expect(page.getByTestId('defense-checklist')).toContainText('4 of 20 ticked');
  await expect(card).toContainText('Card 1 of 3');
  await card.getByTestId('show-answer').click();
  await expect(card.getByRole('button', { name: 'Could explain it' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(card).toContainText('Where does a sent reminder get recorded?');
  await card.getByTestId('show-answer').click();
  for (const name of ['Could explain it', 'Shaky', "Couldn't"]) await expect(card.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('a card, the meter and the checklist fit the width', async ({ page }) => {
    const p = await importProject('def-practice-phone', 'Defense practice phone');
    await writeDefense(p);
    await page.goto(`${p.url}/defense?mode=practice`);
    await expect(page.getByTestId('flashcard')).toContainText('Card 1 of 3');
    await page.getByTestId('show-answer').click();
    await expect(page.getByTestId('defense-checklist')).toContainText('0 of 20 ticked');
    expect(await noSideScroll(page)).toEqual([]);
  });
});
