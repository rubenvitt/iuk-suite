"use server";
import { auditAccessActor } from "@/core/audit/server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "../_db/client";
import { artikel, buchungen, chargen, lagerorte, newId } from "../_db/schema";
import { HANDLAGER_ID, MONAT_REGEX } from "../_lib/konstanten";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { requireHelferSchreibend } from "../_lib/helferZugang";
import { fefoAbbuchung } from "../_lib/schreibpfade/abbuchung";
import { umlagerung } from "../_lib/schreibpfade/umlagerung";
import { handlagerOrte } from "../_lib/lesepfade/orte";
import { istAktivesFahrzeug } from "../_lib/lesepfade/fahrzeuge";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { RIEGEL_TEXTE, leerText, type HelferErgebnis } from "../_lib/actionTypen";
import {
  ZIEL_COOKIE, ZIEL_UNGUELTIG_TEXT, ZIEL_VERALTET_TEXT, zielAusWert, type EntnahmeZiel,
} from "../_lib/entnahmeZiel";
import { cookies } from "next/headers";

/**
 * DIE DREI BUCHUNGSWEGE — und warum sie in EINER Datei stehen (H7).
 *
 * `bucheZugang` und `bucheEntnahme` bedienen den `ArtikelDrawer` (Teil 5),
 * `bucheEntnahmeHelfer` bedient `/a/[artikelId]` (Teil 4). Sie teilen sich
 * `fefoAbbuchung` und dieselbe Zod-Basis; zwei Dateien fuer einen
 * Buchungsvorgang waeren zwei Orte fuer dieselbe Invariante. TEIL 4 LEGT KEINE
 * ZWEITE DATEI AN.
 *
 * Der Riegel ist NICHT ueberall derselbe: die ersten beiden rufen
 * `requireLagerbuchAdmin()`, die dritte `requireHelferSchreibend(db)`. Beide
 * stehen als erste Anweisung; `_actions/guards.test.ts` (Teil 2) akzeptiert
 * genau diese zwei Formen.
 *
 * ⚠️ DIE ZWEI ERGEBNISTYPEN SIND STRUKTURELL UNVEREINBAR, und das ist Absicht:
 * `ActionErgebnis` traegt im Fehlerzweig `fehler` (+ Feldkarte fuer ein
 * Formular), `HelferErgebnis` traegt `grund` und einen FERTIGEN `text` (§7.3).
 * Wer hier `ActionErgebnis` stehen liesse, verloere in `_ui/Entnahme.tsx` den
 * Riegelgrund — und mit ihm die Entscheidung, ob ein Erneuern-Feld erscheint.
 */

const ZugangSchema = z
  .object({
    artikelId: z.string().min(1),
    menge: z.coerce.number().int().positive("Menge muss größer als 0 sein"),
    chargeId: z.string().min(1).optional(),
    neueCharge: z
      .object({
        chargenNr: z.string().trim().min(1, "Chargennummer darf nicht leer sein"),
        verfall: z.string().regex(MONAT_REGEX, "Verfall muss YYYY-MM sein"),
      })
      .optional(),
    /**
     * DRK-297 — der Schrank, in den die Ware kommt. Fehlt er, landet der Zugang
     * auf der Handlager-Wurzel; das heisst „Schrank noch nicht zugeordnet" und
     * ist genau das, was jede Altbuchung bedeutet.
     */
    zielLagerortId: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.chargeId) !== Boolean(v.neueCharge), {
    message: "Genau eine Charge angeben",
    path: ["chargeId"],
  });

export async function bucheZugang(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis> => {

    const geparst = ZugangSchema.safeParse(eingabe);
    if (!geparst.success) {
      // Falle 66: eine unbrauchbare Nutzlast ist erwartbar und deshalb ein
      // RUECKGABEWERT. Der Feldfehler traegt den Grund ans Feld — der
      // Produktions-Deserialisierer wuerde aus einem Wurf einen festen englischen
      // Satz mit `digest` bauen, und `e.message` erreichte niemanden.
      const feldFehler = zodFehler(geparst.error);
      return {
        ok: false,
        fehler: "Bitte die markierten Felder prüfen.",
        ...(feldFehler ? { feldFehler } : {}),
      };
    }
    const v = geparst.data;

    try {
      db.transaction((tx) => {
        let chargeId = v.chargeId!;
        if (v.neueCharge) {
          chargeId = newId();
          tx.insert(chargen)
            .values({
              id: chargeId,
              artikelId: v.artikelId,
              chargenNr: v.neueCharge.chargenNr,
              verfall: v.neueCharge.verfall,
              createdAt: new Date(),
            })
            .run();
        } else {
          /*
           * I5 — DIE CHARGE MUSS ZU DIESEM ARTIKEL GEHOEREN.
           * Eine manipulierte Anfrage koennte eine `chargeId` uebergeben, die zu
           * einem anderen Artikel gehoert. Ohne diese Pruefung buchte der Zugang
           * auf den Bestand des falschen Artikels — „phantom, un-withdrawable
           * Bestand": der Bestand steigt, und FEFO findet die Charge nie, weil
           * sie zum anderen Artikel gehoert. Teil 3 hat diese Invariante
           * ausdruecklich an Teil 5 abgegeben.
           *
           * DER WURF IST HIER RICHTIG (§7.3, Riegelfall): er rollt die
           * Transaktion zurueck; der `catch` unten macht daraus den
           * Rueckgabewert.
           */
          const charge = tx.select().from(chargen).where(eq(chargen.id, chargeId)).get();
          if (!charge || charge.artikelId !== v.artikelId) {
            throw new Error("Charge gehört nicht zu diesem Artikel");
          }
        }
        const ziel = v.zielLagerortId ?? HANDLAGER_ID;
        if (ziel !== HANDLAGER_ID) {
          // DREI BEDINGUNGEN, EIN SATZ: existiert der Ort, haengt er am
          // Handlager, ist er aktiv? Ohne diese Pruefung entschiede der
          // Fremdschluessel — und der meldet „FOREIGN KEY constraint failed".
          const ort = tx.select().from(lagerorte).where(eq(lagerorte.id, ziel)).get();
          if (!ort || ort.parentId !== HANDLAGER_ID || !ort.aktiv) {
            throw new Error("Ziel ist kein gültiger, aktiver Schrank im Handlager");
          }
        }
        tx.insert(buchungen)
          .values({
            id: newId(),
            ts: new Date(),
            typ: "zugang",
            artikelId: v.artikelId,
            chargeId,
            lagerortId: ziel,
            menge: v.menge,
            quelleTyp: "oidc",
            quelleId: viewer.sub,
            referenz: null,
            kommentar: null,
          })
          .run();
        // Eine Bestellmarkierung, die einen Zugang ueberlebt, fuehrte die
        // Position nach der Lieferung dauerhaft als „bestellt" (§5.5).
        tx.update(artikel).set({ bestelltAt: null }).where(eq(artikel.id, v.artikelId)).run();
      });
    } catch (e) {
      return {
        ok: false,
        fehler: e instanceof Error ? e.message : "Zugang konnte nicht gebucht werden.",
      };
    }

    // INNERE Pfade (§2.1 g, Falle 49): `revalidatePath` bekommt den Pfad, unter
    // dem die Route im Dateibaum liegt. Ein aeusserer Pfad trifft nichts — und
    // wirft dabei nicht.
    revalidatePath("/m/lagerbuch/verwaltung/artikel");
    revalidatePath("/m/lagerbuch/verwaltung");
    return { ok: true };
  });
}

/**
 * Zwei Ziele sind dasselbe, wenn ihre Art übereinstimmt — und bei einem
 * Fahrzeug zusätzlich der Lagerort. Ausgeschrieben statt als Vergleich der
 * kodierten Form: eine Änderung an der Kodierung darf diese Prüfung nicht
 * still aushebeln.
 */
function gleichesZiel(a: EntnahmeZiel, b: EntnahmeZiel): boolean {
  if (a.art !== b.art) return false;
  return a.art === "verbrauch" || a.lagerortId === (b as { lagerortId: string }).lagerortId;
}

/**
 * DRK-300 — das Ziel als DREI Zustände, hier als die zwei WÄHLBAREN.
 * Der dritte („noch nichts gewählt") ist die ABWESENHEIT des Feldes und
 * scheitert deshalb schon am `safeParse`: ein fehlendes Ziel ist kein
 * Verbrauch, sondern eine offene Entscheidung, und die bucht nicht.
 */
const ZielSchema = z.discriminatedUnion("art", [
  z.object({ art: z.literal("fahrzeug"), lagerortId: z.string().min(1) }),
  z.object({ art: z.literal("verbrauch") }),
]);

const EntnahmeSchema = z.object({
  artikelId: z.string().min(1),
  menge: z.coerce.number().int().positive("Menge muss größer als 0 sein"),
  kommentar: z.string().trim().optional(),
  /*
   * Optionales Ziel-Fahrzeug: gesetzt -> Umlagerung Handlager -> Fahrzeug (der
   * Verbrauch bleibt am Fahrzeug und sinkt erst beim naechsten Check);
   * leer oder Handlager -> normaler Verbrauch aus dem Handlager.
   */
  zielLagerortId: z.string().min(1).optional(),
});

export async function bucheEntnahme(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ gebucht: number }>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis<{ gebucht: number }>> => {

    const geparst = EntnahmeSchema.safeParse(eingabe);
    if (!geparst.success) {
      const feldFehler = zodFehler(geparst.error);
      return {
        ok: false,
        fehler: "Bitte die markierten Felder prüfen.",
        ...(feldFehler ? { feldFehler } : {}),
      };
    }
    const v = geparst.data;

    const quelle = { quelleTyp: "oidc" as const, quelleId: viewer.sub };
    const zielFahrzeug =
      v.zielLagerortId && v.zielLagerortId !== HANDLAGER_ID ? v.zielLagerortId : null;
    let gebucht = 0;

    try {
      db.transaction((tx) => {
        if (zielFahrzeug) {
          /*
           * DREI BEDINGUNGEN, EIN SATZ. Ohne diese Pruefung entschiede der
           * Fremdschluessel — und der meldet „FOREIGN KEY constraint failed",
           * was der Verwaltenden nichts sagt. Ein INAKTIVES Fahrzeug und ein
           * zweites LAGER kaemen ueberdies ganz durch: beide existieren.
           */
          if (!istAktivesFahrzeug(tx, zielFahrzeug)) {
            throw new Error("Ziel ist kein gültiges, aktives Fahrzeug");
          }
          gebucht = umlagerung(tx, {
            artikelId: v.artikelId,
            menge: v.menge,
            vonOrten: handlagerOrte(tx),
            nachLagerortId: zielFahrzeug,
            quelle,
            kommentar: v.kommentar ?? null,
            referenz: `entnahme-ziel:${zielFahrzeug}`,
          }).umgelagert;
        } else {
          gebucht = fefoAbbuchung(tx, {
            artikelId: v.artikelId,
            menge: v.menge,
            quelle,
            kommentar: v.kommentar ?? null,
            referenz: null,
          }).gebucht;
        }
      });
    } catch (e) {
      return {
        ok: false,
        fehler: e instanceof Error ? e.message : "Entnahme konnte nicht gebucht werden.",
      };
    }

    revalidatePath("/m/lagerbuch/verwaltung/artikel");
    revalidatePath("/m/lagerbuch/verwaltung");
    return { ok: true, wert: { gebucht } };
  });
}

const HelferEntnahmeSchema = z.object({
  artikelId: z.string().min(1),
  menge: z.coerce.number().int().positive(),
  /** PFLICHT seit DRK-300 — siehe `ZielSchema`. */
  ziel: ZielSchema,
});

/**
 * DER HELFER-WEG. Einziger Aufrufer: `_ui/Entnahme.tsx` (Teil 4, §7.2) — und
 * zwar als PROP aus `a/[artikelId]/page.tsx`, nicht per Import in der Insel.
 *
 * `requireHelferSchreibend` prueft Sitzung UND Sperrbefund (Teil 2, T25): ein
 * gesperrter Code liest im Bestand bis zu 12 Stunden weiter und darf hier auf
 * keinen Fall buchen. ⚠️ SEIN RUECKGABEWERT MUSS AUSGEWERTET WERDEN — bis zur
 * Portierung warf dieser Riegel; `await requireHelferSchreibend(db)` ohne
 * Pruefung ist typkorrekt, lint-sauber und oeffnet die Action fuer jeden.
 *
 * ⚠️ `requireLagerbuchHost` wird hier NICHT gerufen: `requireHelferSchreibend`
 * ruft ihn INTERN als erste Anweisung (Teil 1, T10). Nur so ist die Zusage
 * „jede Helfer-Action ist host-gebunden" durch KONSTRUKTION wahr und nicht
 * durch eine Liste, die die naechste Action vergisst.
 *
 * `quelleId` ist der CODE, nicht die Token-Kennung: das Journal zeigt ihn als
 * Klarnamen an (`_db/quelle.ts`, Teil 1 T13).
 */
export async function bucheEntnahmeHelfer(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<HelferErgebnis<{ gebucht: number }>> {
  const riegel = await requireHelferSchreibend(db);
  if (!riegel.ok) {
    // Der Grund wandert DURCH, samt seinem fertigen Satz — die Insel darf
    // „deine Sitzung ist abgelaufen" von „dieser Code wurde gesperrt"
    // unterscheiden, und nur der erste Fall darf einen Erneuern-Knopf zeigen
    // (`darfErneuern`, _lib/actionTypen.ts).
    return { ok: false, grund: riegel.grund, text: RIEGEL_TEXTE[riegel.grund] };
  }
  return withAuditContext({ actor: auditAccessActor("lagerbuch", riegel.zugang.tokenId) }, async (): Promise<HelferErgebnis<{ gebucht: number }>> => {

    const geparst = HelferEntnahmeSchema.safeParse(eingabe);
    if (!geparst.success) {
      /*
       * ⚠️ `grund: "eingabe"`, NICHT `"netz"` (Betreiberentscheidung B4). Global
       * Constraint 12 weist `"netz"` ausschliesslich dem Client zu; es entsteht
       * NIE serverseitig. Die Verbindung STEHT hier — sie hat gerade eine
       * unbrauchbare Nutzlast geliefert, und „Keine Verbindung" waere ein
       * stiller, typkorrekter Fehlschluss auf dem Telefon der Helferin.
       */
      return {
        ok: false,
        grund: "eingabe",
        text: "Die Eingabe war unvollständig. Bitte die Seite neu laden und die Menge erneut eingeben.",
      };
    }
    const v = geparst.data;

    /*
     * ⚠️ KEIN try/catch um die Transaktion, und das ist der Unterschied zu den
     * beiden Verwaltungs-Actions oben. Der Plan druckt hier
     * `catch { return { grund: "netz", … } }` ab — das erzeugte `"netz"`
     * SERVERSEITIG und verletzt damit Global Constraint 12 wortwoertlich; die
     * Insel (`_ui/Entnahme.tsx`) haelt in ihrem eigenen Kommentar fest, dass
     * `"netz"` „ausschliesslich HIER" — in IHREM `catch` — entsteht. Ein
     * Datenbankfehler ist ueberdies keine ERWARTBARE Lage im Sinn von Falle 66,
     * sondern ein Defekt; `checkAbschluss` (T75) laesst ihn aus demselben Grund
     * durchschlagen.
     */
    /*
     * ⚠️ DAS COOKIE IST DIE WAHRHEIT, DIE NUTZLAST IST DIE BEHAUPTUNG
     * (Review-Befund P1 zu PR #140, zweite Runde).
     *
     * Das Ziel kommt aus der Insel — also vom Client. Eine offene Artikelseite
     * überlebt einen Kärtchenwechsel in einem zweiten Tab: ihre Buchung träfe
     * dann mit dem NEUEN Sitzungscookie ein und trüge das ALTE Fahrzeug. Sie
     * wäre dem neuen Kärtchen zugeschrieben und ginge an das Ziel der vorigen
     * Schicht — still, und im Bestand nicht mehr aufzulösen.
     *
     * Die Bindung des Cookies an die Kärtchen-Kennung allein reicht dagegen
     * NICHT: dieser Pfad läse das Cookie sonst überhaupt nicht. Gebucht wird
     * deshalb nur, wenn beide Seiten dasselbe sagen.
     *
     * Und weil `zielAusWert` ein fremdes oder fehlendes Cookie zu `null` macht,
     * fällt derselbe Vergleich auch auf „gar nichts gemerkt" — der Zustand, in
     * dem die Insel ihren Knopf ohnehin sperrt.
     */
    const ziel: EntnahmeZiel = v.ziel;
    const gemerkt = zielAusWert(
      (await cookies()).get(ZIEL_COOKIE)?.value,
      riegel.zugang.tokenId,
    );
    if (!gemerkt || !gleichesZiel(gemerkt, ziel)) {
      return { ok: false, grund: "eingabe", text: ZIEL_VERALTET_TEXT };
    }

    /*
     * DAS ZIEL WIRD VOR DER TRANSAKTION GEPRÜFT, und die Antwort ist ein
     * RÜCKGABEWERT — kein Wurf (siehe `istAktivesFahrzeug`). Ein Fahrzeug, das
     * seit der Anzeige stillgelegt oder gelöscht wurde, ist eine ERWARTBARE
     * Lage: die Wahl gilt für den ganzen Kärtchen-Zugang und überlebt damit
     * jede Änderung in der Verwaltung.
     */
    if (ziel.art === "fahrzeug" && !istAktivesFahrzeug(db, ziel.lagerortId)) {
      return { ok: false, grund: "eingabe", text: ZIEL_UNGUELTIG_TEXT };
    }

    let gebucht = 0;
    db.transaction((tx) => {
      const quelle = { quelleTyp: "token" as const, quelleId: riegel.zugang.code };
      gebucht =
        ziel.art === "fahrzeug"
          ? /*
             * Der Verbrauch bleibt am FAHRZEUG und sinkt erst beim nächsten
             * Check. Beide Legs tragen `umlagerung`, damit Reporting und
             * Bestellvorschlag eine interne Verschiebung nicht als Verbrauch
             * missdeuten; die Charge wandert mit, damit das Fahrzeug die
             * Verfall-Herkunft behält.
             */
            umlagerung(tx, {
              artikelId: v.artikelId,
              menge: v.menge,
              vonOrten: handlagerOrte(tx),
              nachLagerortId: ziel.lagerortId,
              quelle,
              kommentar: null,
              referenz: `entnahme-ziel:${ziel.lagerortId}`,
            }).umgelagert
          : fefoAbbuchung(tx, {
              artikelId: v.artikelId,
              menge: v.menge,
              quelle,
              kommentar: null,
              referenz: null,
            }).gebucht;
    });

    /**
     * ⚠️ DER TEUERSTE ZUSTAND DER GANZEN TABELLE AUS §7.3: „ein 200, das lügt."
     *
     * FEFO bucht, was da ist — bei leerem Handlager sind das null Stueck. Der
     * Bestand macht daraus eine Erfolgsmeldung mit Haken („Entnahme gebucht:
     * 0 × Mullbinde", `HelferEntnahme.tsx:26-27`, `:55`), und die Helferin geht
     * mit leeren Haenden und einem gruenen Chip zum Fahrzeug.
     *
     * `gebucht === 0` ist deshalb ein FEHLERZWEIG, kein Erfolg — und zwar mit
     * dem Artikelnamen im Satz, weil der Server ihn hat und die Insel ihn sonst
     * raten muesste. Auflage A1 aus Teil 4, §6.3.
     */
    if (gebucht === 0) {
      const name =
        db.select({ name: artikel.name }).from(artikel).where(eq(artikel.id, v.artikelId)).get()
          ?.name ?? "diesem Artikel";
      return { ok: false, grund: "leer", text: leerText(name) };
    }

    revalidatePath(`/m/lagerbuch/a/${v.artikelId}`);
    revalidatePath("/m/lagerbuch/helfer");
    revalidatePath("/m/lagerbuch/verwaltung");
    return { ok: true, wert: { gebucht } };
  });
}
