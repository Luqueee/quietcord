import {readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {homedir} from 'node:os';

export type StoredConfig = {token?: string; execName?: string; showHints?: boolean};

const CONFIG_PATH = join(homedir(), '.config', 'quietcord', 'config.json');

function readConfig(): StoredConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as StoredConfig;
  } catch {
    return {};
  }
}

function writeConfig(cfg: StoredConfig): void {
  mkdirSync(dirname(CONFIG_PATH), {recursive: true, mode: 0o700});
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  try {
    chmodSync(CONFIG_PATH, 0o600);
  } catch {}
}

export function loadToken(): string | null {
  return readConfig().token ?? null;
}

export function saveToken(token: string): void {
  const cfg = readConfig();
  cfg.token = token;
  writeConfig(cfg);
}

export function clearToken(): void {
  const cfg = readConfig();
  delete cfg.token;
  writeConfig(cfg);
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
