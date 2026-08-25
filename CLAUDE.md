# lm-cli

The `@design-edito/cli` command-line tool. Each subdirectory of `src/` whose `index.ts` is discovered becomes a standalone CLI command: it is bundled with esbuild, given a `#!/usr/bin/env node` shebang and made executable under `build/`.

## Git workflow

- Commit message shape: `<scope>: <lowercase description>`. Scope is the area touched — a command or top-level concern (e.g. `packages`, `tsconfig`, `src`, `diff`, `make-template`). The description after the colon is lowercase and terse: a few words, not a full punctuated sentence. Multiple concerns can be joined with `+` or `&`.
- Do not add a `Co-Authored-By: Claude` trailer to commits in this repo — use a plain commit message.
- Only run `git commit` when asked, and stage explicitly (`git add <paths>`) only the files relevant to that commit. Never run `git push` or `git pull` — the user handles pushing and pulling themselves.
- Before committing dependency or config bumps, run `npm run build` and confirm it is green — do not commit a red build.

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

## TODO

- [ ] **Modernize the `make-template` scaffolding tsconfigs.** The templates under `src/make-template/assets/` are shipped verbatim into user-scaffolded projects, and several still use the deprecated `baseUrl` + node10 `"moduleResolution": "Node"` — so every generated project inherits the same TypeScript 7 deprecation (and eventual breakage). Update them (checking per-template whether any imports actually rely on `baseUrl` before removing it, and picking `nodenext` vs `bundler` per project type): `express/src/tsconfig.json`, `express-api/src/tsconfig.json`, `node-ts/src/tsconfig.json`, `react/src/tsconfig.json`, `react/scripts/tsconfig.json`.
