import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { cliPath, e2eEnv, e2eTmp } from './env';

export default function globalTeardown() {
  const tmp = e2eTmp();
  execFileSync(process.execPath, [cliPath, 'stop'], { env: e2eEnv(tmp), stdio: 'inherit' });
  fs.rmSync(tmp, { recursive: true, force: true });
}
