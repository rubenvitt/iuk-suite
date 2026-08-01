import { eq } from "drizzle-orm";

import { getDb } from "../../../_db/client";
import { zugangslinks } from "../../../_db/schema";
import { normalisiereToken, tokenHash } from "../../../_lib/token";
import { AbgabeFormular } from "../../../_ui/AbgabeFormular";
import s from "./abgabe.module.css";

/**
 * DIE ANONYME ABGABESEITE — `/u/<token>` an der Wurzel des Inbox-Hosts
 * (Spec §8.1, §8.4 Stufe 1, Plan T38).
 *
 * ═══ HTTP 200 IN JEDEM FALL, AUCH BEIM UNGUELTIGEN TOKEN ═════════════════════
 *
 * Kein `notFound()`, kein `redirect()`, keine 401-Seite: der Melder steht mit
 * einem gedruckten Zettel vor einem Handy und hat sich vertippt — was er braucht,
 * ist eine KORREKTURAUFFORDERUNG am Ort. Genau das ist die 1:1-Pflicht aus §8.1.
 *
 * **Der Token-Parameter wird dabei NICHT uebernommen.** `drop` antwortet heute
 * `302` auf `/?error=invalid_token&token=<eingabe>` — ein GUELTIGES Token landete
 * damit in Browser-History und Referer und waere dort ein Zugangsdatum. Die
 * Pflicht ist die Aufforderung, nicht der Parameter.
 *
 * **Ein ungueltiges, ein widerrufenes und ein abgelaufenes Token sagen dasselbe.**
 * Der Melder erfaehrt nicht, welcher der drei Faelle vorliegt; sonst waere die
 * Seite ein Orakel, an dem sich gueltige Praefixe abfragen liessen. Dieselbe
 * Linie wie in `api/u/[token]/upload/route.ts` (`loeseTokenAuf`).
 *
 * **KEIN Token im Log** (§8.1): `drop` laeuft mit `logger: true` und schreibt die
 * volle URL samt Token in jede `incoming request`-Zeile. Diese Datei loggt
 * nicht — und der Token erscheint auch in keinem gerenderten Text.
 *
 * ═══ WARUM DIE AUFLOESUNG HIER LIEGT UND NICHT IM FORMULAR ═══════════════════
 *
 * `_lib/token.ts` haengt an `node:crypto`. Ein Import aus der Client-Insel zoege
 * das ins Browser-Bundle; die Richtung ist deshalb fest: die Server Component
 * liest den Token, das Formular bekommt ihn als Zeichenkette. Umgekehrt liest
 * diese Datei aus `_ui/AbgabeFormular.tsx` KEINEN Wert, nur die Komponente —
 * ein Wert aus einem `"use client"`-Modul kaeme hier als Client-Referenz an und
 * ergaebe HTTP 500 fuer die ganze Seite (Falle 6).
 *
 * Rolle (`inbox`) und Rahmen kommen aus `(oeffentlich-inbox)/layout.tsx`. Ein
 * zweiter Riegel hier waere derselbe an der falschen Stelle.
 */

/**
 * KEIN Zwischenspeicher. Die Seite entscheidet je Aufruf ueber einen Token, und
 * eine zwischengespeicherte Antwort hielte einen widerrufenen Link am Leben —
 * die Laufzeit betraegt hoechstens 72 Stunden, der Widerruf wirkt sofort. Das
 * Layout ruft zwar schon `headers()` und macht das Segment damit dynamisch; auf
 * diesen Nebeneffekt eines FREMDEN Riegels soll die Zusage aber nicht hoerbar
 * angewiesen sein.
 */
export const dynamic = "force-dynamic";

/**
 * Stufe 1 aus §8.4, lesend: Grammatik, `revoked_at IS NULL`, `expires_at > now`.
 *
 * KEIN Fehlversuchszaehler hier, anders als im Route Handler: gezaehlt wird, wo
 * geschrieben wird. Ein Zaehler auf dem Leseweg sperrte die Seite fuer alle
 * Melder hinter derselben NAT-IP, sobald einer sich vertippt — genau der
 * `feedback`-Ausfall, den §8.4 als nicht verhandelbar benennt.
 */
function istOffen(kanonisch: string, jetzt: Date): boolean {
  const zeile = getDb()
    .select({ expiresAt: zugangslinks.expiresAt, revokedAt: zugangslinks.revokedAt })
    .from(zugangslinks)
    .where(eq(zugangslinks.tokenHash, tokenHash(kanonisch)))
    .get();

  if (zeile === undefined) return false;
  if (zeile.revokedAt !== null) return false;
  // Gleichstand ist abgelaufen — dieselbe Lesart wie bei `shares.expires_at`
  // und im Route Handler.
  return zeile.expiresAt.getTime() > jetzt.getTime();
}

export default async function FilesAbgabeSeite({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const kanonisch = normalisiereToken(token);

  if (kanonisch === null || !istOffen(kanonisch, new Date())) {
    return (
      <div data-testid="files-abgabe-ungueltig">
        <h1 className="fp-titel">Dieser Abgabelink ist nicht (mehr) gültig</h1>
        <div className={s.ungueltig}>
          <p className="fp-text">
            Bitte prüfen Sie, ob der Link vollständig übernommen wurde — am
            sichersten ist der QR-Code auf dem Aushang.
          </p>
        </div>
        <p className="fp-meta">
          Wenn er auch dann nicht funktioniert, ist die Laufzeit abgelaufen. Bitte
          wenden Sie sich an die Stelle, die die Abgabe angefordert hat — sie kann
          Ihnen einen neuen Link geben.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="files-abgabe">
      <h1 className="fp-titel">Dateien abgeben</h1>
      <p className="fp-text">
        Wählen Sie die Dateien aus, die Sie übermitteln möchten. Auf dem Handy
        können Sie im Auswahldialog auch direkt die Kamera benutzen.
      </p>
      {/* Der Token geht als Zeichenkette weiter — die Insel baut daraus die
          Adresse des Abgabewegs, und sonst nichts. */}
      <AbgabeFormular token={kanonisch} />
    </div>
  );
}
