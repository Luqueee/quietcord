import {appendFileSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {homedir} from 'node:os';

const LOG_PATH = join(homedir(), '.local', 'share', 'disc-chat-tui', 'gateway.log');

let enabled = false;

export function enableVerbose(): void {
  enabled = true;
  mkdirSync(dirname(LOG_PATH), {recursive: true});
}

export function log(...args: unknown[]): void {
  if (!enabled) return;
  const line = `[${new Date().toISOString()}] ${args
    .map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}\n`;
  try {
    appendFileSync(LOG_PATH, line);
  } catch {}
}

export function getLogPath(): string {
  return LOG_PATH;
}
