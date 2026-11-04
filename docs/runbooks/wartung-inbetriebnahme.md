# Runbook: Inbetriebnahme des Moduls `wartung` (Gerätewartung)

Geräte mit Prüf- und Wartungsfristen aus mehreren Gruppen der Bereitschaft (IDA-312, POC IDA-307):
Stromerzeuger, Heizungen, Akkus und Powerstationen, IT. Funkgeräte bleiben in `radio`, Sanitätsmaterial im
Lagerbuch.

## 1. Wer was darf

| Wer | Wie | Was |
| --- | --- | --- |
| jeder, auch ohne Anmeldung | QR-Code am Gerät (`/g/<id>`) | Mangel mit Foto melden, Name freiwillig; gebremst je Gerät (5 in 10 Minuten) und insgesamt (60 je Stunde) |
| Zugang | Pocket-ID-Gruppe `wartung-nutzer` (`SUITE_ACCESS_GROUP_WARTUNG`) | dazu Prüfung mit Checkliste, Betriebsstunden, Geräteliste |
| Verwalter einer Gruppe | vom Admin unter **Gruppen** zugeordnet (Tabelle `verwalter`, je Person der OIDC-`sub`) | Geräte der Gruppe pflegen, Wartung/Elektroprüfung eintragen, Mängel beheben, Etiketten drucken; Gerätearten und Checklisten (gemeinsam für alle Gruppen) |
| Admin | `wartung-admin` (`SUITE_ADMIN_GROUP_WARTUNG`; der Suite-Admin zählt mit) | alles, dazu **Gruppen** anlegen und Verwalter zuordnen |

Pocket ID kennt nur `wartung-nutzer` und `wartung-admin` (IDA-337). Wer welche Gruppe verwaltet, steht in der
Moduldatenbank und wird bei jeder Aktion daraus gelesen (IDOR). Ein Verwalter braucht zusätzlich Zugang.
Gruppen im JWT sind so frisch wie der letzte Token-Refresh (≈ 1 Stunde); eine Zuordnung im Modul wirkt sofort.

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
Boot-Pfad an (`MODULE_MIGRATIONS`), mit Startbestand: Gruppen Technik und I&K (noch ohne Verwalter) und die
vier Gerätearten mit Fristen und Checklisten. Mängelfotos liegen unter `DATA_DIR/wartung/maengel/`,
Unterlagen am Gerät (IDA-300) unter `DATA_DIR/wartung/unterlagen/`; `scripts/backup.sh` sichert die
`wartung.db` und seit IDA-336 beide Verzeichnisse (`wartung/maengel/`, `wartung/unterlagen/` im Tarball).

## 3. Erste Schritte nach dem Deploy

1. In Pocket ID die Gruppen `wartung-admin` und `wartung-nutzer` anlegen, Personen hineinnehmen und die Gruppen
   am OIDC-Client „IDA“ erlauben.
2. Die künftigen Verwalter öffnen das Modul einmal (oder stehen im Personenverzeichnis). Mit einem Admin
   anmelden und unter **Gruppen** je Gruppe die Verwalter zuordnen.
3. Unter **Gerätearten und Checklisten** die Checklisten an die echten Geräte anpassen (der Startbestand
   ist ein plausibler Entwurf).
4. Geräte anlegen, beim ersten Mal die letzten Wartungen und Elektroprüfungen unter **Erledigt eintragen**
   nachtragen; ohne Eintrag gilt eine Frist als überfällig.
5. Unter **QR-Etiketten** drucken und aufkleben. Der Code zeigt auf `https://<host>/g/<id>` und bleibt
   gleich, wenn das Gerät umzieht.

## 4. Was hier bewusst fehlt

- **Unterlagen** über 9 MB: Hochgeladen wird in einem Stück, der Proxy puffert höchstens 10 MB (IDA-300).
- **Materialkisten** mit Inhaltsliste folgen in IDA-335.
- Ein Foto je Mangel; mehrere Fotos gibt es bewusst nicht.
