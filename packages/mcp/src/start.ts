import { execFile } from 'node:child_process';
import { readInstallInfo } from '@dev-plumbing/core';
import { ServiceError } from './errors';

/** Runs `dev-plumbing start` with the Node and CLI that setup recorded. */
export async function startService(configDir: string): Promise<void> {
  const info = await readInstallInfo(configDir);
  if (!info) throw new ServiceError(503, "dev-plumbing isn't set up on this Mac. Run dev-plumbing setup in a terminal.");
  await new Promise<void>((resolve, reject) =>
    execFile(info.nodePath, [info.cliPath, 'start'], { env: { ...process.env, DEV_PLUMBING_HOME: configDir }, timeout: 20_000 }, (err, _stdout, stderr) =>
      err ? reject(new ServiceError(503, `dev-plumbing couldn't start: ${String(stderr).trim() || err.message}`)) : resolve(),
    ),
  );
}
