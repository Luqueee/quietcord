import {clearToken, getConfigPath} from '../../config.js';

export function runLogout(): void {
  clearToken();
  process.stdout.write('token cleared from ' + getConfigPath() + '\n');
  process.exit(0);
}
