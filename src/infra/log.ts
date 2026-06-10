import {appendFileSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {getLogPath} from './paths.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let level: LogLevel = 'error';
let enabled = false;

const ORDER: Record<LogLevel, number> = {debug: 0, info: 1, warn: 2, error: 3};

export function setLogLevel(l: LogLevel): void {
  level = l;
  enabled = l !== 'error' || process.env.QUIETCORD_LOG === '1';
  if (enabled) {
    mkdirSync(dirname(getLogPath()), {recursive: true});
  }
}

function emit(l: LogLevel, args: unknown[]): void {
  if (!enabled) return;
  if (ORDER[l] < ORDER[level]) return;
  const line = `[${new Date().toISOString()}] [${l}] ${args
    .map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}\n`;
  try {
    appendFileSync(getLogPath(), line);
  } catch {}
}

export function debug(...args: unknown[]): void {
  emit('debug', args);
}

export function info(...args: unknown[]): void {
  emit('info', args);
}

export function warn(...args: unknown[]): void {
  emit('warn', args);
}

export function error(...args: unknown[]): void {
  emit('error', args);
}

export function enableVerbose(): void {
  setLogLevel('debug');
}

export const log = debug;
