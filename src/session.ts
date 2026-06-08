import {readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {homedir} from 'node:os';

export type SessionState = {
  guildId?: string;
  channelId?: string;
  draft?: string;
  draftAt?: number;
  updatedAt: number;
};

const SESSION_PATH = join(homedir(), '.config', 'quietcord', 'session.json');
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

function readRaw(): SessionState {
  if (!existsSync(SESSION_PATH)) return {updatedAt: 0};
  try {
    return JSON.parse(readFileSync(SESSION_PATH, 'utf8')) as SessionState;
  } catch {
    return {updatedAt: 0};
  }
}

function writeRaw(s: SessionState): void {
  mkdirSync(dirname(SESSION_PATH), {recursive: true, mode: 0o700});
  writeFileSync(SESSION_PATH, JSON.stringify(s, null, 2));
  try {
    chmodSync(SESSION_PATH, 0o600);
  } catch {}
}

export function loadSession(): SessionState {
  const s = readRaw();
  if (s.draftAt && Date.now() - s.draftAt > DRAFT_TTL_MS) {
    delete s.draft;
    delete s.draftAt;
  }
  return s;
}

export function saveChannel(guildId: string, channelId: string): void {
  const s = readRaw();
  s.guildId = guildId;
  s.channelId = channelId;
  s.updatedAt = Date.now();
  writeRaw(s);
}

export function saveDraft(draft: string): void {
  const s = readRaw();
  s.draft = draft;
  s.draftAt = Date.now();
  s.updatedAt = Date.now();
  writeRaw(s);
}

export function clearDraft(): void {
  const s = readRaw();
  delete s.draft;
  delete s.draftAt;
  s.updatedAt = Date.now();
  writeRaw(s);
}

export function clearSession(): void {
  writeRaw({updatedAt: Date.now()});
}

export function getSessionPath(): string {
  return SESSION_PATH;
}
