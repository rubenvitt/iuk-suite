# Runbook: Inbetriebnahme des Moduls `fahrzeuge`

Das Modul führt die Fahrzeuge und Anhänger der Bereitschaft als Stammdaten der Suite (Epic IDA-254).
Einsatzbuch, Lagerbuch und Funkgeräte übernehmen von hier Funkrufname, Funkkenner, Kennzeichen, Typ
und Standort über die eine veröffentlichte Funktion `bereitgestellteFahrzeuge()`
(`src/app/m/fahrzeuge/_lib/bereitstellung.ts`). Bis die Kopplungen gebaut sind (IDA-257 bis IDA-259),
pflegt jede App ihre Fahrzeuge weiter selbst.

## 1. Gruppen in Pocket ID

| Variable | Vorgabe | Bedeutung |
| --- | --- | --- |
| `SUITE_ACCESS_GROUP_FAHRZEUGE` | `fahrzeuge-nutzer,fahrzeuge-admin` | Liste ansehen |
| `SUITE_ADMIN_GROUP_FAHRZEUGE` | `fahrzeuge-admin` | anlegen, ändern, außer Dienst stellen |

Beide Gruppen öffnen das Modul. Der Suite-Admin darf verwalten, braucht aber eine der beiden Gruppen,
sonst lässt ihn schon die Middleware nicht durch. Die Gruppen müssen in Pocket ID existieren, bevor das
Modul erreichbar ist; ohne Überschreibung in der `.env` gelten die Vorgaben.

## 2. Umgebung

```
SUITE_HOST_FAHRZEUGE=fahrzeuge.iuk-ue.de
```

Der Host braucht wie jedes Modul einen DNS-Eintrag und eine Traefik-Regel auf den Suite-Container.
Die Datenbank `fahrzeuge.db` legt der Boot-Pfad an (`MODULE_MIGRATIONS`); sie gehört ins nächtliche
Backup wie die anderen Moduldatenbanken (`backup-sidecar.md`).

## 3. Erste Daten

Bis zum Erstimport (IDA-256) werden Fahrzeuge von Hand unter **Fahrzeug anlegen** erfasst. Der
Erstimport liest danach die Fahrzeuge aus Einsatzbuch, Lagerbuch und Funkgeräten, schlägt Zuordnungen
vor und legt erst nach Bestätigung an; Fahrzeuge, die schon hier stehen, werden dabei zugeordnet, nicht
doppelt angelegt.

## 4. Was hier bewusst fehlt

- **Löschen.** Ein ausgemustertes Fahrzeug wird außer Dienst gestellt. Andere Apps verweisen auf seine
  Kennung, und versiegelte Einsätze im Einsatzbuch tragen sie.
- **Fachdaten** wie Sollbestand, Funkgeräte oder Einsatzhistorie. Sie bleiben in ihren Apps.
