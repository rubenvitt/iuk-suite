import { Card, Col, Row } from "antd";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SPACE } from "@/core/theme/tokens";
import { getDb, type DB } from "../../../../_db/client";
import { lagerorte } from "../../../../_db/schema";
import { ampelTon } from "../../../../_lib/format";
import {
  artikelListe,
  chargenJeArtikelAmLagerort,
  type ChargeZeile,
} from "../../../../_lib/lesepfade/artikel";
import {
  sollFuerFahrzeug,
  templateDetail,
  templateListeAktiv,
} from "../../../../_lib/lesepfade/fahrzeuge";
import { verfallFuerLagerort } from "../../../../_lib/lesepfade/verfall";
import { zugangsZiele } from "../../../../_lib/lesepfade/orte";
import { SCHRIFT } from "../../../../_lib/schrift";
import { einheitenartLabel } from "../../../../_lib/konstanten";
import { Chip } from "../../../../_ui/Chip";
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { ChecklisteKnopf } from "../ChecklisteKnopf";
import { CheckDurchfuehrenKnopf } from "../CheckDurchfuehrenKnopf";
import { AufladenDialog } from "./AufladenDialog";
import { EinheitenartWahl } from "./EinheitenartWahl";
import { FahrzeugAktivToggle } from "./FahrzeugAktivToggle";
import { FahrzeugReiter } from "./FahrzeugReiter";
import { SollEditor } from "./SollEditor";
import { TemplateVerknuepfung } from "./TemplateVerknuepfung";
import { VerfallEditor, type VerfallAnzeigeZeile } from "./VerfallEditor";
import { PlombenEditor } from "./PlombenEditor";
import { WeitereAktionen } from "./WeitereAktionen";
import { blattAdresse } from "./reiter";
import { plombenFuerLagerort } from "../../../../_lib/lesepfade/plomben";
import { fmtDatumZeit } from "../../../../_lib/zeit";

export const dynamic = "force-dynamic";

function verfallZeilen(
  soll: ReturnType<typeof sollFuerFahrzeug>,
  verfall: ReturnType<typeof verfallFuerLagerort>,
  chargen: Map<string, ChargeZeile[]>,
): VerfallAnzeigeZeile[] {
  const jeArtikel = new Map<string, {
    artikelId: string;
    artikelName: string;
    faecher: string[];
    /* Je Artikel derselbe Wert an ALLEN seinen Soll-Positionen — der Bestand
     * haengt am (Lagerort, Artikel), nicht am Fach. */
    bestand: number;
    /* IDA-232 — die SUMME aller aktiven Positionen des Artikels, dieselbe
     * Rechnung wie „unter Soll" in `fahrzeugUebersicht`. */
    soll: number;
    einheit: string;
  }>();

  for (const position of soll) {
    if (position.entfernt) continue;
    const vorhanden = jeArtikel.get(position.artikelId);
    if (vorhanden) {
      if (!vorhanden.faecher.includes(position.fachLabel)) {
        vorhanden.faecher.push(position.fachLabel);
      }
      vorhanden.soll += position.soll;
      continue;
    }
    jeArtikel.set(position.artikelId, {
      artikelId: position.artikelId,
      artikelName: position.artikelName,
      faecher: [position.fachLabel],
      bestand: position.fahrzeugBestand,
      soll: position.soll,
      einheit: position.einheit,
    });
  }

  return Array.from(jeArtikel.values()).map((artikel) => {
    const eintrag = verfall.get(artikel.artikelId) ?? null;
    return {
      artikelId: artikel.artikelId,
      artikelName: artikel.artikelName,
      fachText: artikel.faecher.join(" · "),
      verfall: eintrag?.verfall ?? null,
      statusTon: eintrag ? ampelTon(eintrag.ampel) : null,
      statusText: eintrag?.text ?? null,
      // IDA-232 — aus der Quelle, nicht aus dem Ton (DRK-340, s. u.).
      abgelaufen: eintrag?.abgelaufen ?? false,
      bestand: artikel.bestand,
      soll: artikel.soll,
      einheit: artikel.einheit,
      chargen: chargen.get(artikel.artikelId) ?? [],
    };
  });
}

type VerfallKennzahlen = {
  abgelaufen: number;
  warnend: number;
  erfasst: number;
  sollArtikel: number;
};

/**
 * DIE KOPFZEILE ZÄHLT ÜBER `abgelaufen`, NICHT ÜBER DEN TON (DRK-340).
 *
 * ⚠️ `abgelaufen` und `ampel === "rot"` SIND NICHT DASSELBE (`domain/verfall.ts`):
 * eine abgelaufene Meldung ist immer rot, eine rote nicht immer abgelaufen. Wer
 * die Kacheln über `statusTon` aus `verfallZeilen` teilt, schiebt jede rote,
 * aber noch nicht abgelaufene Meldung in die linke Kachel — während die
 * Fahrzeugliste eine Ebene darüber dieselbe Meldung rechts zählt
 * (`lesepfade/fahrzeuge.ts`). Zwei Flächen, zwei Zahlen, und das Blatt
 * widerspräche genau der Liste, mit der es übereinstimmen soll. Das DTO an den
 * Editor trägt `abgelaufen` nicht — deshalb rechnet diese Funktion aus der
 * QUELLE und nicht aus den Anzeigezeilen.
 *
 * ⚠️ DIE BEIDEN ZAHLEN ÜBERSCHNEIDEN SICH NICHT, und die Reihenfolge der
 * Zweige stellt das sicher: eine abgelaufene Meldung zählt NUR links. Ein
 * `ampel !== "gruen"` ohne den `else` zählte sie in beiden, und die Summe wäre
 * stillschweigend zu groß.
 *
 * ⚠️⚠️ DIE ZWEI RECHNUNGEN LAUFEN ÜBER VERSCHIEDENE MENGEN, und das ist der
 * Kern der Sache — nicht eine Ungenauigkeit, die sich vereinheitlichen ließe:
 *
 *   die WARNZAHLEN über JEDE Meldung des Fahrzeugs,
 *   die ERFASSUNG nur über das AKTIVE SOLL.
 *
 * Eine Meldung darf einen Artikel betreffen, der nicht (mehr) im aktiven Soll
 * steht — ein Grabstein oder ein Artikel, der nie eine Sollposition hatte.
 * `fahrzeugUebersicht` rechnet genau so, und ihr Fixture schreibt es als
 * Absicht aus (`lesepfade/fahrzeuge.test.ts`: auf `rtw-1` kommt die einzige
 * abgelaufene Zahl von `a3`, das GAR KEINE Sollposition hat). Filtert man die
 * Warnzahlen auf das Soll, sagt die Liste „1 abgelaufen" und das Blatt
 * desselben Fahrzeugs „0" — der Widerspruch, gegen den dieses Ticket gebaut
 * ist, nur andersherum als vorher, und mit der Entwarnungskante darunter sogar
 * GRÜN. Umgekehrt darf die Erfassung die fremden Meldungen NICHT mitzählen,
 * sonst meldete ein Fahrzeug „3 von 2 erfasst".
 *
 * Wer das je vereinheitlichen will, bricht eine der beiden Aussagen; der
 * Paritätstest in `page.test.tsx` hält sie gegen `fahrzeugUebersicht`.
 */
export function verfallKennzahlen(
  soll: ReturnType<typeof sollFuerFahrzeug>,
  verfall: ReturnType<typeof verfallFuerLagerort>,
): VerfallKennzahlen {
  // ÜBER JEDE MELDUNG DES FAHRZEUGS — dieselbe Menge, die die Verfallsseite
  // zeigt und die Fahrzeugliste zählt.
  let abgelaufen = 0;
  let warnend = 0;
  for (const eintrag of verfall.values()) {
    if (eintrag.abgelaufen) abgelaufen += 1;
    else if (eintrag.ampel !== "gruen") warnend += 1;
  }
  // ÜBER DAS AKTIVE SOLL — Grabsteine sind kein Soll, und so kann die Quote
  // ihren Nenner nicht überschreiten. Die Erfassung trägt AUCH die grünen
  // Angaben: sie beantwortet „angesehen?", nicht „auffällig?".
  const imSoll = new Set(
    soll.filter((position) => !position.entfernt).map((position) => position.artikelId),
  );
  let erfasst = 0;
  for (const artikelId of imSoll) {
    if (verfall.has(artikelId)) erfasst += 1;
  }
  return { abgelaufen, warnend, erfasst, sollArtikel: imSoll.size };
}

/**
 * Trägt JEDER Artikel des aktiven Solls eine Angabe?
 *
 * ⚠️ NUR DANN GIBT DAS BLATT ENTWARNUNG. Zwei Nullen heißen „nichts
 * Auffälliges GEMELDET", nicht „nichts fällig" — der Check gibt das
 * Verfallsdatum ausdrücklich freiwillig ab, halb gepflegte Fahrzeuge sind der
 * Normalfall (Reviewbefund zu DRK-298). Eine grüne Kante auf einem Fahrzeug,
 * von dem niemand weiß, was drin liegt, ist genau die falsche Entwarnung,
 * gegen die die Liste ihr „im grünen Bereich" gatet — und das Blatt sagte sonst
 * Entwarnung, wo die Liste daneben schweigt.
 *
 * ⚠️ `sollArtikel === 0` IST NICHT VOLLSTÄNDIG. Ein Fahrzeug ohne Soll hat
 * nichts zu erfassen und verdient keine Aussage; „null von null" wäre
 * rechnerisch vollständig und fachlich eine Aussage über nichts.
 */
function vollstaendigErfasst(kennzahlen: VerfallKennzahlen): boolean {
  return kennzahlen.sollArtikel > 0 && kennzahlen.erfasst === kennzahlen.sollArtikel;
}

/**
 * Die Kante einer Verfallskachel: der eigene Warnton, sonst Entwarnung NUR bei
 * vollständiger Erfassung — andernfalls bleibt sie ungefärbt.
 */
function kachelTon(
  zahl: number,
  warnton: "rot" | "gelb",
  kennzahlen: VerfallKennzahlen,
): "rot" | "gelb" | "ok" | undefined {
  if (zahl > 0) return warnton;
  return vollstaendigErfasst(kennzahlen) ? "ok" : undefined;
}

/**
 * Zweite Zugriffslinie neben dem Verwaltungs-Layout: Eine bekannte Lager-ID
 * ist noch kein Fahrzeugblatt. Alle Client-Inseln erhalten nur serielle DTOs.
 */
export function fahrzeugInhalt(db: DB, id: string, jetzt: Date): ReactNode {
  const fahrzeug = db.select().from(lagerorte).where(eq(lagerorte.id, id)).get();
  if (!fahrzeug || fahrzeug.typ !== "fahrzeug") notFound();

  const soll = sollFuerFahrzeug(db, id);
  const aktivePositionen = soll.filter((position) => !position.entfernt);
  // DRK-340 zieht die Meldungen heraus, weil die Kennzahlen sie ein zweites Mal
  // brauchen; DRK-303 reicht zusaetzlich die Chargen je Artikel durch.
  const gemeldeterVerfall = verfallFuerLagerort(db, id, jetzt);
  const verfall = verfallZeilen(
    soll,
    gemeldeterVerfall,
    // EINE Aggregation fuer das ganze Blatt — `chargenMitRest` je Artikel waere
    // bei 60 Soll-Positionen 60 Vollaggregationen (§5.2.3).
    chargenJeArtikelAmLagerort(db, id),
  );
  const kennzahlen = verfallKennzahlen(soll, gemeldeterVerfall);
  const artikel = artikelListe(db).map((eintrag) => ({
    id: eintrag.id,
    name: eintrag.name,
    fach: eintrag.fach,
  }));
  const aktuelleVorlageDetail = fahrzeug.templateId
    ? templateDetail(db, fahrzeug.templateId)
    : null;
  const aktuelleVorlage = aktuelleVorlageDetail
    ? { id: aktuelleVorlageDetail.id, name: aktuelleVorlageDetail.name }
    : null;
  const vorlagen = templateListeAktiv(db);
  const faecher = new Set(aktivePositionen.map((position) => position.fachLabel)).size;
  // IDA-222. Der Zeitpunkt wird HIER formatiert — die Insel bekommt Text, kein `Date`.
  const plomben = plombenFuerLagerort(db, id, { nurAktive: false }).map((p) => ({
    id: p.id, bezeichnung: p.bezeichnung, fachLabel: p.fachLabel, aktiv: p.aktiv,
    gesetzt: p.nummer !== null && p.gesetztAt !== null
      ? `${p.nummer} · gesetzt ${fmtDatumZeit(p.gesetztAt)}`
      : null,
  }));

  return (
    <>
      <SeitenKopf
        titel={fahrzeug.name}
        /*
         * ⚠️ DIE ART STEHT IM KOPF, NICHT ERST BEI IHRER WAHL IM REITER
         * „EINSTELLUNGEN" (DRK-309). Wer das Blatt aufschlägt, muss wissen,
         * wovon er liest, bevor er eine Zahl darunter deutet — eine Kennung
         * allein sagt es nicht mehr, seit eine Tasche gar keine haben muss. Die
         * Wahl ändert die Angabe; hier steht sie.
         *
         * IDA-232: DASSELBE GILT FÜR DEN STATUS. Der Schalter liegt jetzt im
         * Reiter „Einstellungen"; ablesbar sein muss eine stillgelegte Einheit
         * trotzdem ohne Klick — sonst sucht jemand den Check-Knopf, den es an
         * ihr nicht gibt.
         */
        beschreibung={(
          <span style={{ display: "inline-flex", alignItems: "center", gap: SPACE.sm, flexWrap: "wrap" }}>
            <Chip ton="grau" zeichen={fahrzeug.einheitenart ?? undefined}>
              {einheitenartLabel(fahrzeug.einheitenart)}
            </Chip>
            {fahrzeug.kennung ? (
              <span style={SCHRIFT.mono}>{fahrzeug.kennung}</span>
            ) : null}
            {!fahrzeug.aktiv ? <Chip ton="grau">inaktiv</Chip> : null}
          </span>
        )}
        zurueck={{ titel: "Fahrzeuge und Taschen", href: "/verwaltung/fahrzeuge" }}
        aktionen={fahrzeug.aktiv ? (
          <>
            {/*
              IDA-232 — EINE HAUPTAKTION JE KOPF, und an einer aktiven Einheit
              ist es der Check. NUR AM AKTIVEN FAHRZEUG — DRK-305: die
              Check-Seite kennt nur aktive und führt für jedes andere auf die
              Fahrzeugwahl. Ein Knopf, der woanders landet, als er verspricht,
              ist schlimmer als keiner.
            */}
            <CheckDurchfuehrenKnopf
              fahrzeugId={fahrzeug.id}
              beschriftung="Check durchführen"
              primaer
            />
            {/*
              DRK-485 — MATERIAL AUFLADEN, von einem anderen Ort oder neu. Nur
              an der AKTIVEN Einheit, dieselbe Regel wie beim Check davor:
              die Action nimmt auf eine stillgelegte nichts mehr an, und ein
              Knopf, der immer abgewiesen wird, ist schlimmer als keiner.
            */}
            <AufladenDialog
              fahrzeugId={fahrzeug.id}
              einheitenart={fahrzeug.einheitenart}
              artikel={artikel}
            />
            {/* Der Druckbogen — seltener gebraucht, deshalb im Menü. */}
            <WeitereAktionen fahrzeugId={fahrzeug.id} />
          </>
        ) : (
          /*
            MIT `fahrzeugId` — und damit ausdruecklich AUCH fuer ein
            stillgelegtes Fahrzeug. `checklistenDaten` filtert `aktiv` nur,
            wenn gar keine Auswahl uebergeben wurde; wer hier steht, hat das
            Fahrzeug vor sich und meint genau dieses eine. An einer inaktiven
            Einheit ist der Druck die einzige Aktion — ein Menü mit einem
            einzigen Eintrag wäre ein Klick zu viel.
          */
          <ChecklisteKnopf
            fahrzeugId={fahrzeug.id}
            beschriftung="Checkliste drucken"
          />
        )}
      />

      {/*
        VIER KACHELN, UND DIE VIERTE IST DIE AUFGETEILTE DRITTE (DRK-340).

        Hier stand EINE Zahl „auffällige Verfallsmeldungen" aus abgelaufen UND
        bald ablaufend — dieselbe Vermischung, die DRK-298 eine Ebene darüber
        aus der Fahrzeugliste genommen hat. Die Liste sagte danach „1
        abgelaufen", das Blatt desselben Fahrzeugs „1 auffällige
        Verfallsmeldung": beides richtig, und die schärfere Auskunft ging genau
        dort verloren, wo man hinklickt, um zu handeln.

        ⚠️ ZWEI KACHELN, NICHT EINE MIT ZWEI ZAHLEN — die offene Frage des
        Tickets. Die Verwaltungsübersicht (`verwaltung/(arbeit)/page.tsx`)
        führt dieselbe Trennung für die Chargen längst als ZWEI `Kachel`n
        („Chargen bald fällig / kritisch" neben „abgelaufen — aussondern
        nötig"). Eine Kachel mit zwei Zahlen wäre ein drittes Muster für
        dieselbe Aussage im selben Modul.

        ⚠️ DIE BESCHRIFTUNGEN SIND WÖRTLICH DIE CHIPTEXTE DER FAHRZEUGLISTE
        („abgelaufen", „läuft ab"). Dieselbe Festlegung wie dort zwischen
        Filter- und Chiptext: zwei Namen für einen Zustand lassen den Leser
        einen dritten vermuten — und hier liegen die beiden Flächen einen Klick
        auseinander.

        ⚠️ `md={12}` STATT `md={8}`: vier Kacheln nebeneinander unterschreiten
        ab dem md-Umbruch die 190px, die `Kachel` als Untergrenze nennt. Zwei
        Reihen zu zweit ab 768px, vier nebeneinander erst ab xl.

        IDA-232 — DIE KACHELN FÜHREN HIN. „abgelaufen" und „läuft ab" öffnen
        die Bestandsliste mit genau diesem Filter, die beiden anderen das Soll.
        ⚠️ NUR MIT EINER ZAHL ÜBER NULL: ein Link auf eine leere Auswahl ist
        eine Sackgasse. Und eine Zahl, die eine Meldung ohne aktives Soll
        mitzählt (Grabstein, s. `verfallKennzahlen`), findet in der Liste keine
        Zeile — die Liste führt nur Soll-Artikel; die Verfallsseite der
        Verwaltung zeigt jede Meldung.
      */}
      <Row gutter={[SPACE.md, SPACE.md]} style={{ marginBlockEnd: SPACE.lg }}>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={aktivePositionen.length}
            beschriftung="Soll-Positionen"
            href={blattAdresse(fahrzeug.id, "soll")}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={faecher}
            beschriftung="Fächer"
            href={blattAdresse(fahrzeug.id, "soll")}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={kennzahlen.abgelaufen}
            beschriftung="abgelaufen"
            ton={kachelTon(kennzahlen.abgelaufen, "rot", kennzahlen)}
            href={kennzahlen.abgelaufen > 0
              ? blattAdresse(fahrzeug.id, "bestand", "abgelaufen")
              : undefined}
          />
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Kachel
            zahl={kennzahlen.warnend}
            beschriftung="läuft ab"
            ton={kachelTon(kennzahlen.warnend, "gelb", kennzahlen)}
            href={kennzahlen.warnend > 0
              ? blattAdresse(fahrzeug.id, "bestand", "laeuft-ab")
              : undefined}
          />
        </Col>
      </Row>

      {/*
        IDA-232 — DIE REITER. Tagesgeschäft vor Einrichtung: das Blatt öffnet
        auf Bestand und Verfall; Soll, Plomben und die Einstellungen der
        Einheit liegen daneben. Vorher stand alles untereinander, und bei einem
        großen Fahrzeug begann der Verfall erst nach rund 17 000px.
      */}
      <FahrzeugReiter
        reiter={[
          {
            schluessel: "bestand",
            titel: "Bestand & Verfall",
            // Dieselbe Zahl wie die Kachel — aus `verfallKennzahlen`.
            zusatz: kennzahlen.abgelaufen > 0 ? `${kennzahlen.abgelaufen} abgelaufen` : undefined,
            inhalt: (
              <VerfallEditor
                lagerortId={fahrzeug.id}
                eintraege={verfall}
                einheitenart={fahrzeug.einheitenart}
                // DRK-366 — dieselbe Liste, die die Action prüft: die Seite
                // bietet nichts an, was die Buchung danach verwirft.
                ruecklaufZiele={zugangsZiele(db).map(({ id: zielId, name }) => ({ id: zielId, name }))}
              />
            ),
          },
          {
            schluessel: "soll",
            titel: "Soll",
            zusatz: String(aktivePositionen.length),
            inhalt: <SollEditor fahrzeugId={fahrzeug.id} positionen={soll} artikel={artikel} />,
          },
          {
            schluessel: "plomben",
            titel: "Plomben",
            zusatz: plomben.length > 0 ? String(plomben.filter((p) => p.aktiv).length) : undefined,
            inhalt: (
              <Card>
                <PlombenEditor
                  lagerortId={fahrzeug.id}
                  plomben={plomben}
                  faecher={[...new Set(aktivePositionen.map((position) => position.fachLabel))]
                    .sort((a, b) => a.localeCompare(b, "de"))}
                />
              </Card>
            ),
          },
          {
            schluessel: "einstellungen",
            titel: "Einstellungen",
            inhalt: (
              <>
                <h2 style={{ ...SCHRIFT.abschnitt, marginBlockStart: 0, marginBlockEnd: SPACE.sm }}>
                  Art
                </h2>
                <Card>
                  <EinheitenartWahl
                    id={fahrzeug.id}
                    einheitenart={fahrzeug.einheitenart}
                  />
                </Card>

                <h2 style={{ ...SCHRIFT.abschnitt, marginBlockStart: SPACE.xl, marginBlockEnd: SPACE.sm }}>
                  Vorlage
                </h2>
                <Card>
                  <TemplateVerknuepfung
                    fahrzeugId={fahrzeug.id}
                    aktuelleVorlage={aktuelleVorlage}
                    vorlagen={vorlagen}
                    hatPositionen={aktivePositionen.length > 0}
                    einheitenart={fahrzeug.einheitenart}
                  />
                </Card>

                <h2 style={{ ...SCHRIFT.abschnitt, marginBlockStart: SPACE.xl, marginBlockEnd: SPACE.sm }}>
                  Status
                </h2>
                <Card>
                  <FahrzeugAktivToggle
                    id={fahrzeug.id}
                    name={fahrzeug.name}
                    aktiv={fahrzeug.aktiv}
                    // DRK-309: die Rückfrage vor dem Löschen nennt dieselbe Art
                    // wie der Chip in der Kopfzeile.
                    einheitenart={fahrzeug.einheitenart}
                  />
                </Card>
              </>
            ),
          },
        ]}
      />
    </>
  );
}

export default async function FahrzeugBlatt({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return fahrzeugInhalt(getDb(), id, new Date());
}
