import {restoreTerminal} from './restore.js';

export function installSignalHandlers(unmount: () => void = () => {}): void {
  const handler = (): void => {
    restoreTerminal();
    unmount();
    process.exit(0);
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, handler);
  }
  process.on('exit', () => {
    restoreTerminal();
  });
}
