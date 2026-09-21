/**
 * Die Werte, die Server Components lesen muessen — §4.15.
 *
 * KEIN "use client" und KEIN Icon-Import in dieser Datei. Die beiden Fallen sind
 * GEGENLAEUFIG und duerfen nicht zusammengelegt werden: ein WERT aus einem
 * Client-Modul kommt in einer Server Component nicht an (Falle 6, HTTP 500), und
 * `@ant-design/icons` in RSC wirft schon beim Import (Falle 7). Wer "use client"
 * setzt, um Falle 7 zu „loesen", verwandelt sie in Falle 6: HTTP 200 mit leerer
 * Map und still falschem Wert. Laut ist besser als still.
 *
 * ZUSTAENDE stand bis zum Port in CheckFlow.tsx:22 — einer Client-Datei.
 */

/** Die feste Lagerort-Zeile. 75 Fundstellen im Alt-Repo; jede Entnahme, Inventurkorrektur,
 *  Aussonderung und Nachfuellung bucht gegen genau diese ID. */
export const HANDLAGER_ID = "handlager";

/**
 * DIE ENTNAHMEBOX — die Kiste in der Halle, DRK-314.
 *
 * Sie nimmt auf, was aus einer Einheit HERAUSgenommen wurde und noch nicht
 * wieder einsortiert ist: zu viel mitgenommene Kühlkompressen, was jemand
 * beim Check zu viel auf dem Fahrzeug fand. Eingeräumt wird später, von Hand,
 * durch jemanden mit Lagerbuch-Zugang.
 *
 * ⚠️ SIE HÄNGT NEBEN DEM HANDLAGER, NICHT DARUNTER (`parent_id IS NULL`,
 * Migration 0011), UND DAS IST DIE GANZE ENTSCHEIDUNG DES TICKETS. Ein Schrank
 * unter der Wurzel wäre der naheliegende Bau und wäre falsch: `handlagerOrte`
 * ist der Bereich JEDER handlager-gescopten Abfrage (`_lib/lesepfade/orte.ts`),
 * und alles darunter zählt sofort als Handlagerbestand — in den Bestellvorschlag,
 * in die Verfallsliste, in die FEFO-Verteilung jeder Entnahme. Eine Helferin am
 * Regal bekäme Material angeboten, das ungeprüft in einer Kiste liegt.
 *
 * ⚠️ UND SIE IST KEIN `typ: "fahrzeug"`. Die Art trennt den Bestandsort vom
 * beweglichen Träger, und an dieser Trennung hängt jeder Schreibpfad des Moduls
 * (dieselbe Begründung wie bei `einheitenart`, `_db/schema.ts`): eine Box mit
 * `typ: "fahrzeug"` bekäme ein Soll, stünde in der Einheitenliste, ließe sich
 * checken und tauchte in der Zielwahl jeder Entnahme auf.
 *
 * Was daraus folgt und ausdrücklich so gewollt ist: die Box hat KEIN Soll,
 * KEINEN Check, KEINEN Mindestbestand und steht in KEINER Zielwahl. Sie ist ein
 * Zwischenzustand, kein Lagerplatz.
 */
export const ENTNAHMEBOX_ID = "entnahmebox";

/**
 * Der Name, den die Migration schreibt — und damit der, den jede Anzeige aus
 * `lagerorte.name` liest.
 *
 * ⚠️ ER STEHT HIER ALS ZWEITE KOPIE DESSELBEN WORTES, und das ist Absicht: die
 * Zeile in der Datenbank ist umbenennbar (es ist eine gewöhnliche
 * `lagerorte`-Zeile), dieser Wert ist es nicht. Gebraucht wird er allein dort,
 * wo eine Fläche über die Box spricht, OHNE sie geladen zu haben — im
 * Seitenkopf, in einem Satz, in einer leeren Liste. Wo die Zeile vorliegt,
 * gewinnt `lagerorte.name`; `_lib/lesepfade/entnahmebox.test.ts` hält fest,
 * dass die Migration genau dieses Wort schreibt.
 */
export const ENTNAHMEBOX_NAME = "Entnahmebox";

/**
 * Ist dieser Ort die Box?
 *
 * ⚠️ EINE FUNKTION UND KEIN `=== ENTNAHMEBOX_ID` AN VIER STELLEN: die Frage
 * wird von den drei Standortwahlen gestellt (Gerät, BZ-Gerät, Flasche), und die
 * drei laufen über `lagerorte.aktiv` und sonst nichts. Ein Vergleich, den man
 * je Datei abschreibt, ist der, den die vierte Datei vergisst.
 */
export const istEntnahmebox = (lagerortId: string): boolean => lagerortId === ENTNAHMEBOX_ID;

/** Kodiert „kein Verfall". Auf NULL umgestellt kippen Ampel, Verfall-Liste und die
 *  FEFO-Sortierung (fefo.ts sortiert ueber den String) fuer jede so angelegte Charge. */
export const PSEUDO_VERFALL = "2099-12";
export const istOhneVerfall = (verfall: string): boolean => verfall === PSEUDO_VERFALL;

/** Herkunftshinweise in chargen.chargen_nr — NICHT Bedeutungstraeger. Die Bedeutung
 *  „ohne Verfall" haengt am Verfallswert (§5.3.2). */
/**
 * DIE KOMMENTARE, DIE EIN ABGESCHLOSSENER CHECK IN DIE BUECHER SCHREIBT —
 * NEUTRAL, UND DAS IST EINE AUSNAHME VON DER REGEL DIESES TICKETS (DRK-309,
 * Reviewrunde 8).
 *
 * Ueberall sonst gilt: wo die Art BEKANNT ist, steht sie auch da. Hier ist sie
 * bekannt (`fz.einheitenart` liegt in derselben Transaktion vor), und trotzdem
 * steht sie nicht im Text. Der Grund ist die LEBENSDAUER:
 *
 * ⚠️ EIN GESPEICHERTER TEXT DARF NICHTS BEHAUPTEN, WAS EINE SPAETERE KORREKTUR
 * FALSCH MACHT. `setEinheitenart` erlaubt ausdruecklich, die Art einer
 * bestehenden Einheit zu aendern — das ist der Weg aus dem Zwischenstand. Ein
 * „Fahrzeug-Check Abgleich" in einer Journalzeile waere danach eine Behauptung
 * ueber einen Vorgang, die die Einheit selbst laengst widerlegt hat, und das
 * Journal ist APPEND-ONLY: niemand schreibt sie um. Die Anzeige darf
 * art-bewusst sein, weil sie die HEUTIGE Art liest; ein Eintrag im Buch kann
 * das nicht.
 *
 * ⚠️ DIE FREITEXTSUCHE UEBERLEBT DEN WECHSEL, und zwar ohne Zutun: die Suche
 * des Moduls arbeitet auf Teilzeichenketten, und „Check Abgleich" steckt auch
 * im alten „Fahrzeug-Check Abgleich". EIN Suchbegriff findet damit weiter
 * Zeilen von vorher UND von nachher. Ein art-bewusster Text („Taschen-Check
 * Abgleich") haette dieselbe Eigenschaft — aber eben auch die falsche
 * Behauptung oben.
 *
 * ⚠️ ALTE ZEILEN BLEIBEN, WIE SIE SIND. Sie tragen weiter „Fahrzeug-Check …",
 * und das ist richtig so: sie sind entstanden, als jede Einheit ein Fahrzeug
 * war. `_lib/vorgang.ts` haelt denselben Gedanken fuer die Praefixe fest.
 */
export const CHECK_ABGLEICH = "Check Abgleich";
export const CHECK_NACHFUELLUNG = "Check Nachfüllung";
export const CHECK_MESSUNG = "Check";

/**
 * DER KOMMENTAR, DEN EINE BUCHUNG IN DIE ENTNAHMEBOX SCHREIBT — DRK-314.
 *
 * ⚠️ FESTGENAGELT UND NICHT FREITEXT, aus demselben Grund wie `CHECK_ABGLEICH`
 * daneben: dadurch steht in der Journalspalte „Kommentar" bereits, WAS passiert
 * ist, und das Praefix `entnahmebox:` braucht kein zweites Etikett in der Spalte
 * „Vorgang" (die Entscheidungstabelle steht im Kopf von `_lib/vorgang.ts`).
 *
 * ⚠️ NEUTRAL, OHNE DIE ART DER EINHEIT — dieselbe Ausnahme und dieselbe
 * Begruendung wie bei `CHECK_ABGLEICH`: ein GESPEICHERTER Text darf nichts
 * behaupten, was eine spaetere Korrektur falsch macht, und `setEinheitenart`
 * erlaubt ausdruecklich, die Art einer bestehenden Einheit zu aendern. Woher das
 * Material kam, steht ohnehin praeziser in der Referenz und in der Ortsspalte
 * der Gegenzeile — und zwar als ID, die kein Umbenennen veraltet.
 */
export const ENTNAHMEBOX_KOMMENTAR = "In die Entnahmebox gelegt";

/**
 * DER KOMMENTAR DES WEGES ZURUECK — DRK-381, aus der Kiste in einen Schrank.
 *
 * ⚠️ DERSELBE GRUND WIE EINE ZEILE HOEHER: festgenagelt, damit die
 * Journalspalte „Kommentar" schon sagt, was passiert ist, und das Praefix
 * `einraeumen:` kein zweites Etikett in der Spalte „Vorgang" braucht.
 *
 * ⚠️ ER SAGT „EINGERAEUMT" UND NICHT „AUFGEFUELLT", und das ist keine
 * Wortwahl, sondern die Abgrenzung des ganzen Tickets: Auffuellen ist ein
 * WARENEINGANG (`typ: "zugang"`, Material entsteht), dies hier eine
 * UMLAGERUNG (Material wandert, netto null). Stuende „aufgefuellt" im
 * Journal, laese jemand spaeter eine Lieferung, wo nur etwas umgeraeumt
 * wurde — und die Zeile ist append-only.
 */
export const ENTNAHMEBOX_EINRAEUMEN_KOMMENTAR = "Aus der Entnahmebox eingeräumt";

/**
 * DER KOMMENTAR DES RUECKLAUFS — DRK-366, von der Einheit direkt in einen
 * Schrank.
 *
 * ⚠️ FESTGENAGELT, aus demselben Grund wie die beiden darueber: die
 * Journalspalte „Kommentar" sagt damit schon, was passiert ist, und das Praefix
 * `ruecklauf:` braucht kein zweites Etikett. NEUTRAL, ohne die Art der Einheit
 * — dieselbe Begruendung wie bei `ENTNAHMEBOX_KOMMENTAR`: die Art ist
 * korrigierbar, das Journal nicht.
 */
export const RUECKLAUF_KOMMENTAR = "Zurück ins Handlager gebucht";

export const CHARGE_KORREKTUR = "Korrektur";
export const CHARGE_INVENTUR = "Inventur";
export const CHARGE_OHNE_VERFALL = "ohne Verfall";

/** Entscheidung 2 (b): kein Backfill der Altdaten, aber ab jetzt z.enum() beim Schreiben.
 *  Beim Schreiben streng, beim Anzeigen tolerant (§5.8.2). */
export const ZUSTAENDE = ["In Ordnung", "Gebrauchsspuren", "Defekt"] as const;
export type Zustand = (typeof ZUSTAENDE)[number];
/** Der Vertrag der serverseitigen Auswertung an drei Stellen. Ein unbekannter Altwert
 *  zaehlt NICHT als auffaellig. */
export const ZUSTAND_DEFEKT: Zustand = "Defekt";

/** Entscheidung 6 (a): der EINZIGE Monatsvalidator des Moduls. Der laxe Ausdruck
 *  /^\d{4}-\d{2}$/ aus buchung.ts:17 und bz.ts:83 faellt ersatzlos weg. */
export const MONAT_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Form der zwei Tagesfelder (geraete.mtk_faellig, geraete.ablaufdatum). Die Form allein
 *  genuegt nicht — "2026-02-31" ist formgerecht und kein Kalendertag. */
export const TAG_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Form UND ueberrollfreier Kalendertag. Portiert aus `parseTag`
 * (lagerbuch/src/lib/domain/geraet.ts:16-25): die Alt-App hat am Eingang gar keinen
 * Validator, die Robustheit sitzt im Leser, und `null` bedeutet dort grau statt rot
 * („damit frisch angelegte Geraete keinen Fehlalarm ausloesen"). Diese Toleranz wandert
 * 1:1 mit; ergaenzt wird sie hier um dieselbe Pruefung am EINGANG, damit neue Zeilen
 * den Fall nicht mehr erzeugen. Altzeilen bleiben unberuehrt.
 */
export function istEchterKalendertag(s: string): boolean {
  if (!TAG_REGEX.test(s)) return false;
  const [j, m, t] = s.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

/**
 * Die Enum-Listen fuer die Zod-Seite. Die Drizzle-Seite steht in `_db/schema.ts` —
 * §4.15 fuehrt bewusst beide Orte: der Drizzle-Enum ist ein 1:1-Port des Bestands,
 * diese Listen sind der Eingangsvalidator. `_lib/konstanten.test.ts` behauptet die
 * Mengengleichheit, damit sie nicht auseinanderlaufen. Die REIHENFOLGE darf abweichen
 * — SQLite-`text({enum})` erzeugt keinen CHECK, sie ist im SQL unsichtbar.
 */
export const BUCHUNGSTYPEN = ["zugang", "entnahme", "korrektur", "umlagerung"] as const;
export const QUELLE_TYPEN = ["token", "oidc", "system"] as const;
export const LAGERORT_TYPEN = ["lager", "fahrzeug"] as const;
export const GERAETE_TYPEN = ["medizin", "objekt"] as const;
export const TOKEN_ZIEL_TYPEN = ["fahrzeug", "artikel"] as const;

/**
 * DRK-309 — die Art einer verwalteten Einheit: Fahrzeug oder Tasche.
 *
 * ⚠️ SIE STEHT NEBEN `LAGERORT_TYPEN`, NICHT DARIN. `typ` trennt Ort von
 * Traeger, diese Liste trennt Traeger von Traeger; die Begruendung, warum aus
 * „Tasche" kein dritter `typ` wurde, steht an der Spalte (`_db/schema.ts`).
 *
 * ⚠️ DIE LISTE KENNT KEIN „unbekannt". Der Zwischenstand ist die ABWESENHEIT
 * eines Wertes (`null` in der Spalte), kein Wert in dieser Liste — ein
 * Literal „unbekannt" waere ueber den Eingangsvalidator anlegbar und damit
 * eine Einheit, die sich absichtlich nicht zuordnet. Neu angelegt wird
 * ausschliesslich mit einem dieser beiden Werte.
 */
export const EINHEITENARTEN = ["fahrzeug", "tasche"] as const;

export type Einheitenart = (typeof EINHEITENARTEN)[number];

/**
 * Die Beschriftung je Art — EINE Quelle fuer Liste, Filter, Anlegen-Dialog und
 * Einheitenblatt. Zwei Schreibweisen fuer denselben Zustand lassen den Leser
 * einen dritten vermuten (dieselbe Festlegung wie zwischen Filter- und
 * Chiptext in `FahrzeugeListe.tsx`).
 */
export const EINHEITENART_LABEL: Record<Einheitenart, string> = {
  fahrzeug: "Fahrzeug",
  tasche: "Tasche",
};

/**
 * Wie der Zwischenstand heisst. „nicht zugeordnet" und NICHT „unbekannt":
 * unbekannt klaenge nach einem Datenfehler, zugeordnet wird es aber schlicht
 * noch — von einem Menschen, der es weiss.
 */
export const EINHEITENART_OFFEN_LABEL = "nicht zugeordnet";

/** Die Beschriftung einer Einheit, deren Art feststeht oder eben nicht. */
export function einheitenartLabel(art: Einheitenart | null): string {
  return art === null ? EINHEITENART_OFFEN_LABEL : EINHEITENART_LABEL[art];
}

/**
 * DREI SATZBAUSTEINE FUER DIE HELFER- UND DRUCKFLAECHEN (DRK-309, Reviewrunde 1).
 *
 * ⚠️ SIE SIND DER EIGENTLICHE TEIL DER AUFGABE, NICHT IHR ANHANG. Das
 * Akzeptanzkriterium lautet „Bezeichnung und Darstellung machen erkennbar, ob
 * eine Einheit ein Fahrzeug oder eine Tasche ist" — und die Flaechen, auf denen
 * das am meisten zaehlt, sind nicht die Verwaltungsliste, sondern die, die eine
 * Helferin mit dem Gegenstand in der Hand vor sich hat: die Checkstrecke und
 * das gedruckte Blatt. Eine Sanitaetstasche, deren Checkliste „Fahrzeug-
 * Checkliste" ueberschreibt und die zum „Fahrzeug waehlen" auffordert, ist
 * genau die Einheit, die das Ticket sichtbar machen wollte.
 *
 * ⚠️ WARUM NICHT UEBERALL NUR „Einheit". Weil „Einheit" nirgends steht, wo die
 * Art BEKANNT ist: wer eine Tasche in der Hand haelt, liest „diese Tasche" und
 * nicht ein Oberwort, das er erst uebersetzen muss. Neutral wird es nur dort,
 * wo ein Text ueber MEHRERE Einheiten spricht (eine Auswahlliste, ein
 * Leerzustand) oder wo die Art noch nicht zugeordnet ist.
 *
 * ⚠️ UND WARUM DREI STATT EINER. Deutsch laesst sich nicht aus einem Nomen
 * zusammensetzen: „auf das Fahrzeug" und „in die Tasche" haben verschiedene
 * Praepositionen UND verschiedene Genera. Eine einzige Funktion, die nur das
 * Nomen liefert, zwingt jede Aufrufstelle zu ihrer eigenen Grammatik — und
 * genau so entstehen „auf die Tasche" und „diese Fahrzeug".
 */

/**
 * Das blosse Nomen: „Fahrzeug" · „Tasche" · „Einheit".
 *
 * ⚠️ NICHT `einheitenartLabel`, und der Unterschied ist genau der Zwischenstand.
 * Jenes liefert fuer `null` den CHIPTEXT „nicht zugeordnet" — richtig als
 * Zustandsanzeige, als Nomen aber unbrauchbar: „nicht zugeordnet löschen" und
 * „nicht zugeordnet aktiv" sind kein Deutsch. Wo das Wort in einem SATZ oder
 * an einem BEDIENELEMENT steht, ist das Oberwort die richtige Rueckfallebene.
 */
export function einheitNomen(art: Einheitenart | null): string {
  return art === null ? "Einheit" : EINHEITENART_LABEL[art];
}

/**
 * Die Beizeile einer Einheit: „Fahrzeug · MS-E2E-1" · „Tasche" ·
 * „nicht zugeordnet".
 *
 * ⚠️ EINE FUNKTION, WEIL DREI FLAECHEN DIESELBE ZEILE FUEHREN (DRK-309,
 * Reviewrunde 4): der Helferschirm (`_ui/FahrzeugWahl.tsx`) und die beiden
 * Zielwahlen in der Verwaltung (Artikelschublade, Zugangs-Codes). Zwei
 * Schreibweisen fuer dieselbe Zeile sind auf zwei Bildschirmen, die dieselbe
 * Einheit waehlen lassen, ein eigener kleiner Fehler.
 *
 * ⚠️ DIE ART STEHT IMMER, DIE KENNUNG NUR, WENN ES EINE GIBT. Eine Tasche
 * traegt kein Kennzeichen — ohne die Art bliebe ihre Beizeile leer, und der
 * Name allein muesste die Art tragen („Rucksack Betreuung" tut das nicht).
 * Der Zwischenstand sagt „nicht zugeordnet" statt zu schweigen: hier ist das
 * Wort eine ZUSTANDSANZEIGE und kein Nomen im Satz, also `einheitenartLabel`
 * und nicht `einheitNomen`.
 *
 * ⚠️ DIE PRAEMISSE HINTER ALL DEM — „zwei Einheiten duerfen gleich heissen" —
 * GILT NACH DRK-367 WEITERHIN, und der Index dort sagt das selbst. Rund ein
 * Dutzend Stellen begruenden ihre Beizeile mit „`lagerorte.name` traegt keinen
 * Eindeutigkeitsschluessel"; seit DRK-367 gibt es einen, und wer ihn
 * greppt, haelt die Kommentare fuer veraltet. Er ist aber TEILWEISE:
 * `idx_lagerorte_name_je_parent` steht unter `WHERE parent_id IS NOT NULL` und
 * deckt damit nur die Schraenke unter dem Handlager. Eine Einheit — Fahrzeug
 * wie Tasche — haengt an `parent_id IS NULL` und ist ausdruecklich nicht
 * gedeckt („Fahrzeugnamen bleiben damit unberuehrt", Kopf der Migration).
 * Zwei gleichnamige Taschen sind also weiter erlaubt, und diese Zeile bleibt
 * das einzige, was sie im Bild auseinanderhaelt.
 */
export function einheitMeta(
  einheit: { kennung: string | null; einheitenart: Einheitenart | null },
): string {
  return [einheitenartLabel(einheit.einheitenart), einheit.kennung]
    .filter(Boolean).join(" · ");
}

/**
 * Die Beizeile eines LAGERORTS — „Lager" oder die Beizeile der Einheit.
 *
 * ⚠️ `einheitMeta` REICHT HIER NICHT, und der Unterschied ist keine
 * Feinheit (DRK-309, Reviewrunde 5). Die Standortlisten der Geräte, der
 * BZ-Geräte und der Sauerstoffflaschen mischen das Handlager mit den
 * Einheiten. Für eine Lagerzeile ist `einheitenart` nicht „noch nicht
 * zugeordnet", sondern gegenstandslos — ein Lager IST keine Einheit. Stünde
 * dort der Zwischenstandstext, läse sich das Handlager als eine Einheit, bei
 * der jemand die Zuordnung vergessen hat, und es stünde auf jeder dieser
 * Listen auf der To-do-Liste, die der Artfilter aufmacht.
 */
export function standortMeta(
  ort: {
    typ: "lager" | "fahrzeug";
    kennung: string | null;
    einheitenart: Einheitenart | null;
  },
): string {
  return ort.typ === "lager" ? "Lager" : einheitMeta(ort);
}

/**
 * DIE BESCHRIFTUNGEN EINER EINHEITEN-LISTE — EINDEUTIG (DRK-309,
 * Reviewrunde 16).
 *
 * ⚠️ „NAME · ART · KENNUNG" REICHT NICHT, UND DAS IST EIN LOCH IN MEINER
 * EIGENEN BEGRUENDUNG. Der ganze PR argumentiert, die Art mache zwei
 * gleichnamige Einheiten unterscheidbar — das stimmt fuer ein Fahrzeug neben
 * einer Tasche. Zwei TASCHEN duerfen aber ebenfalls „Betreuung" heissen und
 * beide gar keine Kennung tragen: `createFahrzeug` prueft nichts dergleichen,
 * und `idx_lagerorte_name_je_parent` (DRK-367) deckt nur Schraenke unter dem
 * Handlager, nicht Einheiten. Dann ergibt `einheitMeta` fuer beide dieselbe
 * Zeichenkette.
 *
 * ⚠️ WAS DARAN TEUER IST, IST NICHT DIE OPTIK. In einer WAHL filtert ein Klick
 * danach zwar korrekt auf EINE Einheit — der Benutzer erfaehrt nur nicht, auf
 * welche, und liest die Zahlen der einen im Glauben, die der anderen zu sehen.
 * In einem SPALTENFILTER faellt es zusammen: zwei Einheiten, ein Filterwert,
 * und die gemeinte ist ueber diese Spalte gar nicht zu isolieren.
 *
 * ⚠️ DIE ID IST HAESSLICH UND ERSCHEINT NUR IM KOLLISIONSFALL — also nur in
 * genau der Lage, die selbst schon ein Datenfehler ist. Dort ist
 * Unterscheidbarkeit mehr wert als Schoenheit; zwei identische Zeilen sind
 * die unehrlichere Antwort.
 *
 * ⚠️ DREI DURCHGAENGE, UND ERST DER DRITTE BEWEIST ETWAS.
 * Heissen zwei Einheiten `X` und eine dritte woertlich `X · <id der ersten>`,
 * erzeugt der erste Durchgang fuer die erste genau diese Zeichenkette — und
 * die dritte wurde nicht angefasst, weil IHR Ausgangsname nur einmal vorkam.
 * Kollidiert danach noch etwas, bekommt JEDE Zeile ihre ID. Auch das reicht
 * noch nicht — eine ID darf das Trennzeichen enthalten, und dann ist die
 * Verkettung nicht umkehrbar (Begruendung samt Gegenbeispiel unten am dritten
 * Durchgang). Erst der haengt an, bis die Beschriftung frei ist, und ist damit
 * eindeutig per Konstruktion statt per Annahme. Verwandte Bauform wie
 * `eindeutigeLabels` fuer
 * Zaehlorte (`_lib/inventurOrt.ts`, DRK-337); die beiden koennen nicht
 * gemeinsam genutzt werden, weil jene Datei aus DIESER liest und ein
 * Import zurueck einen Zyklus ergaebe.
 */
export function einheitLabels(
  einheiten: readonly { id: string; name: string; kennung: string | null;
    einheitenart: Einheitenart | null }[],
): Map<string, { label: string; meta: string }> {
  const roh = new Map<string, { name: string; meta: string }>();
  for (const e of einheiten) {
    if (!roh.has(e.id)) roh.set(e.id, { name: e.name, meta: einheitMeta(e) });
  }
  const voll = (t: { name: string; meta: string }) => `${t.name} · ${t.meta}`;

  const anzahl = new Map<string, number>();
  for (const teile of roh.values()) {
    const text = voll(teile);
    anzahl.set(text, (anzahl.get(text) ?? 0) + 1);
  }
  /*
   * ⚠️ DIE ID HAENGT AN DER META-HAELFTE, NICHT AN DER GANZEN ZEILE. Der
   * Helferschirm rendert Name und Beizeile in ZWEI Elementen; haette nur die
   * volle Zeichenkette die ID, muesste er sie wieder auseinanderschneiden —
   * und ein `slice` ueber die Namenslaenge bricht beim ersten Namen, der
   * selbst ein „ · " enthaelt.
   */
  const mitId = (id: string, teile: { name: string; meta: string }) =>
    ({ label: `${voll(teile)} · ${id}`, meta: `${teile.meta} · ${id}` });
  const schlicht = (teile: { name: string; meta: string }) =>
    ({ label: voll(teile), meta: teile.meta });

  const einDurchgang = new Map(
    [...roh].map(([id, teile]) =>
      [id, (anzahl.get(voll(teile)) ?? 0) > 1 ? mitId(id, teile) : schlicht(teile)] as const),
  );
  if (eindeutig(einDurchgang)) return einDurchgang;

  const zweiterDurchgang = new Map(
    [...roh].map(([id, teile]) => [id, mitId(id, teile)] as const),
  );
  if (eindeutig(zweiterDurchgang)) return zweiterDurchgang;

  /*
   * ⚠️ DRITTER DURCHGANG — WEIL DIE ID ALS SUFFIX NICHTS BEWEIST
   * (Reviewbefund zu diesem PR, und er trifft).
   *
   * Hier stand vorher die Behauptung, nach dem zweiten Durchgang koennten zwei
   * Ergebnisse nicht mehr gleich sein: jedes ende auf ` · <eigene id>`, und IDs
   * seien eindeutig. Das setzt voraus, dass `a · b` die beiden Teile wieder
   * hergibt — und das tut es nicht, sobald eine ID das Trennzeichen enthaelt:
   *
   *     Name „A · Tasche"       + ID „foo · bar"  →  „A · Tasche · foo · bar"
   *     Name „A · Tasche · foo" + ID „bar"        →  „A · Tasche · foo · bar"
   *
   * Beide Zeilen sind erlaubt, und EINE beliebige andere Kollision reicht, um
   * diesen Zweig ueberhaupt zu betreten. Heute vergibt `createFahrzeug` seine
   * IDs ueber `newId()` und die enthalten kein „ · " — aber „heute unerreichbar"
   * ist kein Beweis, und genau als Beweis war der Satz geschrieben.
   *
   * Dieser Durchgang macht die Zusage wahr, statt sie zu behaupten: er geht die
   * Zeilen in fester Reihenfolge durch und haengt an, solange die Beschriftung
   * schon vergeben ist. Weil die Menge endlich ist, endet die Schleife, und
   * weil jede Zeile erst eintraegt, wenn ihre Beschriftung frei war, sind am
   * Ende alle verschieden — ohne Annahme ueber die Form der IDs.
   */
  const belegt = new Set<string>();
  const dritterDurchgang = new Map<string, { label: string; meta: string }>();
  for (const [id, teile] of roh) {
    const kandidat = mitId(id, teile);
    let label = kandidat.label;
    let meta = kandidat.meta;
    for (let n = 2; belegt.has(label); n += 1) {
      label = `${kandidat.label} · ${n}`;
      meta = `${kandidat.meta} · ${n}`;
    }
    belegt.add(label);
    dritterDurchgang.set(id, { label, meta });
  }
  return dritterDurchgang;
}

function eindeutig(m: ReadonlyMap<string, { label: string }>): boolean {
  return new Set([...m.values()].map((w) => w.label)).size === m.size;
}

/** Ein Standort, so wie ihn eine Anzeige braucht — Name plus Beizeile. */
export type StandortAngabe = {
  name: string;
  typ: "lager" | "fahrzeug";
  kennung: string | null;
  einheitenart: Einheitenart | null;
};

/**
 * „Rucksack Betreuung · Tasche" — die Zeile, die einen Standort BENENNT.
 *
 * ⚠️ EINE FUNKTION, WEIL SIEBEN FLAECHEN DIESELBE ZEILE FUEHREN (DRK-309,
 * Reviewrunde 14): die drei Wahlen (Gerät, BZ-Gerät, Flasche), die drei
 * Uebersichtstabellen dazu und die Spalte „Liegt in" in der Artikelschublade.
 * Bis hierher trugen nur die WAHLEN die Art — man suchte sich „Rucksack
 * Betreuung · Tasche" aus und bekam in der Liste daneben „Rucksack
 * Betreuung". Bei zwei gleichnamigen Standorten ist das nicht nur karger,
 * sondern MEHRDEUTIG.
 *
 * ⚠️ UND SIE IST ZUGLEICH DER FILTER- UND SUCHWERT. Ein Spaltenfilter
 * gruppiert ueber die Zeichenkette, die er anzeigt; gruppierte er weiter ueber
 * den blossen Namen, fielen ein Fahrzeug und eine gleichnamige Tasche in
 * EINEN Filterwert zusammen — derselbe Befund, den die Checkhistorie in
 * Runde 7 hatte (`ChecksTabelle.zeileTitel`).
 */
export function standortZeile(ort: StandortAngabe): string {
  return `${ort.name} · ${standortMeta(ort)}`;
}

/**
 * Der Ort EINER MENGE ODER BEWEGUNG: „Schrank 1: 5 Stk" ·
 * „RTW 1 · Fahrzeug: 7 Stk" — und die Ortsspalte des Journals.
 *
 * ⚠️ HIER SCHWEIGT EIN LAGER, UND DAS IST EINE ABWEICHUNG MIT GRUND
 * (DRK-309, Reviewrunde 15) — `standortZeile` laesst es „Lager" sagen.
 * Der Unterschied ist die Bauform der Flaeche, nicht die Regel:
 *
 *  * Der STANDORT EINES GEGENSTANDS ist eine Eigenschaft: „wo gehoert das
 *    Geraet hin?". Die Spalte daneben fuehrt Lager UND Einheiten, jede Zelle
 *    muss etwas tragen, und eine leere Beizeile neben gefuellten laese sich
 *    als fehlende Angabe. Dort ist „Lager" die richtige Auskunft
 *    (`standortZeile`: die drei Uebersichten und die drei Detailseiten).
 *  * Der ORT EINER MENGE ODER BEWEGUNG beantwortet „wo liegt das / wo ist
 *    das hingegangen?". Die Antwort „Schrank 1" ist dort VOLLSTAENDIG —
 *    dass ein Schrank ein Lager ist, sieht man am Namen, und „· Lager"
 *    haengt nur Laenge an (diese Funktion: Verteilungs-Chips, Helferschirm,
 *    Journal, Bewegungen der Artikelschublade).
 *
 * ⚠️ UNTERSCHEIDBAR BLEIBT ES TROTZDEM, und das ist die Bedingung, unter
 * der die Abweichung ueberhaupt zulaessig ist: nur die LAGER-Zeile bleibt
 * nackt. Ein gleichnamiges Fahrzeug traegt „· Fahrzeug", eine gleichnamige
 * Tasche „· Tasche" — die drei koennen nie dieselbe Zeichenkette ergeben.
 *
 * ⚠️ UND ES IST EIN VERTRAG, NICHT NUR GESCHMACK: `e2e/lagerbuch-schraenke`,
 * `e2e/lagerbuch-umlagern` und die Journalfaelle aus DRK-338 sichern die Form
 * `Name: Menge Einheit` bzw. den blossen Ortsnamen zu. Ein „· Lager" darin
 * ist eine Produktaenderung, die dieses Ticket nicht beauftragt hat.
 */
export function ortZeile(ort: StandortAngabe): string {
  return ort.typ === "lager" ? ort.name : standortZeile(ort);
}

/** „dieses Fahrzeug" · „diese Tasche" · „diese Einheit". */
export function dieseEinheit(art: Einheitenart | null): string {
  if (art === "fahrzeug") return "dieses Fahrzeug";
  if (art === "tasche") return "diese Tasche";
  return "diese Einheit";
}

/**
 * Herkunftsangabe: „aus diesem Fahrzeug" · „aus dieser Tasche" ·
 * „aus dieser Einheit".
 *
 * ⚠️ NICHT AUS `dieseEinheit` ZUSAMMENSETZBAR, und das ist der Grund, warum
 * dieser Baustein einzeln danebensteht: jenes liefert den NOMINATIV („dieses
 * Fahrzeug"), „aus" verlangt den DATIV („diesem Fahrzeug"). Ein
 * `aus ${dieseEinheit(art)}` waere fuer keine der drei Arten richtig und faellt
 * in keinem Tor auf — Zeichenketten haben keine Faelle.
 */
export function ausDieserEinheit(art: Einheitenart | null): string {
  if (art === "fahrzeug") return "aus diesem Fahrzeug";
  if (art === "tasche") return "aus dieser Tasche";
  return "aus dieser Einheit";
}

/**
 * Ortsangabe: „an diesem Fahrzeug" · „an dieser Tasche" · „an dieser Einheit".
 *
 * ⚠️ DER DRITTE DATIV-BAUSTEIN, und er steht neben `ausDieserEinheit` aus
 * demselben Grund, aus dem der dort neben `dieseEinheit` steht: die
 * Praeposition entscheidet den Kasus, und „an" verlangt hier den Dativ. Die
 * Formen sehen sich aehnlich genug, dass ein `an ${ausDieserEinheit(art)}`
 * beim Lesen durchginge — herauskaeme „an aus diesem Fahrzeug", und kein Tor
 * sieht das: Zeichenketten haben keine Faelle.
 */
export function anDieserEinheit(art: Einheitenart | null): string {
  if (art === "fahrzeug") return "an diesem Fahrzeug";
  if (art === "tasche") return "an dieser Tasche";
  return "an dieser Einheit";
}

/** Ortsangabe: „im Fahrzeug" · „in der Tasche" · „in der Einheit". */
export function inDerEinheit(art: Einheitenart | null): string {
  if (art === "fahrzeug") return "im Fahrzeug";
  if (art === "tasche") return "in der Tasche";
  return "in der Einheit";
}

/**
 * Satzanfang: „aufs Fahrzeug" → „Aufs Fahrzeug".
 *
 * ⚠️ MIT `toLocaleUpperCase("de")`, nicht mit `toUpperCase()`. Der Unterschied
 * traegt heute nichts (kein Baustein beginnt mit „i"), aber die Vorgabe des
 * Moduls ist ueberall die zonen- und sprachexplizite Form — und eine Stelle,
 * die es anders macht, ist die, an der es spaeter still schiefgeht.
 */
export function grossAmAnfang(text: string): string {
  return text.charAt(0).toLocaleUpperCase("de") + text.slice(1);
}

/** Richtungsangabe: „aufs Fahrzeug" · „in die Tasche" · „in die Einheit". */
export function inDieEinheit(art: Einheitenart | null): string {
  if (art === "fahrzeug") return "aufs Fahrzeug";
  if (art === "tasche") return "in die Tasche";
  return "in die Einheit";
}

/**
 * Die Ueberschrift des Checklistenblatts: „Fahrzeug-Checkliste" ·
 * „Taschen-Checkliste" · „Checkliste".
 *
 * ⚠️ „Taschen-Checkliste" MIT FUGEN-N, nicht „Tasche-Checkliste" — und deshalb
 * steht die Zeichenkette hier ganz und wird nicht aus `EINHEITENART_LABEL`
 * zusammengeklebt. Ein `${label}-Checkliste` waere fuer „Fahrzeug" richtig und
 * fuer „Tasche" still falsch.
 */
export function checklisteTitel(art: Einheitenart | null): string {
  if (art === "fahrzeug") return "Fahrzeug-Checkliste";
  if (art === "tasche") return "Taschen-Checkliste";
  return "Checkliste";
}
