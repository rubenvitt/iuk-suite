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
 */
const eslintConfig = [{ ignores: [".claude/**"] }, ...nextCoreWebVitals, ...nextTypescript];
export default eslintConfig;
