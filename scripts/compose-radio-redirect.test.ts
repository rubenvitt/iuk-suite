import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Der Redirect vom Alt-Host `radio-admin.iuk-ue.de` auf `radio.iuk-ue.de/admin` lebt in SECHS
 * Traefik-Labels, und kein anderes Tor sieht sie an: `pnpm build` liest keine `compose.yaml`,
 * `docker compose config` prueft nur die Syntax, und E2E benutzt kein Compose. Faellt eine der
 * sechs Zeilen weg oder verrutscht ein `$`, ist der Fehlfall meist STILL — und wo er es (heute,
 * auf dieser Compose-Fassung) nicht mehr ist, sieht ihn trotzdem nur, wer `docker compose config`
 * von Hand aufruft:
 *
 *   * Middleware am SERVICE statt am ROUTER  -> der Redirect trifft die Suite selbst.
 *   * `permanent=true` (301)                 -> die Weiterleitung liegt im Cache jedes Telefons,
 *                                               das den Alt-Host je besucht hat, und der Rueckweg
 *                                               ist praktisch unmoeglich.
 *   * `${1}` statt `$${1}`                    -> die Ersetzung ist nicht mehr pfaderhaltend.
 *                                               ⚠️ GEMESSEN AM 2026-08-28, und es weicht von der
 *                                               Planvorlage ab: auf Docker Compose v5.1.2 ist das
 *                                               NICHT still — `docker compose config` bricht mit
 *                                               „invalid interpolation format for
 *                                               services.a.labels.[]" ab. Aeltere Compose-Fassungen
 *                                               verschluckten das eine `$` und lieferten `/admin/`
 *                                               fuer JEDEN Pfad; genau darauf beruht die
 *                                               Beschreibung in `.env.example:608-612`. Der Test
 *                                               traegt in beiden Faellen, und aus einem Grund, der
 *                                               von der Compose-Fassung unabhaengig ist: KEIN
 *                                               CI-Schritt dieses Repos ruft `docker compose
 *                                               config` ueberhaupt auf.
 *   * fehlende Vorbelegung                    -> `docker compose config` scheitert, sobald die
 *                                               Variable nicht gesetzt ist.
 *   * `entrypoints` abweichend vom Suite-Router -> `https://radio-admin.iuk-ue.de/` antwortet gar
 *                                               nicht oder mit einem Zertifikatsfehler, und die
 *                                               drei curl aus dem Runbook laufen ins Leere,
 *                                               STATT rot zu werden.
 *
 * Belege: Spec 2 §4.4.4; `compose.yaml:2` (der Service heisst `suite`, nicht `app`),
 * `compose.yaml:153-155` (der bestehende Suite-Router und seine Entrypoints).
 * Vorgehen (Zeilenzerlegung statt YAML-Paket) uebernommen aus
 * `src/app/m/files/_lib/compose.test.ts:14-21`.
 *
 * ⚠️ ABWEICHUNG VON DER PLANVORLAGE (`2026-08-18-plan4-radio-cutover.md:417-436`), und sie ist
 * eine Bauform-Aenderung, KEINE Aenderung an einer Zusicherung: die Vorlage ruft `suiteLabels()`
 * im Rumpf des `describe` auf, also waehrend der Sammelphase. Ein `expect()` dort erzeugt im
 * Fehlfall einen SAMMELFEHLER statt eines roten Falles — dann meldet vitest „0 Tests, 1 Fehler",
 * und der rote Lauf, den dieser Test beweisen soll, waere gar nicht erst gesammelt worden.
 * Deshalb wird die Zerlegung hier einmalig und TRAEGE ausgewertet (`suiteLabels()` mit
 * Zwischenspeicher), und der Aufruf steht in jedem `it`. Jede Zusicherung ist zeichengleich zur
 * Vorlage.
 */

const WURZEL = path.resolve(__dirname, "..");
const compose = readFileSync(path.join(WURZEL, "compose.yaml"), "utf8");
const composeZeilen = compose.split("\n");

let zwischenspeicher: string[] | undefined;

/** Alle Label-Zeilen des Service `suite` — also die `- `-Eintraege unter `    labels:`. */
function suiteLabels(): string[] {
  if (zwischenspeicher) return zwischenspeicher;
  const start = composeZeilen.findIndex((z) => z === "    labels:");
  expect(start, "Labelblock des Service `suite` nicht gefunden").toBeGreaterThan(-1);
  const raus: string[] = [];
  for (let i = start + 1; i < composeZeilen.length; i++) {
    const z = composeZeilen[i];
    if (z.trim() === "") continue;
    if (!z.startsWith("      ")) break;
    if (z.trim().startsWith("#")) continue;
    raus.push(z.trim().replace(/^- /, ""));
  }
  zwischenspeicher = raus;
  return raus;
}

describe("compose.yaml — der Redirect vom Alt-Host radio-admin.iuk-ue.de", () => {
  it("der Router traegt die Regel aus SUITE_REDIRECT_RULE_RADIO_ADMIN mit unschaedlicher Vorbelegung", () => {
    expect(suiteLabels()).toContain(
      "traefik.http.routers.radio-admin-alt.rule=${SUITE_REDIRECT_RULE_RADIO_ADMIN:-Host(`radio-admin.invalid`)}",
    );
  });

  it("der Redirect-Router fuehrt DIESELBEN Entrypoints wie der Suite-Router", () => {
    const labels = suiteLabels();
    const suite = labels.find((l) => l.startsWith("traefik.http.routers.iuk-suite.entrypoints="));
    const alt = labels.find((l) =>
      l.startsWith("traefik.http.routers.radio-admin-alt.entrypoints="),
    );
    expect(suite, "Suite-Router hat keine entrypoints-Zeile").toBeTruthy();
    expect(alt?.split("=")[1]).toBe(suite?.split("=")[1]);
  });

  it("die Middleware haengt am ROUTER, nicht am Service", () => {
    const labels = suiteLabels();
    expect(labels).toContain(
      "traefik.http.routers.radio-admin-alt.middlewares=radio-admin-alt-redirect",
    );
    expect(labels.some((l) => l.startsWith("traefik.http.services.radio-admin-alt"))).toBe(false);
  });

  it("die Ersetzung ist pfaderhaltend und traegt das doppelte Dollarzeichen", () => {
    const rep = suiteLabels().find((l) =>
      l.startsWith("traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.replacement="),
    );
    expect(rep).toBe(
      "traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.replacement=https://radio.iuk-ue.de/admin/$${1}",
    );
    // Das eine `$` ist der Fehlfall, der den Redirect funktionieren laesst und den Pfad verliert.
    // Auf Compose v5.1.2 bricht `docker compose config` darauf ab (Kopf der Datei) — nur ruft ihn
    // kein Tor dieses Repos auf, diese Zeile also schon.
    expect(rep).not.toMatch(/[^$]\$\{1\}/);
  });

  it("die Regex trifft beide Protokolle und den Alt-Host", () => {
    expect(suiteLabels()).toContain(
      "traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.regex=^https?://radio-admin\\.iuk-ue\\.de/(.*)",
    );
  });

  it("permanent=false — ein 301 laege im Cache jedes Telefons", () => {
    expect(suiteLabels()).toContain(
      "traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.permanent=false",
    );
  });

  it("radio-admin.iuk-ue.de steht NICHT in der Vorbelegung von SUITE_TRAEFIK_RULE", () => {
    // Sonst erreicht der Alt-Host den Container und faellt STILL auf portal zurueck
    // (`src/core/routing.ts:69`), statt umgeleitet zu werden.
    const rule = suiteLabels().find((l) => l.startsWith("traefik.http.routers.iuk-suite.rule="));
    expect(rule).toBeTruthy();
    expect(rule).not.toContain("radio-admin");
  });
});
