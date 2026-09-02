# lm-cli

The `@design-edito/cli` command-line tool. Each subdirectory of `src/` whose `index.ts` is discovered becomes a standalone CLI command: it is bundled with esbuild, given a `#!/usr/bin/env node` shebang and made executable under `build/`.

Shared conventions — commits, code style, import order — live in the root
[`../CLAUDE.md`](../CLAUDE.md) and apply here. This file only adds what is specific
to this repo.

Commit scope is a command or a top-level concern (e.g. `packages`, `tsconfig`,
`src`, `diff`, `make-template`). Before committing a dependency or config bump,
run `npm run build` and confirm it is green.

## Where new code goes

**This repo is meant to be a CLI orchestrator, nothing more:** argument parsing,
prompts, output formatting, exit codes. The business logic it drives belongs in
`lm-tools`, and is consumed from there.

That is not yet true of the existing commands — several carry their own logic —
but it is the direction. So a new command wires up `@design-edito/tools`
functions; when the function it needs does not exist, write it in `lm-tools` and
call it, rather than growing the logic here.

## Build assets: `.build` and `.publish` hooks

A command may ship a sibling `assets/` folder (copied verbatim into `build/<command>/assets/` at build time). Inside such an `assets/` folder, two optional folders act as **generator hooks** that produce derived asset files, then erase themselves so they never ship:

- **`assets/.build/`** — runs on every `npm run build` (see `scripts/build/index.ts`).
- **`assets/.publish/`** — runs only at `prepublishOnly`, just before `npm publish` (see `scripts/pre-publish/index.ts`).

### Philosophy

Assets that must stay in sync with the codebase (a command manifest, a version stamp) are **regenerated deterministically at build/publish time** instead of being hand-maintained. This keeps derived files free of drift, lets an asset carry build-time logic without polluting the CLI's source or runtime, and — via the two-stage split — lets a value be cheap in dev and accurate at publish. For example, `cli/assets/.build` writes `list.txt` (the sorted list of built commands) and seeds `version.txt` with `'developpment'`; `cli/assets/.publish` then overwrites `version.txt` with the real version read from `package.json`. Both files are consumed by `src/cli/index.ts` at runtime (command listing and `--version`).

### The contract

A `.build` / `.publish` folder is auto-discovered — the orchestrator scans every `assets/` for it, so no registration is needed. To be picked up it **must** contain:

- `index.ts` — the generator. It receives the **assets dir path as `process.argv[2]`** and writes its output files relative to that path. It should depend only on `node:*` builtins (it is compiled and run in isolation, decoupled from `src`).
- `tsconfig.json` — its own compiler config. It compiles `index.ts` to `./dist/index.js`, which is then run as a separate `node` process.

If either file is missing, or transpilation fails, the orchestrator logs, skips, and removes the folder (fail-soft) — a malformed hook never breaks the build. After a successful run the `.build` / `.publish` folder is deleted from the output.

### Conventions for hook tsconfigs

Keep these configs modern (they are typechecked by the IDE and would break on TypeScript 7): no `baseUrl` (unused — hooks import only `node:*`), and `"moduleResolution": "bundler"` rather than the deprecated node10 `"Node"`. Mirror `src/tsconfig.json`.
