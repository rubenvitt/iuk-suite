/**
 * Welcher Commit läuft hier gerade?
 *
 * Gebraucht wird das vom automatischen Rollout: ein grüner Health-Abruf beweist ohne
 * diesen Wert nur, dass IRGENDEIN Stand antwortet. Ein hängengebliebenes altes Image —
 * genau der Fall vom 19.07.2026, als der emulierte arm64-Build nie fertig wurde und Prod
 * wochenlang auf einem alten Stand stand — sieht von außen identisch aus.
 *
 * WARUM NICHT AUS DEM OCI-LABEL: `org.opencontainers.image.revision` setzt die CI schon
 * heute (`docker/metadata-action`), aber das Label steht in der Image-CONFIG. Ein Prozess
 * IM Container liest seine eigenen Labels nicht — dafür bräuchte er den Docker-Socket.
 * Der Wert kommt deshalb ein zweites Mal, als Build-Arg in eine `ENV` der Runner-Stage
 * (`Dockerfile`), und von dort hierher.
 *
 * WARUM DER ZUGRIFF IN DER FUNKTION STEHT UND NICHT AUF MODULEBENE: `SUITE_REVISION`
 * wird erst in Stage 3 gesetzt; `pnpm build` (Stage 2) sieht die Variable nicht. Ein
 * Top-Level-`process.env`-Zugriff in einer Route, die Next prerendert, fröre damit den
 * BAUZEIT-Wert ein — also `unbekannt`, für immer, und zwar still: Build grün, Health 200,
 * und der Rollout meldete bei jedem Lauf „falsche Revision" statt „ausgerollt".
 */
export function laufendeRevision(): string {
  const wert = process.env.SUITE_REVISION?.trim();
  return wert ? wert : "unbekannt";
}
