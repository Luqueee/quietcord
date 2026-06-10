import React from 'react';
import {render} from 'ink';
import {TokenPrompt} from '../../ui/components/TokenPrompt.js';
import {getConfigPath, saveToken} from '../../config.js';
import {restoreTerminal} from '../restore.js';
import {installSignalHandlers} from '../signals.js';
import {startApp} from './start-app.js';

export function promptForToken(): void {
  let pending: {unmount: () => void} | null = null;

  const handleSave = (t: string): void => {
    saveToken(t);
    if (pending) pending.unmount();
    if (process.stdout.writable) {
      process.stdout.write('\x1b[2J\x1b[H');
    }
    startApp(t);
  };
  const handleQuit = (): void => {
    restoreTerminal();
    process.exit(0);
  };

  installSignalHandlers();
  const r = render(
    React.createElement(TokenPrompt, {
      configPath: getConfigPath(),
      onSave: handleSave,
      onQuit: handleQuit,
    }),
    {exitOnCtrlC: false, patchConsole: false}
  );
  pending = r;
}
