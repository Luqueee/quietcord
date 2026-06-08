#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';
import {loadToken, saveToken, clearToken, getConfigPath} from './config.js';
import {enableVerbose, log} from './logger.js';
import {clearSession, getSessionPath} from './session.js';

if (process.argv.includes('--')) {
  process.argv = process.argv.filter(a => a !== '--');
}

const cli = meow(
  `
  Usage
    $ quietcord [options]
    $ quietcord --login          set token (writes to ~/.config/quietcord/config.json)
    $ quietcord --logout         clear stored token
    $ quietcord --reset-session  clear last channel/draft memory

  Options
    --token, -t  Discord user token (overrides stored token and env)
    --login      read token from stdin and save it
    --logout     remove stored token
    --exec-name  process title shown in ps (default: node)
    --show-hints show keyboard hints footer
    --no-resume  always start at guild picker (skip last channel restore)
    --reset-session  clear saved last channel and draft
    --verbose    log gateway activity to ~/.local/share/quietcord/gateway.log
`,
  {
    importMeta: import.meta,
    flags: {
      token: {type: 'string', shortFlag: 't'},
      login: {type: 'boolean', default: false},
      logout: {type: 'boolean', default: false},
      execName: {type: 'string', default: 'node'},
      showHints: {type: 'boolean', default: false},
      noResume: {type: 'boolean', default: false},
      resetSession: {type: 'boolean', default: false},
      verbose: {type: 'boolean', default: false},
    },
  }
);

if (cli.flags.verbose) enableVerbose();

if (cli.flags.execName) process.title = cli.flags.execName;

if (cli.flags.logout) {
  clearToken();
  process.stdout.write('token cleared from ' + getConfigPath() + '\n');
  process.exit(0);
}

if (cli.flags.resetSession) {
  clearSession();
  process.stdout.write('session cleared from ' + getSessionPath() + '\n');
  process.exit(0);
}

if (cli.flags.login) {
  process.stdout.write('paste token: ');
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buf += chunk;
    const line = buf.trim();
    if (line) {
      saveToken(line);
      process.stdout.write('saved to ' + getConfigPath() + '\n');
      process.exit(0);
    }
  });
  process.stdin.on('end', () => {
    if (!buf.trim()) {
      process.stderr.write('no token provided\n');
      process.exit(1);
    }
  });
} else {
  const token = cli.flags.token || process.env.DISCORD_TOKEN || loadToken() || '';
  if (!token) {
    process.stderr.write('no token; pass --token, set DISCORD_TOKEN, or run --login\n');
    process.exit(1);
  }

  if (!process.stdin.isTTY) {
    process.stderr.write(
      'stdin is not a TTY. quietcord requires an interactive terminal ' +
        '(run it directly in your terminal emulator, not piped or backgrounded).\n'
    );
    process.exit(1);
  }

  log('cli: starting with token length', token.length);

  const {unmount, waitUntilExit} = render(
    React.createElement(App, {
      token,
      showHints: cli.flags.showHints,
      noResume: cli.flags.noResume,
    }),
    {exitOnCtrlC: true, patchConsole: false}
  );

  const restoreTerminal = () => {
    if (process.stdout.writable) {
      process.stdout.write('\x1b[?25h');
      process.stdout.write('\x1b[?1049l');
    }
  };

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => {
      restoreTerminal();
      unmount();
      process.exit(0);
    });
  }

  process.on('exit', () => {
    restoreTerminal();
  });

  void waitUntilExit().then(() => {
    restoreTerminal();
  });
}
