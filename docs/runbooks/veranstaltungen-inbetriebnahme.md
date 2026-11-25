# Runbook: Inbetriebnahme des Moduls `veranstaltungen`

Das Modul führt geplante Dienste — Sanitätsdienste, Betreuungen, Übungen — mit Ort, Zeitraum, Veranstalter
und Status (IDA-415). Die Schichtplanung hängt eine Planung an eine Veranstaltung und an einen Einsatz in
Lifeline Hub (IDA-416). Lifeline Hub soll die Veranstaltungen später abholen und als Einsatzvorschlag zeigen
(LLH-2097).

## 1. Gruppen in Pocket ID

| Variable | Vorgabe | Bedeutung |
| --- | --- | --- |
| `SUITE_ACCESS_GROUP_VERANSTALTUNGEN` | `veranstaltungen-nutzer,veranstaltungen-admin` | anlegen, ändern, absagen |
| `SUITE_ADMIN_GROUP_VERANSTALTUNGEN` | `veranstaltungen-admin` | zusätzlich löschen |

Wer nur in der Schichtplanung eine Veranstaltung auswählt, braucht keine dieser Gruppen: die Auswahl liest
die Schichtplanung serverseitig. Statt neuer Gruppen lassen sich auch bestehende eintragen, etwa
`SUITE_ACCESS_GROUP_VERANSTALTUNGEN=schichtplan-nutzer,schichtplan-admin`. Der Suite-Admin braucht wie
überall eine der Zugangsgruppen.

## 2. Umgebung

```
SUITE_HOST_VERANSTALTUNGEN=veranstaltungen.iuk-ue.de
```

Der Host braucht einen DNS-Eintrag und eine Traefik-Regel auf den Suite-Container. Die Datenbank
`veranstaltungen.db` legt der Boot-Pfad an (`MODULE_MIGRATIONS`); das nächtliche Backup nimmt sie von selbst
mit (`backup-sidecar.md`).

## 3. Abruf durch Lifeline Hub (LLH-2097)

Lifeline Hub holt die Veranstaltungen über den Vertrag „Veranstaltungen-Abruf v1“ ab (Beschreibung im Repo
`lifeline-hub`, `docs/schnittstellen/veranstaltungen-abruf.md`). Geliefert wird alles, dessen Ende höchstens
7 Tage zurückliegt, auch Abgesagtes; keine Personen.

1. Mit einer Person in `veranstaltungen-admin` unter Veranstaltungen **Abruf-Zugänge** öffnen, einen Zugang
   anlegen. Adresse und Schlüssel stehen genau einmal da.
2. In Lifeline Hub unter Einstellungen → Anbindungen einen Adapter „Veranstaltungen (Schnittstelle v1)“
   anlegen, Adresse und Schlüssel eintragen, **Verbindung prüfen**.
3. Ohne Login erreichbar ist nur `GET /api/abruf` auf dem Veranstaltungen-Host (`ABRUF_OHNE_LOGIN` in
   `core/routing.ts`); ein falscher Schlüssel ergibt 401 und eine gedrosselte Audit-Zeile.
4. Widerrufen geht im selben Fenster; Lifeline behält seinen letzten Stand.

## 4. Prüfen nach dem Deploy

1. Mit einer Person in `veranstaltungen-nutzer` anmelden, **Neue Veranstaltung** anlegen.
2. In der Schichtplanung **Neue Planung**, unter **Veranstaltung** die eben angelegte wählen: Name, Ort und
   Zeitraum stehen drin. Unter **Einsatz in Lifeline Hub** einen Link aus der Adresszeile des Hubs einfügen.
3. Im Kopf der Planung erscheinen Veranstaltung und **Einsatz öffnen**.
4. Unter Portal → Verwaltung → Audit erscheinen die Änderungen mit Modul `veranstaltungen`.

## 5. Was hier bewusst fehlt

- **Einsatzvorschlag in Lifeline Hub** (LLH-1192): der Hub hält die Veranstaltungen schon vor; die Liste, aus
  der ein Einsatz wird, kommt mit dieser Aufgabe.
- **Einsatzauswahl aus dem Hub** (IDA-419): bis dahin wird der Einsatz als Link eingefügt.
