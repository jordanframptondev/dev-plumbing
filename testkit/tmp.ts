import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const created = new Set<string>();

/** Some tests lock folders with chmod 000 to simulate unreadable ones. Unlock them so they can be removed. */
function unlock(dir: string): void {
  try {
    fs.chmodSync(dir, 0o700);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) unlock(path.join(dir, entry.name));
    }
  } catch {
    // Already gone, or not ours to change.
  }
}

/** A fresh folder under the OS temp folder. Call `afterAll(removeTempDirs)` in every test file that uses this. */
export function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.add(dir);
  return dir;
}

/** Deletes every folder `tempDir` made in this test file. */
export function removeTempDirs(): void {
  for (const dir of created) {
    unlock(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  created.clear();
}
