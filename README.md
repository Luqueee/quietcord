# disc-chat-tui

Tiny TUI to chat in a Discord voice channel's text chat, written in TypeScript with [Ink](https://github.com/vadimdemedes/ink).

## How it works

- Connects to Discord using **your user token** over the official REST + Gateway APIs (no third-party Discord library).
- No microphone / no audio — just text in the voice channel's text-in-voice chat.
- Pick a server → pick a channel (`#text` or `🔊 voice`) → type messages.
- **Stealth by default**: no banner, no footers, cursor hidden during use, scrollback restored on exit, errors flash in a status bar.

> ⚠️ Selfbot warning: using a user token violates Discord's ToS. Use at your own risk; the account may be banned.

## Setup

```sh
npm install
npm run build
```

## Run

This is a terminal app. **It must be run from a real interactive terminal** (gnome-terminal, iTerm2, Alacritty, kitty, Windows Terminal, tmux pane, etc.). It will not work when piped, backgrounded with `&`, or run from IDE run-panels that don't expose a TTY.

### First time: save your token

```sh
echo "your_token_here" | npm start -- --login
```

The token is stored in `~/.config/disc-chat-tui/config.json` with permissions `0600`.

### Subsequent runs

```sh
npm start
# or with env var
DISCORD_TOKEN=your_token npm start
# or explicit override
npm start -- --token your_token
```

### Useful flags

| Flag | Effect |
|---|---|
| `--login` | Read token from stdin, save to disk |
| `--logout` | Remove stored token |
| `--token <t>`, `-t <t>` | Use this token, ignore stored/env |
| `--exec-name <name>` | Set `process.title` (default: `node`) — controls what `ps` shows |
| `--show-hints` | Show keyboard hints footer (off by default for stealth) |
| `--verbose` | Log gateway activity to `~/.local/share/disc-chat-tui/gateway.log` |

## How to get your user token

Open Discord in a browser, open DevTools → Network → trigger any request → copy the `authorization` header value.

## Controls

- `↑/↓` navigate lists
- `enter` select / send
- `esc` go back
- `ctrl+c` quit

## Troubleshooting

- **`stdin is not a TTY`** — you ran the app from a non-interactive shell. Open a real terminal and try again.
- **`no token`** — run `echo "..." | npm start -- --login` once.
- **No messages appear** — run with `--verbose` and inspect `~/.local/share/disc-chat-tui/gateway.log`. Look for `READY` and `MESSAGE_CREATE` entries. If you see `close 4004`, your token was rejected.
- **App exits immediately on `enter`** — you might be in a non-voice channel that doesn't allow your user to send. Check the status flash line.
