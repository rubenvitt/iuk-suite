"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/core/auth";
import { requireModuleAdmin } from "@/core/auth/guards";
import { getDb } from "./_db/client";
import {
  eigenesZeichenMitKanon,
  eigenesZeichenMitNamen,
  legeEigenesZeichenAn,
  ueberschreibeEigenesZeichen,
} from "./_db/eigeneZeichen";
import { schreibeAntwort } from "./_db/lernen";
import { lernsets, lernsetZeichen, merkliste } from "./_db/schema";
import { kanonischerSchluessel } from "./_lib/kanon";
import { KATALOG_STAND, findeZeichen } from "./_lib/katalog";
import { FRAGETYPEN, type Fragetyp } from "./_lib/lernen/fragen";
import { konfliktFrage, specFormFehler, svgFormFehler } from "./_lib/pruefung";

/*
 * DIE ZWEI ACTIONS DES KATALOGS. Beide werden von Client-Inseln DIREKT
 * IMPORTIERT, nie als Prop durchgereicht — Server Actions sind die einzigen
 * Funktionen, die die RSC-Grenze ueberqueren duerfen (Falle 9).
 *
 * ⛔ DER `sub` KOMMT AUS `auth()`, NIE AUS EINEM ARGUMENT. Sonst waere die
 * Merkliste jeder anderen Person mit einer erratenen Kennung zu leeren (IDOR).
 *
 * DER TYP LUEGT: `@auth/core` baut `session.user` OHNE `id`
 * (`lib/actions/session.js`), waehrend `core/auth/config.ts` den Pocket-ID-`sub`
 * im jwt-Callback aktiv zurueckholt. TypeScript sieht die Luecke nicht — deshalb
 * prueft jede Stelle explizit. In einer Server Action heisst das WERFEN: eine
 * Action, die unerlaubt aufgerufen wird, darf nicht „nichts tun und aussehen wie
 * Erfolg".
 */

const ZEICHEN_WURZEL = "/m/zeichen";

/**
 * EIN Aufruf mit `"layout"` (Vorbild `feedback/actions.ts`, `aufgaben/actions.ts`):
 * die Merkzahl steht auf `/katalog`, `/katalog/[id]` UND `/merkliste`. Ohne
 * `"layout"` bliebe die jeweils andere Flaeche auf dem alten Stand.
 */
function revalidate(): void {
  revalidatePath(ZEICHEN_WURZEL, "layout");
}

async function eigenerSub(): Promise<string> {
  const sub = (await auth())?.user?.id;
  if (!sub) throw new Error("Forbidden");
  return sub;
}

/**
 * Ein Zeichen auf die eigene Merkliste legen.
 *
 * Der `titelSchnappschuss` wird HIER aus dem Generat genommen und nicht vom
 * Client geliefert: der Client koennte jeden Text schicken, und der Schnappschuss
 * ist genau die Angabe, die spaeter trotz verschwundener ID noch etwas taugt
 * (Spec §4.2).
 *
 * Eine unbekannte ID ist ein ZUSTAND, kein Fehler (`findeZeichen` wirft nie): es
 * gibt nichts zu merken, also passiert nichts. Ein Wurf schickte ein altes
 * Lesezeichen auf die technische Fehlerseite.
 */
export async function merkeZeichen(zeichenId: string): Promise<void> {
  const sub = await eigenerSub();
  const zeichen = findeZeichen(zeichenId);
  if (zeichen === null) return;

  getDb()
    .insert(merkliste)
    .values({ sub, zeichenId: zeichen.id, titelSchnappschuss: zeichen.titel })
    .onConflictDoNothing()
    .run();
  revalidate();
}

/**
 * Ein Zeichen von der eigenen Merkliste nehmen.
 *
 * ⛔ HIER WIRD BEWUSST NICHT GEGEN DEN KATALOG GEPRUEFT. Spec §4.6 Stufe 2 sagt
 * zu, dass eine Merkzeile ohne Aufloesung SICHTBAR bleibt und einen
 * Entfernen-Knopf traegt. Mit einer `findeZeichen`-Huerde waere ausgerechnet
 * diese Zeile die einzige, die niemand mehr loswird — der Knopf stuende da und
 * taete nichts, ohne Meldung.
 */
export async function entferneZeichen(zeichenId: string): Promise<void> {
  const sub = await eigenerSub();
  getDb()
    .delete(merkliste)
    .where(and(eq(merkliste.sub, sub), eq(merkliste.zeichenId, zeichenId)))
    .run();
  revalidate();
}

/**
 * Der Rueckgabetyp von `speichereEigenesZeichen`.
 *
 * Ein Typexport aus einer "use server"-Datei ist zulaessig — er verschwindet im
 * Build (Vorbild `files/(verwaltung)/actions.ts` mit `ShareFormZustand`).
 *
 * DREI AUSGAENGE, WEIL ES DREI LAGEN GIBT: Erfolg, Feldfehler (der Name fehlt) und
 * RUECKFRAGE (§6.6). Die Rueckfrage ist ausdruecklich KEIN Feldfehler: es ist
 * nichts falsch, es ist nur etwas zu entscheiden — und die Entscheidung trifft die
 * Person, nicht die Action.
 */
export type SpeichernZustand =
  | { ok: true; name: string }
  | { ok: false; art: "fehler"; feldFehler: Record<string, string>; werte: Record<string, string> }
  | {
      ok: false;
      art: "rueckfrage";
      frage: "name" | "zusammenstellung";
      text: string;
      werte: Record<string, string>;
    };

const feld = (formData: FormData, name: string): string => {
  const wert = formData.get(name);
  return typeof wert === "string" ? wert : "";
};

/**
 * EIN EIGENES ZEICHEN SPEICHERN (Spec §6.6).
 *
 * Die Kette: `sub` pruefen → FORMpruefung von Spec und SVG → kanonischer
 * Schluessel → Konfliktfrage → schreiben → revalidatePath.
 *
 * ⛔ DER KANONISCHE SCHLUESSEL WIRD HIER GERECHNET, nicht vom Client uebernommen.
 * Er beantwortet die Frage „schon gespeichert?", und ein mitgelieferter Wert
 * koennte sie beliebig beantworten. `_lib/kanon.ts` importiert keinen Katalogcode,
 * das Rechnen ist reine Zeichenkettenarbeit.
 *
 * ⚠️ ER WIRD ZUGLEICH GESPEICHERT, und damit wird sein FORMAT zur Datenzusage:
 * aendert sich die Serialisierung in `_lib/kanon.ts`, antwortet „schon
 * gespeichert?" fuer jede alte Zeile still „nein". Die lange Fassung dieser
 * Warnung steht ueber `_db/eigeneZeichen.ts`.
 *
 * ⛔ EINE FACHLICHE PRUEFUNG DER SPEC GIBT ES NICHT: sie braeuchte
 * `composeFromCatalog` und zoege den Katalog in den Server-Graph (M1). Gespeichert
 * wird das von der Insel gelieferte SVG; auf /meine wird es als `<img>`-Datenquelle
 * gerendert und nie als HTML ausgefuehrt (§4.3).
 *
 * `paket_version`/`daten_version` kommen aus `KATALOG_STAND` — als Literale
 * notiert loegen sie ab dem ersten Upgrade.
 *
 * Zugriffsverletzungen WERFEN; Feldfehler kommen zurueck.
 */
export async function speichereEigenesZeichen(
  _vorher: SpeichernZustand,
  formData: FormData,
): Promise<SpeichernZustand> {
  const sub = await eigenerSub();

  const name = feld(formData, "name").trim();
  const specJson = feld(formData, "spec");
  const svg = feld(formData, "svg");
  const bestaetigung = feld(formData, "bestaetigung");
  const werte = { name };

  if (name === "") {
    return {
      ok: false,
      art: "fehler",
      werte,
      feldFehler: { name: "Gib dem Zeichen einen Namen, damit du es wiederfindest." },
    };
  }
  if (name.length > 80) {
    return { ok: false, art: "fehler", werte, feldFehler: { name: "Höchstens 80 Zeichen." } };
  }
  const specFehler = specFormFehler(specJson);
  if (specFehler) return { ok: false, art: "fehler", werte, feldFehler: { spec: specFehler } };
  const svgFehler = svgFormFehler(svg);
  if (svgFehler) return { ok: false, art: "fehler", werte, feldFehler: { spec: svgFehler } };

  const kanon = kanonischerSchluessel(JSON.parse(specJson));
  const db = getDb();
  const gleicherName = eigenesZeichenMitNamen(db, sub, name);
  const gleicheForm = eigenesZeichenMitKanon(db, sub, kanon);
  const frage = konfliktFrage(
    gleicherName !== null,
    gleicheForm && gleicheForm.name !== name ? gleicheForm.name : null,
    bestaetigung,
  );
  if (frage === "name") {
    return {
      ok: false,
      art: "rueckfrage",
      frage,
      werte,
      text: "Unter diesem Namen hast du schon ein Zeichen. Überschreiben oder anders benennen?",
    };
  }
  if (frage === "zusammenstellung") {
    return {
      ok: false,
      art: "rueckfrage",
      frage,
      werte,
      text:
        `Diese Zusammenstellung hast du schon als „${gleicheForm?.name}“ gespeichert — ` +
        "trotzdem zusätzlich sichern?",
    };
  }

  const gemeinsam = {
    specJson,
    specKanon: kanon,
    svg,
    paketVersion: KATALOG_STAND.paket,
    datenVersion: KATALOG_STAND.daten,
  };
  if (gleicherName) ueberschreibeEigenesZeichen(db, gleicherName.id, gemeinsam);
  else legeEigenesZeichenAn(db, { sub, name, ...gemeinsam });

  revalidate();
  return { ok: true, name };
}

/*
 * --- Lernen (Aufgabe 8) ---------------------------------------------------------------
 */

/**
 * Bewertet eine Antwort und schreibt den Stand. DIE ACTION IST DIE WAHRHEIT ueber den
 * Fortschritt — die Insel kennt die Optionen ohnehin, ein signiertes Fragetoken waere
 * Aufwand gegen jemanden, der sich nur selbst belaege.
 */
export async function beantworte(
  zeichenId: string,
  typ: Fragetyp,
  gewaehlteId: string,
): Promise<{ richtig: boolean }> {
  const sub = (await auth())?.user?.id;
  // Der Typ luegt: @auth/core baut `user` ohne `id`. TypeScript sieht das nicht.
  if (!sub) throw new Error("Forbidden");
  if (!FRAGETYPEN.includes(typ)) throw new Error("Unbekannter Fragetyp");

  const richtig = gewaehlteId === zeichenId;
  const heute = new Date().toISOString().slice(0, 10);
  schreibeAntwort(getDb(), sub, zeichenId, richtig ? "richtig" : "falsch", heute);
  revalidatePath("/m/zeichen/lernen");
  return { richtig };
}

/*
 * --- Lernsets, Verwaltung (Aufgabe 8) --------------------------------------------------
 *
 * JEDE Action hier beginnt mit `await requireModuleAdmin("zeichen")` — nicht
 * `moduleAdminPageOrNotFound`: das ist die Seitenform (liefert 404), Actions nehmen
 * die WERFENDE Form (Falle unterschieden im CLAUDE.md-Abschnitt „Zugriffsschutz").
 */

const LERNSETS_WURZEL = "/m/zeichen/verwaltung/lernsets";

export type LernsetFormState =
  | { ok: true }
  | { ok: false; feldFehler: Record<string, string> };

/**
 * Ein Lernset anlegen. `aktiv` beginnt auf `false` (Schema-Vorgabe) — ein Set entsteht
 * ueber mehrere Sitzungen, ohne Entwurfszustand saehe jeder Lernende jede Halbfertigkeit.
 */
export async function legeLernsetAn(
  _vorher: LernsetFormState,
  formData: FormData,
): Promise<LernsetFormState> {
  await requireModuleAdmin("zeichen");

  const titel = String(formData.get("titel") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();

  const feldFehler: Record<string, string> = {};
  if (!titel) feldFehler.titel = "Bitte einen Titel angeben.";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    feldFehler.slug = "Nur Kleinbuchstaben, Ziffern und Bindestriche.";
  }
  if (Object.keys(feldFehler).length > 0) return { ok: false, feldFehler };

  const sub = (await auth())?.user?.id;
  if (!sub) throw new Error("Forbidden");

  const bestehend = getDb().select().from(lernsets).where(eq(lernsets.slug, slug)).get();
  if (bestehend) {
    return { ok: false, feldFehler: { slug: "Dieses Kürzel gibt es schon." } };
  }

  getDb().insert(lernsets).values({ slug, titel, erstelltVon: sub }).run();
  revalidatePath(LERNSETS_WURZEL);
  return { ok: true };
}

/** Ein Set sichtbar schalten oder wieder zurueckziehen. */
export async function setzeLernsetAktiv(lernsetId: string, aktiv: boolean): Promise<void> {
  await requireModuleAdmin("zeichen");
  getDb()
    .update(lernsets)
    .set({ aktiv, geaendertAm: new Date() })
    .where(eq(lernsets.id, lernsetId))
    .run();
  revalidatePath(LERNSETS_WURZEL);
  revalidatePath("/m/zeichen/lernen");
}

/**
 * Ein Zeichen in ein Lernset aufnehmen. Der `titelSchnappschuss` wird — wie bei der
 * Merkliste (Spec §4.2) — HIER aus dem Generat genommen, nicht vom Client geliefert.
 *
 * Eine unbekannte Katalog-ID ist ein Feldfehler, kein Wurf: die Admin-Person hat sich
 * vertippt, das ist kein Zugriffsproblem.
 */
export async function fuegeZeichenZuSetHinzu(
  lernsetId: string,
  zeichenId: string,
): Promise<{ ok: boolean; fehler?: string }> {
  await requireModuleAdmin("zeichen");

  const zeichen = findeZeichen(zeichenId);
  if (zeichen === null) return { ok: false, fehler: "Diese Zeichen-ID kennt der Katalog nicht." };

  const db = getDb();
  const bisherige = db
    .select()
    .from(lernsetZeichen)
    .where(eq(lernsetZeichen.lernsetId, lernsetId))
    .all();
  if (bisherige.some((z) => z.zeichenId === zeichen.id)) {
    return { ok: false, fehler: "Dieses Zeichen steht schon im Set." };
  }

  db.insert(lernsetZeichen)
    .values({
      lernsetId,
      zeichenId: zeichen.id,
      titelSchnappschuss: zeichen.titel,
      position: bisherige.length,
    })
    .run();
  revalidatePath(`${LERNSETS_WURZEL}/${lernsetId}`);
  return { ok: true };
}

/** Ein Zeichen aus einem Lernset nehmen. Wie bei der Merkliste: kein Katalog-Abgleich
 *  noetig, eine verwaiste Zeile muss sich genauso entfernen lassen. */
export async function entferneZeichenAusSet(lernsetId: string, zeichenId: string): Promise<void> {
  await requireModuleAdmin("zeichen");
  getDb()
    .delete(lernsetZeichen)
    .where(and(eq(lernsetZeichen.lernsetId, lernsetId), eq(lernsetZeichen.zeichenId, zeichenId)))
    .run();
  revalidatePath(`${LERNSETS_WURZEL}/${lernsetId}`);
}
