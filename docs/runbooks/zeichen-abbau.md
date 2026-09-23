# Runbook — Abbau des Hosts `zeichen.iuk-ue.de`

Das Modul „Taktische Zeichen" ist aus der Suite entfernt (DRK-465, PR #257). Übrig ist mit Absicht
ein Rest: der Registry-Eintrag `zeichen` in `src/core/registry.ts` und die Route
`src/app/m/zeichen/sw.js/route.ts`. Der Host liefert nur noch `/sw.js` mit dem **Abräum-Worker**;
jeder andere Pfad antwortet mit 410 (`decideRoute` in `src/core/routing.ts`).

## Warum der Rest da ist

Die PWA lief seit 2026-09-03 auf `zeichen.iuk-ue.de`. Ein installierter Worker prüft sich nur
gegen **seine eigene** Adresse `zeichen.iuk-ue.de/sw.js`. Dort bekommt er den Abräum-Worker, der
Cache und Gerätedatenbank (`zeichen-merkliste`) löscht und sich austrägt. Den Abräum-Worker gibt es
erst seit PR #186 (2026-09-17). Der Merge von #257 hätte den Pfad sechs Tage später mitgenommen.
Jedes Gerät, das die App bis dahin nicht geöffnet hatte, hätte seinen alten Worker samt
Offline-Katalog und Merkliste behalten, und nichts hätte ihn danach noch erreicht.

Der erste Build nach #257 kam gar nicht erst live: die Prod-`.env` trägt noch
`SUITE_HOST_ZEICHEN` und `SUITE_ADMIN_GROUP_ZEICHEN`, beide ohne passendes Modul. Deshalb warf
`assertHostConfig` beim Start, `/api/health/portal` antwortete 500, und der Auto-Rollout
(`auto-rollout.md`) rollte zurück.

## Solange der Rest steht

- `.env` bleibt, wie sie ist. `SUITE_HOST_ZEICHEN` **muss** gesetzt bleiben: ohne ihn fällt der Host
  aufs Portal zurück, und `/sw.js` antwortet dort 404.
- `ZEICHEN_SW` liest niemand mehr. Die Zeile ist wirkungslos und kann jederzeit raus.
- `SUITE_ADMIN_GROUP_ZEICHEN` ist ebenfalls wirkungslos, besteht aber die Boot-Prüfung, solange der
  Registry-Eintrag steht.

## Wann die Geräte durch sind

Das entscheidet der Betreiber. Anhaltspunkt ist das Traefik-Zugriffsprotokoll: jeder Abruf von
`GET /sw.js` auf `zeichen.iuk-ue.de` ist ein Gerät mit altem Worker, das sich gerade abräumt. Ein
abgeräumtes Gerät kommt nicht wieder. Vorschlag: den Abbau angehen, wenn 14 Tage lang kein Abruf
mehr kam. Geräte, deren PWA seit dem 2026-09-17 nie mehr geöffnet wurde, erreicht keine Frist.

## Abbau — in dieser Reihenfolge

Jeder Schritt lässt die Boot-Prüfung grün. Vertauscht bricht der Start ab wie am 2026-09-23.

1. **`.env` (Server):** `SUITE_HOST_ZEICHEN`, `SUITE_ADMIN_GROUP_ZEICHEN` und `ZEICHEN_SW` löschen,
   `docker compose up -d`. Das laufende Image kennt `zeichen` noch; ohne Host antwortet
   `zeichen.iuk-ue.de` jetzt mit dem Portal.
2. **Traefik:** ``Host(`zeichen.iuk-ue.de`)`` aus `SUITE_TRAEFIK_RULE` nehmen, `docker compose up -d`.
3. **Repo:** erst jetzt den Rest entfernen: Registry-Eintrag, `src/app/m/zeichen/`, den
   `zeichen`-Zweig und die Aktion `gone` in `src/core/routing.ts` und `src/proxy.ts`, den Eintrag
   in `src/core/audit/coverage-manifest.json` und dieses Runbook. Der nächste grüne `main` rollt
   normal aus.

Die Datenbankdatei `zeichen.db` im Volume öffnet seit #257 niemand mehr. Sie gehört ins Backup und
kann danach gelöscht werden.
