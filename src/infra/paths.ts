import {homedir} from 'node:os';
import {join} from 'node:path';

const xdgConfig = process.env.XDG_CONFIG_HOME;
const xdgData = process.env.XDG_DATA_HOME;

const configHome = xdgConfig && xdgConfig.length > 0 ? xdgConfig : join(homedir(), '.config');
const dataHome = xdgData && xdgData.length > 0 ? xdgData : join(homedir(), '.local', 'share');

const configDir = join(configHome, 'quietcord');
const dataDir = join(dataHome, 'quietcord');

export const paths = {
  configDir,
  dataDir,
  configFile: join(configDir, 'config.json'),
  sessionFile: join(configDir, 'session.json'),
  logFile: join(dataDir, 'gateway.log'),
} as const;

export function getConfigPath(): string {
  return paths.configFile;
}

export function getSessionPath(): string {
  return paths.sessionFile;
}

export function getLogPath(): string {
  return paths.logFile;
}
