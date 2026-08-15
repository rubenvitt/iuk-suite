# Runbook — Modul `aufgaben` produktiv schalten

Ziel: `aufgaben.iuk-ue.de` erreichbar machen. **Kein Cutover** — es gibt keine Alt-Anwendung, kein
Datenimport, kein Paritätscheck. Das Modul startet mit einer leeren Datenbank, und genau daran hängt
die einzige echte Vorbedingung dieses Runbooks: **die beiden Pocket-ID-Gruppen.**

## Die Vorbedingung, an der alles hängt

Beide Gruppen müssen in Pocket ID **existieren UND Mitglieder haben**, bevor der Router umschwenkt:

| Gruppe (Instanz `id.iuk-ue.de`) | Variable | Was ohne sie passiert |
|---|---|---|
| `aufgaben_nutzer` | `SUITE_ACCESS_GROUP_AUFGABEN` | Die Middleware antwortet **jedem** mit 403. Das Modul ist für niemanden erreichbar. |
| `aufgaben_koordination` | `SUITE_ADMIN_GROUP_AUFGABEN` | Niemand kann eine Person anlegen, eine Aufgabe verteilen oder eine Freigabe erteilen. Das Modul ist begehbar und **tut nichts**. |

**Stand bei Erstellung dieses Runbooks: beide Gruppen existieren mit 0 Mitgliedern.** Das Modul wäre
in diesem Zustand für niemanden erreichbar, unabhängig davon, wie die Gruppen heißen — die leere
Mitgliederliste ist die Sperre, nicht der Name.

Eine **leere Gruppe ist nicht dasselbe wie „keine Gruppe"**: `requiresAuth: true` (Registry) heißt,
dass `canAccess` die Zugangsliste tatsächlich liest. Ein leer **gesetztes**
`SUITE_ACCESS_GROUP_AUFGABEN=` ist zudem still wirkungslos (der Registry-Wert gilt weiter);
`validateGroupConfig` meldet das beim Boot.

### Warum die Koordinationsgruppe seit dem 2026-08-15 schwerer wiegt

Bis dahin gatete `SUITE_ADMIN_GROUP_AUFGABEN` nur die Personenverwaltung, und wer koordinierte,
stand in der Modultabelle `personen`. Seit dem Quellenwechsel trägt die Gruppe die **gesamte**
Koordinationsrolle (`_lib/zugang.ts`, `akteurFuer` → `canAdminModule("aufgaben")`); `personen.rolle`
kennt nur noch `auftrag` und `bufdi`.

Drei Folgen für den Betrieb:

1. **Ein Tippfehler im Variablenwert sperrt jede Koordination aus** — nicht nur `/personen`.
2. **Der Rückweg ist die Suite-Admin-Gruppe** (`dashboard-admins`, `SUITE_ADMIN_GROUP`):
   `isModuleAdmin` lässt sie neben der Modulgruppe passieren, ausdrücklich als Notausgang. Wer ihn
   benutzt, bekommt beim ersten Modulaufruf selbst eine `personen`-Zeile — sie bleibt danach in
   `/personen` stehen und lässt sich nur über `aktiv bis` beenden, nicht löschen.
3. **Ein Gruppenentzug wirkt mit bis zu einer Stunde Verzug** (Gruppen im JWT sind nur so frisch wie
   der letzte Token-Refresh, s. `CLAUDE.md`, „Zugriffsschutz"). Wer sofort wirken muss, wird über
   `aktiv bis` in `/personen` beendet — das gilt aber nur für `auftrag`/`bufdi`, nicht für die
   Koordination: bei ihr trägt die Gruppe die Rolle, `aktiv bis` misst sie bewusst nicht.

## Ablauf

1. **Gruppen in Pocket ID anlegen und besetzen.**
   - `aufgaben_nutzer`: **alle**, die das Modul benutzen sollen — BuFDis, Auftraggeber *und* die
     Koordination. Ohne diese Gruppe kommt auch die Koordination nicht durch die Middleware.
   - `aufgaben_koordination`: die koordinierenden Personen. **Zusätzlich** zu `aufgaben_nutzer`, nicht
     statt ihr.
   - Gegenprobe vor dem Weitermachen: beide Gruppen haben ≥ 1 Mitglied.

2. **`.env` des Stacks ergänzen** (Vorlage in `.env.example`, Abschnitt „Modul aufgaben"):
   ```
   SUITE_HOST_AUFGABEN=aufgaben.iuk-ue.de
   SUITE_ACCESS_GROUP_AUFGABEN=aufgaben_nutzer
   SUITE_ADMIN_GROUP_AUFGABEN=aufgaben_koordination
   ```
   Die Registry-Vorgaben heißen `iuk-aufgaben-nutzer`/`iuk-aufgaben-koordination` und bleiben im
   Quelltext unverändert — die Instanz löst die Abweichung über diese beiden Variablen, nicht durch
   Ändern der Literale (daran hängt `e2e/aufgaben.spec.ts` über `e2e/helpers/aufgaben.ts`).

3. **`SUITE_TRAEFIK_RULE` erweitern**, sonst erreicht die Domain den Container gar nicht erst:
   ```
   SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`) || Host(`aufgaben.iuk-ue.de`)
   ```

4. **Stack hochziehen**: `docker compose pull && docker compose up -d`. Der Boot legt
   `aufgaben.db` an und wendet die Migrationen an (`MODULE_MIGRATIONS` in `core/bootstrap.ts`); die
   Datenbank ist danach **leer**. Das ist der vorgesehene Zustand, kein Fehler — der Seed
   (`pnpm seed:lokal`) ist ein reines Entwicklungswerkzeug und läuft hier nie.

5. **Erstzugang von Hand prüfen** — der eigentliche Abnahmeschritt:
   1. Mit einem Konto anmelden, das **beide** Gruppen trägt.
   2. `https://aufgaben.iuk-ue.de/` muss die **Verteilung** zeigen. Erscheint stattdessen
      „Du bist noch nicht im Modul eingetragen.", trägt das Konto die Koordinationsgruppe **nicht**
      (oder `SUITE_ADMIN_GROUP_AUFGABEN` steht falsch) — zurück zu Schritt 1/2.
   3. Über `/personen` die BuFDis und Auftraggeber anlegen. Die Pocket-ID-Kennung (`sub`) sieht jede
      betroffene Person selbst auf der Hinweisseite, die sie nach ihrer ersten Anmeldung bekommt.
   4. Gegenprobe: ein Konto **ohne** Koordinationsgruppe bekommt auf `/verteilen` und `/personen`
      eine 404 und findet in seiner Oberfläche keinen Weg dorthin.

## Rollback

`SUITE_TRAEFIK_RULE` zurücksetzen und `docker compose up -d`. Sekunden, und ohne Datenverlust — das
Volume bleibt. Ein Rollback der Gruppen ist nicht nötig: sie sind für andere Module wirkungslos.
