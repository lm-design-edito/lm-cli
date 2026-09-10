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

Après lm-link. Dans l'ordre.

1. **Rapatrier la logique métier dans lm-tools.** lm-cli est censé orchestrer des
   fonctions de `@design-edito/tools`, pas en porter — c'est déjà ce que dit le
   README du workspace. Chaque commande devrait se réduire à sa coquille : lire des
   arguments, appeler une fonction publiée, rendre un résultat. Le tri se fait
   commande par commande.

2. **Remettre les templates de `make-template` d'aplomb.** Ils ont vieilli, et ils
   sont livrés tels quels dans les projets échafaudés — donc chaque défaut se
   propage. Le plus visible : plusieurs `tsconfig.json` gardent `baseUrl` et le
   `"moduleResolution": "Node"` de node10, dépréciés et voués à casser en TypeScript
   7. Vérifier par template si un import s'appuie réellement sur `baseUrl` avant de
   le retirer, et choisir `nodenext` ou `bundler` selon le type de projet :
   `express/src/tsconfig.json`, `express-api/src/tsconfig.json`,
   `node-ts/src/tsconfig.json`, `react/src/tsconfig.json`,
   `react/scripts/tsconfig.json`. Le reste des templates est à relire dans la foulée.

3. **Automatiser la publication via le CMS maison.** Le gros morceau, et ce à quoi
   une bonne partie du reste de l'année est destinée : des outils pour interagir
   programmatiquement avec le CMS, et publier notre production sans passer par
   l'interface. **Une phase de conception est à mener avant d'écrire quoi que ce
   soit** — le périmètre sera clarifié à ce moment-là, pas ici.
