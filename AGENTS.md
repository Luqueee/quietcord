# quietcord — agent guide

Stealthy TUI Discord client written in TypeScript + Ink. Treat this file as canonical for any change in the repo.

## Project layout

```
src/
  cli/              # arg parsing, command dispatch, terminal restore
  domain/           # pure types: Snowflake, User, Channel, Guild, Message
                    # union discriminada de GatewayEvent
  discord/          # WebSocket gateway + REST + ratelimit + typed event bus
  state/            # pure reducer (state, action) => state + selectors
  markdown/         # parse + render for Discord-flavored markdown
  ui/
    components/     # presentational, no useInput if avoidable
    hooks/          # useKeybindings, useDiscordEvents, useTerminalCursor
    keybindings/    # declarative tables: stealth.ts, normal.ts, shared.ts
    views/          # ModeSelect, StealthFlow, NormalFlow
  infra/            # XDG paths, secure fs store, leveled logger
  app.tsx           # root: <Providers> + <Router>
  router.tsx        # (mode, view) => component
  provider.tsx      # ClientProvider, SessionProvider
tests/              # vitest
```

## Conventions

- 2 spaces, single quotes, semicolons, no trailing commas.
- `*.ts` if the file returns no JSX. `*.tsx` only if it does.
- Components are `PascalCase`. Hooks are `useXxx`. Types are `Xxx` or `XxxState`.
- No barrel files (`index.ts` re-exporting a directory's contents).
- One file, one responsibility. If a file passes ~200 lines, split.
- `any` is forbidden; `unknown` is allowed at boundaries.
- The `state` reducer MUST stay pure. Side effects (fs, network, timers) live in hooks or in `discord/`.
- The `client` Discord lives in a React Context, not in the state.
- All persisted paths are XDG-aware (`$XDG_CONFIG_HOME`, `$XDG_DATA_HOME`).
- Files under `~/.config/quietcord/` are `chmod 0o600`. Directories are `0o700`.

## Testing

- `vitest` + `ink-testing-library`.
- Every pure helper in `state/`, `markdown/`, `discord/ratelimit.ts` must have a test.
- UI tests are best-effort; if `ink-testing-library` cannot simulate a particular `useInput` interaction, skip it rather than mock-stabbing the renderer.

## Commands

- `pnpm run build` — `tsc` to `dist/`.
- `pnpm run typecheck` — `tsc --noEmit`.
- `pnpm test` — `vitest run`.
- `pnpm run dev` — `tsc --watch`.

## Git

- Do not commit. The user reviews and commits.
- Do not amend, force-push, skip hooks, or change git config.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
