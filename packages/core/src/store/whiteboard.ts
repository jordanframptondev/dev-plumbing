import fs from 'node:fs/promises';
import { writeJsonAtomic } from '../atomic';
import { practiceSchema, whiteboardDefenseSchema, whiteboardRequestSchema, type Practice, type WhiteboardDefense, type WhiteboardRequest } from '../schemas';
import { projectFiles, readJsonFile } from './io';

// The Whiteboard Defense's files, in the project's whiteboard/ folder: request.json while a defense is asked for,
// defense.json once one is saved, and practice.json for your flashcard ratings and checklist ticks.

type Schema<T> = { safeParse: (v: unknown) => { success: true; data: T } | { success: false } };

/** A JSON file that matches its schema, or null when it's missing or damaged. */
async function readValid<T>(file: string, schema: Schema<T>): Promise<T | null> {
  const r = await readJsonFile(file);
  if (!r.ok) return null;
  const parsed = schema.safeParse(r.value);
  return parsed.success ? parsed.data : null;
}

/**
 * whiteboard/request.json, or null when missing or damaged. A damaged file reads as none: it only ever holds the one
 * request, so Generate can replace it.
 */
export async function readWhiteboardRequest(dir: string): Promise<WhiteboardRequest | null> {
  return readValid(projectFiles(dir).whiteboardRequest, whiteboardRequestSchema);
}

/** whiteboard/defense.json, or null when missing or damaged. */
export async function readDefense(dir: string): Promise<WhiteboardDefense | null> {
  return readValid(projectFiles(dir).defense, whiteboardDefenseSchema);
}

/** whiteboard/practice.json; empty ({ ratings: {}, ticks: {} }) when missing or damaged. */
export async function readPractice(dir: string): Promise<Practice> {
  return (await readValid(projectFiles(dir).practice, practiceSchema)) ?? { ratings: {}, ticks: {} };
}

export async function writeWhiteboardRequest(dir: string, r: WhiteboardRequest): Promise<void> {
  await writeJsonAtomic(projectFiles(dir).whiteboardRequest, r);
}

export async function writeDefense(dir: string, d: WhiteboardDefense): Promise<void> {
  await writeJsonAtomic(projectFiles(dir).defense, d);
}

export async function writePractice(dir: string, p: Practice): Promise<void> {
  await writeJsonAtomic(projectFiles(dir).practice, p);
}

/** Removes request.json. Fine when there's none. */
export async function removeWhiteboardRequest(dir: string): Promise<void> {
  await fs.rm(projectFiles(dir).whiteboardRequest, { force: true });
}
