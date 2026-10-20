import { redirect } from "next/navigation";
import { bereichsAbweisung, startPfad } from "../../_lib/helferBereich";
import { requireHelferSitzung } from "../../_lib/helferZugang";
import { sitzungsEtikett } from "../../_lib/zugangHerkunft";
import { fahrzeugListe, sollFuerFahrzeug } from "../../_lib/lesepfade/fahrzeuge";
import { geraeteFuerLagerort } from "../../_lib/lesepfade/geraete";
import { o2FlaschenFuerLagerort } from "../../_lib/lesepfade/o2";
import { verfallFuerLagerort } from "../../_lib/lesepfade/verfall";
import { letzterCheckZeitpunkt } from "../../_lib/lesepfade/checks";
import { kurzcheckVorlage, letzteCheckId } from "../../_lib/lesepfade/kurzcheck";
import { plombenFuerLagerort } from "../../_lib/lesepfade/plomben";
import { boxOrt } from "../../_lib/lesepfade/entnahmebox";
import { plombeDecktAb, plombenNummerNorm } from "../../_lib/plombe";
import { grundText } from "../../_lib/domain/stichprobe";
import { fmtDatumZeit } from "../../_lib/zeit";
import { verfallSchwellen } from "../../_lib/domain/verfall";
import { einWert } from "../../_lib/suchparameter";
import { getDb } from "../../_db/client";
import { HelferRahmen } from "../../_ui/HelferRahmen";
import { FahrzeugWahl } from "../../_ui/FahrzeugWahl";
import { CheckFlow } from "../../_ui/CheckFlow";
import { CheckArtWahl } from "../../_ui/CheckArtWahl";
import { ScanHinweis } from "../../_ui/ScanHinweis";
import { LeerZustand } from "../../_ui/LeerZustand";

/**
 * DER FAHRZEUG-CHECK — §7.9.1, DIE EINE STRUKTURAENDERUNG DES KAPITELS
 * (Falle 15).
 *
 * Heute baut diese Seite VIER `Object.fromEntries(fahrzeuge.map(...))`-
 * Woerterbuecher (`helfer/check/page.tsx:16,19-21,23,24-26`) und reicht sie
 * KOMPLETT an die Client-Komponente; `?fz=` wirkt nur als Vorauswahl (`:28`).
 * Damit wandert bei JEDEM Helfer-Aufruf die Soll-Bestueckung, Geraeteliste,
 * Flaschenliste und Verfallslage DER GESAMTEN ORGANISATION in den RSC-Payload —
 * auf ein privates Telefon, in einer Sitzung ohne Konto (§3.4.5).
 *
 * AB JETZT: ERST WAEHLEN, DANN LADEN.
 *
 * Host und Sitzungsriegel kommen aus `helfer/layout.tsx` (§7.4.3); der zweite
 * Aufruf von `requireHelferSitzung` hier holt `sitzungsetikett` und `laeuftAb`,
 * die ein Layout einer Seite nicht reichen kann (§7.8.2). Er ist billig —
 * dasselbe gecachte Handle, derselbe Primaerschluessel-Lookup.
 *
 * ⚠️ DIE ZUSAGE AUS TEIL 2 IST HIERMIT UEBERHOLT (Befund 38 des
 * Preflight-Scans). Der `Produces`-Block von T25
 * (`plans/2026-08-03-lagerbuch-modul-teil2.md:4977`) nennt `helfer/layout.tsx`
 * als einzigen Konsumenten von `requireHelferSitzung` („nur dort"). Teil 4 hat
 * drei: das Layout, `helfer/page.tsx` und diese Datei.
 *
 * ⚠️ KEIN `requireLagerbuchHost` — der Riegel ruft ihn INTERN als erste
 * Anweisung (§2.24). Falle 17 gilt trotzdem: dass diese Seite den Riegel
 * ueberhaupt SELBST ruft, ist die tragende Zusage, nicht die Route-Group. Das
 * ist der Grund, warum `page.test.tsx` sie OHNE Layout auf fremdem Host rendert.
 *
 * ⚠️ WAS AN JEDER `.map()`-ZEILE UNTEN HAENGT: die Lesepfade fuehren mehr
 * Felder, als der Check zeigt (`SollZeile` = `CheckPos` plus `sort`, `herkunft`,
 * `entfernt`; `GeraetZeile` traegt zwoelf Felder statt drei; `VerfallAmLagerort`
 * traegt `erfasstAt`, `ampel`, `abgelaufen`, `text`). Weil Arrays kovariant sind
 * und die Ueberschuss-Pruefung nur auf frischen Objektliteralen greift,
 * kompilierte ein Durchreichen OHNE diese `.map()` sauber — `typecheck` und
 * `build` saehen nichts, und die Verwaltungsfelder landeten still im Payload.
 */
export const dynamic = "force-dynamic";

export default async function CheckSeite({
  searchParams,
}: {
  /**
   * `gescannt` SETZT AUSSCHLIESSLICH DIE ORTSETIKETT-WEICHE — DRK-373. Sie
   * haengt es an, wenn ein gebundenes Kaertchen das Etikett einer ANDEREN
   * Einheit schlaegt (`_lib/ortZiel.ts`); `fz` traegt dann die Einheit, die
   * gilt, und `gescannt` die, die gemeint war.
   *
   * ⚠️ DER NAME STEHT AN ZWEI STELLEN UND WIRD AN EINER DRITTEN ZUSAMMENGEHALTEN.
   * Ein `searchParams`-Typ verlangt einen literalen Schluessel, eine geteilte
   * Konstante kann ihn also nicht ersetzen — benennt eine Seite ihn um, faellt
   * das in keinem Tor auf: die Seite liest still `undefined`, der Hinweis
   * bleibt einfach weg. `_lib/ortZiel.test.ts` liest deshalb BEIDE Dateien und
   * vergleicht den geschriebenen Parameter mit dem gelesenen.
   *
   * ⚠️ `string | string[]` IST DIE WAHRHEIT, NICHT EINE VORSICHTSMASSNAHME
   * (Codex-Befund P2 zu PR #186). Nexts `searchParams` ist
   * `string | string[] | undefined`, und eine engere Signatur hier aendert den
   * LAUFZEITWERT nicht — sie verbirgt ihn nur. Hier stand `gescannt?: string`,
   * und bei `?gescannt=b&gescannt=b` verglich die Zeile unten ein ARRAY mit
   * einer Id: sie traf nie, und der Hinweis verschwand STILL. Also genau der
   * Ausgang, gegen den dieses Ticket geschrieben ist. `typecheck` und `build`
   * bleiben dabei gruen; nur ein echter Abruf mit doppeltem Parameter zeigt es.
   * `_lib/suchparameter.ts` nimmt die ganze Form entgegen, mit derselben
   * Bedeutung, die `zaehlOrtAus` fuer den Zaehlort hat (DRK-337): derselbe Wert
   * mehrfach ist eine Wahl, zwei verschiedene sind ein Widerspruch.
   *
   * ⚠️ `fz` GEHT MIT, obwohl der Befund nur `gescannt` nannte. Es trug dieselbe
   * zu enge Angabe, und eine Datei, in der die eine Zeile die Wahrheit sagt und
   * die Zeile darueber nicht, laedt den naechsten Leser dazu ein, `fz` fuer
   * sicher zu halten. Die Wirkung aendert sich dabei fast nicht: ein
   * widersprechendes `?fz=a&fz=b` faellt weiter auf die Wahl zurueck (vorher,
   * weil das Array keine Id traf; jetzt, weil der Widerspruch keinen Wert
   * ergibt), und ein doppeltes `?fz=a&fz=a` waehlt jetzt `a`, statt still in
   * die Wahl zu fallen.
   */
  searchParams: Promise<{
    fz?: string | string[]; gescannt?: string | string[];
    /** IDA-222: Kurz- oder Vollcheck; fehlt er, fragt die Seite. */
    art?: string | string[];
  }>;
}) {
  const roh = await searchParams;
  const fz = einWert(roh.fz);
  const artWahl = einWert(roh.art);
  const gescannt = einWert(roh.gescannt);
  const db = getDb();
  const zugang = await requireHelferSitzung(db);

  /*
   * DER REGAL-CODE KOMMT HIER NICHT HEREIN — DRK-406, seit DRK-417 jeder
   * Code ohne den Bereich „check“.
   *
   * ⚠️ `redirect` UND NICHT `notFound`: die Seite EXISTIERT, sie ist fuer
   * diesen Zugang nur nicht gedacht. Eine 404 behauptete, es gebe sie nicht,
   * und schickte jemanden am Regal auf die Suche nach einem Tippfehler.
   *
   * ⚠️ ER STEHT DIREKT HINTER DEM SITZUNGSRIEGEL, vor jedem Lesepfad. Weiter
   * unten haette die Seite den Bestand einer Einheit bereits geladen und in den
   * RSC-Payload gelegt — auf ein privates Telefon, fuer einen Zugang, der ihn
   * nicht bekommen soll (§3.4.5).
   *
   * ⚠️ UND DAS IST ANZEIGE, KEIN RIEGEL. Die Durchsetzung steht in der Action,
   * die DIESELBE Funktion ruft; ohne sie waere dieser Redirect mit einem
   * selbstgebauten POST zu umgehen.
   *
   * ⚠️ DIE BEDINGUNG GEHT UEBER `bereichsAbweisung` UND NICHT UEBER
   * `zugang.reichweite` DIREKT, obwohl das hier kuerzer waere. Der Grund ist
   * der Protokolleintrag: die Funktion schreibt das `access_denied` mit dem
   * Akteur des Zugangs. Ein direkter Feldzugriff liesse die Umleitung STILL —
   * und still ist sie genau in dem Fall falsch, fuer den es sie gibt: jemand
   * tippt die Adresse, weil die Reiterleiste sie nicht anbietet.
   */
  /*
   * ⚠️ DAS ZIEL IST NICHT MEHR FEST `/helfer` (DRK-417): die Karte an der
   * Entnahmebox darf weder Entnahme noch Check, und die Artikelliste waere
   * fuer sie nur die naechste Umleitung. `startPfad` gibt denselben Schirm, auf
   * dem dieser Code auch nach dem Scan landet.
   */
  if (bereichsAbweisung(zugang, "check")) {
    redirect(startPfad(zugang.reichweite, zugang.fahrzeugBindung));
  }
  const etikett = sitzungsEtikett(zugang);

  const fahrzeuge = fahrzeugListe(db).filter((f) => f.aktiv);

  /*
   * DER EINSTIEG NACH DEM FAHRZEUG-SCAN — DRK-302.
   *
   * Wurde ein Fahrzeug-Kaertchen eingeloest, ist DIESES Fahrzeug der Kontext:
   * keine Wahl, und ein `?fz=` auf ein anderes Fahrzeug zaehlt nicht. Die
   * Bindung kommt aus der TOKEN-ZEILE (`_lib/helferZugang.ts`), nicht aus dem
   * Suchparameter — der ist Nutzereingabe und waere als Beleg wertlos.
   *
   * ⚠️ DAS IST EINE ANZEIGE-ENTSCHEIDUNG, KEIN RIEGEL, und der Unterschied ist
   * die ganze Abgrenzung des Tickets: „Fahrzeugfilterung ist nicht automatisch
   * eine neue Berechtigungsregel." Eine selbst gebaute Anfrage an
   * `checkAbschluss` erreicht weiterhin jedes Fahrzeug — Ansatzpunkt 2 dort
   * bleibt unangetastet, weil eine Durchsetzung zur PHYSISCHEN VERTEILUNG der
   * Etiketten passen muss und die ist unbeantwortet (offene Betreiberfrage 5,
   * §7.9.1). Wer hier „nur konsequent" den Riegel nachzieht, beantwortet sie im
   * Vorbeigehen.
   *
   * ⚠️ NICHT ueber `tokens.scope_lagerort_id` — die Spalte ist tot
   * (`_db/schema.ts`), kein Produktionspfad schreibt sie. Eine Begrenzung
   * darueber waere fuer JEDES heutige Kaertchen leer und damit wirkungslos,
   * ohne dass ein Tor etwas meldete. Gepflegt wird `zielTyp`/`zielId`, und
   * genau daraus liest `fahrzeugBindungAus` (`_lib/tokenZiel.ts`) — dieselbe
   * Funktion, aus der auch der Landepfad des Scans entsteht. Landung und
   * Begrenzung koennen so konstruktiv nicht auseinanderfallen.
   *
   * ⚠️ DIE SUCHE LAEUFT UEBER `fahrzeuge`, also ueber die bereits auf `aktiv`
   * gefilterte Liste (und `fahrzeugListe` haelt `typ`). Zeigt das Kaertchen auf
   * ein stillgelegtes oder geloeschtes Fahrzeug — `tokens.ziel_id` traegt
   * KEINEN Fremdschluessel —, bleibt `gebunden` undefined und die Seite faellt
   * auf die Wahl zurueck. Eine Sackgasse waere hier der teuerste Ausgang: die
   * Helferin steht im Fahrzeug und kaeme mit einem gueltigen Kaertchen
   * nirgendwohin. Zulaessig ist der Rueckfall NUR, weil die Bindung kein Riegel
   * ist.
   */
  /*
   * DER GEGENPOL — DRK-305: WER ANGEMELDET KOMMT, IST AN NICHTS GEBUNDEN.
   *
   * `fahrzeugBindung` ist beim Konto-Zugang durch den TYP `null`
   * (`_lib/helferZugang.ts`), nicht durch eine Abfrage hier. Der Unterschied ist
   * die Zusage des Tickets: die fahrzeugbezogene Ansicht nach dem Scan bleibt
   * unverändert (DRK-302), und daneben steht ein zweiter Einstieg, der die volle
   * Fahrzeugliste anbietet. Beide Wege laufen durch DIESELBE Seite — eine
   * zweite Check-Fläche in `/verwaltung` wäre eine zweite Wahrheit darüber, wie
   * ein Fahrzeug geprüft wird, und die erste Änderung, die nur eine von beiden
   * mitnimmt, fällt niemandem auf.
   *
   * ⚠️ `?fz=` GILT FÜR DAS KONTO GENAUSO WENIG WIE FÜR DAS KÄRTCHEN: die Zeile
   * darunter sucht in `fahrzeuge`, also in der bereits auf `aktiv` gefilterten
   * Liste. Eine geratene oder stillgelegte Id fällt still durch auf die Wahl.
   */
  const gebunden = zugang.fahrzeugBindung
    ? fahrzeuge.find((f) => f.id === zugang.fahrzeugBindung)
    : undefined;

  /*
   * DIE UEBERGANGENE EINHEIT — DRK-373, und sie ist der einzige Grund, warum
   * diese Seite `gescannt` ueberhaupt liest.
   *
   * Die Bindung schlaegt den Scan (Zeile darueber, DRK-302/DRK-312). Was bis
   * hierher fehlte, ist die AUSKUNFT darueber: die Person liest in der
   * Ueberschrift den Namen IHRER Einheit und muss selbst schliessen, dass das
   * nicht die ist, vor der sie steht. Bei „RTW 1" neben „RTW 2" merkt das
   * niemand — und gezaehlt wuerde der Inhalt der einen in das Buch der anderen.
   *
   * ⚠️ ZWEI WEGE, EIN SATZ, und das ist Absicht (offene Frage 3 des Tickets).
   * Ein getipptes `?fz=B` ist aus Serversicht von einem gescannten `/o/<B>`
   * nicht zu unterscheiden (`_lib/ortZiel.ts` schreibt das aus); derselbe
   * Vorrang gilt, also gehoert dieselbe Auskunft dazu.
   *
   * ⚠️ `gescannt` GILT NUR AUF DEM ETIKETTENWEG, UND DER IST AN SEINER FORM
   * ERKENNBAR — Codex-Befund P2 zu `4bb5135`. Hier stand `gescannt ?? fz`, und
   * die Begruendung dafuer stand schon richtig da: auf dem Etikettenweg traegt
   * `fz` bereits die GEBUNDENE Einheit, dort ist `fz` gar nicht die gemeinte.
   * Nur war das eine ANNAHME UEBER DIE ADRESSE und keine Bedingung — und BEIDE
   * Parameter sind Nutzereingabe. Gemessen an einem Kaertchen auf A:
   *
   *   ?fz=B&gescannt=A  →  gemeint = A = gebunden  →  KEIN Hinweis,
   *                        obwohl B uebergangen wurde. Der Hinweis liess sich
   *                        also per Adresse ABSCHALTEN — genau der Ausgang,
   *                        gegen den dieses Ticket geschrieben ist.
   *   ?fz=B&gescannt=C  →  gemeint = C  →  der Hinweis nennt C, und C kam in
   *                        dem Vorgang nie vor. Eine falsche Auskunft auf einer
   *                        Datenflaeche, schlimmer als das Schweigen von vorher.
   *
   * `ortZielPfad` schreibt `{ fz: fahrzeugBindung, gescannt: ort.id }` — auf dem
   * echten Weg ist `fz` also IMMER die gebundene Einheit. Das ist die Form, die
   * `vomEtikettenweg` prueft. Traegt `fz` etwas anderes, ist `fz` selbst die
   * uebergangene Einheit (der getippte Fall), und `gescannt` hat daneben nichts
   * zu sagen: eine zweite Behauptung ueber denselben Vorgang, fuer die es keine
   * Quelle gibt. Ein `?gescannt=` OHNE `fz` ergibt damit nichts — diese Form
   * entsteht nirgends, und sie behauptet keine uebergangene Einheit.
   *
   * ⚠️ NICHT MIT EINER RECHTEPRUEFUNG VERWECHSELN. Hier wird nichts gesichert:
   * geladen wird ohnehin nur die gebundene Einheit (Falle 15, unten), und die
   * Bindung schlaegt den Scan unabhaengig davon.
   *
   * ⚠️ UND ES IST EINE FORMPRUEFUNG, KEIN HERKUNFTSNACHWEIS — hier stand, es
   * werde geprueft, „ob die AUSKUNFT wahr ist", und das war zu viel behauptet
   * (Reviewrunde 4). `?fz=<gebunden>&gescannt=<andere>` erfuellt
   * `vomEtikettenweg` und ist von Hand schreibbar; ein Lesezeichen auf eine
   * frueher besuchte Check-Adresse traegt dieselbe Form ohne jede Absicht.
   * Was diese Bedingung leistet, ist genau eines: sie verhindert, dass ein
   * `gescannt` den Hinweis ABSCHALTET oder eine Einheit an die Stelle der
   * uebergangenen setzt. Dass der Satz daneben nichts Unbelegbares behauptet,
   * leistet nicht sie, sondern sein Wortlaut — `_ui/ScanHinweis.tsx` spricht
   * deshalb von der Adresse und nicht vom Scan, mit der Abwaegung gegen einen
   * signierten Marker in seinem Kopf.
   *
   * ⚠️ NUR EINE EINHEIT, DIE DIE SEITE AUCH KENNT. Die Suche laeuft ueber
   * `fahrzeuge`, also ueber die auf `aktiv` gefilterte Liste — dieselbe Menge,
   * gegen die `etikettOrt` (`_lib/lesepfade/ortEtiketten.ts`) ein Etikett
   * aufloest. Eine unbekannte, stillgelegte oder geloeschte Id ergibt KEINEN
   * Hinweis, und das ist die richtige Antwort statt eines halben: das
   * Akzeptanzkriterium verlangt, dass die Auskunft BEIDE Einheiten beim Namen
   * nennt, und einen Namen, den die Datenbank nicht hergibt, koennte nur der
   * Suchparameter selbst liefern — Nutzereingabe, ungeprueft auf dem Schirm.
   * Ueber `/o/<id>` ist der Fall ohnehin unerreichbar: dort faellt ein Etikett
   * ohne Ort schon vorher auf `/helfer`.
   *
   * ⚠️ OHNE BINDUNG AENDERT SICH NICHTS. `gebunden` ist die erste Bedingung:
   * wer ungebunden mit `?fz=` kommt, hat seine Einheit selbst gewaehlt, und es
   * wird ihm nichts uebergangen.
   */
  const vomEtikettenweg = fz !== undefined && fz === gebunden?.id;
  const gemeint = vomEtikettenweg ? gescannt ?? fz : fz;
  const uebergangen =
    gebunden && gemeint && gemeint !== gebunden.id
      ? fahrzeuge.find((f) => f.id === gemeint) ?? null
      : null;

  // Genau EIN aktives Fahrzeug → keine Wahl anbieten. KEIN `redirect()`: das
  // spart eine Anfrage und schreibt keinen Pfad, den jemand aeusser/innen
  // verwechseln koennte (§2.1 g, §7.11) — das gilt auch fuer ein `?fz=`, das
  // gegen die Bindung verliert: die Seite rendert das richtige Fahrzeug, die
  // URL bleibt stehen. Ein `?fz=` auf eine unbekannte oder stillgelegte Zeile
  // faellt hier still durch — sonst laedt eine geratene ID die Daten eines
  // stillgelegten Fahrzeugs.
  const gewaehlt =
    gebunden ??
    (fz ? fahrzeuge.find((f) => f.id === fz) : undefined) ??
    (fahrzeuge.length === 1 ? fahrzeuge[0] : null);

  /*
   * FUEHRT „ANDERE EINHEIT" UEBERHAUPT WOANDERSHIN? — DRK-376.
   *
   * Der Flow hat zwei Ausgaenge in die Wahl (Leerzustand und Abschlussschirm),
   * und beide zeigen auf `/helfer/check` — auf DIESE Seite, deren `gewaehlt`
   * oben dieselbe Einheit erneut liefert, sobald einer von ZWEI Gruenden gilt:
   *
   *   `gebunden`             — das Kaertchen zeigt auf DIESE Einheit und
   *                            gewinnt gegen jedes `?fz=` (DRK-302).
   *   genau EINE aktive      — die Wahl wird uebersprungen.
   *
   * Der erste war seit DRK-302 beruecksichtigt, der zweite nicht: dann lud der
   * Link denselben Schirm. Das sieht nicht kaputt aus — er funktioniert, die
   * Seite laedt, sie zeigt dasselbe —, und deshalb meldet es niemand.
   *
   * ⚠️ EINE ENTSCHEIDUNG FUER BEIDE AUSGAENGE, und deshalb steht sie HIER und
   * nicht in einem der beiden Zweige des Flows: sie stellen dieselbe Frage, und
   * zwei Rechnungen dafuer liefen beim naechsten Griff auseinander — genau das
   * fand die zweite Codex-Runde an der Entnahmebox, weil die erste nur den
   * Leerzustand geheilt hatte.
   *
   * ⚠️ DIE SEITE RECHNET, NICHT DIE INSEL. Nur sie kennt die Bindung der
   * Sitzung und die Zahl der aktiven Einheiten; der Flow bekaeme beides nur,
   * wenn man ihm mehr in den Payload legt, als er zeigt — gegen den ganzen
   * Schnitt dieser Datei (Falle 15).
   *
   * ⚠️ NICHT DIE BINDUNG LOCKERN: sie ist eine Anzeige-Entscheidung, kein
   * Riegel, aber sie im Vorbeigehen zu umgehen hiesse, die offene
   * Betreiberfrage 5 zu beantworten. Geaendert wird der WEG, nicht die Wahl.
   */
  const andereEinheitErreichbar = gebunden === undefined && fahrzeuge.length > 1;

  if (fahrzeuge.length === 0) {
    return (
      <HelferRahmen aktiv="check" reichweite={zugang.reichweite} sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        <LeerZustand
          // DRK-309: NEUTRAL, weil hier ueber ALLE Einheiten gesprochen wird
          // und es keine gibt — es gibt also auch keine Art zu nennen.
          titel="Keine Einheit angelegt"
          text={"Die Verwaltung muss zuerst ein Fahrzeug oder eine Tasche mit "
              + "Soll-Bestückung pflegen. Bis dahin gibt es hier nichts zu prüfen."}
          weg={{ href: "/helfer", text: "Zur Entnahme" }}
        />
      </HelferRahmen>
    );
  }

  if (!gewaehlt) {
    return (
      <HelferRahmen aktiv="check" reichweite={zugang.reichweite} sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        <FahrzeugWahl
          fahrzeuge={fahrzeuge.map((f) => ({
            id: f.id, name: f.name, kennung: f.kennung,
            // DRK-309: Die Zeile nennt die Art — eine Tasche traegt keine
            // Kennung, und ohne sie stuende in ihrer Meta-Zeile sonst nichts.
            einheitenart: f.einheitenart,
          }))}
        />
      </HelferRahmen>
    );
  }

  // ERST JETZT laden — und nur fuer dieses EINE Fahrzeug. Bei zehn Fahrzeugen
  // ist das eine Zehntelung des Payloads.
  //
  // Grabsteine (`entfernt`) sind auf dem Fahrzeug bewusst NICHT vorhanden →
  // nicht Teil des Checks (1:1 aus `helfer/check/page.tsx:15`).
  const sollZeilen = sollFuerFahrzeug(db, gewaehlt.id).filter((p) => !p.entfernt);
  const soll = sollZeilen.map((p) => ({
    id: p.id, fachLabel: p.fachLabel, artikelId: p.artikelId, artikelName: p.artikelName,
    einheit: p.einheit, handlagerFach: p.handlagerFach, soll: p.soll, sollMax: p.sollMax,
    fahrzeugBestand: p.fahrzeugBestand, handlagerBestand: p.handlagerBestand,
  }));
  // IDA-223: nur fuer die Stichprobe hier auf dem Server — der Flow bekommt
  // davon nur den Grund an der gezogenen Position.
  const immerZaehlen = new Set(sollZeilen.filter((p) => p.immerZaehlen).map((p) => p.id));
  const box = boxOrt(db);
  const geraete = geraeteFuerLagerort(db, gewaehlt.id).map((g) => ({
    id: g.id, typ: g.typ, name: g.name,
  }));
  // ⚠️ `letzterDruck` geht UNVERAENDERT weiter, `null` eingeschlossen. Ein
  // `?? 0` hier stellte den Fehlalarm wieder her, gegen den Teil 3 den Typ
  // nullbar gemacht hat: eine fehlende Messung wurde als „0 bar" gelesen →
  // Ampel rot → jemand lief los, um eine VOLLE Flasche zu tauschen.
  // `CheckFlow.tsx:826` loest den Null-Fall als „noch nicht gemessen" auf.
  const flaschen = o2FlaschenFuerLagerort(db, gewaehlt.id).map((f) => ({
    id: f.id, name: f.name, nennfuelldruckBar: f.nennfuelldruckBar, letzterDruck: f.letzterDruck,
    // DRK-308: der Wechselwert DIESER Flasche. Er reist als Zahl mit, weil der
    // Flow eine Client-Insel ist und einen Import aus einem Servermodul nicht
    // als Wert saehe (Falle 6).
    wechselAbProzent: f.wechselAbProzent,
  }));
  const verfall = Object.fromEntries(
    [...verfallFuerLagerort(db, gewaehlt.id)].map(([artikelId, e]) => [artikelId, e.verfall]),
  );

  /*
   * DER LETZTE CHECK — DRK-306, und er wird HIER formatiert, nicht in der Insel.
   *
   * ⚠️ EIN `Date` UEBER DIE RSC-GRENZE SERIALISIERT KLAGLOS und formatiert dann
   * in der Zone des GERAETS. Auf einem privaten Telefon im Urlaub stuende der
   * Zeitpunkt damit um Stunden daneben, ohne dass irgendein Tor etwas meldete —
   * dieselbe Zusage, die `verwaltung/fahrzeuge` seit DRK-298 woertlich traegt
   * („gibt kein Date an die Insel", `FahrzeugeListe.test.tsx`). `fmtDatumZeit`
   * ist zonenexplizit (`_lib/zeit.ts`, Entscheidung 26 b).
   *
   * ⚠️ `null` BLEIBT `null` UND WIRD NICHT ZU EINEM TEXT GEMACHT. „Noch nie
   * geprueft" ist eine andere Aussage als „vor langer Zeit"; welchen Satz die
   * Helferin dafuer liest, entscheidet die Insel an EINER Stelle.
   */
  const letzterCheck = letzterCheckZeitpunkt(db, gewaehlt.id);
  const letzterCheckText = letzterCheck === null ? null : fmtDatumZeit(letzterCheck);

  /*
   * KURZCHECK ODER VOLLCHECK — IDA-222.
   *
   * Ohne `?art=` fragt die Seite, sobald es etwas zu zaehlen gibt. Eine Einheit
   * ohne Soll-Bestueckung hat keine Stichprobe — dort IST jeder Check ein
   * Vollcheck, und eine Frage, deren Antwort nichts aendert, wird nicht gestellt.
   *
   * ⚠️ DIE STICHPROBE ENTSTEHT HIER, AUF DEM SERVER. Die Insel bekommt nur die
   * gezogenen Positionen samt Grund; gezogen wird mit einem Seed aus Einheit,
   * Tag und letztem Check (`_lib/lesepfade/kurzcheck.ts`) — ein Neuladen zieht
   * dieselbe Stichprobe, man kann sich keine leichtere erladen.
   */
  const plombenListe = plombenFuerLagerort(db, gewaehlt.id);
  const vorlage = soll.length > 0
    ? kurzcheckVorlage(db, {
        fahrzeugId: gewaehlt.id,
        soll: soll.map((p) => ({ ...p, immerZaehlen: immerZaehlen.has(p.id) })),
        plomben: plombenListe,
        letzterCheckId: letzteCheckId(db, gewaehlt.id),
      })
    : null;
  const art: "kurz" | "voll" | null = artWahl === "kurz" || artWahl === "voll"
    ? artWahl
    : vorlage ? null : "voll";

  if (art === null && vorlage) {
    return (
      <HelferRahmen aktiv="check" reichweite={zugang.reichweite} sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
        {uebergangen && <ScanHinweis gescannt={uebergangen} gezeigt={gewaehlt} />}
        <CheckArtWahl
          fahrzeug={{
            id: gewaehlt.id, name: gewaehlt.name, kennung: gewaehlt.kennung,
            einheitenart: gewaehlt.einheitenart,
          }}
          gescannt={vomEtikettenweg ? gescannt : undefined}
          kurz={{
            positionen: vorlage.auswahl.length,
            plomben: Object.keys(vorlage.versiegelt).length,
            abgedeckt: vorlage.abgedeckt,
            gesamt: vorlage.gesamt,
          }}
          plombenGesamt={plombenListe.length}
          letzterCheckText={letzterCheckText}
        />
      </HelferRahmen>
    );
  }

  /*
   * ⚠️ DIE ERWARTETE NUMMER REIST MIT, NORMALISIERT, UND WIRD NIE ANGEZEIGT.
   * Die Insel vergleicht sofort, damit ein geoeffnetes Fach noch VOR dem Zaehlen
   * in die Liste kommt; der Abschluss vergleicht noch einmal selbst. Wer den
   * Payload liest, kann sie finden — das ist hingenommen: eine Plombe ist
   * Nachweis gegen Versehen im Dienstalltag, keine Sicherung gegen Vorsatz.
   *
   * Im Kurzcheck kommen nur Plomben, die etwas bezeugen (gesetzt, mit Fach),
   * und die nie gesetzten — die zeigt der Schritt als Hinweis.
   */
  const plombenFuerFlow = (art === "kurz"
    ? plombenListe.filter((p) => plombeDecktAb(p) || p.nummer === null)
    : plombenListe
  ).map((p) => ({
    id: p.id, bezeichnung: p.bezeichnung, fachLabel: p.fachLabel,
    erwartet: art === "kurz" && plombeDecktAb(p) ? plombenNummerNorm(p.nummer!) : null,
  }));

  return (
    <HelferRahmen aktiv="check" reichweite={zugang.reichweite} sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
      {/*
        ⚠️ VOR DEM FLOW UND NICHT IN IHM — DRK-373. Der Flow ist eine
        Client-Insel mit vier Phasen, die jede ihren eigenen Kopf rendert; ein
        Hinweis darin muesste an vier Stellen stehen und faellt bei der
        naechsten Phase an einer davon weg (dieselbe Falle, gegen die
        `letzterCheckZeile` dort an JEDEM Schritt steht). Hier steht er EINMAL,
        ausserhalb der Insel — und bleibt damit ueber alle Phasenwechsel
        stehen, also auch dann noch, wenn der Abschluss gebucht wird. Genau
        dann zaehlt er: in diesem Moment landet der Inhalt in einem Buch.

        ⚠️ DIE GANZE `fahrzeugListe`-ZEILE GEHT HINEIN, UND DAS IST KEIN
        VERSEHEN. Jede `.map()` weiter unten haelt den RSC-Schnitt aus
        Falle 15 — `CheckFlow` ist eine Client-Insel, jedes Feld mehr reist
        ueber die Grenze auf ein privates Telefon. `ScanHinweis` ist eine
        SERVER Component: hier wird nichts serialisiert, ein `.map()` waere
        Ballast mit einer geliehenen Begruendung.

        `gewaehlt` IST hier `gebunden` — `uebergangen` ist nur dann gesetzt,
        und die `gewaehlt`-Zeile laesst die Bindung zuerst gewinnen. Die
        Komponente bekommt trotzdem `gewaehlt` und nicht `gebunden`: sie
        benennt, was der Schirm ZEIGT, und das ist `gewaehlt`.
      */}
      {uebergangen && <ScanHinweis gescannt={uebergangen} gezeigt={gewaehlt} />}
      <CheckFlow
        fahrzeug={{
          id: gewaehlt.id, name: gewaehlt.name, kennung: gewaehlt.kennung,
          // DRK-309: Die Strecke spricht danach von „der Tasche" statt vom
          // „Fahrzeug". `fahrzeugListe` reicht die Art mit heraus.
          einheitenart: gewaehlt.einheitenart,
        }}
        // Ob der Flow „Andere Einheit" ueberhaupt anbietet — und wohin der
        // Rueckweg im Leerzustand fuehrt. Ohne diese Angabe zeigte die Seite
        // zwar eine einzige Einheit, waere von der vollen Liste aber genau eine
        // Bedienung entfernt (§7.9.1, DRK-302), und bei genau einer aktiven
        // Einheit fuehrte der Weg im Kreis (DRK-376).
        andereEinheitErreichbar={andereEinheitErreichbar}
        // DRK-305: faellt der Zugang mitten im Check aus, entscheidet diese
        // Angabe den Rueckweg. Der Server kann die Herkunft dann nicht mehr
        // unterscheiden — diese Seite kennt sie.
        kontoZugang={zugang.herkunft === "konto"}
        art={art ?? "voll"}
        soll={soll}
        stichprobe={art === "kurz" && vorlage
          ? Object.fromEntries(vorlage.auswahl.map((t) => [t.id, grundText(t)]))
          : null}
        versiegelt={art === "kurz" && vorlage ? vorlage.versiegelt : {}}
        plomben={plombenFuerFlow}
        geraete={geraete}
        flaschen={flaschen}
        verfall={verfall}
        letzterCheckText={letzterCheckText}
        // IDA-247: nur eine Kiste, die aufnimmt, wird angeboten. Der Abschluss
        // prueft dasselbe noch einmal, falls sie waehrend des Checks wegfaellt.
        entnahmebox={box?.aktiv ? { name: box.name } : null}
        // Die Schwellen kommen vom SERVER; die Ampel im Zaehlschritt rechnet
        // der Client damit ueber `verfallStatus`, und das ist seit
        // Entscheidung 26 (b) zonenexplizit — Chip und Abschlusszahl koennen
        // konstruktiv nicht auseinanderfallen (§7.9.3).
        warn={verfallSchwellen()}
      />
    </HelferRahmen>
  );
}
