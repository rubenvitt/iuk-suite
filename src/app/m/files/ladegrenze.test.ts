import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * KEINE LADEGRENZE IN files (DRK-424) — gemessen und entschieden, nicht
 * vergessen.
 *
 * Die Messung aus DRK-201 (lagerbuch) gilt der Bauform: eine dynamische Route
 * ohne `loading.tsx` laesst in Produktion auch die Adresszeile auf den
 * Server-Rundlauf warten. Sie wirkt aber nur, wo VORABGELADEN wird, und das
 * geschieht nur ueber `<Link>`. In files (Stand 24.09.2026, `build`/`start`):
 *   - `shares/[id]` und `shares/[id]/bearbeiten` erreicht man fast nur ueber
 *     Knoepfe mit `href`, also harte Aufrufe; der einzige `<Link>` ist
 *     „Zurueck" aus Bearbeiten. Rundlauf 30 ms.
 *   - `s/[id]` und `u/[token]` kommen von aussen (Mail, QR-Code), 20–22 ms.
 *
 * ⛔ UND DER PREIS WAERE HIER KONKRET: unter einer Ladegrenze bleibt eine
 * Seite ohne JavaScript beim Ladezustand stehen (gemessen, siehe
 * `core/shell/SeiteLaedt.tsx`). Die Freigabe-Detailseite traegt mit der
 * erneuten Virenpruefung ausdruecklich eine Aktion, die ohne JavaScript
 * funktioniert (`_ui/ShareDateienTabelle.tsx`, `AvWiederholen`), und die
 * oeffentliche Freigabe ist ohne JavaScript lesbar (`_ui/PasswortMaske.tsx`).
 *
 * Wer hier eine Grenze braucht, misst zuerst gegen `build`/`start` und traegt
 * die Entscheidung in DRK-424 bzw. einen Nachfolger ein — dann faellt dieser
 * Fall bewusst, nicht nebenbei.
 */
describe("files: Ladegrenzen", () => {
  it("legt keine loading.tsx an", () => {
    const gefunden: string[] = [];
    (function suche(dir: string): void {
      for (const eintrag of readdirSync(dir)) {
        const pfad = join(dir, eintrag);
        if (statSync(pfad).isDirectory()) suche(pfad);
        else if (eintrag === "loading.tsx") gefunden.push(relative(__dirname, pfad));
      }
    })(__dirname);
    expect(gefunden).toEqual([]);
  });
});
