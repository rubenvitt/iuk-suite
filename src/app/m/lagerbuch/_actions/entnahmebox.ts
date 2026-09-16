"use server";
import { withAuditContext } from "@/core/audit/server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { artikel, chargen, lagerorte } from "../_db/schema";
import { RIEGEL_TEXTE, type HelferErgebnis } from "../_lib/actionTypen";
import { BUCHUNG_MENGE_MAX } from "../_lib/grenzen";
import {
  kontoZugangOderNull, requireHelferSchreibend, type HelferZugang,
} from "../_lib/helferZugang";
import {
  ENTNAHMEBOX_ID, ENTNAHMEBOX_KOMMENTAR, ENTNAHMEBOX_NAME, ausDieserEinheit,
} from "../_lib/konstanten";
import { restJeChargeFuerArtikelAnOrt } from "../_lib/lesepfade/bestand";
import { umlagerungVonOrt } from "../_lib/schreibpfade/umlagerung";
import { ENTNAHMEBOX_PRAEFIX } from "../_lib/vorgang";
import { journalQuelle, zugangsAkteur } from "../_lib/zugangHerkunft";

/**
 * VOM FAHRZEUG IN DIE ENTNAHMEBOX — DRK-314.
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
           * ⚠️ DIE VERFALLSANGABE DER EINHEIT BLEIBT STEHEN — AUCH WENN DIE
           * EINHEIT DAMIT LEER IST. Das ist die dritte Fassung dieser Stelle,
           * und die beiden davor waren falsch; wer sie wieder anfasst, sollte
           * die Kette kennen (Codex-Review zu PR #175, drei Runden).
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
           *    `postenAmOrt` liest den Verfall ausschliesslich aus
           *    `chargen.verfall`. Loeschen machte aus einer Falschanzeige einen
           *    Datenverlust.
           *
           * 3. DANN wurde nur noch geloescht, wenn eine bewegte Charge ein
           *    echtes Datum traegt — als Beleg, dass nichts verloren geht.
           *    Auch das war falsch, und das ist der Grund, warum hier jetzt
           *    NICHTS mehr passiert: `korrekturAufLagerort` waehlt beim
           *    Plus-Abgleich IRGENDEINE Charge des Artikels (`chargen` ohne
           *    Ortsfilter, absteigend nach `verfall`) — die geratene Charge
           *    kann also 12/30 sagen, waehrend der Check 10/26 gemeldet hat.
           *    Ein echtes Datum an der Charge beweist gar nichts.
           *
           * ⚠️ UND DIE ANGABE MITWANDERN ZU LASSEN GEHT NICHT:
           * `lagerort_verfall` setzt eine aktive Sollposition voraus
           * (`bereinigeVerfallOhneAktivesSoll`: „ohne mindestens eine aktive
           * Sollposition gibt es keinen pflegbaren Verfall"), und die Box hat
           * ausdruecklich KEIN Soll (`_lib/konstanten.ts`).
           *
           * Solange die Box einen gemeldeten Verfall nicht fuehren kann, sind
           * die beiden Befunde nicht zugleich zu erfuellen. Von den zwei
           * Fehlern ist die veraltete Anzeige der kleinere: sie ist sichtbar
           * und mit einem Handgriff zu korrigieren, ein geloeschtes
           * Verfallsdatum ist weder das eine noch das andere. Deshalb steht
           * hier bewusst KEIN Loeschen.
           *
           * Die Entscheidung dahinter ist eine Betreiberfrage und liegt als
           * DRK-377 auf dem Board — mit ihr faellt auch diese Stelle.
           */

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
       * ⚠️ VIER PFADE, UND DIE ERSTEN ZWEI SIND DIE BEIDEN FLAECHEN DIESES
       * TICKETS. Der dritte ist das Einheitenblatt (dessen Bestandszahlen sich
       * gerade geaendert haben), der vierte die Verwaltungsuebersicht. Der
       * Helferschirm traegt die Einheit in der URL und wird deshalb mit ihr
       * genannt — ein Pfad ohne sie traefe die Seite nicht.
       */
      revalidatePath("/m/lagerbuch/verwaltung/entnahmebox");
      revalidatePath("/m/lagerbuch/helfer/box");
      revalidatePath(`/m/lagerbuch/verwaltung/fahrzeuge/${v.fahrzeugId}`);
      revalidatePath("/m/lagerbuch/verwaltung");
      return { ok: true, wert: { gebucht } };
    },
  );
}
