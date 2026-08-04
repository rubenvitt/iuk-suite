import type { DB } from "../_db/client";
import { users } from "../_db/schema";
import type { Viewer } from "./zugang";

/**
 * Bauform 1:1 aus `m/feedback/_db/queries.ts:83` (upsertKnownUser), Semantik 1:1
 * aus `lagerbuch/src/auth.ts:18-27`.
 *
 * ⚠️ `import type { Viewer }` — NICHT als Wert. `zugang.ts` importiert
 * `merkeNutzer` von hier; ein Wert-Import in dieser Richtung erzeugte einen
 * echten Modulzyklus. TypeScript erlaubt ihn, ESM loest ihn zur Laufzeit mit
 * `undefined` auf, und der Fehler waere ein `merkeNutzer is not a function` auf
 * genau EINEM Codepfad: dem ersten Verwaltungsaufruf. `import type` wird beim
 * Uebersetzen GELOESCHT und hinterlaesst keine Kante.
 *
 * `id` ist der `sub` und niemals `user.id` — Auth.js vergibt bei OIDC je Login
 * eine ZUFALLS-UUID (`lagerbuch/src/lib/auth/konto.ts:10-15`). In der Suite kommt
 * der Wert aus `session.user.id`, das `core/auth/config.ts:171-173` auf
 * `token.sub` legt; die Verwechslung ist hier also nicht mehr moeglich. Genau
 * diese Verwechslung hat den Altbestand verseucht: bis `f2b515b` (29.07.2026,
 * fuenf Tage vor dem Freeze) schrieb `src/auth.ts` den Auth.js-`user.id` in
 * `users.id`, und fast jede Zeile des Altbestands ist deshalb auf eine Waise
 * geschluesselt. DAS JOURNAL IST HEIL — dort stand immer der echte `sub`.
 *
 * LAEUFT NACH DEM RIEGEL: nur wer die Pruefung uebersteht, wird zuordenbar
 * (§3.7.2, Muster `requireFeedbackAccess.ts:50-55`). Der Preis, benannt: heute
 * entsteht der Satz beim LOGIN, kuenftig beim ERSTEN AUFRUF DER VERWALTUNG. Wer
 * sich anmeldet und lagerbuch nie oeffnet, hat keinen Satz — das ist richtig so.
 *
 * `core/directory` ersetzt die Tabelle NICHT: es ist ein Verzeichnisdienst gegen
 * Pocket ID und kennt nur, was dort heute gefuehrt wird — niemals die ALTEN
 * Kennungen aus dem historischen Journal. `users` muss auch dann noch Namen
 * liefern, wenn ein Konto laengst geloescht wurde.
 */

/**
 * EINMAL JE PERSON JE PROZESS. `merkeNutzer` laeuft bei JEDER Verwaltungsanfrage;
 * ohne Deduplizierung schriebe eine einzige betroffene Person bei jedem
 * Seitenwechsel eine Zeile ins Containerlog.
 *
 * ⚠️ ANDERS ALS BEI `meldeFehlendeGruppe` (zugang.ts) STEHT DIE KENNUNG HIER IN
 * DER ZEILE. Das ist Absicht (§4.13 (i): „console.warn mit der Kennung"): dort
 * dient der `sub` ausschliesslich als Dedup-Schluessel, hier ist er der einzige
 * Weg, die betroffene Zeile zu finden. Die abgewiesene Person ist eine
 * Zugriffsmeldung, die namenlose Zeile ein Datenbefund.
 */
const namenlosGemeldet = new Set<string>();

function meldeNamenlos(sub: string): void {
  if (namenlosGemeldet.has(sub)) return;
  namenlosGemeldet.add(sub);
  console.warn(
    `[lagerbuch] users-Zeile ohne Namen und ohne E-Mail fuer die Kennung ${sub}. ` +
      `Das Journal zeigt fuer diese Person die ROHE Kennung, waehrend ihre Zeilen von ` +
      `vor dem Cutover den Klarnamen tragen — dieselbe Person, zwei Darstellungen, in ` +
      `derselben Liste. Zwei moegliche Ursachen: die Suite-Sitzung fuehrt keine ` +
      `name/email-Claims (dann fehlt der passende OIDC-Scope), oder merkeNutzer laeuft ` +
      `an einer Stelle, an der die Claims noch nicht vorliegen.`,
  );
}

/**
 * Legt die Zeile beim ersten Sehen an und haelt sie danach aktuell.
 *
 * ⚠️ DIE NICHT-UEBERSCHREIBEN-REGEL GILT NUR FUER DAS UPDATE, NICHT FUER DAS
 * INSERT (§4.13 (i)). Ein spaeterer Login ohne Klarnamen darf einen bereits
 * bekannten Namen nicht ueberschreiben — die Bedingung steht heute schon so da
 * (`lagerbuch/src/auth.ts:22-27`). Wer sie auf BEIDES zieht, erzeugt den
 * Defektzustand mit Ansage: das INSERT liesse name und email dann leer, und die
 * frisch angelegte Zeile loeste sofort auf die rohe Kennung auf.
 *
 * EIN FEHLSCHLAG WIRD GELOGGT, NICHT GEWORFEN. Der Zugang funktioniert auch ohne
 * den Satz — nur das Journal zeigt dann rohe IDs
 * (`lagerbuch/src/auth.ts:29-33` begruendet das bereits so). Diese Zeile wird
 * ABSICHTLICH NICHT dedupliziert: sie traegt ein Exception-Objekt, und ein
 * wiederkehrender Datenbankfehler soll jedes Mal sichtbar sein.
 */
export function merkeNutzer(db: DB, viewer: Viewer): void {
  if (!viewer.name && !viewer.email) meldeNamenlos(viewer.sub);
  const jetzt = new Date();
  try {
    db.insert(users)
      .values({ id: viewer.sub, name: viewer.name, email: viewer.email, lastLoginAt: jetzt })
      .onConflictDoUpdate({
        target: users.id,
        // Nur setzen, was die Sitzung wirklich mitbringt. `undefined` heisst in
        // Drizzle „Spalte nicht anfassen"; ein `null` hier machte aus jedem
        // Login ohne Claims einen Namensverlust.
        set: {
          ...(viewer.name ? { name: viewer.name } : {}),
          ...(viewer.email ? { email: viewer.email } : {}),
          lastLoginAt: jetzt,
        },
      })
      .run();
  } catch (e) {
    console.warn(
      "[lagerbuch] users-Upsert fehlgeschlagen — das Journal zeigt fuer diese Person rohe IDs:",
      e,
    );
  }
}

/** Nur fuer Tests: den prozess-lokalen Dedup-Speicher leeren. */
export function _resetNamenlosGemeldet(): void {
  namenlosGemeldet.clear();
}
