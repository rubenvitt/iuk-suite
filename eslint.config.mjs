import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/*
 * `.claude/**` zuerst, und aus demselben Grund wie in `vitest.config.ts`:
 * Agenten legen git-Worktrees unter `.claude/worktrees/` an — innerhalb des
 * Repos. Ohne diesen Eintrag lintet ESLint den fremden Zweig mit; gemessen
 * wurden 1733 Fehler und 43590 Warnungen, und `pnpm lint` ist damit still
 * vergiftet, obwohl der eigene Code sauber ist.
 *
 * `git` sieht die Worktrees nicht (`.git/info/exclude`), aber das ist eine
 * lokale, nicht eingecheckte Datei — sie schuetzt nur den Klon, in dem sie
 * steht, und sagt ESLint nichts.
 *
 * Die Vorlagen-Ordner unter `docs/design/`: Design-Vorlagen im Originalzustand (z. B. das
 * gebündelte `support.js` der Einsatzbuch-Vorlage). Sie sind Referenz, kein
 * Suite-Code, und bleiben unverändert — ESLint-Regeln für Next-Module passen
 * nicht auf sie.
 *
 * `apps/**`: Die Desktop-App des Einsatzbuchs (Workspace-Mitglied `apps/einsatzbuch`)
 * hat eine eigene Lint-Konfiguration (`apps/einsatzbuch/eslint.config.js`); die
 * Next-Regeln hier passen dort nicht.
 */
const eslintConfig = [
  { ignores: [".claude/**", "docs/design/**/vorlage/**", "apps/**"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];
export default eslintConfig;
