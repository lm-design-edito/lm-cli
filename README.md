# @design-edito/cli

Command-line tool for the *le-monde* projects. Each subdirectory of `src/` whose
`index.ts` is discovered becomes a standalone command: it is bundled with esbuild,
given a `#!/usr/bin/env node` shebang and made executable under `build/`.

A command may ship a sibling `assets/` folder, copied verbatim at build time. See
[CLAUDE.md](./CLAUDE.md) for the `.build` / `.publish` generator hooks and the
coding conventions, and the root [`../CLAUDE.md`](../CLAUDE.md) for the shared ones.

---

# Roadmap

## Chantiers

- [ ] **Modernize the `make-template` scaffolding tsconfigs.** The templates under `src/make-template/assets/` are shipped verbatim into user-scaffolded projects, and several still use the deprecated `baseUrl` + node10 `"moduleResolution": "Node"` — so every generated project inherits the same TypeScript 7 deprecation (and eventual breakage). Update them (checking per-template whether any imports actually rely on `baseUrl` before removing it, and picking `nodenext` vs `bundler` per project type): `express/src/tsconfig.json`, `express-api/src/tsconfig.json`, `node-ts/src/tsconfig.json`, `react/src/tsconfig.json`, `react/scripts/tsconfig.json`.

## Idées d'utilitaires — diff et messages de commit

Esquissées dans `lm-tools/src/TODO.md`, déplacées ici : elles relèvent du CLI, pas
de la librairie.



### Get diff from commit hash

```ts
export type GetDiffOptions = {
  cwd?: string
}

// Pas certain de Array<string> mais c'est peut-être suffisant,
// l'idée c'est d'avoir une liste descriptive des changements successifs sur un fichier (genre le contenu brut de git diff)
export type Diff = Record<string, Array<string>>

// Ou pas async si pas nécessaire
export async function getDiffFrom (
  commitHash: string,
  options: GetDiffOptions = {}
): Promise<Diff> {
  const { cwd } = options
  return {}
}
```

### Generate commit message from diff

```ts
export type GenerateDiffDescriptionOptions = {
  customPromptOrSomething?: string // juste une idée comme ça, sais pas si c'est pertinent
  // Ptet c'est là qu'il faut dire "je veux plutôt un changelog, ou plutôt un message de commit"
}

export async function generateDiffDescription (
  diff: Diff,
  options: GenerateDiffDescriptionOptions = {}): Promise<string> {
  return ''
}
```
