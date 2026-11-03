# Runbook: Inbetriebnahme des Moduls `wartung` (Gerätewartung)

Geräte mit Prüf- und Wartungsfristen aus mehreren Gruppen der Bereitschaft (IDA-312, POC IDA-307):
Stromerzeuger, Heizungen, Akkus und Powerstationen, IT. Funkgeräte bleiben in `radio`, Sanitätsmaterial im
Lagerbuch.

## 1. Wer was darf

| Wer | Wie | Was |
| --- | --- | --- |
| jeder Angemeldete | QR-Code am Gerät (`/g/<id>`) oder **Geräte** | Prüfung mit Checkliste, Mangel mit Foto melden, Betriebsstunden eintragen |
| Verwalter einer Gruppe | Mitglied der Pocket-ID-Gruppe dieser Gruppe (z. B. `wartung-technik`) | Geräte der Gruppe pflegen, Wartung/Elektroprüfung eintragen, Mängel beheben, Etiketten drucken; Gerätearten und Checklisten (gemeinsam für alle Gruppen) |
| Admin | `wartung-admin` (`SUITE_ADMIN_GROUP_WARTUNG`; der Suite-Admin zählt mit) | alles, dazu **Gruppen** anlegen und ihre Pocket-ID-Gruppe festlegen |

Welche Gruppe ein Gerät hat und wer sie verwaltet, steht in der Moduldatenbank (`gruppe.pocket_gruppe`)
und wird bei jeder Aktion daraus gelesen (IDOR). Gruppen im JWT sind so frisch wie der letzte Token-Refresh
(≈ 1 Stunde).

„Was steht an“ im Portal zeigt Fristen und nicht einsatzbereite Geräte nur den Verwaltern der jeweiligen
Gruppe und den Modul-Admins (ohne Suite-Admin-Kurzschluss, wie im Lagerbuch). Ein neuer Mangel „nicht
einsatzbereit“ geht sofort als Push an deren Abos, ohne Freitext.

## 2. Umgebung

```
SUITE_HOST_WARTUNG=wartung.iuk-ue.de
# optional, Vorgabe wartung-admin
# SUITE_ADMIN_GROUP_WARTUNG=wartung-admin
```

Reihenfolge wie bei jedem neuen Modul: erst das Image mit dem Modul ausrollen, dann den Host setzen.
Der Host braucht DNS und die Traefik-Regel (`SUITE_TRAEFIK_RULE`). Die Datenbank `wartung.db` legt der
Boot-Pfad an (`MODULE_MIGRATIONS`), mit Startbestand: Gruppen Technik (`wartung-technik`) und I&K
(`wartung-iuk`) und die vier Gerätearten mit Fristen und Checklisten. Mängelfotos liegen unter
`DATA_DIR/wartung/maengel/`; beides gehört ins Backup (`backup-sidecar.md`).

## 3. Erste Schritte nach dem Deploy

1. In Pocket ID die Gruppen `wartung-admin`, `wartung-technik` und `wartung-iuk` anlegen, die Verwalter
   hineinnehmen und die Gruppen am OIDC-Client „IDA“ erlauben.
2. Mit einem Admin anmelden, unter **Gruppen** Namen und Pocket-ID-Gruppen prüfen.
3. Unter **Gerätearten und Checklisten** die Checklisten an die echten Geräte anpassen (der Startbestand
   ist ein plausibler Entwurf).
4. Geräte anlegen, beim ersten Mal die letzten Wartungen und Elektroprüfungen unter **Erledigt eintragen**
   nachtragen; ohne Eintrag gilt eine Frist als überfällig.
5. Unter **QR-Etiketten** drucken und aufkleben. Der Code zeigt auf `https://<host>/g/<id>` und bleibt
   gleich, wenn das Gerät umzieht.

## 4. Was hier bewusst fehlt

- **Unterlagen** (Betriebsanleitung, Kurzanleitung) am Steckbrief kommen mit IDA-300 aus dem Modul Dateien.
- **Materialkisten** mit Inhaltsliste folgen in IDA-335.
- Ein Foto je Mangel; mehrere Fotos gibt es bewusst nicht.
