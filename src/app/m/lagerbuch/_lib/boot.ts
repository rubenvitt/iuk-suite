/**
 * Die Boot-Pruefungen des Moduls `lagerbuch` (§10.5).
 *
 * Kein "use client", kein Icon-Import. Diese Datei laeuft im Instrumentation-Hook,
 * bevor irgendetwas gerendert wird.
 *
 * ⚠️ SIE WIRFT NIE. `assertHostConfig()` sammelt die Meldungen ALLER Module ein
 * und entscheidet EINMAL, ob daraus ein Abbruch wird. Ein Wurf von hier braeche
 * die Kette mit einem fremden Fehler ab — und `assertHostConfig` laeuft fuer
 * portal, qr, feedback und files MIT. Ein Wurf naehme alle vier mit, und die
 * Meldung naennte nicht einmal das Modul, das ihn ausgeloest hat.
 *
 * ⚠️ SIE GREIFT NUR, WENN DAS MODUL ERREICHBAR IST — und das ist keine Milderung,
 * sondern eine Notwendigkeit. Eine unbedingte Pflicht hiesse: sobald ein Image mit
 * lagerbuch auf dem Server landet, startet die Suite nicht mehr, bis der Betreiber
 * die .env ergaenzt hat. Damit blockierte dieses Modul jeden unbeteiligten Deploy
 * im Fenster zwischen Merge und Cutover. Der Schalter ist DIESELBE Variable, die
 * das Modul einschaltet (`SUITE_HOST_LAGERBUCH` ueber `prodHostsFor`); es gibt
 * keinen zweiten, den jemand vergessen kann. Vorbild: `files/_lib/grenzen.ts:347-351`.
 *
 * ⚠️ `async` UND `Promise<string[]>`, obwohl nichts hier asynchron ist. Die Naht
 * daneben sieht so aus (`...(await filesBootFehler())`, `bootstrap.ts:44`), und
 * eine synchrone Funktion an derselben Stelle laedt dazu ein, das `await` beim
 * naechsten Umbau zu vergessen — aus einem Startabbruch wuerde dann eine
 * unbehandelte Rejection, die NICHTS abbricht (der Kopfkommentar von
 * `assertHostConfig` schreibt genau diesen Vorfall aus).
 */
import { getModule, prodHostsFor } from "@/core/registry";
import { grenzenFehler } from "./grenzen";

type EnvLike = Record<string, string | undefined>;

/**
 * Alle sechs Boot-Pruefungen aus §10.5 als Liste.
 *
 * 1–4 kommen aus `grenzenFehler()` (`_lib/grenzen.ts`, T32) — Zahlen, Kopplungen,
 * Sitzungsgeheimnis. Sie liegen dort, weil sie die modul-private `ZAHLEN`-Tabelle
 * brauchen und diese ausdruecklich NICHT exportiert wird (§10.8, Eigenschaft 2).
 *
 * 5 und 6 sind GRUPPEN-Fragen und liegen hier.
 */
export async function lagerbuchBootFehler(env: EnvLike = process.env): Promise<string[]> {
  if (prodHostsFor(getModule("lagerbuch"), env).length === 0) return [];

  // Pruefungen 1–4. `grenzenFehler` faengt die Wuerfe von `grenzen()` selbst ab
  // und liefert immer eine Liste.
  const fehler: string[] = [...grenzenFehler(env)];

  // Pruefung 5 — SUITE_ADMIN_GROUP_LAGERBUCH ist gesetzt und nicht leer.
  //
  // ⚠️ GELESEN WIRD DIE VARIABLE DIREKT, NICHT UEBER `adminGroupsFor`. Das faellt
  // bei nicht gesetzter Variable auf `mod.adminGroups` zurueck
  // (`core/groups.ts:83`), also auf den ENTWICKLUNGS-Vorgabewert
  // ["lagerbuch_nutzer"] — und meldete nichts. Die Frage hier ist aber eine andere:
  // HAT DER BETREIBER DIE PRODUKTIVE GRUPPE GESETZT?
  const adminGruppen = (env.SUITE_ADMIN_GROUP_LAGERBUCH ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
  if (adminGruppen.length === 0) {
    fehler.push(
      `SUITE_ADMIN_GROUP_LAGERBUCH ist nicht gesetzt oder leer. Ohne sie greift der ` +
        `Entwicklungs-Vorgabewert aus dem Registry ("lagerbuch_nutzer"); ist in Pocket ID ` +
        `niemand in dieser Gruppe, ist die Folge ein STUMMES 404 fuer ALLE Verwaltenden — ` +
        `fuer dieses Modul gibt es bewusst KEINE Suite-Admin-Rueckfallebene ` +
        `(Betreiber-Entscheidung 3). Der Wert wandert 1:1 aus OIDC_ADMIN_GROUP der alten ` +
        `stack.env. ⚠️ Diese Pruefung faengt den LEEREN, nicht den FALSCHEN Wert.`,
    );
  }

  // Pruefung 6 — SUITE_ACCESS_GROUP_LAGERBUCH ist NICHT gesetzt.
  //
  // Ein gesetzter Wert waere STILL WIRKUNGSLOS: `canAccess` steigt fuer
  // `requiresAuth: false` sofort mit `true` aus (`core/registry.ts:155`) und liest
  // `requiredGroups` NIE. `validateGroupConfig` meldet nur den LEER gesetzten Fall
  // (`core/groups.ts:137`) — der Betreiber setzte also eine Zugangsgruppe, bekaeme
  // keine Warnung, und das Modul bliebe fuer jeden offen.
  if (env.SUITE_ACCESS_GROUP_LAGERBUCH !== undefined) {
    fehler.push(
      `SUITE_ACCESS_GROUP_LAGERBUCH ist gesetzt und waere fuer dieses Modul WIRKUNGSLOS. ` +
        `lagerbuch traegt requiresAuth: false (zwingend — /t/<code> erzeugt die Sitzung erst ` +
        `und wird ohne jede Sitzung aufgerufen); canAccess steigt damit sofort mit true aus ` +
        `und liest requiredGroups nie. Ausweg: die Zeile ersatzlos entfernen. Wer den ` +
        `Verwaltungszugang steuern will, setzt SUITE_ADMIN_GROUP_LAGERBUCH.`,
    );
  }

  return fehler;
}
