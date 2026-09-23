"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { artikel, chargen, lagerorte, lagerortVerfall } from "../_db/schema";
import { RIEGEL_TEXTE, type HelferErgebnis } from "../_lib/actionTypen";
import { BUCHUNG_MENGE_MAX } from "../_lib/grenzen";
import { bereichsAbweisung } from "../_lib/helferBereich";
import {
  kontoZugangOderNull, requireHelferSchreibend, type HelferZugang,
} from "../_lib/helferZugang";
import {
  ENTNAHMEBOX_EINRAEUMEN_KOMMENTAR, ENTNAHMEBOX_ID, ENTNAHMEBOX_KOMMENTAR,
  ENTNAHMEBOX_NAME, MONAT_REGEX, ausDieserEinheit, istOhneVerfall,
} from "../_lib/konstanten";
import { fmtVerfall } from "../_lib/format";
import { restJeChargeFuerArtikelAnOrt } from "../_lib/lesepfade/bestand";
import { zugangsZiele } from "../_lib/lesepfade/orte";
import { revalidiereBestand } from "../_lib/revalidierung";
import { abgeleseneCharge } from "../_lib/schreibpfade/abgeleseneCharge";
import {
  raeumeVerfallAmLeerenOrt, verfallFolgtDemMaterial,
} from "../_lib/schreibpfade/lagerortVerfall";
import { umlagerungVonOrt } from "../_lib/schreibpfade/umlagerung";
import { EINRAEUMEN_PRAEFIX, ENTNAHMEBOX_PRAEFIX } from "../_lib/vorgang";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { journalQuelle, zugangsAkteur } from "../_lib/zugangHerkunft";

/**
 * DIE BEIDEN RICHTUNGEN DER ENTNAHMEBOX — DRK-314 (hinein) und DRK-381
 * (heraus).
 *
 * ⚠️ SIE STEHEN IN EINER DATEI, UND DIE PROBE DAFUER IST DER GETEILTE
 * SCHREIBPFAD, NICHT DIE AEHNLICHE FLAECHE. Hin- und Rueckweg teilen sich
 * `umlagerungVonOrt`, die Box-Riegel (gibt es die Zeile, ist sie ein Lager?)
 * und die Regel „nicht gedeckt heisst abweisen, nicht kappen". Zwei Dateien
 * dafuer waeren zwei Orte fuer dieselben Invarianten — dieselbe Festlegung,
 * mit der `buchung.ts` fuenf Buchungswege zusammenhaelt (H7).
 *
 * ⚠️ IHRE RIEGEL SIND VERSCHIEDEN, und das ist kein Widerspruch dazu, sondern
 * eine fachliche Aussage: in die Kiste legt die HELFERIN am Fahrzeug
 * (`requireHelferSchreibend`, traegt Kaertchen UND Konto), eingeraeumt wird vom
 * Gruppenfuehrer (`requireLagerbuchAdmin`, also angemeldetes Konto in der
 * Lagerbuch-Gruppe). Die Begruendung steht je Action.
 *
 * ── VOM FAHRZEUG IN DIE ENTNAHMEBOX — DRK-314 ──────────────────────────────
 *
 * Der Vorgang, den es bisher gar nicht gab: Material verlaesst eine Einheit,
 * OHNE verbraucht oder entsorgt zu sein. Bis hierher kannte das Modul dafuer
 * zwei Wege, und keiner passt:
 *
 *  * `aussondernVomLagerort` bucht eine `korrektur` mit negativer Menge — das
 *    Material ist danach nirgends. Richtig fuer Abgelaufenes, falsch fuer fuenf
 *    zu viel mitgenommene Kuehlkompressen, die in der Halle auf dem Tisch
 *    liegen.
 *  * Der Fahrzeug-Check gleicht den Bestand auf den gezaehlten Ist ab — auch
 *    das eine `korrektur`, mit demselben Ergebnis, und zusaetzlich einer, der
 *    viele Ursachen hat (verbraucht, verzaehlt, zu viel drauf). Deshalb ist
 *    DIES hier ein eigener Handgriff und keine Erweiterung des Checks:
 *    ein automatisches Umleiten des Ueberschusses buchte jeden EINSATZVERBRAUCH
 *    als Boxzugang.
 *
 * ── DIE RIEGELFRAGE ────────────────────────────────────────────────────────
 *
 * ⚠️ `requireHelferSchreibend` UND NICHT `requireLagerbuchAdmin`, obwohl die
 * Verwaltung dieselbe Action ruft. Der Riegel traegt BEIDE Herkuenfte
 * (`_lib/helferZugang.ts`): das Kaertchen am Fahrzeug UND das angemeldete
 * Lagerbuch-Konto, und er probiert in dieser Reihenfolge. Die Verwaltungsseite
 * kommt damit ueber den Konto-Zweig durch — dieselbe EINE Rechtestufe, die auch
 * `/verwaltung` gatet.
 *
 * Der umgekehrte Bau waere zwei Actions fuer denselben Vorgang, und die zweite
 * bekommt die naechste fachliche Aenderung nicht mit. Die schaerfere Stufe
 * anzulegen ginge ueberdies am Ticket vorbei: wer das Material aus dem Fahrzeug
 * nimmt, ist die Helferin, und sie hat kein Konto.
 *
 * ⚠️ DIE HERKUNFT ENTSCHEIDET DIE JOURNALQUELLE, nicht die aufrufende Seite:
 * `journalQuelle(zugang)` schreibt beim Kaertchen den CODE mit
 * `quelleTyp: "token"`, beim Konto den OIDC-`sub` mit `"oidc"`. Ein festes
 * `"oidc" as const` hier schriebe eine Kaertchen-Buchung unter einer Kennung,
 * die es in `users` nicht gibt — und die Zeile ist append-only.
 *
 * ⚠️ `zugang` IST NICHT IMMER `riegel.zugang`, und das ist die eine Stelle, an
 * der diese Action mehr weiss als ihr Riegel: raeumt sie eine STILLGELEGTE
 * Einheit aus, traegt allein die Verwaltungserlaubnis den Vorgang — dann steht
 * auch die Verwaltung in der Zeile, nicht das Kaertchen, mit dem der Riegel
 * zufaellig aufgegangen ist. Die Herleitung steht am Vorabblick unten.
 */

const BoxSchema = z.object({
  /** Die Einheit, AUS der genommen wird — Fahrzeug oder Tasche. */
  fahrzeugId: z.string().min(1),
  artikelId: z.string().min(1),
  menge: z.coerce.number().int().positive("Menge muss größer als 0 sein").max(BUCHUNG_MENGE_MAX),
  /**
   * GENAU DIESE Charge, oder `null` fuer FEFO ueber die Einheit.
   *
   * ⚠️ BEIDE FAELLE SIND FACHLICH RICHTIG, und das ist der Grund, warum das Feld
   * optional ist statt Pflicht. Wer die Packung in der Hand haelt, liest ihr
   * Verfallsdatum ab und waehlt DIESE Charge — beim UMRAEUMEN gilt FEFO nicht
   * (die Begruendung steht ausgeschrieben an `umlagerung.ts`). Wer sie nicht
   * unterscheiden kann, weil die Einheit nur eine fuehrt oder weil ihr
   * Chargenbestand ohnehin aus einem Check-Abgleich geraten ist
   * (`_lib/schreibpfade/korrektur.ts`), nimmt die aelteste. Eine Pflichtangabe
   * verlangte hier eine Genauigkeit, die die Daten nicht hergeben.
   */
  chargeId: z.string().min(1).nullish(),
});

export async function bucheInEntnahmebox(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<HelferErgebnis<{ gebucht: number }>> {
  // ERSTE ANWEISUNG, und der Rueckgabewert MUSS ausgewertet werden — dieselbe
  // Form und derselbe Grund wie in `checkAbschluss` und `bucheEntnahmeHelfer`:
  // ein `await requireHelferSchreibend(db)` ohne Pruefung ist typkorrekt,
  // lint-sauber und oeffnet diese Action fuer jeden. `guards.test.ts` haelt
  // fest, dass der Riegel hier steht.
  const riegel = await requireHelferSchreibend(db);
  if (!riegel.ok) {
    return { ok: false, grund: riegel.grund, text: RIEGEL_TEXTE[riegel.grund] };
  }
  /*
   * DER REGAL-CODE DARF HIER NICHT DURCH — DRK-406. Dieselbe Zeile und
   * derselbe Grund wie in `checkAbschluss`: die Kiste gehoert zum Fahrzeug,
   * nicht zum Regal. Sie steht VOR der Validierung, weil eine Absage nach einem
   * Teilschritt eine Absage waere, die schon etwas getan hat.
   *
   * ⚠️ SEIT DRK-417 NENNT DIE ZEILE IHREN BEREICH. Vorher lautete die Frage
   * „ist das der Regal-Code?" — und beantwortete damit ZWEI Flaechen mit einer
   * Pruefung. Das ging so lange gut, wie Box und Check dieselbe Karte hatten;
   * die Entnahmebox hat jetzt eine eigene, und die darf hier durch und beim
   * Check nicht. Eine gemeinsame Bedingung koennte das nicht mehr trennen.
   */
  const bereich = bereichsAbweisung(riegel.zugang, "box");
  if (bereich) return bereich;
  const geparst = BoxSchema.safeParse(eingabe);
  if (!geparst.success) {
    // ⚠️ `grund: "eingabe"`, NICHT `"netz"` (Betreiberentscheidung B4): die
    // Verbindung STEHT, sie hat gerade eine unbrauchbare Nutzlast geliefert.
    // `"netz"` entsteht ausschliesslich im `catch` des Clients.
    return {
      ok: false,
      grund: "eingabe",
      text: "Die Eingabe war unvollständig. Bitte die Seite neu laden und die Menge erneut eingeben.",
    };
  }
  const v = geparst.data;

  /*
   * ── DER VORABBLICK AUF DIE QUELLE ─────────────────────────────────────────
   *
   * Eine stillgelegte Einheit darf nur die Verwaltung ausraeumen (die
   * Begruendung steht an Riegel 1 unten). Die Erlaubnis dafuer kann NICHT am
   * `riegel` haengen: `requireHelferSchreibend` prueft das KAERTCHEN ZUERST und
   * steigt mit `herkunft: "token"` aus, sobald ein gueltiges Kaertchen-Cookie
   * da ist — auch bei einer Verwalterin, die daneben angemeldet ist.
   *
   * ⚠️ UND WER DIE ERLAUBNIS MITBRINGT, STEHT AUCH IN DER ZEILE (Codex-Review
   * zu PR #178, P1). Das ist der Grund fuer den zusaetzlichen Lesezugriff hier
   * oben statt einer Abfrage in der Transaktion: `withAuditContext` und
   * `journalQuelle` legen die Kennung VOR dem ersten Schreibvorgang fest. Ein
   * Ausraeumen, das allein die Verwaltungserlaubnis traegt, waere sonst im
   * Protokoll und im append-only-Journal auf den GEMEINSAMEN Zugangscode
   * gebucht — `zugangsAkteur` schreibt fuer das Kaertchen ausdruecklich
   * `auditAccessActor` („Gemeinsamer Zugangscode", identifiziert einen Zugang,
   * nie eine Person). Die Zeile bliebe fuer immer falsch, und zwar still.
   *
   * `kontoZugangOderNull` UND NICHT `istLagerbuchAdmin(await viewerOderNull())`
   * — es beantwortet dieselbe Frage, liefert aber den Zugang GLEICH MIT und
   * legt dabei die `users`-Zeile an (`merkeNutzer`). Ohne die zeigte das
   * Journal die rohe OIDC-Kennung statt des Klarnamens (`_db/quelle.ts`).
   *
   * ⚠️ NUR BEI STILLGELEGTER QUELLE, nicht immer. Eine gewoehnliche Buchung mit
   * Kaertchen bleibt beim Kaertchen — auch die einer angemeldeten Person. Wer
   * die Kennung IMMER auf das Konto zoege, traegt den Klarnamen jeder
   * Verwaltenden in jede Buchung, die sie am Fahrzeug mit der Karte macht,
   * waehrend die Buchung einer Kollegin ohne Konto daneben anonym bleibt. Die
   * Kennung wechselt genau dort, wo die zusaetzliche Erlaubnis greift.
   */
  const quellAktiv = db
    .select({ aktiv: lagerorte.aktiv })
    .from(lagerorte).where(eq(lagerorte.id, v.fahrzeugId)).get()?.aktiv;
  const verwaltung = quellAktiv === false ? await kontoZugangOderNull(db) : null;
  const zugang: HelferZugang = verwaltung ?? riegel.zugang;

  return withAuditContext(
    { actor: zugangsAkteur(zugang) },
    async (): Promise<HelferErgebnis<{ gebucht: number }>> => {
      const quelle = journalQuelle(zugang);

      let gebucht = 0;
      let fachFehler: string | null;
      try {
        fachFehler = db.transaction((tx): string | null => {
          /*
           * RIEGEL 1 — DIE QUELLE IST EINE EINHEIT.
           *
           * Ohne diese Probe entschiede der Fremdschluessel, und der laesst
           * JEDEN Lagerort klaglos durch: eine selbst gebaute Anfrage buchte
           * damit aus dem Handlager oder aus der Box selbst. Weder
           * `_lib/schreibpfade/umlagerung.ts` noch `fefoAbbuchung` pruefen das
           * nach — richtig so, sie erwarten einen validierten Aufrufer.
           *
           * ⚠️ `aktiv` WIRD NICHT VERLANGT — ABER NUR MIT KONTO (Codex-Review
           * zu PR #175). Eine stillgelegte Einheit ist genau die, die man
           * ausraeumt; das Ausraeumen ist aber Sache der Verwaltung, und die
           * Helferflaeche bietet stillgelegte Einheiten deshalb gar nicht an.
           *
           * Bis hierher stand das NUR in der Auswahlliste, und eine Server
           * Action ist ein eigener Einstiegspunkt: eine selbst gebaute Anfrage
           * mit Kaertchen raeumte eine ausserdienstliche Einheit aus, ohne dass
           * jemand aus der Verwaltung davon weiss.
           *
           * ⚠️ MEINE URSPRUENGLICHE BEGRUENDUNG TRUG NICHT: sie berief sich auf
           * `aussondernVomLagerort`, und der laeuft hinter
           * `requireLagerbuchAdmin` — dort ist „auch die stillgelegten" richtig,
           * WEIL nur die Verwaltung ihn ueberhaupt erreicht. Diese Action teilen
           * sich zwei Flaechen, also muss die Unterscheidung in die Action.
           *
           * ⚠️ GEPRUEFT WIRD DAS KONTO, NICHT DIE HERKUNFT DES RIEGELS
           * (Codex-Review zu PR #175, zweite Runde an dieser Stelle). Die erste
           * Fassung fragte `riegel.zugang.herkunft !== "konto"` — und lief in
           * eine Sackgasse: `requireHelferSchreibend` prueft das KAERTCHEN
           * ZUERST (`helferZugang.ts`) und gibt `token` zurueck, sobald ein
           * gueltiges Kaertchen-Cookie da ist. Eine Verwalterin, die vorher
           * irgendwann ein Kaertchen eingeloest hat, kam damit auf IHRER
           * EIGENEN Seite nicht mehr an die stillgelegten Einheiten, die genau
           * dort zum Ausraeumen stehen — und der Satz „Das Ausraeumen laeuft
           * ueber die Verwaltung" stand ihr entgegen, waehrend sie darin sass.
           *
           * ⚠️ GEFRAGT WIRD `verwaltung`, NICHT EIN ZWEITES MAL DAS KONTO, und
           * das ist die ganze Zusage aus dem P1 der Review zu PR #178: die
           * Erlaubnis und die Kennung, unter der gebucht wird, stammen aus
           * DERSELBEN Entscheidung dort oben. Eine zweite Abfrage hier koennte
           * ja sagen, waehrend `zugangsAkteur` und `journalQuelle` laengst auf
           * das Kaertchen festgelegt sind — und genau diese Zeile bliebe dann
           * fuer immer falsch.
           *
           * ⚠️ DIE VORABPROBE UND DIESE SIND ZWEI LESEZUGRIFFE, und dazwischen
           * kann sich `aktiv` in BEIDE Richtungen aendern. Nur die Probe hier
           * ist massgeblich — sie steht in der Transaktion —, die Kennung liegt
           * aber laengst fest. Also wird jede Abweichung ABGEWIESEN statt
           * gebucht, und zwar in beide Richtungen:
           *
           *   stillgelegt, `verwaltung === null`  → wurde inzwischen stillgelegt
           *   aktiv,       `verwaltung !== null`  → wurde inzwischen reaktiviert
           *
           * Die zweite Zeile ist der Befund P2 der Codex-Review zu PR #178, und
           * sie ist die unauffaelligere: die Buchung waere fachlich voellig in
           * Ordnung — eine gewoehnliche Abgabe aus einer aktiven Einheit —, nur
           * traegt sie den KLARNAMEN der Verwaltung statt des Kaertchens, weil
           * die Kennung aus der stillgelegten Lage stammt. Genau das Gegenteil
           * dessen, was der Vorabblick oben zusichert.
           *
           * ⚠️ EIN ZWEITER LESEZUGRIFF NACH DEM `await` LOEST DAS NICHT — er
           * verkleinert das Fenster und schliesst es nicht, denn auch er laege
           * vor der Transaktion. Massgeblich kann nur die Probe sein, die mit
           * dem Schreibvorgang im selben Vorgang steht.
           *
           * Beide Male laedt die Person neu und bucht erneut; die Gegenrichtung
           * hinterliesse eine append-only-Zeile mit falscher Kennung.
           *
           * ⚠️ UND DIE PROBE IST DABEI SCHAERFER GEWORDEN, nicht nur anders:
           * sie fragt nach der Lagerbuch-Gruppe statt nach „irgendein Konto".
           * Die erste Fassung liess eine angemeldete Person OHNE die Gruppe
           * durch; das war als Grenze benannt und ist mit diesem Schritt
           * erledigt. Der Riegel der Action bleibt unberuehrt — hier wird
           * NICHTS aufgesperrt, was er zugelassen hat, sondern nur eine
           * zusaetzliche Erlaubnis richtig zugeordnet.
           *
           * ⚠️ `einheitenart` FAEHRT MIT, OBWOHL DER SCHREIBPFAD SIE NICHT
           * BRAUCHT (dieselbe Lage wie in `aussondernVomLagerort`): sie traegt
           * allein die Meldungen unten, und die gibt die Insel WOERTLICH weiter
           * (§7.3). Stuende darin „Fahrzeug", widerspraeche der Satz dem Chip
           * „Tasche" in derselben Ansicht.
           */
          const von = tx
            .select({
              typ: lagerorte.typ,
              einheitenart: lagerorte.einheitenart,
              aktiv: lagerorte.aktiv,
            })
            .from(lagerorte).where(eq(lagerorte.id, v.fahrzeugId)).get();
          if (!von) return "Diese Einheit gibt es nicht mehr. Bitte die Seite neu laden.";
          if (!von.aktiv && !verwaltung) {
            // Der Satz nennt den WEG, nicht die Ursache: dass die Zeile
            // `aktiv = 0` traegt, hilft am Fahrzeug niemandem weiter.
            return "Diese Einheit ist außer Dienst. Das Ausräumen läuft über die Verwaltung.";
          }
          if (von.aktiv && verwaltung) {
            // Der Weg ist das Neuladen, und der Satz sagt auch warum — sonst
            // liest sich eine Ablehnung ohne erkennbaren Grund wie ein Fehler.
            return "Diese Einheit ist wieder in Dienst. Bitte die Seite neu laden und erneut buchen.";
          }
          if (von.typ !== "fahrzeug") {
            // NEUTRAL, und zwar nicht aus Vorsicht: die Zeile, die hierher
            // faellt, ist ein LAGER — sie hat gar keine Art. Der Satz spricht
            // ueber die Menge der erlaubten Quellen, nicht ueber eine
            // bestimmte Einheit.
            return "In die Entnahmebox kommt nur, was aus einem Fahrzeug oder einer Tasche stammt.";
          }

          /*
           * RIEGEL 2 — DIE BOX GIBT ES, UND SIE NIMMT AUF.
           *
           * Migration 0011 schreibt die Zeile, aber eine importierte
           * Alt-Datenbank kann sie nicht haben und jemand kann sie stillgelegt
           * haben. Ohne die Probe liefe die Buchung in einen Ort, den keine
           * Oberflaeche zeigt — das Material waere im Buch verschwunden, und
           * zwar still.
           */
          const box = tx
            .select({ typ: lagerorte.typ, aktiv: lagerorte.aktiv })
            .from(lagerorte).where(eq(lagerorte.id, ENTNAHMEBOX_ID)).get();
          if (!box || box.typ !== "lager") {
            return `Die ${ENTNAHMEBOX_NAME} ist nicht eingerichtet. Bitte der Verwaltung melden.`;
          }
          if (!box.aktiv) {
            return `Die ${ENTNAHMEBOX_NAME} ist stillgelegt und nimmt nichts mehr auf.`;
          }

          /*
           * RIEGEL 3 — DIE CHARGE GEHOERT ZU DIESEM ARTIKEL.
           *
           * Dieselbe Pruefung wie in `bucheZugang` und `bucheUmlagerung` (I5),
           * aus demselben Grund: eine manipulierte Anfrage buchte sonst gegen
           * den Bestand eines anderen Artikels. Die Deckungspruefung darunter
           * faengt das NICHT zuverlaessig mit ab — sie fragt nur nach dem Rest
           * DIESER Charge an DIESEM Ort.
           */
          if (v.chargeId) {
            const charge = tx.select({ artikelId: chargen.artikelId })
              .from(chargen).where(eq(chargen.id, v.chargeId)).get();
            if (!charge || charge.artikelId !== v.artikelId) {
              return "Diese Charge gehört nicht zu diesem Artikel. Bitte die Seite neu laden.";
            }
          }

          /*
           * ⚠️ DIE DECKUNGSPRUEFUNG STEHT VOR DER BUCHUNG, UND EINE TEILWEISE
           * UMLAGERUNG WIRD ABGELEHNT — nicht gekappt.
           *
           * `fefoAbbuchung` kappt STILL an der Verfuegbarkeit und meldet die
           * tatsaechlich gebuchte Menge nur im Rueckgabewert. Fuer eine ENTNAHME
           * ist das richtig: was nicht da ist, kann nicht entnommen werden. Fuer
           * diesen Vorgang ist es falsch, und zwar aus demselben Grund, den
           * `bucheUmlagerung` ausschreibt: die Person hat fuenf Stueck in die
           * Kiste gelegt, gebucht waeren drei, und die verbleibenden zwei
           * stuenden weiter auf der Einheit. Der Buchstand waere danach an
           * BEIDEN Orten falsch, und niemand bekaeme es gesagt.
           *
           * Der Rueckgabewert wird trotzdem unten noch einmal geprueft: die
           * Deckung hier und die Buchung dort lesen denselben Stand in
           * derselben Transaktion, aber ein Gleichlauf, der sich auf zwei
           * Stellen verteilt, ist genau der, den ein spaeterer Umbau trennt.
           */
          const rest = restJeChargeFuerArtikelAnOrt(tx, v.artikelId, v.fahrzeugId);
          /*
           * ⚠️ ZWEI ZAHLEN AUS DERSELBEN KARTE, UND SIE MEINEN VERSCHIEDENES —
           * dieselbe Aufteilung wie in `aussondernVomLagerort`:
           *
           *   `vorhanden` deckt die BUCHUNG: bei gewaehlter Charge nur DIESE.
           *   `gesamt`    ist der Bestand des ARTIKELS an der Einheit und die
           *               Bezugsgroesse der Verfallsfrage unten.
           */
          const gesamt = [...rest.values()].reduce((s, r) => s + (r > 0 ? r : 0), 0);
          const vorhanden = v.chargeId ? (rest.get(v.chargeId) ?? 0) : gesamt;
          if (vorhanden < v.menge) {
            const einheit = tx.select({ einheit: artikel.einheit }).from(artikel)
              .where(eq(artikel.id, v.artikelId)).get()?.einheit ?? "";
            // Die EINHEIT des Artikels, nicht ein erfundenes „Stück": das Modul
            // fuehrt sie als freien Text („Stk.", „Pkg.", „Paar"), und ein
            // erfundenes Wort in einer Fehlermeldung ist genau die Stelle, an
            // der jemand zu zaehlen anfaengt.
            const wo = v.chargeId ? "Von dieser Charge liegen" : "Es liegen";
            return `${wo} ${ausDieserEinheit(von.einheitenart)} nur ${vorhanden} ${einheit}`.trimEnd()
              + ". Es wurde nichts gebucht — bitte die Menge prüfen.";
          }

          const ergebnis = umlagerungVonOrt(tx, {
            artikelId: v.artikelId,
            menge: v.menge,
            /*
             * ⚠️ `…VonOrt` UND NICHT `…AusBereich`: genau diese Einheit, nicht
             * ihr Teilbaum. Eine Einheit hat heute keine Kinder — ein Bereich
             * holte sich die fehlende Menge morgen still von woanders.
             *
             * Seit DRK-354 sagt das der Typ und nicht mehr dieser Kommentar:
             * `vonOrt` nimmt eine ID, ein `Lagerbereich` wird hier abgelehnt.
             */
            vonOrt: v.fahrzeugId,
            nachLagerortId: ENTNAHMEBOX_ID,
            ...(v.chargeId ? { chargeId: v.chargeId } : {}),
            quelle,
            kommentar: ENTNAHMEBOX_KOMMENTAR,
            // ⚠️ DAS PRAEFIX KOMMT AUS `_lib/vorgang.ts` UND WIRD NICHT
            // ABGESCHRIEBEN — es wird beim Schreiben (hier) und beim Lesen der
            // Herkunft gebraucht, und zwei Literale liefen still auseinander.
            // `vorgang.test.ts` scannt dafuer den Quelltext; kein anderes Tor
            // sieht es.
            referenz: `${ENTNAHMEBOX_PRAEFIX}${v.fahrzeugId}`,
          });

          if (ergebnis.umgelagert < v.menge) {
            // Unerreichbar, solange die Deckungspruefung darueber steht — und
            // genau deshalb ein WURF und keine Meldung: waere er erreichbar,
            // stuende die Datenbank halb gebucht da, und der einzige richtige
            // Ausgang ist das Zuruecknehmen der ganzen Transaktion.
            throw new Error("Deckung und Buchung sind uneins");
          }
          /*
           * ── DIE VERFALLSANGABE WANDERT MIT (DRK-377) ──────────────────────
           *
           * ⚠️ DIESE STELLE HATTE VIER FASSUNGEN, UND DIE ERSTEN DREI WAREN
           * FALSCH. Wer sie wieder anfasst, sollte die Kette kennen
           * (Codex-Review zu PR #175, drei Runden, dann DRK-377):
           *
           * 1. URSPRUENGLICH wurde gar nichts geloescht. Befund: nach dem
           *    letzten Stueck meldeten Einheitenblatt und Verfallsliste den
           *    Artikel weiter als ablaufend, obwohl er in der Kiste liegt —
           *    `verfallFuerLagerort` liest `lagerort_verfall` OHNE
           *    Bestandsprobe. Richtig beobachtet.
           *
           * 2. DANN wurde beim Leerwerden geloescht. Gegenbefund: genau dort,
           *    wo die Kompensationszeile gebraucht wird, ist sie die EINZIGE
           *    Stelle mit dem gemeldeten Datum — ein Check legt Bestand, den er
           *    keiner Charge zuordnen kann, auf eine geratene Charge, und
           *    `postenAmOrt` las den Verfall ausschliesslich aus
           *    `chargen.verfall`. Loeschen machte aus einer Falschanzeige einen
           *    Datenverlust.
           *
           * 3. DANN wurde nur noch geloescht, wenn eine bewegte Charge ein
           *    echtes Datum traegt — als Beleg, dass nichts verloren geht. Auch
           *    das war falsch: `korrekturAufLagerort` waehlt beim Plus-Abgleich
           *    IRGENDEINE Charge des Artikels (`chargen` ohne Ortsfilter,
           *    absteigend nach `verfall`) — die geratene Charge kann 12/30
           *    sagen, waehrend der Check 10/26 gemeldet hat. Ein echtes Datum
           *    an der Charge beweist gar nichts.
           *
           * ⚠️ ALLE DREI SCHEITERTEN AN DERSELBEN SACKGASSE, und sie war keine
           * Eigenschaft dieser Action: die Box konnte einen gemeldeten Verfall
           * gar nicht FUEHREN. `lagerort_verfall` galt als soll-gebunden, und
           * die Box hat ausdruecklich kein Soll — also blieb nur die Wahl
           * zwischen einer veralteten Anzeige an der leeren Einheit und einem
           * verlorenen Datum. DRK-377 hat die Sackgasse aufgeloest, nicht die
           * Abwaegung gewonnen: seit dort ist die Bindung ans Soll eine Auflage
           * des EDITORS und keine der TABELLE
           * (`bereinigeVerfallOhneAktivesSoll`), und damit wandert die Angabe
           * schlicht mit dem Material.
           *
           * ⚠️ EIN AUFRUF UND NICHT ZWEI SCHRITTE HIER (Codex zu PR #194, P2).
           * `verfallFolgtDemMaterial` traegt die Meldung an den Zielort UND
           * raeumt sie am Quellort ab, sobald dort nichts mehr liegt — in
           * dieser Reihenfolge, weil der erste Schritt die Quellzeile liest.
           * Die Regel steht dort, weil diese Action nicht die einzige Stelle
           * ist, die Material in die Box bucht: der lokale Seed tut es ueber
           * `umlagerungVonOrt` direkt und stand an zwei Zeilen hier vorbei.
           *
           * ⚠️ UEBERNOMMEN WIRD BEI JEDER MENGE, NICHT ERST BEIM LETZTEN
           * STUECK, und das ist eine bewusste Ueberwarnung. Die Meldung haengt
           * am ARTIKEL, nicht an einer Charge („das frueheste Datum, das an
           * diesem Ort auf einer Packung steht") — welche Packung das Datum
           * trug und ob gerade SIE in die Kiste gewandert ist, weiss niemand.
           * Die Kiste bekommt das Datum also auch dann, wenn die fruehe Packung
           * an der Einheit geblieben ist. Die Gegenrichtung waere, in der Kiste
           * Material ohne Hinweis liegen zu lassen, fuer das ein Datum gemeldet
           * war — genau der Befund dieses Tickets.
           *
           * ⚠️ WAS DIESE STELLE NICHT LOESEN KANN: die Zeile der BOX wieder
           * loszuwerden. Es gibt heute keinen Weg, Bestand aus der Box
           * herauszubuchen (`aussondernVomLagerort` nimmt nur Einheiten, diese
           * Action nimmt die Box nicht als Quelle), also kann sie auch nicht
           * leerlaufen — DRK-313 hat die Box ausdruecklich draussen gelassen.
           * Mit dem Auffuellen AUS der Box (DRK-381) kommt der Weg, und mit ihm
           * die Pflicht, die Angabe dort abzuraeumen, sobald das letzte Stueck
           * aus der Kiste ist. Die Box hat keinen Verfall-Editor; eine Zeile,
           * die niemand mehr wegnehmen kann, waere ein Dauerposten in der
           * Verfallsuebersicht.
           */
          verfallFolgtDemMaterial(tx, {
            vonLagerortId: v.fahrzeugId,
            nachLagerortId: ENTNAHMEBOX_ID,
            artikelId: v.artikelId,
          });

          gebucht = ergebnis.umgelagert;
          return null;
        });
      } catch {
        // ⚠️ EIN `catch` UM DIE TRANSAKTION, ANDERS ALS IN
        // `bucheEntnahmeHelfer`. Dort ist das Fehlen begruendet („ein
        // Datenbankfehler ist kein erwartbarer Betriebsfall"), und das gilt hier
        // genauso — aber der Wurf oben ist KEIN Datenbankfehler, sondern die
        // Notbremse eines Gleichlaufs. Ohne diesen Zweig schluege sie bis zur
        // Fehlerseite durch, und in Produktion stuende dort ein englischer Satz
        // mit `digest` (Falle 66) statt einer Zeile am Formular.
        return {
          ok: false,
          grund: "eingabe",
          text: "Die Buchung wurde nicht gespeichert. Bitte die Seite neu laden und es erneut versuchen.",
        };
      }

      if (fachFehler !== null) return { ok: false, grund: "eingabe", text: fachFehler };

      /*
       * ⚠️ HIER STANDEN BIS DRK-374 VIER PFADE — die beiden Box-Flaechen, das
       * Einheitenblatt und die Verwaltungsuebersicht. Die Abgabe an der Box ist
       * eine Umlagerung und damit ein Bestandsschreiber wie jeder andere; sie
       * nimmt deshalb die modulweite Liste. Das Einheitenblatt traegt seine
       * Kennung in der URL und kommt ueber das Muster
       * `verwaltung/fahrzeuge/[id]` dazu — ein Pfad ohne sie traefe die Seite
       * nicht.
       *
       * ⚠️ DRK-377 HAT DIESE STELLE VORUEBERGEHEND AUF SIEBEN HANDGEPFLEGTE
       * PFADE GEBRACHT, und der Merge von DRK-374 loest genau das wieder auf.
       * Der Grund war echt: seit DRK-377 schreibt diese Action
       * `lagerort_verfall` — sie traegt die Meldung in die Box und raeumt sie
       * an der leeren Einheit ab —, also veralten zusaetzlich die
       * Verfallsuebersicht, die Einheitenliste und die Einraeumflaeche. Alle
       * drei stehen in `BESTANDSFLAECHEN`; eine eigene Zeile waere jetzt nicht
       * falsch, nur doppelt. Die Lehre der beiden Tickets ist dieselbe, aus
       * zwei Richtungen: eine Flaeche fehlt in einer handgepflegten Liste
       * IMMER, und sie meldet sich nie von selbst.
       *
       * ⚠️ `force-dynamic` AUF DER SEITE HILFT DAGEGEN NICHT. Es schaltet den
       * vollen Routen-Cache ab, nicht den Router-Cache im Browser: eine
       * vorgeladene oder gerade verlassene Seite kommt weiter aus ihm, bis sie
       * jemand vollstaendig neu laedt. Genau diese Annahme war die Luecke.
       */
      revalidiereBestand();
      return { ok: true, wert: { gebucht } };
    },
  );
}

/**
 * AUS DER ENTNAHMEBOX IN EINEN SCHRANK — DRK-381, der Weg ZURUECK.
 *
 * Die zweite Haelfte von DRK-313: dessen User Story sagt woertlich „das
 * Handlager neu aufzufuellen ODER AUS DER BOX mit Dingen aufzufuellen, die zu
 * viel waren". Der zweite Teil war zurueckgestellt, weil er die Kiste
 * voraussetzte.
 *
 * ── DIE FALLE, DIE HIER AM TEUERSTEN IST ───────────────────────────────────
 *
 * ⚠️ DAS IST EINE UMLAGERUNG, KEIN WARENEINGANG — und der naheliegende Griff
 * waere der falsche. `bucheAuffuellung` (`_actions/buchung.ts`) heisst
 * schliesslich „auffuellen" und traegt dieselbe Zielliste; sie bucht aber einen
 * `zugang`, und ein Zugang laesst Material ENTSTEHEN. Der Bestand in der Kiste
 * bliebe stehen, im Handlager kaeme neuer dazu — DIESELBEN TEILE ZWEIMAL IM
 * BUCH. Das Journal ist append-only; heilbar waere das nur mit einer
 * Gegenkorrektur, die selbst wieder eine Behauptung ist.
 *
 * Richtig ist derselbe Umlagerungspfad, den die Kiste in der Gegenrichtung
 * schon nutzt: zwei Legs, eine Referenz, die Charge wandert mit — und damit
 * die Verfallsangabe, auf die FEFO spaeter zugreift.
 *
 * ⚠️ SIE STEHT IN DIESER DATEI UND NICHT IN `buchung.ts`, und die Probe dafuer
 * ist der geteilte SCHREIBPFAD, nicht die aehnliche Flaeche: Hin- und Rueckweg
 * der Kiste teilen sich `umlagerungVonOrt`, die Box-Riegel (gibt es die Zeile,
 * ist sie ein Lager?) und die Deckungsregel „abweisen statt kappen". Die
 * Auffuellansicht teilt mit ihnen nur das Aussehen.
 *
 * ── DIE RIEGELFRAGE ────────────────────────────────────────────────────────
 *
 * ⚠️ `requireLagerbuchAdmin` UND NICHT `requireHelferSchreibend` — der
 * Unterschied zum Hinweg eine Datei weiter oben, und er ist fachlich. In die
 * Kiste legt die HELFERIN am Fahrzeug, sie hat kein Konto; EINGERAEUMT wird
 * vom Gruppenfuehrer („die Artikel werden anschliessend von einem
 * Gruppenfuehrer wieder in das Handlager einsortiert"). Das ist dieselbe eine
 * Stufe wie bei DRK-313: angemeldetes Konto in der Lagerbuch-Gruppe, KEINE
 * zweite Gruppe (die Begruendung steht ausgeschrieben an `bucheAuffuellung`).
 * Ein Kaertchen erreicht diese Action damit auf keinem Weg — und das ist eine
 * Zusage der ACTION, nicht ihrer Flaeche: eine Action-Id ist global.
 */
const EinraeumenSchema = z.object({
  artikelId: z.string().min(1),
  /**
   * ⚠️ PFLICHT, anders als beim Hinweg — und das ist die zweite Entscheidung
   * dieses Tickets.
   *
   * Beim ABLEGEN ist FEFO ein zulaessiger Rueckfall: wer die Packung nicht
   * unterscheiden kann, weil die Einheit nur eine fuehrt oder ihr
   * Chargenbestand aus einem Check-Abgleich geraten ist, nimmt die aelteste.
   * Beim EINRAEUMEN gibt es diesen Rueckfall nicht: die Kiste liegt offen vor
   * einem, die Charge steht auf dem Schirm, und genau ihre Verfallsampel
   * entscheidet, ob das Teil ueberhaupt zurueck in den Schrank geht oder in den
   * Muell. Eine FEFO-Vorgabe schriebe hier eine andere Charge ins Journal als
   * die physisch gewanderte — still (netto bleibt null, der Handlager-Bestand
   * stimmt) und wegen append-only nicht mehr zu heilen. Dieselbe Festlegung wie
   * in `bucheUmlagerung` (DRK-338) und aus demselben Grund.
   */
  chargeId: z.string().min(1),
  /**
   * ⚠️ TEILMENGEN SIND ERLAUBT — die dritte Entscheidung des Tickets. Eine
   * Charge aus der Kiste auf zwei Schraenke zu verteilen ist der Normalfall,
   * nicht die Ausnahme; ein „ganzer Posten oder gar nichts" zwaenge dazu,
   * erst alles in einen Schrank zu buchen und danach von dort weiter
   * umzulagern — zwei Vorgaenge im Journal fuer einen Handgriff.
   *
   * Der Deckel ist derselbe wie ueberall (`BUCHUNG_MENGE_MAX`): die fachliche
   * Grenze ist der Bestand, die technische diese Zahl.
   */
  menge: z.coerce.number().int().positive("Menge muss größer als 0 sein").max(BUCHUNG_MENGE_MAX),
  /**
   * PFLICHT, nicht optional — dieselbe Regel wie in `AuffuellSchema`: die
   * Handlager-Wurzel („Handlager (ohne Schrank)") ist eine ZEILE der Auswahl
   * und wird gewaehlt wie jeder Schrank. Ein fehlendes Feld ist deshalb keine
   * Vorgabe, sondern eine offene Entscheidung, und die bucht nicht.
   */
  zielLagerortId: z.string().min(1),
  /**
   * DRK-404 — DAS VON DER PACKUNG ABGELESENE DATUM. Die Flaeche fragt danach
   * nur, wenn die Box fuer den Artikel einen Verfall meldet und die gewaehlte
   * Charge ihn nicht traegt; sonst fehlt das Feld, und es bleibt beim
   * zweimaligen Tippen. Verlangt wird es in der Transaktion, nicht hier: ob
   * es gebraucht wird, weiss erst die Datenbank.
   */
  verfall: z.string().regex(MONAT_REGEX)
    .refine((m) => !istOhneVerfall(m)).optional(),
});

export type EinraeumWert = {
  eingeraeumt: number;
  ziel: string;
  /** Nur gesetzt, wenn das Material auf ein abgelesenes Datum umgebucht wurde. */
  abgelesen?: string;
};

export async function raeumeAusEntnahmebox(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<HelferErgebnis<EinraeumWert>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext(
    { actor: auditActor(viewer) },
    async (): Promise<HelferErgebnis<EinraeumWert>> => {
      const geparst = EinraeumenSchema.safeParse(eingabe);
      if (!geparst.success) {
        // `grund: "eingabe"`, NICHT `"netz"` (Betreiberentscheidung B4): die
        // Verbindung STEHT, sie hat gerade eine unbrauchbare Nutzlast geliefert.
        return {
          ok: false,
          grund: "eingabe",
          text:
            "Die Eingabe war unvollständig. Bitte die Seite neu laden und " +
            "Charge, Menge und Schrank erneut wählen.",
        };
      }
      const v = geparst.data;

      /*
       * ⚠️ DAS ZIEL WIRD VOR DER TRANSAKTION GEPRUEFT UND ALS SATZ BEANTWORTET
       * — dieselbe Form und derselbe Grund wie in `bucheAuffuellung`: die Lage
       * entsteht ohne Zutun (die Seite rendert, jemand legt in der Verwaltung
       * einen Schrank still, erst danach wird gebucht), sie ist also erwartbar
       * und kein Defekt.
       *
       * ⚠️ `zugangsZiele` UND NICHT `handlagerOrte`: die beiden beantworten
       * verschiedene Fragen. `handlagerOrte` ist der BESTANDSBEREICH und
       * enthaelt stillgelegte Schraenke ausdruecklich mit — genau dafuer legt
       * man einen still: um ihn auszuraeumen. `zugangsZiele` ist die Liste
       * derer, die noch AUFNEHMEN. Wer hier den Bereich pruefte, raeumte
       * Material in einen Schrank, den die Verwaltung gerade leert.
       *
       * Dieselbe Funktion, die die Flaeche anzeigt — die Seite bietet damit
       * nichts an, was die Buchung danach verwirft.
       */
      const ziel = zugangsZiele(db).find((o) => o.id === v.zielLagerortId);
      if (!ziel) {
        return {
          ok: false,
          grund: "eingabe",
          text:
            "Dieser Schrank nimmt kein Material mehr auf — er wurde stillgelegt " +
            "oder gelöscht. Bitte die Seite neu laden und einen anderen wählen.",
        };
      }

      let eingeraeumt = 0;
      let abgelesen: string | undefined;
      let fachFehler: string | null;
      try {
        fachFehler = db.transaction((tx): string | null => {
          /*
           * RIEGEL 1 — DIE BOX GIBT ES, UND SIE IST EIN LAGER.
           *
           * Dieselbe Probe wie beim Hinweg, mit EINEM Unterschied:
           *
           * ⚠️ `aktiv` WIRD HIER NICHT VERLANGT, und das ist kein Vergessen.
           * Eine stillgelegte Box nimmt nichts mehr AUF — genau das prueft der
           * Hinweg. Sie AUSZURAEUMEN muss trotzdem moeglich bleiben, sonst
           * strandet jedes Teil, das beim Stilllegen noch darin lag. Die
           * Verwaltungsseite sagt denselben Satz mit anderen Worten: „Was
           * bereits darin liegt, steht unverändert unten."
           */
          const box = tx
            .select({ typ: lagerorte.typ })
            .from(lagerorte).where(eq(lagerorte.id, ENTNAHMEBOX_ID)).get();
          if (!box || box.typ !== "lager") {
            return `Die ${ENTNAHMEBOX_NAME} ist nicht eingerichtet. Bitte der Verwaltung melden.`;
          }

          /*
           * RIEGEL 2 — DAS ZIEL NOCH EINMAL, IN DER TRANSAKTION.
           *
           * Die Probe oben und diese sind zwei Lesezugriffe, und dazwischen
           * kann sich `aktiv` aendern. Massgeblich ist die hier — sie steht mit
           * dem Schreibvorgang im selben Vorgang. Ohne sie entschiede der
           * Fremdschluessel, und der laesst JEDEN Lagerort klaglos durch: eine
           * selbst gebaute Anfrage raeumte damit in ein Fahrzeug ein oder
           * zurueck in die Box.
           *
           * ⚠️ DER TEILBAUM UND DAS `aktiv`-FLAG WERDEN BEIDE GEBRAUCHT, und
           * `zugangsZiele` deckt beides auf einmal ab — deshalb steht hier
           * dieselbe Funktion und nicht eine handgeschriebene Kombination aus
           * `handlagerOrte` und `ortStamm`. Zwei Schreibweisen fuer dieselbe
           * Auswahl liefen mit der Zeit auseinander.
           */
          if (!zugangsZiele(tx).some((o) => o.id === v.zielLagerortId)) {
            return "Dieser Schrank nimmt kein Material mehr auf. Bitte die Seite neu laden.";
          }

          /*
           * RIEGEL 3 — DIE CHARGE GEHOERT ZU DIESEM ARTIKEL (I5).
           *
           * Dieselbe Pruefung wie im Hinweg und in `bucheZugang`, aus
           * demselben Grund: eine manipulierte Anfrage buchte sonst gegen den
           * Bestand eines anderen Artikels. Die Deckungspruefung darunter
           * faengt das NICHT zuverlaessig mit ab — sie fragt nur nach dem Rest
           * DIESER Charge in DER BOX.
           */
          // `verfall` faehrt mit: er entscheidet unten, ob die gemeldete
          // Angabe der Box fallen darf (DRK-377).
          const charge = tx.select({
            artikelId: chargen.artikelId, verfall: chargen.verfall,
          }).from(chargen).where(eq(chargen.id, v.chargeId)).get();
          if (!charge || charge.artikelId !== v.artikelId) {
            return "Diese Charge gehört nicht zu diesem Artikel. Bitte die Seite neu laden.";
          }

          /*
           * ⚠️ NICHT GEDECKTE MENGEN WERDEN ABGEWIESEN, NICHT GEKAPPT
           * (Akzeptanzkriterium 4) — dieselbe Regel und dieselbe Begruendung
           * wie beim Hinweg und in `bucheUmlagerung`: `fefoAbbuchung` kappt
           * STILL an der Verfuegbarkeit. Fuer eine ENTNAHME ist das richtig,
           * fuer eine Umlagerung nicht: die Person hat fuenf Stueck in den
           * Schrank gelegt, gebucht waeren drei, und die verbleibenden zwei
           * stuenden weiter in der Kiste. Der Buchstand waere danach an BEIDEN
           * Orten falsch, und niemand bekaeme es gesagt.
           */
          const rest = restJeChargeFuerArtikelAnOrt(tx, v.artikelId, ENTNAHMEBOX_ID);
          const vorhanden = rest.get(v.chargeId) ?? 0;
          if (vorhanden < v.menge) {
            // Die EINHEIT des Artikels, nicht ein erfundenes „Stück": das Modul
            // fuehrt sie als freien Text („Stk.", „Pkg.", „Paar"), und ein
            // erfundenes Wort in einer Fehlermeldung ist genau die Stelle, an
            // der jemand zu zaehlen anfaengt.
            const einheit = tx.select({ einheit: artikel.einheit }).from(artikel)
              .where(eq(artikel.id, v.artikelId)).get()?.einheit ?? "";
            return `Von dieser Charge liegen in der ${ENTNAHMEBOX_NAME} nur `
              + `${vorhanden} ${einheit}`.trimEnd()
              + ". Es wurde nichts gebucht — bitte die Menge prüfen.";
          }

          /*
           * ── DAS DATUM AUF DER PACKUNG (DRK-404) ──────────────────────────
           *
           * Meldet die Box fuer diesen Artikel einen Verfall und traegt die
           * gewaehlte Charge ihn nicht (Pseudo-Charge „bis 12/99" aus einem
           * Check, oder eine geratene), waere die Meldung die EINZIGE Stelle,
           * die das Datum kennt. Bis DRK-404 blieb sie deshalb an der Box
           * stehen, auch an einer leeren. Jetzt wird gefragt: die Person haelt
           * die Packung in der Hand.
           *
           * ⚠️ OHNE ANTWORT WIRD NICHT GEBUCHT — kein Rueckfall auf „dann eben
           * ohne Datum". Die Flaeche schickt das Feld immer mit, wenn sie es
           * zeigt; fehlt es trotzdem, kam die Meldung nach dem Laden der Seite
           * (jemand hat gerade etwas in die Kiste gelegt).
           */
          const gemeldet = tx.select({ verfall: lagerortVerfall.verfall })
            .from(lagerortVerfall)
            .where(and(
              eq(lagerortVerfall.lagerortId, ENTNAHMEBOX_ID),
              eq(lagerortVerfall.artikelId, v.artikelId),
            ))
            .get();
          if (gemeldet && gemeldet.verfall !== charge.verfall && !v.verfall) {
            return `Für diesen Artikel ist in der ${ENTNAHMEBOX_NAME} der Verfall `
              + `${fmtVerfall(gemeldet.verfall)} gemeldet, die Charge trägt ein anderes Datum. `
              + "Bitte die Seite neu laden und das Datum auf der Packung angeben.";
          }
          /*
           * ⚠️ EINE ANTWORT GILT AUCH OHNE MELDUNG, und auch, wenn sie von der
           * Meldung abweicht: abgelesen ist genauer als gemeldet. Nur wenn sie
           * dem Datum der Charge entspricht, wandert die Charge unveraendert —
           * eine Umbuchung auf dasselbe Datum truege nichts ein.
           */
          const zielCharge = v.verfall && v.verfall !== charge.verfall
            ? abgeleseneCharge(tx, v.artikelId, v.verfall)
            : undefined;
          if (zielCharge) abgelesen = v.verfall;

          const ergebnis = umlagerungVonOrt(tx, {
            artikelId: v.artikelId,
            menge: v.menge,
            /*
             * ⚠️ `…VonOrt` UND NICHT `…AusBereich`: genau die Box, nicht ihr
             * Teilbaum. Die Box haengt heute frei (`parent_id IS NULL`, siehe
             * `ENTNAHMEBOX_ID`) — ein Bereich holte sich die fehlende Menge
             * morgen still von woanders. Seit DRK-354 sagt das der Typ.
             */
            vonOrt: ENTNAHMEBOX_ID,
            nachLagerortId: v.zielLagerortId,
            // DIE CHARGE WANDERT MIT (Akzeptanzkriterium 3) — und zwar GENAU
            // die gewaehlte, nicht die zuerst ablaufende. `umlagerungVonOrt`
            // traegt sie auf BEIDE Legs; damit bleibt die Verfallsangabe
            // erhalten, auf die FEFO im Handlager spaeter zugreift.
            chargeId: v.chargeId,
            ...(zielCharge ? { nachChargeId: zielCharge } : {}),
            quelle: { quelleTyp: "oidc", quelleId: viewer.sub },
            kommentar: ENTNAHMEBOX_EINRAEUMEN_KOMMENTAR,
            // ⚠️ DAS PRAEFIX KOMMT AUS `_lib/vorgang.ts` UND WIRD NICHT
            // ABGESCHRIEBEN — es ist die einzige Klammer zwischen den beiden
            // Legs, und zwei Literale liefen still auseinander.
            referenz: `${EINRAEUMEN_PRAEFIX}${v.zielLagerortId}`,
          });

          if (ergebnis.umgelagert < v.menge) {
            // Unerreichbar, solange die Deckungspruefung darueber steht — und
            // genau deshalb ein WURF und keine Meldung: waere er erreichbar,
            // stuende die Datenbank halb gebucht da, und der einzige richtige
            // Ausgang ist das Zuruecknehmen der ganzen Transaktion.
            throw new Error("Deckung und Buchung sind uneins");
          }

          /*
           * ── DIE GEMELDETE VERFALLSANGABE DER BOX (DRK-377) ────────────────
           *
           * Dieser Weg raeumt die Kiste aus und muss sich um ihre Meldung
           * kuemmern, denn die Box hat KEINEN Verfall-Editor: was hier stehen
           * bleibt, bekommt niemand mehr weg.
           *
           * ⚠️ SEIT DRK-404 FAELLT SIE SCHLICHT MIT DEM LETZTEN STUECK, wie an
           * jedem anderen Ort. Bis dahin hielt eine eigene Probe sie fest,
           * sobald Material ohne das gemeldete Datum gegangen war — noetig,
           * weil die Meldung dann die einzige Stelle war, die das Datum
           * kannte. Die Frage oben schliesst genau das aus: jedes Stueck, das
           * geht, traegt jetzt sein Datum selbst. Die Vorgeschichte (Codex zu
           * PR #194) steht in `schreibpfade/lagerortVerfall.ts`.
           */
          raeumeVerfallAmLeerenOrt(tx, ENTNAHMEBOX_ID, v.artikelId);

          eingeraeumt = ergebnis.umgelagert;
          return null;
        });
      } catch {
        // Wie beim Hinweg: der Wurf oben ist KEIN Datenbankfehler, sondern die
        // Notbremse eines Gleichlaufs. Ohne diesen Zweig schluege sie bis zur
        // Fehlerseite durch, und in Produktion stuende dort ein englischer Satz
        // mit `digest` (Falle 66) statt einer Zeile am Formular.
        return {
          ok: false,
          grund: "eingabe",
          text: "Die Buchung wurde nicht gespeichert. Bitte die Seite neu laden und es erneut versuchen.",
        };
      }

      if (fachFehler !== null) return { ok: false, grund: "eingabe", text: fachFehler };

      /*
       * ⚠️ HIER STANDEN BIS ZUM MERGE VON DRK-374 DREI AUFRUFE: die geteilte
       * Liste plus die beiden Box-Flaechen einzeln, mit der ausdruecklichen
       * Begruendung, dass die Box-Flaechen NICHT in die geteilte Liste
       * gehoerten — „eine Zugangsbuchung im Drawer der Verwaltung raeumte sie
       * sonst bei jedem Wareneingang mit aus".
       *
       * DIESE ABWAEGUNG IST MIT DRK-374 ANDERS ENTSCHIEDEN, und zwar bewusst:
       * ein Pfad zu viel kostet einen Rerender einer ohnehin dynamischen
       * Seite, ein Pfad zu wenig zeigt eine falsche Zahl auf einer
       * Arbeitsflaeche — und niemand meldet ihn, weil nichts bricht. Die
       * Kosten sind unsymmetrisch, also gewinnt die Obermenge. Ein Filter je
       * Schreiber war ausserdem genau die Bauform, die vier Review-Befunde in
       * Folge erzeugt hat; die Codex-Review zu PR #187 hat dafuer noch ein
       * zweites Beispiel geliefert.
       *
       * Beide Box-Flaechen stehen deshalb jetzt IN der Liste — sie lesen ueber
       * `einraeumPosten` bzw. `postenAmOrt` Buchungszeilen wie jede andere
       * Bestandsflaeche auch.
       *
       * ⚠️ DIE VERFALLSUEBERSICHT IST DAMIT EBENFALLS GEDECKT, und hier zaehlt
       * das mehr als anderswo: beim Einraeumen kann die Meldung der Box
       * wegfallen (DRK-377). Sie steht in `BESTANDSFLAECHEN`.
       */
      revalidiereBestand();
      // Der ZIELNAME kommt aus dem Server, nicht aus der Insel: dort laege er
      // als Anzeigewert vor, und ein umbenannter Schrank stuende im Beleg noch
      // unter seinem alten Namen.
      return {
        ok: true,
        wert: { eingeraeumt, ziel: ziel.name, ...(abgelesen ? { abgelesen } : {}) },
      };
    },
  );
}
