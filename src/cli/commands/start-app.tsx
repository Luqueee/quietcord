import React from 'react';
import {render} from 'ink';
import {DiscordClient} from '../../discord.js';
import App from '../../app.js';
import {restoreTerminal} from '../restore.js';
import {installSignalHandlers} from '../signals.js';
import {log} from '../../logger.js';

export function startApp(token: string, noResume = false): void {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      'stdin is not a TTY. quietcord requires an interactive terminal ' +
        '(run it directly in your terminal emulator, not piped or backgrounded).\n'
    );
    process.exit(1);
  }

  log('cli: starting with token length', token.length);

  const client = new DiscordClient(token);
  const {unmount, waitUntilExit} = render(
    React.createElement(App, {client, noResume}),
    {exitOnCtrlC: true, patchConsole: false}
  );

  installSignalHandlers(unmount);

  void waitUntilExit().then(() => {
    restoreTerminal();
  });
}
