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

/** Kodiert „kein Verfall". Auf NULL umgestellt kippen Ampel, Verfall-Liste und die
 *  FEFO-Sortierung (fefo.ts sortiert ueber den String) fuer jede so angelegte Charge. */
export const PSEUDO_VERFALL = "2099-12";
export const istOhneVerfall = (verfall: string): boolean => verfall === PSEUDO_VERFALL;

/** Herkunftshinweise in chargen.chargen_nr — NICHT Bedeutungstraeger. Die Bedeutung
 *  „ohne Verfall" haengt am Verfallswert (§5.3.2). */
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
