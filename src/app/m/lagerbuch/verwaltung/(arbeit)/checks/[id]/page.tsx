import { Alert, Col, Row } from "antd";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { SPACE } from "@/core/theme/tokens";
import { getDb } from "../../../../_db/client";
import { ampelTon } from "../../../../_lib/format";
import { einheitMeta } from "../../../../_lib/konstanten";
import { checkDetail, type CheckDetail } from "../../../../_lib/lesepfade/checks";
import { requireLagerbuchAdmin } from "../../../../_lib/zugang";
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import {
  CheckDetailTabellen,
  type AbgleichAnzeigeZeile,
  type DetailChipAnzeige,
  type FlascheAnzeigeZeile,
  type GeraetAnzeigeZeile,
  type NachfuellAnzeigeZeile,
  type VerfallAnzeigeZeile,
} from "./CheckDetailTabellen";

export const dynamic = "force-dynamic";

function chip(
  text: string,
  ton: DetailChipAnzeige["ton"],
  zeichen: DetailChipAnzeige["zeichen"] = null,
): DetailChipAnzeige {
  return { text, ton, zeichen };
}

export function checkDetailInhalt(check: CheckDetail): ReactNode {
  const abgleichZeilen: AbgleichAnzeigeZeile[] = check.artikel.map((artikel) => ({
    id: artikel.artikelId,
    artikel: artikel.artikelName,
    sollText: String(artikel.sollSumme),
    istText: String(artikel.istSumme),
    korrekturText: String(artikel.korrektur),
    nachgefuelltText: String(artikel.nachfuellGebucht),
    /**
     * ⚠️ DIE ROHZAHLEN REISEN MIT, WEIL DIE SPALTEN DANACH SORTIEREN. Die
     * Texte oben sind `String(…)`; als Zeichenkette sortiert stuende „10" vor
     * „2" und „-3" neben „-30". Angezeigt wird weiterhin nur der Text.
     */
    sollZahl: artikel.sollSumme,
    istZahl: artikel.istSumme,
    korrekturZahl: artikel.korrektur,
    nachgefuelltZahl: artikel.nachfuellGebucht,
    offenZahl: artikel.offen,
    offenChip: artikel.offen > 0
      ? chip(`fehlt ${artikel.offen}`, "rot", "warnung")
      : chip("vollständig", "ok"),
  }));
  const nachfuellZeilen: NachfuellAnzeigeZeile[] = check.positionen.map((position) => {
    const luecke = position.soll - position.ist;
    return {
      id: position.id,
      fachText: position.fachLabel,
      artikelText: position.artikelName,
      einheitText: position.einheit,
      sollText: String(position.soll),
      istText: String(position.ist),
      // Rohzahlen fuer die Sortierung, s. `abgleichZeilen`.
      sollZahl: position.soll,
      istZahl: position.ist,
      lueckeZahl: luecke,
      lueckeChip: luecke > 0
        ? chip(`${luecke} fehlten`, "rot", "warnung")
        : chip("vollständig", "ok"),
    };
  });
  const geraeteZeilen: GeraetAnzeigeZeile[] = check.geraete.map((geraet) => {
    const zustandTon: DetailChipAnzeige["ton"] = geraet.zustand === null
      ? "grau"
      : geraet.zustand === "Defekt"
        ? "rot"
        : geraet.zustand === "Gebrauchsspuren"
          ? "gelb"
          : geraet.zustand === "In Ordnung"
            ? "ok"
            : "grau";
    return {
      id: geraet.geraetId,
      name: geraet.name,
      vorhandenChip: geraet.vorhanden
        ? chip("vorhanden", "ok")
        : chip("fehlt", "rot", "warnung"),
      zustandChip: chip(geraet.zustand ?? "nicht erfasst", zustandTon),
      bemerkungText: geraet.bemerkung ?? "—",
    };
  });
  const flaschenZeilen: FlascheAnzeigeZeile[] = check.flaschen.map((flasche) => {
    const nichtGemessen = flasche.druckBar === null;
    const fuellstandChip = nichtGemessen
      ? chip("nicht gemessen", "grau")
      : flasche.nennfuelldruckBar === null
          || flasche.prozent === null
          || flasche.ampel === null
        ? chip("Nennfülldruck unbekannt", "grau")
        : chip(`${flasche.prozent} %`, ampelTon(flasche.ampel));
    return {
      id: flasche.flascheId,
      name: flasche.name,
      druck: nichtGemessen
        ? { darstellung: "chip", text: "nicht gemessen", ton: "grau" }
        : { darstellung: "mono", text: `${flasche.druckBar} bar`, ton: null },
      // Der Druck als Zahl — „120 bar" sortierte als Zeichenkette vor „80 bar".
      druckZahl: flasche.druckBar,
      fuellstandChip,
    };
  });
  const verfallZeilen: VerfallAnzeigeZeile[] = check.verfall.map((eintrag) => ({
    id: eintrag.artikelId,
    artikel: eintrag.artikelName,
    verfallText: eintrag.verfall,
    statusChip: chip(eintrag.text, ampelTon(eintrag.ampel)),
  }));

  /*
   * ⚠️ DER KOPF NENNT DIE ART — DIESELBE FORM WIE IN DER HISTORIE (DRK-309,
   * Reviewrunde 11). `lagerorte.name` traegt keinen Eindeutigkeitsschluessel;
   * ein blosser Name im Kopf laesst offen, ob dieser Check zu dem Fahrzeug
   * oder zu der gleichnamigen Tasche gehoert. In der Historie daneben steht
   * „Name · Art · Kennung" — wer von dort hierher tippt, liest dieselbe
   * Zeile wieder, und ein Link aus einer Mail steht ueberhaupt erst hier auf
   * einer Zeile, die die Einheit benennt.
   */
  const kopfEinheitTitel = `${check.fahrzeugName} · ${einheitMeta({
    kennung: check.fahrzeugKennung,
    einheitenart: check.fahrzeugEinheitenart,
  })}`;

  return (
    <>
      <SeitenKopf
        titel={kopfEinheitTitel}
        zurueck={{ titel: "Checks", href: "/verwaltung/checks" }}
        beschreibung={(
          <>
            Abgeschlossen{" "}
            {check.completedAt?.toLocaleString("de-DE", {
              timeZone: "Europe/Berlin",
            }) ?? "—"}{" · "}
            {/* DRK-311: derselbe aufgeloeste Name wie in der Spalte „Wer" der
                Historie — wer von dort hierher tippt, liest ihn wieder. Beim
                Kaertchen ist das die Beschriftung des Zugangs, nicht eine
                Person; genau das ist die Aussage, die hier zu treffen ist. */}
            Erfasst von {check.wer}{" · "}
            {/* ⚠️ DER SATZ NENNT BEIDE AMPELN, seit der Wechselwert einstellbar
                ist (DRK-308). Vorher stand hier nur die Verfall-Ampel — und
                genau dadurch las sich die Sauerstoff-Zeile wie der Stand bei
                Abschluss, obwohl auch sie gegen die heutige Vorgabe rechnet. Ein
                Hinweis, der eine von zwei Ausnahmen aufzaehlt, ist irrefuehrender
                als gar keiner: er behauptet Vollstaendigkeit. */}
            <strong>
              Verfall- und Sauerstoff-Ampel unten sind gegen die heute geltenden Vorgaben
              gerechnet, nicht gegen den Zeitpunkt des Checks.
            </strong>
          </>
        )}
      />

      {check.altFormat ? (
        <Alert
          type="warning"
          showIcon={false}
          style={{ marginBlockEnd: SPACE.lg }}
          title="Dieser Check stammt aus dem alten Format. Die Einzelpositionen sind darin nicht enthalten; die Summen unten sind vollständig."
        />
      ) : null}

      {/**
        * §11.5, Zustand 27. OHNE diese Meldung zeigt die Seite fuer ein
        * zerstoertes `ergebnis` „0 Positionen" — sie sieht dann aus wie ein
        * Check, bei dem nichts zu tun war. Ein 200, das luegt, ist auf einem
        * Fahrzeug-Check-Nachweis der teuerste Zustand: gesucht wird danach ein
        * Datenfehler, wo ein Anzeigezustand fehlt.
        *
        * ⚠️ `type="warning"`, NIE `type="error"` (§6.6.5): `colorError` ist
        * `colorPrimary` ist `#c8000f` — ein roter Alert saehe aus wie eine
        * Primaeraktion, und Rot traegt in diesem Modul fachliche Bedeutung.
        *
        * ⚠️ KEIN Icon. Die Seite ist eine Server Component ohne Insel; das
        * antd-Icon-Paket ergibt hier HTTP 500, und zwar SCHON BEIM IMPORT —
        * `typecheck`, `build` und Vitest sehen das strukturell nicht. Braucht
        * die Meldung je ein Zeichen, kommt es aus `_ui/ikonen.tsx`. Bis dahin
        * `showIcon={false}` wie beim Nachbarn darueber. (Der Riegel weiter
        * unten in `page.test.tsx` scannt DIESE Datei im Quelltext — auch ein
        * Kommentar darf den Paketnamen nicht nennen.)
        */}
      {check.unlesbar ? (
        <Alert
          type="warning"
          showIcon={false}
          style={{ marginBlockEnd: SPACE.lg }}
          title="Ergebnis unlesbar: Dieser Check trägt ein beschädigtes Ergebnis. Die Listen und Summen unten sind deshalb leer — das heißt nicht, dass nichts zu tun war."
        />
      ) : null}

      {/**
        * DRK-196 — DER DRITTE GRUND FUER LEERE LISTEN, UND DER EINZIGE, DER
        * KEIN AUSFALL IST. Ein Check ohne Ergebnis ist ein vom Schema
        * vorgesehener Zustand (§4.4): es wurde noch nichts geschrieben. Ohne
        * diese Meldung zeigt die Seite dafuer „0 Positionen" und sieht damit aus
        * wie ein abgeschlossener Check, bei dem nichts zu tun war — dieselbe
        * luegende 200 wie beim Nachbarn darueber, nur aus anderer Ursache.
        *
        * ⛔ `type="info"`, NICHT `type="warning"` WIE DIE BEIDEN DARUEBER: jene
        * melden einen Ausfall oder eine Einschraenkung, dieser meldet einen
        * normalen Zwischenstand. Eine Warnfarbe machte aus „laeuft noch" einen
        * Befund, dem jemand nachgeht. ⛔ Und erst recht kein `type="error"`
        * (§6.6.5): `colorError` ist `colorPrimary` ist `#c8000f`.
        *
        * ⚠️ KEIN Icon, aus demselben Grund wie oben — diese Seite ist eine
        * Server Component ohne Insel, und das antd-Zeichenpaket ergaebe hier
        * HTTP 500 schon beim Import. Der Riegel in `page.test.tsx` scannt diese
        * Datei im Quelltext; auch ein Kommentar darf den Paketnamen nicht nennen.
        *
        * ⚠️ DIE DREI SCHLIESSEN EINANDER NICHT AUS, und deshalb steht hier kein
        * `else`: ein offener Check ist nie `unlesbar` (die Abgrenzung sitzt im
        * Parser), aber die Reihenfolge der Meldungen soll nicht davon abhaengen.
        */}
      {check.offen ? (
        <Alert
          type="info"
          showIcon={false}
          style={{ marginBlockEnd: SPACE.lg }}
          /*
           * ⛔ ZWEI SAETZE, WEIL ES ZWEI LAGEN GIBT (Codex-Review zu PR #210, P2).
           * Das Schema koppelt `completedAt` und `ergebnis` nicht: ein laufender
           * Check KANN schon etwas tragen. Der eine Satz fuer beide log dann in
           * die eine Richtung — er meldete „noch kein Ergebnis erfasst" und
           * darunter standen die erfassten Zeilen.
           *
           * ⚠️ „Zwischenstand", NICHT „Ergebnis": was fehlt, weiss niemand, der
           * Check laeuft ja noch. Der zweite Satz sagt deshalb nur, dass das
           * Gezeigte nicht das Ende ist — er behauptet keine Vollstaendigkeit.
           */
          title={check.hatZwischenstand
            ? "Dieser Check läuft noch. Was unten steht, ist ein Zwischenstand — er kann sich noch ändern, und was fehlt, ist damit nicht gesagt."
            : "Dieser Check läuft noch: Es wurde noch kein Ergebnis erfasst. Die Listen und Summen unten sind deshalb leer — das heißt nicht, dass nichts zu tun war."}
        />
      ) : null}

      {/**
        * ⛔ KEINE KACHELN FUER EINEN LAUFENDEN CHECK (Codex-Review zu PR #210, P2).
        * „0 geprüfte Positionen" ist eine ZAHL, und eine Zahl ist eine Aussage:
        * sie behauptet, gezaehlt worden zu sein. Unter einer Meldung, die gerade
        * sagt, es sei noch nichts erfasst worden, ist das derselbe luegende
        * Nullzustand, gegen den der Vorgang ueberhaupt antrat — nur eine Zeile
        * tiefer. Vier Nullen wegzulassen sagt mehr als vier Nullen zu zeigen.
        *
        * ⚠️ FUER `unlesbar` BLEIBEN SIE STEHEN, und das ist kein Versehen: dort
        * WURDE gezaehlt, der Wert ist nur nicht mehr lesbar. Ob die Nullen auch
        * dort besser wegfielen, ist eine eigene Frage an §11.5 und nicht die
        * dieses Vorgangs; sie hier mitzuentscheiden hiesse, einen fremden
        * Anzeigezustand ungefragt zu aendern.
        */}
      {check.offen && !check.hatZwischenstand ? null : (
      <Row gutter={[SPACE.md, SPACE.md]} style={{ marginBlockEnd: SPACE.xl }}>
        <Col xs={24} md={6}>
          <Kachel
            zahl={check.summe.positionen}
            beschriftung="geprüfte Positionen"
          />
        </Col>
        <Col xs={24} md={6}>
          <Kachel
            zahl={check.summe.nachgefuellt}
            beschriftung="nachgefüllt"
            ton={check.summe.nachgefuellt ? "rot" : "ok"}
          />
        </Col>
        <Col xs={24} md={6}>
          <Kachel
            zahl={check.summe.korrigiert}
            beschriftung="korrigiert"
            ton={check.summe.korrigiert ? "gelb" : "ok"}
          />
        </Col>
        <Col xs={24} md={6}>
          <Kachel
            zahl={check.summe.offen}
            beschriftung="fehlt weiterhin"
            ton={check.summe.offen ? "rot" : "ok"}
          />
        </Col>
      </Row>
      )}

      {/**
        * ⚠️ Die Leertexte gehoeren zur Meldung oben. Jeder von ihnen BEHAUPTET
        * etwas („Keine Geraete in diesem Check."), und bei unlesbarem `ergebnis`
        * hat das niemand geprueft — sonst widersprechen die Tabellen der Warnung
        * ueber ihnen. EIN Satz fuer alle fuenf, weil es EINE Ursache ist.
        * `altFormat` behaelt daneben seinen eigenen, anderen Nachfuell-Text: das
        * Altformat ist LESBAR, es traegt nur keine Positionsdetails.
        */}
      <CheckDetailTabellen
        abgleichZeilen={abgleichZeilen}
        nachfuellZeilen={nachfuellZeilen}
        geraeteZeilen={geraeteZeilen}
        flaschenZeilen={flaschenZeilen}
        verfallZeilen={verfallZeilen}
        nachfuellLeertext={check.altFormat
          ? "Dieser Check stammt aus dem alten Format — Einzelpositionen sind darin nicht enthalten."
          : "Keine Einzelposition erfasst."}
        /*
         * ⚠️ ZWEI URSACHEN, ZWEI TEXTE, EIN SLOT (Codex-Review zu PR #210, P2).
         * Der laufende Check hatte bis dahin KEINEN — die Meldung oben sagte
         * „noch kein Ergebnis erfasst", und darunter behaupteten die Tabellen
         * „Keine Geraete in diesem Check." Das ist genau die luegende Null, die
         * der Vorgang abschaffen sollte, nur eine Zeile tiefer.
         *
         * ⛔ DIE REIHENFOLGE IST EGAL, WEIL SIE SICH AUSSCHLIESSEN: `offen`
         * haengt an `completedAt`, `unlesbar` an einem vorhandenen, aber
         * kaputten Ergebnis. Sie steht hier trotzdem fest, damit niemand raet.
         */
        ersatzLeertext={check.offen && !check.hatZwischenstand
          ? "Für diesen Check wurde noch kein Ergebnis erfasst — es gibt noch nichts zu zeigen."
          : check.unlesbar
            ? "Das Ergebnis dieses Checks ist nicht lesbar — was erfasst wurde, lässt sich nicht sagen."
            : null}
      />
    </>
  );
}

export default async function CheckDetailSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireLagerbuchAdmin();
  const { id } = await params;
  const check = checkDetail(getDb(), id, new Date());
  if (!check) notFound();
  return checkDetailInhalt(check);
}
