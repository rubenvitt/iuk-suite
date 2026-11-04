# Runbook: Inbetriebnahme des Moduls `verpflegung` (Verpflegungslager)

Getränke und Lebensmittel der Verpflegungsgruppe mit tagesgenauem MHD (IDA-316, POC IDA-311), getrennt vom
Lagerbuch. Gebucht wird am Telefon: EAN der Packung scannen, Lagerort über den QR am Regal.

## 1. Wer was darf

| Wer | Wie | Was |
| --- | --- | --- |
| Helfer ohne Konto | Helfer-Link `/t/<code>` (Link oder QR, von der Verwaltung angelegt) | am Telefon (`/h`) einbuchen, ausgeben, aussondern, unbekannte Packung vorläufig anlegen; jede Buchung trägt „Helfer-Link &lt;Anlass&gt;“ |
| Zugang | Pocket-ID-Gruppe `verpflegung-nutzer` (`SUITE_ACCESS_GROUP_VERPFLEGUNG`) | dazu Verwaltung: Übersicht, Bestand, MHD-Kontrolle, Buchungen, Artikel (auch vorläufige prüfen) |
| Admin | `verpflegung-admin` (`SUITE_ADMIN_GROUP_VERPFLEGUNG`; der Suite-Admin zählt mit) | dazu Lagerorte, Ortsetiketten und Helfer-Links |

Ein Helfer-Link gilt bis zu einer Woche; die Sitzung am Telefon höchstens 12 Stunden, danach den Link neu
öffnen. Sperren wirkt sofort, weil jede Anfrage den Link aus der Datenbank liest. Das Cookie
`verpflegung_helfer` ist an den Modul-Host gebunden.

„Was steht an“ im Portal zeigt jede Charge mit roter Ampel (Schwellen je Artikel, Vorgabe rot 7 / gelb 30
Tage) den Gruppen `verpflegung-nutzer` und `verpflegung-admin`, ohne Suite-Admin-Kurzschluss. Ab 07:00 geht
einmal am Tag ein Push an deren Abos, wenn heute etwas abläuft oder ein Verbrauchsdatum morgen endet.

## 2. Umgebung

```
SUITE_HOST_VERPFLEGUNG=verpflegung.iuk-ue.de
# optional, Vorgaben in Klammern
# SUITE_ADMIN_GROUP_VERPFLEGUNG=verpflegung-admin
# VERPFLEGUNG_HELFER_SITZUNG_SECRET=   (sonst aus AUTH_SECRET abgeleitet)
# VERPFLEGUNG_LEBENSMITTEL_URL=        (Open Food Facts; "aus" schaltet das Nachschlagen ab)
```

Reihenfolge wie bei jedem neuen Modul: erst das Image mit dem Modul ausrollen, dann den Host setzen. Der Host
braucht DNS und die Traefik-Regel (`SUITE_TRAEFIK_RULE`). Die Datenbank `verpflegung.db` legt der Boot-Pfad
an (`MODULE_MIGRATIONS`), leer: kein Startbestand. `scripts/backup.sh` sichert sie mit allen `*.db`.

Lebensmitteldatenbank: beim Anlegen eines Artikels (Verwaltung, Knopf **Nachschlagen**) und beim vorläufigen
Anlegen am Telefon fragt der Server `world.openfoodfacts.org` nach der EAN. Hinaus geht nur die EAN; Antwort
höchstens 4 s, eine Stunde gemerkt. Ist der Ausgang gesperrt, bleibt das Feld leer und man tippt den Namen.

## 3. Erste Schritte nach dem Deploy

1. In Pocket ID die Gruppen `verpflegung-admin` und `verpflegung-nutzer` anlegen, Personen hineinnehmen und
   die Gruppen am OIDC-Client „IDA“ erlauben.
2. Mit einem Admin unter **Lagerorte** die Regale, Kühlschränke und den Anhänger anlegen, unter
   **Etiketten** drucken und aufkleben. Der QR zeigt auf `https://<host>/o/<id>`.
3. Unter **Artikel** die Ware anlegen (EAN scannen oder tippen, **Nachschlagen**), Ampel-Schwellen und
   Mindestbestand je Artikel setzen. Brot, Joghurt, Wurst mit kurzen Schwellen; Fleisch und Wurst mit
   „Zu verbrauchen bis“ (danach gesperrt).
4. Für den ersten Abend einen **Helfer-Link** anlegen und den QR zeigen; der Bestand wird beim Einräumen am
   Telefon eingebucht.

## 4. Was hier bewusst fehlt

- **Umlagern** zwischen Orten: ausgeben und am neuen Ort einbuchen.
- **Inventur** und Export; kommen, wenn die Gruppe sie braucht.
- Kein Fehlversuchszähler am Helfer-Link wie im Lagerbuch: der Code hat 140 Bit und wird nicht abgetippt.
