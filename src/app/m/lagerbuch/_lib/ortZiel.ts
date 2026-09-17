/**
 * WOHIN EIN GESCANNTES ORTSETIKETT FUEHRT — DRK-312.
 *
 * Kein "use client", kein Icon-Import (Fallen 6 und 7). Die Weiche
 * `o/[ortId]/page.tsx` liest diese Funktion als Server Component.
 *
 * ⚠️ SIE LEITET AN `tokenZielPfad` WEITER, STATT DIE FAELLE NOCH EINMAL
 * HINZUSCHREIBEN. Das ist der Punkt der Datei: „wo landet jemand, der an einer
 * Einheit einsteigt?" ist dieselbe Frage, die ein auf eine Einheit gebundenes
 * Zugangs-Kaertchen schon beantwortet (`_lib/tokenZiel.ts`), und zwei Antworten
 * darauf laufen auseinander, sobald jemand eine davon erweitert — genau die
 * Begruendung, aus der `tokenZielPfad` seinen Fahrzeugzweig ueber
 * `fahrzeugBindungAus` baut. Ein zweites `/helfer/check?fz=` im Modul waere eine
 * zweite Wahrheit, und die faellt erst auf, wenn die Check-Strecke umzieht.
 *
 * ⚠️ WARUM TROTZDEM EINE EIGENE DATEI UND KEIN ZWEITER EXPORT IN `tokenZiel.ts`:
 * jene Datei ist ZEICHENGLEICH aus der Alt-Anwendung uebernommen (§3.1, ihr
 * Kopf schreibt das aus). Ein neuer Export darin loeschte diese Zusage fuer eine
 * Sache, die es in der Alt-Anwendung gar nicht gibt.
 *
 * ⚠️ ES GIBT KEINEN LAGER-ZWEIG MIT EIGENEM ZIEL, und das ist eine
 * ENTSCHEIDUNG, keine Luecke (ClickUp DRK-312): einen Kontext „dieser
 * Lagerort" gibt es im Helfer-Ast nicht — `/helfer` zeigt den Bestand des
 * HANDLAGERS. Genau deshalb traegt der Etikettenbogen ausschliesslich den
 * Handlager und die Einheiten (`_db/etiketten.ts#ortEtikettenDaten`): fuer ein
 * zweites Lager gaebe es zwar eine Zeile, aber kein Ziel, das von ihm handelt —
 * das Etikett zeigte auf einen fremden Bestand. Ein Etikett, das luegt, ist
 * schlimmer als keins.
 */
import { tokenZielPfad } from "./tokenZiel";

/** Genau das, was die Zielwahl braucht — mehr liest diese Funktion nicht. */
export type EtikettOrt = { id: string; typ: "lager" | "fahrzeug" };

/**
 * Der lokale Pfad in AEUSSERER Form (`/helfer/check?fz=…`, `/helfer`), nie die
 * innere (`/m/lagerbuch/…`): er landet in einem `redirect()`, also beim
 * Browser, und der kennt nur den Modul-Host.
 *
 * @param ort  Der gescannte Ort, oder `null` — zu dieser Adresse gehoert heute
 *   kein Etikett (unbekannte Id, stillgelegte Einheit, Schrank).
 * @param fahrzeugBindung  Die Einheit, an die das eingeloeste Kaertchen gebunden
 *   ist (`HelferZugang.fahrzeugBindung`), sonst `null`.
 *
 * ⚠️ EIN GEBUNDENES KAERTCHEN SCHLAEGT DAS GESCANNTE ETIKETT — und diese Zeile
 * ist der ganze Grund, warum die Funktion die Bindung ueberhaupt kennt
 * (Codex-Befund P1 zu PR #177, nachgeprueft an `helfer/check/page.tsx`).
 *
 * Ohne sie war der Ausgang STILL FALSCH: `/o/<B>` schickte auf
 * `/helfer/check?fz=B`, und die Check-Seite gibt `zugang.fahrzeugBindung`
 * ausdruecklich den Vorrang vor dem Suchparameter (`gebunden ?? (fz ? … )`,
 * DRK-302). Wer mit einem auf A gebundenen Kaertchen das Etikett an B scannt,
 * bekam damit den Check von A zu sehen, waehrend die Adresse B behauptete — und
 * haette den Inhalt von B in das Buch von A gezaehlt. Das ist der teuerste
 * Ausgang dieses Tickets, und kein Tor sieht ihn.
 *
 * ⚠️ DIE BINDUNG GEWINNT, NICHT DER SCAN, und das ist keine Bequemlichkeit: aus
 * Serversicht ist `/o/<B>` vom getippten `?fz=B` NICHT zu unterscheiden — beides
 * ist Nutzereingabe. Liesse man den Scan gewinnen, waere die Begrenzung aus
 * DRK-302 mit einer selbst gebauten Adresse aufhebbar, und diese Datei haette
 * die offene Betreiberfrage 5 („wie sind die Kaertchen physisch verteilt?") im
 * Vorbeigehen beantwortet. Hier wird also nichts gelockert; es wird nur
 * verhindert, dass die Adresse etwas anderes behauptet als der Bildschirm.
 *
 * ⚠️ SEIT DRK-373 VERLIERT DER SCAN NICHT MEHR SPURLOS. Gewinnt die Bindung,
 * haengt der Pfad die GESCANNTE Id als `gescannt=` an — sonst kann die
 * Check-Seite der Person nicht sagen, dass ihr Scan eine andere Einheit meinte.
 * Die Begruendung, warum das die Zusage von DRK-312 nicht aufweicht, steht
 * unten an der Zeile selbst.
 *
 * ⚠️ FUER EIN LAGER GILT DIE BINDUNG NICHT. `/helfer` ist die Artikelliste des
 * Handlagers und an keine Einheit gebunden — ein gebundenes Kaertchen erreicht
 * sie ohnehin ueber die Navigation. Hier gaebe es also nichts zu verfaelschen,
 * und die Bindung durchzuziehen hiesse: wer am REGAL steht und das Regal-Etikett
 * scannt, landet im Fahrzeug-Check. Genau die Verwechslung, gegen die diese
 * Funktion geschrieben ist, nur andersherum.
 */
export function ortZielPfad(
  ort: EtikettOrt | null,
  fahrzeugBindung: string | null,
): string {
  if (!ort || ort.typ !== "fahrzeug") return tokenZielPfad(null, null);
  /*
   * ⚠️ `!fahrzeugBindung` UND NICHT `=== null` — dieselbe Falsy-Probe, die die
   * Check-Seite fuehrt (`zugang.fahrzeugBindung ? … : undefined`). Der Typ
   * laesst die leere Zeichenkette zu, und `fahrzeugBindungAus` kann sie heute
   * nicht liefern; zwei Dateien, die „keine Bindung" verschieden auslegen,
   * sind aber genau die Naht, an der Landung und Anzeige auseinanderlaufen.
   */
  if (!fahrzeugBindung || fahrzeugBindung === ort.id) {
    return tokenZielPfad("fahrzeug", ort.id);
  }
  /*
   * ⚠️ DER UEBERGANGENE SCAN REIST MIT — DRK-373, und das ist der EINZIGE Weg,
   * auf dem die Check-Seite ihn ueberhaupt erfahren kann.
   *
   * Die Zeile darueber laesst die gescannte Id bewusst fallen: gezeigt wird die
   * gebundene Einheit, und die Adresse soll nichts anderes behaupten
   * (DRK-312). Genau damit war die Person aber ohne Auskunft — sie liest in der
   * Ueberschrift den Namen IHRER Einheit und muss selbst schliessen, dass das
   * nicht die ist, vor der sie steht. Bei „RTW 1" neben „RTW 2" merkt das
   * niemand.
   *
   * ⚠️ `gescannt` WIDERSPRICHT DER ZUSAGE VON DRK-312 NICHT, ES ERFUELLT SIE
   * GENAUER. Die Zusage lautet „die Adresse darf nicht etwas anderes behaupten
   * als der Bildschirm". `?fz=A&gescannt=B` behauptet: gezeigt wird A, gescannt
   * wurde B — und genau diese zwei Saetze stehen danach auf dem Bildschirm
   * (`_ui/ScanHinweis.tsx`). Was verboten bleibt, ist ein ZWEITES `fz`: `fz`
   * ist die Einheit, die gilt, und davon gibt es eine.
   *
   * ⚠️ NUR DIE ID, NIE DER NAME. Ein `&gescannt=RTW%202` waere Nutzereingabe,
   * die als Auskunft auf dem Schirm landet — die Check-Seite loest die Id
   * serverseitig gegen ihre Fahrzeugliste auf (CLAUDE.md, „Zugriffsschutz"),
   * und was sie dort nicht findet, nennt sie gar nicht.
   *
   * ⚠️ DIE ABFRAGE WIRD GEBAUT, NICHT ANGEHAENGT — und hier stand vorher genau
   * das Gegenteil (Codex-Befund P2 zu PR #186, nachgemessen, nicht vermutet).
   *
   * Es stand `${ziel}&gescannt=${encodeURIComponent(ort.id)}`: die GESCANNTE Id
   * kodiert, die GEBUNDENE nicht — die setzt `tokenZielPfad` roh in sein
   * `?fz=` ein. Bei einem importierten Bestand kann eine Id URL-Trennzeichen
   * tragen (`lagerorte.id` ist kein nanoid-Vertrag), und dann ist das Ergebnis
   * still falsch, gemessen:
   *
   *   fz = "rtw#1"            → /helfer/check?fz=rtw#1&gescannt=ktw-1
   *                             → alles ab `#` ist FRAGMENT, der Server sieht
   *                               `gescannt: null`
   *   fz = "a&gescannt=ktw-9" → …?fz=a&gescannt=ktw-9&gescannt=ktw-1
   *                             → zwei `gescannt`, Next reicht ein ARRAY, der
   *                               Vergleich auf der Check-Seite trifft nie
   *
   * Beide Male passiert genau das, wogegen dieses Ticket geschrieben ist: der
   * Hinweis bleibt weg, und niemand sieht es — die Seite rendert klaglos, der
   * Check laeuft auf der richtigen Einheit, nur die Auskunft fehlt. KEIN TOR
   * SIEHT DAS: die Pfadform ist gueltig, `typecheck` kennt keine URLs, und die
   * Wertetests standen auf Ids ohne Trennzeichen.
   *
   * ⚠️ DER PFAD KOMMT WEITER VON `tokenZielPfad`, nur die Abfrage nicht. Die
   * Route hier ein zweites Mal hinzuschreiben waere die zweite Wahrheit, gegen
   * die diese Datei gebaut ist (`ortZiel.test.ts` riegelt es ab); die
   * Abfrage-Parameter dagegen sind die WERTE, die diese Funktion ohnehin in der
   * Hand hat — `URLSearchParams` kodiert beide, und das rohe `?fz=` verschwindet
   * damit aus DIESEM Zweig.
   *
   * ⚠️ `tokenZielPfad` SELBST BLEIBT UNBERUEHRT, und das ist Absicht: die Datei
   * ist ZEICHENGLEICH aus der Alt-Anwendung uebernommen (§3.1, ihr Kopf schreibt
   * das aus), und ihr fehlendes `encodeURIComponent` trifft auch `/a/<id>` und
   * das blosse `?fz=` — also mehr als diesen Auftrag. Das steht als eigenes
   * Ticket auf dem Board (DRK-394), nicht als stille Ausweitung hier.
   */
  const ziel = tokenZielPfad("fahrzeug", fahrzeugBindung);
  const abfrage = new URLSearchParams({ fz: fahrzeugBindung, gescannt: ort.id });
  return `${ziel.split("?")[0]}?${abfrage}`;
}

/*
 * ⚠️ HIER STAND `kaertchenFuehrtInsHandlager` (DRK-395) — die Frage „darf
 * dieses Kaertchen auf die Handlager-Karte?". Sie ist mit DRK-406
 * GEGENSTANDSLOS geworden, nicht bloss ungenutzt: es gibt keine Auswahl mehr,
 * auf die eine Antwort passte. Jede Ortskarte traegt seither ihren EIGENEN
 * Code, und welcher das ist, entscheidet `tokens.ort_id` — keine Ableitung aus
 * der Zielart.
 *
 * ⚠️ SIE WIRD GELOESCHT UND NICHT AUFBEWAHRT. Eine exportierte Funktion, die
 * nur noch ihr eigener Test aufruft, sieht beim naechsten Lesen wie eine
 * gueltige Regel aus — und ihre Regel war: „ein Kaertchen mit Fahrzeugziel darf
 * NICHT auf die Handlager-Karte". Wer sie wieder anwendet, baut die
 * Entscheidung wieder ein, die dieses Ticket abgeloest hat.
 */
