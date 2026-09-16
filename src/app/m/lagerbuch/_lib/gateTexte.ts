/**
 * Die sechs Gate-Texte aus §3.9 an GENAU EINER Stelle. KEIN "use client"
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
 * waechst von zwei auf sechs (DRK-305 hat den fuenften und sechsten gebracht). Ein gespeicherter Alt-Link mit `?err=` ist danach
 * wirkungslos, aber nicht kaputt — unbekannte Parameter werden ignoriert.
 *
 * ⚠️ NICHT ZU VERWECHSELN MIT `HelferGrund` aus `_lib/actionTypen.ts` (§7.3,
 * Teil 4): der beschreibt das Ergebnis einer Helfer-ACTION am Formular, dieser
 * den Anlass einer Landung AM GATE. Sie ueberschneiden sich in genau einem Wort
 * (`gesperrt`) und in KEINEM Weg — zusammenlegen hiesse, den Text „deine
 * Eingaben bleiben stehen" auf eine Seite zu schreiben, auf der nichts
 * eingegeben wurde.
 */
export type GateGrund =
  | "code" | "gesperrt" | "abgelaufen" | "zuviele" | "anmeldung" | "keinZugriff";

/**
 * Der Anlass einer Sperre (`_lib/helferZugang.ts`) in den Anlass einer Landung
 * AM GATE übersetzt — die beiden Wertesätze überschneiden sich in genau einem
 * Wort, und „sitzung" heißt am Gate „abgelaufen".
 *
 * ⚠️ SIE STEHT HIER, WEIL ES ZWEI AUFRUFER GIBT: `requireHelferSitzung` und die
 * Zielwahl (DRK-300). Zwei ausgeschriebene Bedingungen wären zwei Wahrheiten
 * über dieselbe Frage — und die zweite ist die, die beim nächsten Wert niemand
 * mitzieht.
 *
 * ⚠️ `lage` IST PFLICHT, NICHT OPTIONAL — DRK-305. „Scanne das Kärtchen erneut"
 * ist für jemanden, der nie ein Kärtchen hatte, eine Aufforderung ins Leere. Ein
 * Vorgabewert wäre in jeder vergessenen Aufrufstelle still „Kärtchen" — also
 * genau der Defekt. So nennt der Compiler jede Stelle.
 *
 * ⚠️ UND DER KONTO-FALL IST SELBST ZWEIGETEILT (Review-Befund P2 zu PR #169).
 * „Melde dich erneut an" hilft nur, wenn die SITZUNG fehlt. Wurde stattdessen
 * die Lagerbuch-Gruppe entzogen, führt die erneute Anmeldung in dieselbe Sperre
 * zurück — eine Schleife, und zwar eine, die der Satz selbst auslöst. Deshalb
 * ist `Herkunftslage` eine unterschiedene Form und kein zweites `boolean`: beim
 * Kärtchen gibt es die Frage nach der Anmeldung gar nicht, und ein Feld, das
 * dort mitgeschleppt würde, wäre eine Antwort auf eine ungestellte Frage.
 *
 * ⚠️ DIE HERKUNFT ENTSCHEIDET ZUERST, DER GRUND ERST DANACH (Review-Befund P2
 * zu PR #169, zweite Runde). Der naheliegende Aufbau — „`gesperrt` gewinnt
 * immer, dann die Herkunft" — war hier falsch, und die Begründung dafür war
 * eine Verwechslung von BESITZEN und BENUTZEN: `gesperrt` entsteht in `befund()`
 * zwar ausschließlich mit Kärtchen-Cookie, aber `requireHelferSitzung` fällt
 * hinter genau diesem Grund auf das Konto durch (ausgeschrieben dort). Wer ein
 * totes Kärtchen-Cookie im Browser hat und angemeldet arbeitet, HAT also ein
 * gesperrtes Kärtchen — benutzt aber seines nie. Ihm „wende dich an die
 * Leitung" über einen Code zu sagen, den er nie eingegeben hat, ist eine
 * Auskunft über den falschen Gegenstand.
 *
 * Innerhalb der Kärtchen-Herkunft bleibt die alte Teilung: `gesperrt` heißt
 * „wende dich an die Leitung", `sitzung` heißt „scanne erneut".
 *
 * Der Parametertyp ist die Literal-Union statt eines Imports von `SperrGrund`:
 * diese Datei ist ein Blatt ohne eigene Importe, und das bleibt sie.
 */
export type Herkunftslage =
  /** Die Person kam ueber ein Kaertchen — die Frage nach der Anmeldung stellt sich nicht. */
  | { herkunft: "kaertchen" }
  /** Die Person kam angemeldet. `nochAngemeldet` trennt „Sitzung weg" von „Gruppe weg". */
  | { herkunft: "konto"; nochAngemeldet: boolean };

export function gateGrundFuerSperre(
  grund: "sitzung" | "gesperrt",
  lage: Herkunftslage,
): GateGrund {
  if (lage.herkunft === "kaertchen") return grund === "gesperrt" ? "gesperrt" : "abgelaufen";
  return lage.nochAngemeldet ? "keinZugriff" : "anmeldung";
}

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
  "anmeldung",
  "keinZugriff",
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
 * DIE SECHS SAETZE. Sie stehen hier und nirgends sonst; §7.2.4 und §11.5
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
   * DERSELBE ZUSTAND, ANDERE HERKUNFT — DRK-305. Wer den Helfer-Weg angemeldet
   * benutzt, hat kein Kärtchen; „scanne es erneut" schickte ihn nach etwas
   * suchen, das es nie gab. Der Weg zurück steht auf derselben Seite: die
   * Karte „Mit Pocket ID anmelden" trägt den `callbackUrl` aus demselben
   * `returnTo`, mit dem diese Landung hier ankommt.
   */
  anmeldung: () => "Deine Anmeldung ist abgelaufen. Melde dich erneut an.",
  /**
   * ⚠️ BEWUSST OHNE „MELDE DICH AN" — Review-Befund P2 zu PR #169. Diese Person
   * IST angemeldet; ihr fehlt die Lagerbuch-Gruppe. Eine erneute Anmeldung
   * führte sie durch den ganzen Pocket-ID-Weg zurück in dieselbe Sperre. Der
   * einzige Weg heraus geht über einen Menschen, also nennt der Satz ihn —
   * dieselbe Form wie bei `gesperrt` daneben.
   */
  keinZugriff: () =>
    "Dein Konto hat keinen Zugriff auf das Lagerbuch. Wende dich an die Leitung.",
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
