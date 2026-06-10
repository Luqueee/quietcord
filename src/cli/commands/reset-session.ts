import {clearSession, getSessionPath} from '../../session.js';

export function runResetSession(): void {
  clearSession();
  process.stdout.write('session cleared from ' + getSessionPath() + '\n');
  process.exit(0);
}
