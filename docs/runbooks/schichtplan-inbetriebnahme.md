# Runbook: Inbetriebnahme des Moduls `schichtplan`

Das Modul plant Schichten im Voraus für Veranstaltungen und große Lagen (IDA-313, POC IDA-308): Abschnitte
und Fahrzeuge, Schichten im Raster, Helfer aus dem Modul `helfer` und temporäre Helfer je Planung,
Konfliktprüfung, Druck und Excel. Ab Einsatzbeginn übernimmt Lifeline Hub; die Übergabe ist bis zur
Entscheidung in LLH-1523 nur der Excel-Export.

## 1. Gruppen in Pocket ID

| Variable | Vorgabe | Bedeutung |
| --- | --- | --- |
| `SUITE_ACCESS_GROUP_SCHICHTPLAN` | `schichtplan-nutzer,schichtplan-admin` | planen (alles außer eine Planung löschen) |
| `SUITE_ADMIN_GROUP_SCHICHTPLAN` | `schichtplan-admin` | zusätzlich ganze Planungen löschen |

Eine Stufe „nur ansehen“ gibt es bewusst nicht: eine Planung ist Teamarbeit. Der Suite-Admin braucht wie
überall eine der beiden Gruppen, sonst lässt ihn die Middleware nicht durch.

## 2. Umgebung

```
SUITE_HOST_SCHICHTPLAN=schichtplan.iuk-ue.de
```

Der Host braucht einen DNS-Eintrag und eine Traefik-Regel auf den Suite-Container. Die Datenbank
`schichtplan.db` legt der Boot-Pfad an (`MODULE_MIGRATIONS`); sie gehört ins nächtliche Backup wie die
anderen Moduldatenbanken (`backup-sidecar.md`).

## 3. Helfer und Fahrzeuge

- **Helfer** kommen aus dem Modul `helfer` über `helferFuerSchichtplanung()`: alle übernommenen Helfer,
  ohne Blick auf die Einsatzbuch-Freigabe. Die Schichtplanung speichert nur ihre Kennung; Name und
  Qualifikationen werden bei jedem Aufruf frisch gelesen.
- **Fahrerlaubnis:** Das Helfer-Modul übernimmt ab diesem Stand aus HiOrg die Fahrerlaubnisklassen (nur die
  Klassen, keine Nummer, kein Datum, keine Beschränkung). Bestehende Helfer haben bis zum nächsten Abgleich
  keine Klassen — nach dem Deploy einmal unter **Helfer → Abgleich** neu abgleichen. Eine Excel-Liste kennt
  keine Spalte dafür.
- **Fahrzeuge** kommen aus `fahrzeuge` (aktive Fahrzeuge, keine Anhänger). Der Name wird beim Hinzufügen
  festgehalten; ein später außer Dienst gestelltes Fahrzeug bleibt in bestehenden Planungen stehen.

## 4. Prüfen nach dem Deploy

1. Mit einer Person in `schichtplan-nutzer` anmelden, **Neue Planung** anlegen, einen Abschnitt hinzufügen.
2. Im Raster eine Schicht aufziehen, einen Helfer daraufziehen, unter **Prüfen** die Lücken ansehen.
3. Unter **Ausgabe** einmal drucken und die Excel-Datei herunterladen.
4. Unter Portal → Verwaltung → Audit erscheinen die Änderungen mit Modul `schichtplan`.

## 5. Was hier bewusst fehlt

- **Schnittstelle zu Lifeline Hub.** Bis LLH-1523 entschieden ist, nur Excel.
- **Benachrichtigungen an Helfer.** Die Pläne je Helfer werden gedruckt oder weitergegeben.
- **Zeichnen auf Touch.** Auf Telefon und Tablet scrollt das Raster; Schichten legst du dort über
  „Schicht anlegen“ an und änderst sie im Schicht-Fenster mit Eingabefeldern.
