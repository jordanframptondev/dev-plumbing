import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { itemSchema, type Item, type Practice, type WhiteboardRequest } from '../src/schemas';
import { projectFiles, readItem, writeItem } from '../src/store/io';
import {
  readDefense,
  readPractice,
  readWhiteboardRequest,
  removeWhiteboardRequest,
  writeDefense,
  writePractice,
  writeWhiteboardRequest,
} from '../src/store/whiteboard';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject, storedDefense } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-06T09:00:00.000Z';
const exists = (file: string) => fs.access(file).then(() => true, () => false);

describe('the whiteboard files', () => {
  it('read as nothing when they are missing or damaged', async () => {
    const dir = await seedProject();
    const files = projectFiles(dir);
    const nothing = async () => {
      expect(await readWhiteboardRequest(dir)).toBeNull();
      expect(await readDefense(dir)).toBeNull();
      expect(await readPractice(dir)).toEqual({ ratings: {}, ticks: {} });
    };
    await nothing();
    await fs.mkdir(files.whiteboard);
    for (const file of [files.whiteboardRequest, files.defense, files.practice]) await fs.writeFile(file, '{damaged');
    await nothing();
    // JSON of the wrong shape is damaged too.
    await fs.writeFile(files.whiteboardRequest, JSON.stringify({ id: 'g-1', state: 'proposed', requestedAt: AT }));
    await fs.writeFile(files.defense, JSON.stringify({ ...storedDefense(), level: 4 }));
    await fs.writeFile(files.practice, JSON.stringify({ ratings: { 'Where does the renewal date come from?': { rating: 'maybe', at: AT } } }));
    await nothing();
  });

  it('write and read back, making whiteboard/ when it is needed', async () => {
    const dir = await seedProject();
    const files = projectFiles(dir);
    expect(files).toMatchObject({
      whiteboard: path.join(dir, 'whiteboard'),
      whiteboardRequest: path.join(dir, 'whiteboard', 'request.json'),
      defense: path.join(dir, 'whiteboard', 'defense.json'),
      practice: path.join(dir, 'whiteboard', 'practice.json'),
    });
    expect(await exists(files.whiteboard)).toBe(false);
    const request: WhiteboardRequest = { id: 'g-1', state: 'writing', requestedAt: AT, pickedUpAt: AT, pickedUpBy: 'w-a', inputsHash: 'abc', basedOn: { doc: 'draft', version: 1 } };
    await writeWhiteboardRequest(dir, request);
    expect(await readWhiteboardRequest(dir)).toEqual(request);
    const defense = storedDefense();
    await writeDefense(dir, defense);
    expect(await readDefense(dir)).toEqual(defense);
    const practice: Practice = { ratings: { 'What stops a customer getting two reminders?': { rating: 'shaky', at: AT } }, ticks: { 'I can explain the purpose.': AT } };
    await writePractice(dir, practice);
    expect(await readPractice(dir)).toEqual(practice);
    expect((await fs.readdir(files.whiteboard)).sort()).toEqual(['defense.json', 'practice.json', 'request.json']);
  });

  it('remove the request and nothing else, and are fine when there is none', async () => {
    const dir = await seedProject();
    await expect(removeWhiteboardRequest(dir)).resolves.toBeUndefined();
    await writeWhiteboardRequest(dir, { id: 'g-1', state: 'requested', requestedAt: AT });
    await writeDefense(dir, storedDefense());
    await removeWhiteboardRequest(dir);
    expect(await readWhiteboardRequest(dir)).toBeNull();
    expect(await readDefense(dir)).toEqual(storedDefense());
    await expect(removeWhiteboardRequest(dir)).resolves.toBeUndefined();
  });

  it('keep which part of the defense an item came from', async () => {
    const dir = await seedProject();
    const { item } = pair('defense-unsubscribe-link', { type: 'defense', title: 'Does the unsubscribe link need a token?' });
    const asked: Item = { ...item, createdBy: 'whiteboard', fromDefense: { id: 'w-test', kind: 'section', ref: 'security' } };
    await writeItem(dir, asked);
    expect(await readItem(dir, asked.id)).toEqual(asked);
    // It's checked, not just carried along: a part of another kind reads as none, as a malformed anchor does, so the
    // item is never hidden.
    const malformed = itemSchema.safeParse({ ...asked, fromDefense: { id: 'w-test', kind: 'box', ref: 'security' } });
    expect(malformed.success).toBe(true);
    expect(malformed.data?.fromDefense).toBeUndefined();
    expect(malformed.data?.title).toBe(asked.title);
    // An item sent to Questions keeps the text it was sent with.
    const sent: Item = { ...pair('questions-unsubscribe-link').item, createdBy: 'whiteboard', fromDefense: { id: 'w-test', kind: 'claim', ref: 'security.1', text: 'Whether the unsubscribe link needs a signed token.' } };
    await writeItem(dir, sent);
    expect(await readItem(dir, sent.id)).toEqual(sent);
  });
});
