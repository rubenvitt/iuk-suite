import { eq } from "drizzle-orm";
import { qrSvg } from "@/core/qr";
import { moduleUrl } from "@/core/shell/moduleUrl";
import {
  einheitLabels, einheitMeta, standortMeta, type Einheitenart,
} from "../_lib/konstanten";
import { etikettOrte } from "../_lib/lesepfade/ortEtiketten";
import { stelleOrtCodesSicher } from "../_lib/schreibpfade/ortCodes";
import type { DB } from "./client";
import { artikel, tokens } from "./schema";

/**
 * DIE DATEN DES ETIKETTENBOGENS (Spec §8.4).
 *
 * Sie liegt unter `_db/`, obwohl `_db/` keine Fachabfrage haelt — eine von zwei
 * benannten Ausnahmen (neben quelle.ts, §2.1). Der Grund ist bei beiden
 * derselbe: sie kennt KEINE Seite, sondern nur eine Zeilenform. Waechst hier
 * etwas heran, das eine Seite kennt, ist es am falschen Ort.
 */

/**
 * WARUM EINE EIGENE KLASSE UND KEIN `new Error(...)`: die Seite muss diesen
 * Zustand von einem Datenbankfehler unterscheiden koennen. Mit einem generischen
 * Error bliebe nur ein Textvergleich als Kontrollfluss — und der bricht beim
 * ersten Umformulieren, still. Alles ausser dieser Klasse faellt bewusst an
 * error.tsx durch (§11.5, Zustaende 23 und 38).
 */
export class EtikettenBasisFehlt extends Error {
  constructor() {
    super(
      "Fuer lagerbuch ist keine oeffentliche Domain konfiguriert (SUITE_HOST_LAGERBUCH).",
    );
    this.name = "EtikettenBasisFehlt";
  }
}

export type ArtikelEtikett = { id: string; name: string; fach: string; url: string; qr: string };
/**
 * ⚠️ NUR NOCH ARTIKEL — DRK-406. Bis hierher druckte dieser Bogen auch
 * KAERTCHEN-Karten (`TokenEtikett`, je ein Zugangs-Code auf Klebematerial).
 * Die sind ersatzlos entfallen, und zwar nicht aus Aufraeumlust: ein Code
 * gehoert seit diesem Ticket IMMER zu einem Ort und steht auf dessen Ortskarte
 * (`ortEtikettenDaten`). Ein zweiter Druckweg fuer denselben Code haette zwei
 * Papierformen fuer eine Sache ergeben — und die Frage „welches Etikett gilt?"
 * beantwortet man am Regal nicht.
 */
export type EtikettenDaten = {
  /** Die tatsaechlich verwendete Basis. Die Seite schreibt sie ueber den Bogen
   *  (Klasse `lb-nichtDrucken`) — der EINZIGE Weg, eine Umsortierung von
   *  SUITE_HOST_LAGERBUCH vor dem Papier zu bemerken (§8.1, 8-B). */
  basis: string;
  artikel: ArtikelEtikett[];
};

/**
 * DIE EINE HERLEITUNG DER DRUCKBASIS — sie steht als Funktion da, weil seit
 * DRK-312 ZWEI Etikettenflaechen sie brauchen (der Artikelbogen und die Ortskarten).
 * Zwei Abschriften waeren zwei Orte fuer dieselbe Aenderung, und die zweite
 * faellt erst auf, wenn jemand ein GEKLEBTES Etikett scannt.
 *
 * `moduleUrl` liest ueber `prodHostsFor()` und damit aus SUITE_HOST_LAGERBUCH —
 * dieselbe Wahrheit, die auch das Routing benutzt (8-B).
 *
 * NICHT `resolveHost(headers)`: der Wert kommt aus `x-forwarded-host`, ist
 * faelschbar und garantiert nicht den Modul-Host. Ein manipulierter Kopf
 * druckte einen ganzen Bogen auf eine fremde Domain — und der Fehler zeigte
 * sich erst, wenn jemand ein GEKLEBTES Etikett scannt.
 *
 * NICHT `APP_BASE_URL`: das waere eine sechste Wahrheit neben
 * SUITE_HOST_LAGERBUCH, mit der Gefahr, dass beide auseinanderlaufen. Die
 * Variable faellt beim Port ersatzlos (§10.2).
 */
function etikettenBasis(): string {
  const roh = moduleUrl("lagerbuch");
  if (!roh) throw new EtikettenBasisFehlt();
  return roh.replace(/\/$/, "");
}

export async function etikettenDaten(db: DB): Promise<EtikettenDaten> {
  // Warum die Basis so und nicht anders entsteht, steht an `etikettenBasis`.
  const basis = etikettenBasis();

  // 1:1 aus etiketten.ts:16-17: hart auf `aktiv`. Ein deaktivierter Artikel ist
  // unter /a/<id> weiterhin bebuchbar, aber nie wieder nachdruckbar (Falle 26) —
  // die Luecke ist bewusst uebernommen und steht als R32 im Runbook.
  const arts = db.select().from(artikel).where(eq(artikel.aktiv, true)).all();

  /**
   * EIN Promise.all, keine Schleife mit vergessenem `await`: `qrSvg` ist async
   * (core/qr/index.ts:37-40), und ein fehlendes `await` ergaebe hier keine
   * Fehlermeldung, sondern `[object Promise]` als Markup (8-I, Punkt 1).
   */
  const artikelEtiketten = await Promise.all(
    arts.map(async (a) => {
      const url = `${basis}/a/${a.id}`;
      return { id: a.id, name: a.name, fach: a.fach, url, qr: await qrSvg(url) };
    }),
  );

  return { basis, artikel: artikelEtiketten };
}

/**
 * DIE DATEN DER ORTSKARTEN — DRK-312.
 *
 * Ein Etikett je Handlager bzw. Einheit, nicht je Produkt. Es traegt einen
 * grossen QR auf `/o/<id>`; die Weiche dort schickt in den Kontext, der zu
 * diesem Ort gehoert (`_lib/ortZiel.ts`).
 */
export type OrtEtikett = {
  id: string;
  /** „Handlager", „RTW 1", „Sanitätstasche 1". */
  name: string;
  /** Die Beizeile: „Lager" · „Fahrzeug · HN-DRK-1101" · „Tasche". */
  meta: string;
  /**
   * DIE ID, WENN ZWEI EINHEITEN SONST GLEICH AUSSAEHEN — sonst `null`.
   *
   * ⚠️ SIE STEHT ALS EIGENES FELD DA UND NICHT IN `meta`, und das ist die
   * Korrektur eines eigenen Fehlgriffs (Codex, sechste Runde): angehaengt an
   * die Beizeile landete der Unterscheider in genau dem Feld, dessen
   * Ueberlaufregel ihn verbirgt — eine Zeile, `text-overflow: ellipsis`, und
   * gemessen reichte sie fuer „Tasche · <id>" (30 Zeichen) gerade noch, fuer
   * „nicht zugeordnet · <id>" (40) nicht mehr. Zwei Karten laesen sich dann
   * wieder gleich, und die Reparatur haette nur so ausgesehen, als wirkte sie.
   */
  unterscheidung: string | null;
  /** Die volle, abtippbare Adresse — sie steht im Fuss der Karte. */
  url: string;
  qr: string;
  /**
   * DER ZUGANGS-CODE DIESER KARTE — DRK-406. `null` heisst: fuer diesen Ort gibt
   * es heute keinen (die Ziehung war erschoepft), und die Karte faellt auf ihre
   * Ortsadresse zurueck.
   *
   * ⚠️ DER RUECKFALL IST LAUT, NICHT STILL: eine Karte ohne Code traegt
   * `/o/<id>`, und ein Scan verlangt dann eine Anmeldung. Das ist unbequem und
   * richtig — eine Karte, die gar nichts traegt, waere unbrauchbar, und eine,
   * die einen fremden Code traegt, waere gefaehrlich.
   *
   * ⚠️ DIESE KARTE TRAEGT EINEN ZUGANG. Bis DRK-406 galt das nur fuer den
   * Handlager (DRK-395), mit der Begruendung, ein Code auf der FAHRZEUG-Karte
   * oeffne den Check dieses Fahrzeugs fuer jeden, der die Karte abfotografiert.
   * Die Betreiberentscheidung vom 17.09.2026 hebt das auf: jede Einheit
   * bekommt ihren eigenen Code, und der Ausgleich ist das ZURUECKSETZEN
   * einzelner Codes, das es damals noch nicht gab. Wer das rueckgaengig macht,
   * nimmt nicht eine Zeile zurueck, sondern eine Entscheidung.
   */
  code: string | null;
};

export type OrtEtikettenDaten = {
  basis: string;
  orte: OrtEtikett[];
  /**
   * WIE VIELE CODES BEIM OEFFNEN DIESER SEITE NEU ENTSTANDEN SIND — DRK-406.
   * Null ist der Normalfall; die Insel sagt es nur, wenn es etwas zu sagen gibt.
   *
   * ⚠️ DIE ZAHL STEHT AM SCHIRM, WEIL DIE SEITE SONST STILL SCHREIBT. Ein GET,
   * der ungefragt Datenbankzeilen anlegt, ist vertretbar, solange er es sagt —
   * und wer gerade eine neue Tasche angelegt hat, will genau das lesen, bevor
   * er druckt.
   */
  neueCodes: number;
};

/**
 * ⚠️ DIE MENGE STEHT NICHT HIER, SONDERN IN `_lib/lesepfade/ortEtiketten.ts`,
 * und das ist die tragende Zeile dieser Funktion: die Weiche `o/[ortId]` loest
 * gegen DIESELBE Menge auf. Eine eigene `where`-Klausel an dieser Stelle waere
 * die Vorlage fuer den teuersten stillen Ausgang des Tickets — ein gedrucktes
 * Etikett, dessen Ziel die Weiche nicht kennt, oder umgekehrt. Warum die Menge
 * genau der Handlager plus die aktiven Einheiten ist (und ausdruecklich NICHT
 * `parent_id IS NULL`), steht dort und in `_lib/ortZiel.ts`.
 *
 * ⚠️ NUR AKTIVE, und hier faellt die Luecke des Regaletiketts (Falle 26, R32)
 * NICHT an: ein stillgelegtes Fahrzeug ist kein Buchungsziel mehr
 * (`istAktivesFahrzeug`), sein Etikett fuehrte also in eine Fahrzeugwahl ohne
 * dieses Fahrzeug. Nicht nachdruckbar ist hier das Richtige.
 */
export async function ortEtikettenDaten(
  db: DB,
  ausstellerSub: string,
  ausstellerName: string | null,
): Promise<OrtEtikettenDaten> {
  const basis = etikettenBasis();
  const zeilen = etikettOrte(db);

  /**
   * ⚠️ ZWEI EINHEITEN DUERFEN GLEICH HEISSEN, UND AUF PAPIER IST DAS TEUER
   * (Codex-Befund zu PR #177): zwei aktive Taschen „Betreuung" ohne Kennung
   * ergaeben zwei Karten mit demselben Namen und derselben Beizeile — nur die
   * QR-Codes zeigten auf verschiedene Einheiten. Wer die beiden Kaertchen beim
   * Ankleben vertauscht, bucht ab da jeden Check auf die falsche.
   * `lagerorte.name` traegt fuer Einheiten keinen Eindeutigkeitsschluessel;
   * `idx_lagerorte_name_je_parent` deckt nur die Schraenke.
   *
   * ⚠️ UEBER `einheitLabels` UND NICHT UEBER EINE EIGENE RECHNUNG. Das Modul
   * beantwortet diese Frage bereits — in der Fahrzeugwahl und in der
   * Artikelschublade —, und die dortige Fassung ist die schaerfere: sie haengt
   * an, bis die Beschriftung frei ist, statt EINEN Durchgang zu raten. Eine
   * zweite Rechnung hier zeigte auf Papier eine andere Beizeile als der
   * Bildschirm daneben.
   *
   * ⚠️ NUR DIE EINHEITEN GEHEN HINEIN. Der Handlager ist ein `typ: "lager"`;
   * `einheitMeta` machte daraus „nicht zugeordnet" statt „Lager", also eine
   * Einheit, bei der jemand die Art vergessen hat (DRK-309). Er kann mit
   * keiner Einheit kollidieren — `standortMeta` gibt fuer ein Lager „Lager",
   * und das erzeugt keine Einheit. Deshalb faellt er hier durch `get()`
   * hindurch auf `standortMeta`, ohne eine eigene Verzweigung.
   *
   * ⚠️ WAS DAS NICHT LEISTET, UND ZWAR GEMESSEN: die verlaengerte Beizeile
   * passt auf 64mm in eine Zeile, solange sie kurz bleibt („Tasche · <id>",
   * 30 Zeichen, 212 von 212px). Kommt eine Kennung dazu (46 Zeichen) oder
   * heisst die Art „nicht zugeordnet" (40 Zeichen), endet sie sichtbar auf
   * „…" — dann traegt die ADRESSE im Fuss die Unterscheidung, die dort
   * ohnehin immer vollstaendig steht.
   */
  const beschriftung = einheitLabels(zeilen.filter((o) => o.typ === "fahrzeug"));

  /**
   * ⚠️ `einheitLabels` ENTSCHEIDET, DIE KARTE RENDERT WOANDERS. Der Helfer
   * haengt die Id an die Beizeile — auf dem Bildschirm richtig, auf 64mm
   * Papier nicht: dort ist die Beizeile eine Zeile mit `text-overflow`, und
   * der Unterscheider waere genau das, was als Erstes verschwindet. Benutzt
   * wird deshalb seine ENTSCHEIDUNG (hat er angehaengt?), nicht seine
   * Zeichenkette.
   *
   * ⚠️ DER VERGLEICH GEGEN `einheitMeta` UND NICHT EIN `slice`: die Id darf
   * das Trennzeichen enthalten, eine Zerlegung der fertigen Zeichenkette waere
   * also nicht umkehrbar — dieselbe Falle, die `einheitLabels` in seinem
   * dritten Durchgang selbst ausschreibt.
   */
  const kollidiert = (o: { id: string; typ: "lager" | "fahrzeug"; kennung: string | null;
                           einheitenart: Einheitenart | null }) =>
    o.typ === "fahrzeug" && beschriftung.get(o.id)?.meta !== einheitMeta(o);

  /**
   * DIE CODES — DRK-406, und sie werden HIER NACHGEZOGEN, nicht nur gelesen.
   *
   * ⚠️ EIN GET, DER SCHREIBT, UND DAS IST DIE BETREIBERENTSCHEIDUNG VOM
   * 17.09.2026. Die Zusage lautet „jede Karte traegt einen Code"; haengt ihre
   * Erfuellung an einem Knopf, ist sie auf Papier keine Zusage, sondern eine
   * Absicht. `stelleOrtCodesSicher` ist idempotent und rein additiv — ein
   * Reload, ein doppeltes Rendern, zwei gleichzeitige Aufrufe aendern nichts;
   * der Teilindex `idx_tokens_ort_aktiv` ist der Riegel darunter.
   *
   * ⚠️ DER AUSSTELLER IST DIE PERSON, DIE DIE SEITE OEFFNET. Die Seite hat
   * `requireLagerbuchAdmin()` hinter sich und reicht den Viewer herein; ein
   * System-Akteur waere hier eine Luege, denn ohne diesen Seitenaufruf waere
   * keine Zeile entstanden.
   */
  const neueCodes = stelleOrtCodesSicher(db, ausstellerSub, ausstellerName);

  /**
   * ⚠️ EINE ABFRAGE FUER ALLE ORTE, kein `aktiverOrtCode` je Karte in der
   * Schleife. Bei zwanzig Einheiten waeren das zwanzig Abfragen fuer eine
   * Zuordnung, die in eine Map passt — und die Schleife darunter ist ohnehin
   * schon durch `qrSvg` teuer.
   */
  const codeJeOrt = new Map(
    db.select({ ortId: tokens.ortId, code: tokens.code })
      .from(tokens)
      .where(eq(tokens.aktiv, true))
      .all()
      .filter((t): t is { ortId: string; code: string } => t.ortId !== null)
      .map((t) => [t.ortId, t.code] as const),
  );

  /**
   * EIN Promise.all, keine Schleife mit vergessenem `await` — dieselbe Falle
   * wie oben (8-I, Punkt 1): `qrSvg` ist async, und ein fehlendes `await`
   * ergaebe `[object Promise]` als Markup statt einer Fehlermeldung.
   */
  const orte = await Promise.all(zeilen.map(async (o) => {
    const code = codeJeOrt.get(o.id) ?? null;
    /*
     * ⚠️ QR UND FUSSZEILE LESEN DIESELBE VARIABLE. Ein zweites `code ? … : …`
     * weiter unten in der Insel koennte auseinanderlaufen, und das Ergebnis
     * waere die teuerste Karte ueberhaupt: ein QR auf den Zugang, darunter die
     * abtippbare Adresse auf etwas anderes. Deshalb entsteht die Adresse HIER,
     * einmal, aus derselben Entscheidung wie der QR.
     */
    const url = code ? `${basis}/t/${code}` : `${basis}/o/${o.id}`;
    return {
      id: o.id,
      name: o.name,
      meta: standortMeta(o),
      unterscheidung: kollidiert(o) ? o.id : null,
      url,
      qr: await qrSvg(url),
      code,
    };
  }));

  return { basis, orte, neueCodes };
}
