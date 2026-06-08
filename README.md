# quietcord

> A stealthy terminal client for Discord. No "online" status, no notifications, no bloat.

Type and read messages in your servers and voice channel chats from the command line, without ever showing up as online or triggering desktop notifications. Pick a server, pick a channel, type. The cursor hides while you work, the scrollback restores on exit, and the screen stays clean.

Built in TypeScript with [Ink](https://github.com/vadimdemedes/ink). Connects directly to Discord's gateway and REST APIs — no third-party Discord library, no bloat. You bring your own user token, you pick the channel, you write.

## Features

- **Stealth by default.** No banner, no footers, cursor hidden during use, scrollback restored on exit, errors flash in a status bar, process name can be hidden in `ps`.
- **Direct gateway.** Hand-rolled WebSocket client in `src/discord.ts`. No `djs-selfbot-v13` or other third-party Discord library.
- **Session memory.** Restores the last `(guild, channel)` you were in, and even your unsent draft, on next launch.
- **Offline send queue.** If the network drops while you're typing, the message waits in a queue and sends when you're back online.
- **Live edits and deletes.** `MESSAGE_UPDATE` and `MESSAGE_DELETE` reconcile in place, no refresh needed.
- **Voice presence.** Shows how many people are in the voice channel you're looking at.
- **Unread counter.** Silent — no beep, no OS notification, no OSC sequence. Just a `●` in the channel name.

## Install

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

The token is stored in `~/.config/quietcord/config.json` with permissions `0600`.

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
| `--no-resume` | Always start at the guild picker (skip last-channel restore) |
| `--reset-session` | Clear saved last channel and draft |
| `--verbose` | Log gateway activity to `~/.local/share/quietcord/gateway.log` |

## How to get your user token

Open Discord in a browser, open DevTools → Network → trigger any request → copy the `authorization` header value.

## Controls

- `↑/↓` navigate lists
- `enter` select / send
- `esc` go back (or quit from the guild picker)
- `ctrl+c` quit

## Troubleshooting

- **`stdin is not a TTY`** — you ran the app from a non-interactive shell. Open a real terminal and try again.
- **`no token`** — run `echo "..." | npm start -- --login` once.
- **No messages appear** — run with `--verbose` and inspect `~/.local/share/quietcord/gateway.log`. Look for `READY` and `MESSAGE_CREATE` entries. If you see `close 4004`, your token was rejected.
- **App exits immediately on `enter`** — you might be in a non-voice channel that doesn't allow your user to send. Check the status flash line.

## ⚠️ Selfbot warning

Using a user token violates Discord's ToS. The account may be banned. Not affiliated with Discord. Use at your own risk.

## License

ISC.
