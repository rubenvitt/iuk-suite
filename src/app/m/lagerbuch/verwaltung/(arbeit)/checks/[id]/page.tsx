import { Alert, Col, Row } from "antd";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "../../../../_db/client";
import { ampelTon } from "../../../../_lib/format";
import { checkDetail, type CheckDetail } from "../../../../_lib/lesepfade/checks";
import { Brotkrume } from "../../../../_ui/Brotkrume";
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
      fuellstandChip,
    };
  });
  const verfallZeilen: VerfallAnzeigeZeile[] = check.verfall.map((eintrag) => ({
    id: eintrag.artikelId,
    artikel: eintrag.artikelName,
    verfallText: eintrag.verfall,
    statusChip: chip(eintrag.text, ampelTon(eintrag.ampel)),
  }));

  return (
    <>
      <Brotkrume href="/verwaltung/checks">Fahrzeug-Checks</Brotkrume>
      <SeitenKopf
        titel={check.fahrzeugName}
        beschreibung={(
          <>
            Abgeschlossen{" "}
            {check.completedAt?.toLocaleString("de-DE", {
              timeZone: "Europe/Berlin",
            }) ?? "—"}{" · "}
            <strong>
              Die Verfall-Ampel unten ist gegen heute gerechnet, nicht gegen den Zeitpunkt des
              Checks.
            </strong>
          </>
        )}
      />

      {check.altFormat ? (
        <Alert
          type="warning"
          showIcon={false}
          style={{ marginBlockEnd: 16 }}
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
          style={{ marginBlockEnd: 16 }}
          title="Ergebnis unlesbar: Dieser Check trägt ein beschädigtes Ergebnis. Die Listen und Summen unten sind deshalb leer — das heißt nicht, dass nichts zu tun war."
        />
      ) : null}

      <Row gutter={[12, 12]} style={{ marginBlockEnd: 24 }}>
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
        unlesbarLeertext={check.unlesbar
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
  const { id } = await params;
  const check = checkDetail(getDb(), id, new Date());
  if (!check) notFound();
  return checkDetailInhalt(check);
}
