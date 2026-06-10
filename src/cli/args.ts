import meow from 'meow';

export type CLIArgs = {
  token: string | undefined;
  login: boolean;
  logout: boolean;
  resetSession: boolean;
  execName: string;
  showHints: boolean;
  noResume: boolean;
  verbose: boolean;
};

export function parseArgs(argv: string[]): CLIArgs {
  if (argv.includes('--')) {
    argv = argv.filter(a => a !== '--');
  }
  const cli = meow(
    `
    Usage
      $ quietcord [options]
      $ quietcord --login          set token from stdin (writes to ~/.config/quietcord/config.json)
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
  return {
    token: cli.flags.token,
    login: cli.flags.login,
    logout: cli.flags.logout,
    resetSession: cli.flags.resetSession,
    execName: cli.flags.execName,
    showHints: cli.flags.showHints,
    noResume: cli.flags.noResume,
    verbose: cli.flags.verbose,
  };
}
