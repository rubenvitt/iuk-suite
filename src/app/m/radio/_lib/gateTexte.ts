/**
 * Die vier Gate-Texte aus Spec 1 §3.3.4 (`docs/superpowers/specs/2026-08-17-radio-modul-design.md:2370-2398`)
 * an GENAU EINER Stelle.
 *
 * ⛔ KEIN `"use client"` — Falle 6 (`CLAUDE.md`, Punkt 6): die Gate-Seite ist eine Server
 * Component und braucht die WERTE, nicht eine Client-Referenz. Der Scan, der das modulweit
 * durchsetzt, steht in `src/app/m/radio/riegel.test.ts:684-703`.
 *
 * ⛔ DIESE DATEI KONSUMIERT NICHTS. Sie hat keinen einzigen Import, und das ist eine
 * Auflage, keine Zufaelligkeit: der Brief `.superpowers/sdd/planteil3/briefs/A5.md:8`
 * schreibt „Consumes: nichts". Der Vorabscan schlaegt vor, dass `_lib/meldungen.ts`
 * (Aufgabe A14) den `gesperrt`-Satz spaeter von HIER importiert, statt ihn ein zweites
 * Mal zu schreiben (`.superpowers/sdd/planteil3/VORABSCAN-A.md:411`, Fund F25). Ein
 * Import in dieser Datei koennte daraus einen Zyklus machen.
 *
 * DREI UNTERSCHIEDE ZU `lagerbuch/_lib/gateTexte.ts`, alle von der Spec gesetzt:
 *
 *   1. „Kaertchen" -> „QR-Code" in `abgelaufen` (Spec:2387-2389).
 *   2. `abgelaufen` nennt den ZWEITEN WEG mit („oder melde dich über die Suite an") —
 *      die Suite-Anmeldung aus §3.5. Bei `lagerbuch` gibt es sie nicht (Spec:2387-2389).
 *   3. Bei genau einer Sekunde steht die ZAHL AUSGESCHRIEBEN: „in einer Sekunde".
 *      ⚠️ Das ist der Unterschied, den ein 1:1-Port ueberliest.
 *      `src/app/m/lagerbuch/_lib/gateTexte.ts:83` baut denselben Satz als
 *      `` `in ${sek} ${sek === 1 ? "Sekunde" : "Sekunden"}` `` und schreibt bei `sek === 1`
 *      folglich „in 1 Sekunde" — grammatisch richtig, aber NICHT der Wortlaut, den
 *      Spec:2385 setzt („bei `n = 1` ‚in einer Sekunde'"). Wer die `lagerbuch`-Zeile
 *      kopiert, ist an `gateTexte.test.ts` rot, und die Reparatur gehoert in DIESE Datei,
 *      nicht in den Test.
 */
export type GateGrund = "code" | "gesperrt" | "abgelaufen" | "zuviele";

/**
 * Der geschlossene Satz, als Wert (Spec:2375). Er ist exportiert, damit der Test ihn
 * durchlaufen kann — waechst er um einen Wert, ohne dass `TEXTE` ihn kennt, ist das ein
 * Typfehler an `TEXTE` und kein stilles `null`.
 */
export const GATE_GRUENDE: readonly GateGrund[] = [
  "code",
  "gesperrt",
  "abgelaufen",
  "zuviele",
] as const;

/**
 * Der Typwaechter vor jeder Verwendung (Spec:2391-2394, woertlich: „ein `searchParams`-Wert
 * ist Nutzereingabe, und er landet in einem `Location`-Kopf, wo keine React-Entkommung
 * schuetzt").
 *
 * ⛔ DER WERT WIRD NIE DURCHGEREICHT, sondern gegen diese Liste geprueft. Ein Route
 * Handler, der den rohen `grund` aus einer URL in eine Weiterleitung schriebe, baute
 * Header-Injection ein; ein geschlossener Satz ist die einfachste Abhilfe dagegen.
 *
 * Nimmt `undefined` mit entgegen: der eine Aufrufer ist ein `searchParams`-Feld, und das
 * kann fehlen (Signatur Spec:2376).
 */
export function istGateGrund(roh: string | null | undefined): roh is GateGrund {
  return typeof roh === "string" && (GATE_GRUENDE as readonly string[]).includes(roh);
}

/**
 * DIE VIER SAETZE. Sie stehen hier und nirgends sonst (Spec:2387).
 *
 * `code` und `gesperrt` sind bewusst VERSCHIEDEN formuliert, und der Unterschied ist
 * fachlich, nicht stilistisch (Spec:2382-2383): `code` heisst „unbekannt ODER gesperrt" —
 * mehr weiss der Einloeseweg nicht. `gesperrt` heisst „wir wissen es genau: DIESER
 * Zugangs-Code wurde gesperrt", weil dort eine gueltige Sitzung lief und die Codezeile
 * gelesen wurde. Zusammengelegt verloere die zweite Lage ihre Auskunft.
 */
const TEXTE: Record<GateGrund, (sperrSekunden: number | null) => string> = {
  code: () => "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.",
  gesperrt: () => "Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung.",
  abgelaufen: () =>
    "Dein Zugang ist abgelaufen. Scanne den QR-Code erneut oder melde dich über die Suite an.",
  /**
   * ⛔ DER GRUND WANDERT UEBER DIE URL, DIE ZAHL NICHT (Spec:2391-2392). `sperrSekunden`
   * ist der Rueckgabewert von `gateGesperrt(...)`, DEN DIE GATE-FLAECHE SELBST liest —
   * mit denselben Absender-Kopfzeilen. Kaeme die Zahl aus der URL, waere sie eine
   * Nutzereingabe und der Satz eine Behauptung des Anfragenden ueber seine eigene Sperre.
   *
   * `null` heisst: die Schranke ist gerade offen — etwa, weil die Sperre zwischen
   * Weiterleitung und Abruf ablief. Dann der Satz OHNE Zahl (Spec:2385).
   *
   * ⛔ DREI ZWEIGE, NICHT ZWEI. Der mittlere ist der, den ein Port aus `lagerbuch`
   * verliert: bei genau einer Sekunde setzt Spec:2385 „in einer Sekunde", nicht „in 1
   * Sekunde" (siehe Unterschied 3 im Kopf dieser Datei). „in 1 Sekunden" waere der
   * groebere Fehler derselben Familie — und er faellt auf einem Aufsteller im Funkraum
   * jedem auf.
   */
  zuviele: (sek) => {
    if (sek === null) return "Zu viele Fehlversuche. Bitte in einer Minute erneut versuchen.";
    if (sek === 1) return "Zu viele Fehlversuche. Bitte in einer Sekunde erneut versuchen.";
    return `Zu viele Fehlversuche. Bitte in ${sek} Sekunden erneut versuchen.`;
  },
};

/**
 * Der anzuzeigende Satz — `null`, wenn `roh` nicht im Satz steht oder fehlt. Die Flaeche
 * rendert dann NORMAL.
 *
 * ⛔ AUSDRUECKLICH KEIN RUECKFALLTEXT (Spec:2396-2398, woertlich: „Ein ‚Etwas ist
 * schiefgelaufen' auf einer Seite, auf der nichts schiefgelaufen ist, ist schlechter als
 * Schweigen"). Ein Rueckfalltext machte aus jedem Tippfehler in der URL eine Meldung, die
 * nichts bedeutet — und der Regelfall dieser Seite IST der normale Aufruf.
 *
 * `sperrSekunden` wirkt NUR auf `zuviele`; jeder andere Text ignoriert die Zahl.
 */
export function gateMeldung(
  roh: string | null | undefined,
  sperrSekunden: number | null,
): string | null {
  if (!istGateGrund(roh)) return null;
  return TEXTE[roh](sperrSekunden);
}
