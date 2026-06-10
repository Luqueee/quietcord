import {readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync} from 'node:fs';
import {dirname} from 'node:path';

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

export function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), {recursive: true, mode: DIR_MODE});
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  try {
    chmodSync(filePath, FILE_MODE);
  } catch {}
}

export function updateJson<T>(filePath: string, fallback: T, update: (cur: T) => T): T {
  const cur = readJson<T>(filePath, fallback);
  const next = update(cur);
  writeJson(filePath, next);
  return next;
}
