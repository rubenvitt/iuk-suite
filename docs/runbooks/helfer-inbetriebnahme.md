# Runbook: Inbetriebnahme des Moduls `helfer` (HiOrg-Import)

Das Modul holt die aktiven Helferinnen und Helfer aus HiOrg-Server und stellt sie dem Einsatzbuch
bereit (IDA-249). Ohne Anbindung läuft es im **Demo-Modus** mit erfundenen Personen, die das Einsatzbuch
zwar anzeigt, aber nicht übernimmt.

## 1. Was vorher geklärt sein muss (Datenschutz)

Das Modul verarbeitet Personaldaten von Ehrenamtlichen. Vor dem ersten echten Abgleich:

1. **Verzeichnis von Verarbeitungstätigkeiten** um den Eintrag „Bereitstellung der Helferliste fürs
   Einsatzbuch“ ergänzen: Zweck (Auswahl der eingesetzten Kräfte im Einsatzbuch), Kategorien (Name,
   Kontostatus in HiOrg, Gruppen, Qualifikationen), Empfänger (Zugangsgruppe des Moduls, Einsatzbuch),
   Löschung (siehe unten). Verantwortlich ist die Gliederung, die den HiOrg-Account führt.
2. **Auftragsverarbeitung prüfen**: HiOrg ist über den bestehenden AV-Vertrag abgedeckt. Wer die Suite
   betreibt, wenn nicht die Gliederung selbst, braucht eigens einen AV-Vertrag mit ihr.
3. **Rechtsgrundlage** festhalten. Naheliegend ist Art. 6 Abs. 1 lit. b DSGVO (Mitgliedschaft bzw.
   ehrenamtliche Mitwirkung) oder lit. f. Die Entscheidung trifft die Gliederung, nicht dieses Runbook.

Was die Suite technisch zusichert, steht auch auf der Seite **Einstellungen → Datenschutz** im Modul:

- **Gespeichert** werden nur Vor- und Nachname, Kontostatus, Gruppen und Qualifikationen. Alles
  Weitere, was `GET /core/v1/personal` mitliefert (Kontakt, Anschrift, Geburtsdatum, Bankverbindung,
  Führerschein, Allergien, Angehörige, Bemerkungen), wird beim Lesen verworfen
  (`_lib/hiorg/person.ts`, geprüft an der Beispielperson der HiOrg-Spezifikation).
- **Nie übernommen** werden gesperrte Konten und Personen mit Austrittsdatum. Wer nicht mehr durch den
  Filter kommt, wird beim nächsten Abgleich **gelöscht**. Abgefilterte Personen erscheinen auch in der
  Vorschau nur als Zahl.
- **Ans Einsatzbuch** gehen nur freigegebene Personen mit Name und Qualifikation, ohne HiOrg-Kennung.
- **Zugang** nur über die Zugangsgruppe, auch für den Suite-Admin. Alle Seiten tragen `no-store`,
  `noindex` und `no-referrer`.
- **Protokoll**: jede Änderung im Audit-Log der Suite (ohne Namen, nur Kennungen), dazu ein
  Abgleichprotokoll ohne Helfernamen, das 365 Tage aufbewahrt wird.
- **Sicherungen**: `helfer.db` liegt im nächtlichen Backup (`backup-sidecar.md`). Gelöschte Personen
  verschwinden dort erst, wenn die Sicherungen ablaufen — das gehört in die Löschfrist im Verzeichnis.

## 2. Gruppen in Pocket ID

| Variable | Vorgabe | Bedeutung |
| --- | --- | --- |
| `SUITE_ACCESS_GROUP_HELFER` | `iuk-helfer` | Liste ansehen |
| `SUITE_ADMIN_GROUP_HELFER` | `iuk-helfer-admin` | abgleichen, freigeben, Quelle wechseln, verbinden, löschen (braucht zusätzlich die Zugangsgruppe) |

Die Gruppen müssen in Pocket ID existieren, bevor das Modul erreichbar ist.

## 3. Den HiOrg-Zugang beantragen

HiOrg vergibt OAuth2-Clients nur über den Support (`support@hiorg-server.de`), beantragt vom
Account-Inhaber der Gliederung. Anzugeben sind:

- Bezeichnung: `iuk-suite – Helferverzeichnis`
- Organisations-Kürzel (den Client darauf beschränken lassen)
- Redirect-URI: `https://<SUITE_HOST_HELFER>/hiorg/rueckruf`
- Grant-Types `authorization_code` und `refresh_token`, Scopes `openid personal:read`
- Kontakt, Einsatzzweck, Systemumgebung

`client_credentials` bietet HiOrg nicht an (Discovery-Dokument, Stand 20.10.2026). Deshalb meldet sich
einmal ein HiOrg-Konto an, das das Personal lesen darf. Die Suite speichert danach nur das
Erneuerungs-Token, verschlüsselt. **Es liest, was dieses Konto in HiOrg sehen darf.**

## 4. Umgebung

```
SUITE_HOST_HELFER=helfer.iuk-ue.de
HELFER_HIORG_CLIENT_ID=<vom Support>
HELFER_HIORG_CLIENT_SECRET=<vom Support, nur in stack.env>
HELFER_HIORG_ORGANISATION=<Kürzel, optional>
HELFER_SCHLUESSEL=<openssl rand -base64 32>
```

Wird `HELFER_SCHLUESSEL` gewechselt, ist das gespeicherte Token nicht mehr lesbar. Dann einmal neu
verbinden; die Helfer bleiben erhalten.

## 5. Erster Abgleich

1. **Einstellungen → Quelle**: auf „HiOrg-Server“ stellen. Die Demo-Helfer werden dabei gelöscht.
2. **Einstellungen → Mit HiOrg-Server verbinden**: Anmeldung bei HiOrg, Rückkehr mit „Verbunden“.
3. **Abgleich**: Kontostatus wählen (Vorgabe „aktiv“). Nach der ersten Vorschau Gruppen wie „Passive“
   oder „Fördermitglieder“ per Klick ausschließen. Dann **Übernehmen**.
4. **Helfer**: festlegen, wer fürs Einsatzbuch freigegeben ist. Die Vorgabe für neue Helfer steht unter
   Einstellungen.
5. **Einsatzbuch → Stammdaten → Personal → Aus Helferverzeichnis abgleichen**: Vorschau prüfen und
   übernehmen. Der Rechner holt die Liste beim nächsten stündlichen Abgleich.

## 6. Rückbau

- **Einstellungen → Alle Helferdaten löschen**, dann **Verbindung trennen**.
- Im Einsatzbuch den Abgleich einmal laufen lassen: Die übernommenen Personen werden deaktiviert.
- Den Client beim HiOrg-Support zurückziehen lassen.
