/**
 * Die vier Gate-Texte aus §3.9 an GENAU EINER Stelle. KEIN "use client"
 * (Falle 6 — die Gate-Seite ist eine Server Component und braucht die WERTE).
 *
 * DER BEFUND, DEN DIESE DATEI HEILT (Falle 60): `lagerbuch/src/app/t/[code]/route.ts:21`
 * haengt heute `?err=rate` bzw. `?err=code` an die Gate-URL — und NIEMAND liest
 * das. Ein grep auf den String ueber src/ liefert genau einen Treffer, und das
 * ist die schreibende Zeile; `src/app/(gate)/page.tsx:10` destrukturiert
 * ausschliesslich `returnTo`. Wer heute ein Etikett mit gesperrtem Code scannt,
 * landet WORTLOS auf dem Gate und sieht dasselbe Bild wie bei einem normalen
 * Aufruf.
 *
 * Das ist ein Mangel des Bestands — und eine Falle fuer die Portierung: `?err=`
 * sieht in `route.ts` nach einer funktionierenden Auskunft aus, und ein Port,
 * der die Zeile mitnimmt und abhakt, uebernimmt eine SACKGASSE ALS FEATURE.
 *
 * Der Parameter heisst deshalb `grund` und nicht mehr `err`: der Wertesatz
 * waechst von zwei auf vier. Ein gespeicherter Alt-Link mit `?err=` ist danach
 * wirkungslos, aber nicht kaputt — unbekannte Parameter werden ignoriert.
 *
 * ⚠️ NICHT ZU VERWECHSELN MIT `HelferGrund` aus `_lib/actionTypen.ts` (§7.3,
 * Teil 4): der beschreibt das Ergebnis einer Helfer-ACTION am Formular, dieser
 * den Anlass einer Landung AM GATE. Sie ueberschneiden sich in genau einem Wort
 * (`gesperrt`) und in KEINEM Weg — zusammenlegen hiesse, den Text „deine
 * Eingaben bleiben stehen" auf eine Seite zu schreiben, auf der nichts
 * eingegeben wurde.
 */
export type GateGrund = "code" | "gesperrt" | "abgelaufen" | "zuviele";

/**
 * Der geschlossene Satz, als Wert. Er ist exportiert, damit der Test ihn
 * durchlaufen kann — waechst er um einen Wert, ohne dass `TEXTE` ihn kennt, ist
 * das rot statt still `null`.
 */
export const GATE_GRUENDE: readonly GateGrund[] = [
  "code",
  "gesperrt",
  "abgelaufen",
  "zuviele",
] as const;

/**
 * Ein `searchParams`-Wert ist NUTZEREINGABE. Er wird gegen die Liste geprueft und
 * NIE in die Seite durchgereicht — und auch nicht in einen `Location`-Kopf: der
 * Route Handler `/abmelden` (§3.4.4) baut aus diesem Wert eine Weiterleitung und
 * reicht deshalb ausschliesslich Werte aus DIESEM Satz weiter.
 *
 * Nimmt zusaetzlich `undefined` entgegen (Festlegung G8): der zweite Aufrufer
 * ist ein `searchParams`-Feld, und das kann fehlen.
 */
export function istGateGrund(roh: string | null | undefined): roh is GateGrund {
  return typeof roh === "string" && (GATE_GRUENDE as readonly string[]).includes(roh);
}

/**
 * DIE VIER SAETZE. Sie stehen hier und nirgends sonst; §7.2.4 und §11.5
 * verweisen hierher, statt sie zu wiederholen.
 *
 * `code` und `gesperrt` sind bewusst VERSCHIEDEN formuliert: `code` heisst
 * „unbekannt ODER gesperrt" — mehr weiss der Einloeseweg nicht, denn `redeemToken`
 * liefert fuer beide Faelle `{ok:false}`. `gesperrt` heisst „wir wissen es genau:
 * dieses Kaertchen wurde gesperrt", weil dort eine gueltige Sitzung lief und die
 * Token-Zeile gelesen wurde. Zusammengelegt verlaere die zweite Lage ihre
 * Auskunft.
 */
const TEXTE: Record<GateGrund, (sperrSekunden: number | null) => string> = {
  code: () => "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.",
  gesperrt: () => "Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung.",
  abgelaufen: () => "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut.",
  /**
   * Die Sekundenzahl ist der Rueckgabewert von `gateGesperrt(absenderAus(...))`,
   * DEN DIE GATE-SEITE SELBST LIEST (§7.2.4) — ueber die URL wandert nur der
   * Grund. Kaeme die Zahl aus der URL, waere sie eine Nutzereingabe und der Satz
   * eine Behauptung des Anfragenden ueber seine eigene Sperre.
   *
   * `null` heisst: die Sperre ist inzwischen abgelaufen. Dann der Satz ohne Zahl.
   * Singularform bei genau einer Sekunde (Festlegung G8) — „in 1 Sekunden" ist
   * kein zumutbarer deutscher Satz.
   */
  zuviele: (sek) =>
    sek === null
      ? "Zu viele Fehlversuche. Bitte in einer Minute erneut versuchen."
      : `Zu viele Fehlversuche. Bitte in ${sek} ${sek === 1 ? "Sekunde" : "Sekunden"} erneut versuchen.`,
};

/**
 * Der anzuzeigende Satz — `null`, wenn `roh` nicht im Satz steht oder fehlt.
 * Das Gate rendert dann NORMAL.
 *
 * Ausdruecklich KEIN Rueckfalltext: ein „Etwas ist schiefgelaufen" auf einer
 * Seite, die gerade voellig normal aufgerufen wurde, ist schlechter als
 * Schweigen — und der Regelfall dieser Seite IST der normale Aufruf.
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
