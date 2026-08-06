"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, type DB } from "../_db/client";
import {
  checks, sollPositionen, geraete, o2Flaschen, o2Messungen, lagerorte, newId,
} from "../_db/schema";
import { requireHelferSchreibend } from "../_lib/helferZugang";
import { HANDLAGER_ID, MONAT_REGEX, ZUSTAENDE, ZUSTAND_DEFEKT } from "../_lib/konstanten";
import { korrekturAufLagerort } from "../_lib/schreibpfade/korrektur";
import { umlagerung } from "../_lib/schreibpfade/umlagerung";
import { setzeVerfall } from "../_lib/schreibpfade/lagerortVerfall";
import { verfallFuerLagerort } from "../_lib/lesepfade/verfall";
import { o2Status } from "../_lib/domain/o2";
import { RIEGEL_TEXTE, type HelferErgebnis } from "../_lib/actionTypen";

/**
 * DER FAHRZEUG-CHECK-ABSCHLUSS — §5.8, §7.9.4. EINE Transaktion.
 *
 * WICHTIG: Der Fahrzeugbestand ist pro (Artikel, Lagerort) — NICHT pro
 * Fach/Soll-Position. Liegt derselbe Artikel in mehreren Faechern, teilen sich
 * diese Positionen EINEN Fahrzeug-Bestand (§5.7.1). Deshalb wird pro ARTIKEL
 * (nicht pro Position) genau einmal:
 *   1. ABGLEICH   — Fahrzeugbestand des Artikels auf die Summe der gezaehlten Ist.
 *   2. NACHFUELLEN — die Summe der bestaetigten Mengen aus dem Handlager umgelagert.
 */

const CheckSchema = z.object({
  fahrzeugId: z.string().min(1),
  // Kann leer sein (Fahrzeug ohne Soll-Artikel, aber mit Geraeten). Der Flow
  // verhindert komplett leere Checks; serverseitig ist ein leerer
  // Positions-Check harmlos (bucht nichts).
  positionen: z.array(z.object({
    sollPositionId: z.string().min(1),
    ist: z.coerce.number().int().min(0),
    // Vom Helfer im Nachfuell-Schritt bestaetigte Menge. Serverseitig pro
    // Position auf max(0, Soll − Ist) geklemmt und ueber `umlagerung()` an der
    // Handlager-Verfuegbarkeit gekappt.
    nachfuellMenge: z.coerce.number().int().min(0),
  })).default([]),
  geraete: z.array(z.object({
    geraetId: z.string().min(1),
    vorhanden: z.boolean(),
    zustand: z.enum(ZUSTAENDE).optional(),
    bemerkung: z.string().trim().optional(),
  })).default([]),
  flaschen: z.array(z.object({
    flascheId: z.string().min(1),
    druckBar: z.coerce.number().int().min(0),
  })).default([]),
  // Im Fahrzeug abgelesener Verfall je Artikel („YYYY-MM", fruehestes Datum im
  // Fahrzeug). Durchgehend optional: null/"" loescht eine fruehere Angabe, ein
  // FEHLENDER Eintrag laesst sie unangetastet.
  verfaelle: z.array(z.object({
    artikelId: z.string().min(1),
    verfall: z.union([z.string().regex(MONAT_REGEX), z.literal("")])
      .nullable().transform((v) => v || null),
  })).default([]),
});

export type CheckAbschlussWert = {
  checkId: string;
  /** TATSAECHLICH umgelagert — nach der stillen Kappung in `umlagerung()`. */
  nachgefuellt: number;
  /** Was der Helfer bestaetigt hat und in der Hand haelt (§7.9.4, NEU). */
  nachfuellBestaetigt: number;
  offen: number;
  geraeteAuffaellig: number;
  flaschenAuffaellig: number;
  /** Flaschen mit `nennfuelldruckBar <= 0` — nicht bewertbar, nicht „niedrig". */
  flaschenNichtBewertbar: number;
  verfallAuffaellig: number;
};

export async function checkAbschluss(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<HelferErgebnis<CheckAbschlussWert>> {
  // ERSTE Anweisung, und der Rueckgabewert MUSS ausgewertet werden. Bis zur
  // Portierung warf dieser Riegel (session.ts:25,28) — ein Wurf liess sich nicht
  // uebersehen. Ein Rueckgabewert schon: `await requireHelferSchreibend(db)` ohne
  // Pruefung ist typkorrekt, lint-sauber und oeffnet diese Action fuer jeden. Das
  // einzige Netz dagegen ist der E2E „gesperrter Token wird an der Buchung
  // abgewiesen" (§3.8.3, §7.12.4) — und der liegt in Teil 6, T171.
  //
  // ⚠️ `requireLagerbuchHost` wird hier NICHT gerufen: `requireHelferSchreibend`
  // ruft ihn INTERN als erste Anweisung (Teil 1, T10). Genau deshalb ist die
  // Zusage „jede Helfer-Action ist host-gebunden" durch KONSTRUKTION wahr und
  // nicht durch eine Liste, die die naechste Action vergisst.
  const riegel = await requireHelferSchreibend(db);
  if (!riegel.ok) return { ok: false, grund: riegel.grund, text: RIEGEL_TEXTE[riegel.grund] };

  // ⚠️ ANSATZPUNKT 2 VON 2 fuer eine spaetere Durchsetzung von
  // `tokens.scope_lagerort_id` als RIEGEL (offene Betreiberfrage 5, §7.9.1).
  // Hier stuende:
  //     if (scope && scope !== v.fahrzeugId) return { ok:false, grund:"gesperrt", … };
  // Heute ist die Spalte Dekoration; ein Fahrzeug-Code kann jedes Fahrzeug
  // checken (Falle 14). Ansatzpunkt 1 ist die `gewaehlt`-Zeile in
  // `helfer/check/page.tsx`. MEHR BRAUCHT ES DANN NICHT.
  //
  // ⚠️ NUR FUER DEN SCOPE. Die abgedruckte Zeile prueft weder `typ` noch
  // `aktiv`; Art- und Aktiv-Pruefung des Fahrzeugs gehoeren ZUSAETZLICH dazu
  // und stehen seit dem Abschluss-Fix von Teil 4 unten als Riegel 5, direkt
  // hinter `const v = geparst.data`.

  const geparst = CheckSchema.safeParse(eingabe);
  if (!geparst.success) {
    // Eine ungueltige Nutzlast ist erwartbar (altes Fenster, halb geladene
    // Seite) und deshalb ein RUECKGABEWERT, kein Wurf (§7.3, Falle 66).
    //
    // ⚠️ `grund: "eingabe"`, NICHT `"netz"` (Betreiberentscheidung B4). Global
    // Constraint 12 weist `"netz"` ausschliesslich dem Client zu; es entsteht
    // NIE serverseitig. Die Verbindung STEHT hier — sie hat gerade eine
    // unvollstaendige Nutzlast geliefert.
    return {
      ok: false,
      grund: "eingabe",
      text: "Die Eingabe war unvollständig. Bitte die Seite neu laden und erneut abschließen.",
    };
  }
  const v = geparst.data;

  // WURF-FREIER RIEGEL 5 — die WURZEL-ID gegen die Datenbank, wie die vier
  // Kind-IDs unten (:153, :198, :212, :255 im Vorzustand).
  //
  // WARUM ES IHN BRAUCHT: `CheckSchema` verlangt fuer `fahrzeugId` nur
  // `z.string().min(1)`; der Wert ist danach Filter der Soll-Positionen,
  // `lagerortId` der Bestandskorrektur, `nachLagerortId` einer echten
  // Umlagerung aus dem Handlager, `lagerortId` der Verfallsschreibung UND
  // `fahrzeugId` der geschriebenen `checks`-Zeile. Weder
  // `_lib/schreibpfade/umlagerung.ts` noch `_lib/schreibpfade/korrektur.ts`
  // pruefen `typ` oder `aktiv` nach — richtig so, sie erwarten einen
  // validierten Aufrufer. Der Fremdschluessel auf `lagerorte.id`
  // (`_db/schema.ts:217`) faengt allein den frei erfundenen String ab, NICHT
  // die falsche Art (ein `typ: "lager"`-Eintrag existiert bereits) und NICHT
  // den stillgelegten Eintrag.
  //
  // Die Schwester-Action macht dieselbe Pruefung mit derselben Begruendung
  // (`_actions/buchung.ts:181-185`), und `helfer/check/page.tsx:75-77` filtert
  // aus demselben Grund auf `aktiv` — „sonst laedt eine geratene ID die Daten
  // eines stillgelegten Fahrzeugs".
  //
  // ⚠️ RUECKGABEWERT UND KEIN WURF: eine Stilllegung WAEHREND des Checks ist
  // eine erwartbare Lage im Sinn von Falle 66 — ein Check dauert zehn bis
  // zwanzig Minuten (`_lib/helferSitzung.ts`, §2.9), und `sollPositionen`
  // ueberleben eine Stilllegung (`lagerorte.aktiv` ist ein reines Flag,
  // `_db/schema.ts:37`), die Nutzlast liefe also durch alle vier bestehenden
  // Wuerfe hindurch. `grund: "eingabe"` ist der Wert aus Betreiberentscheidung
  // B4, und `darfErneuern("eingabe") === false` ist hier auch fachlich richtig:
  // ein stillgelegtes Fahrzeug wird nicht dadurch aktiv, dass jemand die
  // Sitzung erneuert.
  const fz = db.select().from(lagerorte).where(eq(lagerorte.id, v.fahrzeugId)).get();
  if (!fz || fz.typ !== "fahrzeug" || !fz.aktiv) {
    return {
      ok: false,
      grund: "eingabe",
      text: "Dieses Fahrzeug ist nicht mehr aktiv. Bitte die Seite neu laden.",
    };
  }

  const code = riegel.zugang.code;   // der CODE, nicht die Token-Kennung: das
                                     // Journal zeigt ihn als Klarnamen (_db/quelle.ts)
  const checkId = newId();
  let nachgefuellt = 0;              // TATSAECHLICH umgelagert, nach Handlager-Kappung
  let nachfuellBestaetigt = 0;       // was der Helfer bestaetigt hat (§7.9.4, NEU)
  let offen = 0;
  let geraeteAuffaellig = 0;
  let flaschenAuffaellig = 0;
  let flaschenNichtBewertbar = 0;
  let verfallAuffaellig = 0;

  db.transaction((tx) => {
    // Grabsteine (`entfernt`) sind kein Soll → aus der gueltigen Positionsmenge
    // ausschliessen.
    const sollRows = tx.select().from(sollPositionen)
      .where(eq(sollPositionen.fahrzeugId, v.fahrzeugId)).all()
      .filter((s) => !s.entfernt);
    const byId = new Map(sollRows.map((s) => [s.id, s]));
    const quelle = { quelleTyp: "token" as const, quelleId: code };
    const referenz = `check:${checkId}`;

    type Gruppe = {
      artikelId: string; positionen: string[];
      sollSumme: number; istSumme: number; nachfuellGewuenscht: number;
    };
    const gruppen = new Map<string, Gruppe>();
    const posErgebnis: { sollPositionId: string; artikelId: string; soll: number; ist: number }[] = [];

    for (const p of v.positionen) {
      const row = byId.get(p.sollPositionId);
      // WURF 1 von 4 (§7.3, Riegelfall — nicht „erwartbar", sondern
      // „manipuliert"). Kein Helfer erreicht das ueber die Oberflaeche: die
      // Nutzlast entsteht aus Daten, die derselbe Server gerade geliefert hat.
      if (!row) throw new Error("Soll-Position gehört nicht zu diesem Fahrzeug");
      const nachfuellWunsch = Math.min(p.nachfuellMenge, Math.max(0, row.soll - p.ist));
      const g = gruppen.get(row.artikelId) ?? {
        artikelId: row.artikelId, positionen: [], sollSumme: 0, istSumme: 0, nachfuellGewuenscht: 0,
      };
      g.positionen.push(row.id);
      g.sollSumme += row.soll;
      g.istSumme += p.ist;
      g.nachfuellGewuenscht += nachfuellWunsch;
      gruppen.set(row.artikelId, g);
      posErgebnis.push({ sollPositionId: row.id, artikelId: row.artikelId, soll: row.soll, ist: p.ist });
    }

    const artikelErgebnis = [...gruppen.values()].map((g) => {
      // I4: nach `korrekturAufLagerort(…, istMenge)` gilt
      // `bestandProLagerort(…, fahrzeugId) === istMenge`.
      const { diff: korrektur } = korrekturAufLagerort(tx, {
        artikelId: g.artikelId, lagerortId: v.fahrzeugId, istMenge: g.istSumme,
        quelle, kommentar: "Fahrzeug-Check Abgleich", referenz,
      });
      const recordedVorher = g.istSumme - korrektur;
      const nachfuellGebucht = g.nachfuellGewuenscht > 0
        ? umlagerung(tx, {
            artikelId: g.artikelId, menge: g.nachfuellGewuenscht,
            vonLagerortId: HANDLAGER_ID, nachLagerortId: v.fahrzeugId,
            quelle, kommentar: "Fahrzeug-Check Nachfüllung", referenz,
          }).umgelagert
        : 0;
      nachgefuellt += nachfuellGebucht;
      nachfuellBestaetigt += g.nachfuellGewuenscht;
      offen += Math.max(0, g.sollSumme - g.istSumme - nachfuellGebucht);
      return {
        artikelId: g.artikelId, positionen: g.positionen.length,
        sollSumme: g.sollSumme, istSumme: g.istSumme, recordedVorher, korrektur,
        nachfuellGewuenscht: g.nachfuellGewuenscht, nachfuellGebucht,
      };
    });

    // Geraete am Fahrzeug (standort-basiert): nur eingereichte Geraete
    // akzeptieren, die wirklich HIER stehen. Zustand und Bemerkung als Snapshot.
    const geraeteHier = new Set(
      tx.select({ id: geraete.id }).from(geraete)
        .where(eq(geraete.lagerortId, v.fahrzeugId)).all().map((g) => g.id),
    );
    const geraeteErgebnis = v.geraete.map((e) => {
      if (!geraeteHier.has(e.geraetId)) throw new Error("Gerät gehört nicht zu diesem Fahrzeug");   // WURF 2
      if (!e.vorhanden || e.zustand === ZUSTAND_DEFEKT) geraeteAuffaellig++;
      return {
        geraetId: e.geraetId, vorhanden: e.vorhanden,
        zustand: e.zustand ?? null, bemerkung: e.bemerkung ?? null,
      };
    });

    const flaschenHier = new Map(
      tx.select().from(o2Flaschen).where(eq(o2Flaschen.lagerortId, v.fahrzeugId)).all()
        .map((f) => [f.id, f]),
    );
    const flaschenErgebnis = v.flaschen.map((e) => {
      const f = flaschenHier.get(e.flascheId);
      if (!f) throw new Error("Flasche gehört nicht zu diesem Fahrzeug");   // WURF 3
      tx.insert(o2Messungen).values({
        id: newId(), flascheId: e.flascheId, ts: new Date(), druckBar: e.druckBar,
        quelleTyp: "token", quelleId: code, kommentar: `Fahrzeug-Check ${referenz}`,
      }).run();

      // §5.12, §7.9.4 (NEU): eine Flasche OHNE bekannten Nennfuelldruck ist
      // NICHT BEWERTBAR, nicht „niedrig". `fuellstandProzent` gibt bei
      // `nennfuelldruckBar <= 0` eine 0 zurueck (o2.ts:28), und `o2Status` macht
      // daraus ampel "rot" mit `niedrig: true` — die Flasche erschiene als
      // niedrig, obwohl sie schlicht nicht bewertbar ist, UND DIE HELFERIN
      // LIEFE LOS, UM EINE VOLLE FLASCHE ZU TAUSCHEN.
      //
      // Die MESSUNG wird trotzdem geschrieben: sie ist Rohdatum und bleibt
      // richtig, auch wenn die Bewertung fehlt.
      if (f.nennfuelldruckBar <= 0) flaschenNichtBewertbar++;
      else if (o2Status(e.druckBar, f.nennfuelldruckBar).niedrig) flaschenAuffaellig++;

      // Nennfuelldruck als Snapshot mitschreiben, damit der Fuellstand spaeter
      // auch dann rekonstruierbar ist, wenn die Flasche umkonfiguriert oder
      // geloescht wird.
      //
      // ⚠️ `<= 0` WIRD ALS `null` GESCHRIEBEN, NICHT ALS 0. `CheckFlascheRoh`
      // (`_lib/checkErgebnis.ts:58-65`) fuehrt DREI verschiedene Zustaende: eine
      // Zahl = Snapshot, `undefined` = Snapshot fehlt (jeder Altcheck), `null` =
      // ausdruecklich „unbekannt" — und diese Datei ist der Schreiber, den der
      // Kommentar dort mit „ab jetzt geschrieben" meint.
      //
      // Eine geschriebene `0` ist dagegen eine ZAHL und passiert jeden
      // `??`-Riegel des Lesers ungebremst (`_lib/lesepfade/checks.ts:168,174`
      // prueft `nenn === null`); `o2Status(druck, 0)` liefert 0 %, ampel „rot"
      // und `niedrig: true`. Der historische Nachweis behauptete dann eine
      // NIEDRIGE Flasche, wo bloss die Bezugsgroesse fehlt — dieselbe Falle, die
      // `flaschenNichtBewertbar` zwoelf Zeilen darueber im Live-Zweig abfaengt.
      return {
        flascheId: e.flascheId,
        druckBar: e.druckBar,
        nennfuelldruckBar: f.nennfuelldruckBar > 0 ? f.nennfuelldruckBar : null,
      };
    });

    const sollArtikel = new Set(sollRows.map((s) => s.artikelId));
    for (const e of v.verfaelle) {
      if (!sollArtikel.has(e.artikelId)) throw new Error("Artikel gehört nicht zu diesem Fahrzeug");   // WURF 4
      setzeVerfall(tx, {
        lagerortId: v.fahrzeugId, artikelId: e.artikelId, verfall: e.verfall, quelle,
      });
    }

    // NACH dem Schreiben zaehlen, damit die Rueckmeldung den GANZEN
    // Fahrzeugstand widerspiegelt — nicht nur die in diesem Check angefassten
    // Artikel (1:1 aus check.ts:158-159).
    const verfallErgebnis = [...verfallFuerLagerort(tx, v.fahrzeugId).values()].map((e) => ({
      artikelId: e.artikelId, verfall: e.verfall, ampel: e.ampel, abgelaufen: e.abgelaufen,
    }));
    verfallAuffaellig = verfallErgebnis.filter((e) => e.ampel !== "gruen").length;

    tx.insert(checks).values({
      id: checkId, fahrzeugId: v.fahrzeugId, quelleTyp: "token", quelleId: code,
      startedAt: new Date(), completedAt: new Date(),
      // ⚠️ `version: 2` wird ab jetzt AUSGESCHRIEBEN. Der Bestand schreibt das
      // Objekt ohne Diskriminator; `parseCheckErgebnis` (Teil 3, T37) erkennt
      // Alt-Objekte weiterhin an der Form. Ein geschriebenes Feld macht die
      // Unterscheidung fuer alles NEUE explizit statt geraten.
      //
      // ⚠️ DIE FELDNAMEN SIND NICHT UMBENENNBAR (§4.10, 1:1-Pflicht 2) — sonst
      // wird jede historische Auswertung stumm 0.
      ergebnis: JSON.stringify({
        version: 2,
        positionen: posErgebnis,
        artikel: artikelErgebnis,
        geraete: geraeteErgebnis,
        flaschen: flaschenErgebnis,
        verfall: verfallErgebnis,
      }),
    }).run();
  });

  // INNERER Pfad (/m/lagerbuch/…). Gegenrichtung zu allem, was der Client
  // schreibt und was in ein `Location` geht — das sind AEUSSERE Pfade (§7.2.5).
  revalidatePath("/m/lagerbuch/helfer/check");
  revalidatePath("/m/lagerbuch/verwaltung/checks");
  revalidatePath("/m/lagerbuch/verwaltung");
  revalidatePath("/m/lagerbuch/verwaltung/sauerstoff");
  revalidatePath("/m/lagerbuch/verwaltung/verfall");
  revalidatePath("/m/lagerbuch/verwaltung/fahrzeuge");

  return {
    ok: true,
    wert: {
      checkId, nachgefuellt, nachfuellBestaetigt, offen,
      geraeteAuffaellig, flaschenAuffaellig, flaschenNichtBewertbar, verfallAuffaellig,
    },
  };
}
