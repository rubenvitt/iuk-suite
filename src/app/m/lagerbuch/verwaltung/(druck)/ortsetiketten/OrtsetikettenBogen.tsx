"use client";
import { useState } from "react";
import { Button } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { nameStufe } from "../../../_lib/ortEtikettMasse";

/**
 * DIE AUSWAHL-INSEL DER ORTSKARTEN (DRK-312, Querformat seit DRK-388).
 *
 * Bauform und Interaktion sind bewusst DIESELBEN wie am Etikettenbogen
 * (`etiketten/EtikettenBogen.tsx`): Alle / Keine / Drucken mit Zaehler, zu
 * Beginn alles gewaehlt, die Kachel als Ganzes klickbar. Wer beide Flaechen
 * benutzt, soll nicht zweimal etwas lernen — und die Auswahl bleibt auch im
 * Bogenformat wichtig: ein Nachdruck betrifft fast immer GENAU EINE Einheit,
 * und ohne Auswahl kaeme ein ganzer Bogen aus dem Drucker.
 *
 * DAS KONTROLLKAESTCHEN BLEIBT NACKT — kein antd-Checkbox (§6.10.2, Punkt 1).
 * Ein antd-Checkbox rendert kein nacktes <input> auf der erwarteten Ebene,
 * sondern eine `.ant-checkbox-wrapper`-Struktur: die Druckregel liefe ins Leere
 * und die Kaestchen stuenden MIT auf dem Papier. Still, weil es erst am
 * Ausdruck auffaellt (Falle 5).
 *
 * `lb-nichtDrucken` sitzt auf dem KAESTCHEN, nie auf dem <label> und nie auf
 * seiner Kopfzeile: weiter oben saesse die Regel auf der Beizeile oder auf der
 * ganzen Karte und naehme dem Bogen eine Angabe oder eine ganze Karte.
 *
 * KEIN ZEICHEN AM KNOPF, aus demselben Grund wie am Etikettenbogen: ein
 * direkter `@ant-design/icons`-Import ist modulweit verboten, auch in
 * Client-Inseln, und `lucide-react` fuehrt die Suite gar nicht. Text ist hier
 * billiger und ehrlicher.
 *
 * KEIN `size` am Button: `controlHeight` ist unter dem Druckast schon das
 * richtige Mass; `size="large"` waere 72px (Falle 4).
 *
 * Das SVG kommt per `dangerouslySetInnerHTML` herein — dieselbe Stelle und
 * dieselbe Begruendung wie in `EtikettenBogen.tsx` und `m/qr/QrDisplay.tsx`:
 * das Markup stammt aus dem SVG-Serializer von `qrcode`, die Nutzlast landet
 * als Modulkoordinaten im `d`-Attribut, nie als Text im Markup.
 *
 * ⚠️ DIE ADRESSE STEHT IM KLARTEXT AUF DER KARTE, und das ist der Unterschied
 * zum Regaletikett, das ausdruecklich „keinen abtippbaren Identifikator" traegt.
 * Dort ist die Zurueckhaltung richtig: ein Zugangs-Kaertchen traegt ein
 * GEHEIMNIS. `/o/<id>` ist keins — die Adresse fuehrt ohne Sitzung aufs Gate
 * und gibt von sich aus nichts preis. Sie steht da, weil sie die einzige
 * Angabe auf der Karte ist, die AUCH DANN EINDEUTIG IST, wenn zwei Taschen
 * gleich heissen (`lagerorte.name` traegt fuer Einheiten keinen
 * Eindeutigkeitsschluessel), und weil ein Telefon ohne funktionierende Kamera
 * sonst vor der Karte steht.
 */

type Ort = {
  id: string; name: string; meta: string;
  unterscheidung: string | null;
  url: string; qr: string;
};

export function OrtsetikettenBogen({ orte }: { orte: Ort[] }) {
  const keys = orte.map((o) => o.id);
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set(keys));

  function umschalten(k: string) {
    setGewaehlt((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  if (keys.length === 0) {
    return <p className="lb-nichtDrucken">Kein Handlager und keine aktive Einheit.</p>;
  }

  return (
    <>
      <div
        className="lb-nichtDrucken"
        style={{ display: "flex", gap: SPACE.sm, marginBottom: SPACE.md }}
      >
        <Button data-testid="lb-ort-alle" onClick={() => setGewaehlt(new Set(keys))}>
          Alle
        </Button>
        <Button data-testid="lb-ort-keine" onClick={() => setGewaehlt(new Set())}>
          Keine
        </Button>
        {/* Primaeraktion — zulaessig, weil der Knopf eine HANDLUNG ist und keine
            Datenflaeche. Rot traegt hier an keiner Stelle Bedeutung (Falle 3). */}
        <Button data-testid="lb-ort-drucken" type="primary" onClick={() => window.print()}>
          Drucken ({gewaehlt.size})
        </Button>
      </div>

      {/* ⚠️ `lb-ortbogen` TRAEGT `page: ortbogen`. Alles Gedruckte dieser Seite liegt
          darin — das Chrome und die Bedienleiste fallen ueber `lb-nichtDrucken`
          vorher weg. Das ist die Bedingung dafuer, dass Chromium die
          Seitengroesse ueberhaupt annimmt (gemessen: gemischte Groessen in
          einem Dokument ergeben Letter fuer alles). */}
      <div className="lb-ortbogen">
        {orte.map((o) => (
          <label
            className={`lb-ortkarte${gewaehlt.has(o.id) ? "" : " lb-ortkarteAbgewaehlt"}`}
            key={o.id}
          >
            {/*
              ⚠️ DAS KAESTCHEN STEHT IN DER KOPFZEILE, NICHT ALS EIGENES KIND DER
              KARTE. Es traegt `lb-nichtDrucken`, ist im Druck also
              `display: none` — als eigenes Flex-Item kostete es den Namen am
              BILDSCHIRM Hoehe, die er auf PAPIER hat. Vorschau und Ausdruck
              zeigten dann verschieden viel Text, und die Stufentabelle ist
              gegen das Papier gemessen.
            */}
            <span className="lb-ortkarteKopf">
              <input
                type="checkbox"
                className="lb-ortkarteWahl lb-nichtDrucken"
                checked={gewaehlt.has(o.id)}
                onChange={() => umschalten(o.id)}
                aria-label={`${o.name} drucken`}
              />
              <span className="lb-ortkarteMeta">{o.meta}</span>
            </span>
            {/*
              ⚠️ QR UND NAME NEBENEINANDER — das ist der Formatwechsel (DRK-388).
              Untereinander braucht dieselbe Karte rund 95mm Hoehe, und vier
              davon sind ein A4-Blatt; nebeneinander kommt sie mit 72mm aus, und
              acht passen auf das Blatt.
            */}
            <span className="lb-ortkarteHauptteil">
              <span className="lb-ortkarteQr" dangerouslySetInnerHTML={{ __html: o.qr }} />
              {/*
                ⚠️ ZWEI VERSCHACHTELTE SPANS, UND DAS IST KEINE ZIERDE. Die
                aeussere Huelle zentriert den Namen (Flexbox), die innere traegt
                die Zeilenklammer — `-webkit-line-clamp` braucht `display:
                -webkit-box` an DEMSELBEN Element wie den Text, und das vertruege
                sich nicht mit der Zentrierung. Die Klasse kommt aus der
                gemessenen Stufentabelle (`_lib/ortEtikettMasse.ts`).
              */}
              <span className={`lb-ortkarteName ${nameStufe(o.name)}`}>
                <span className="lb-ortkarteNameText">{o.name}</span>
              </span>
            </span>
            <span className="lb-ortkarteUrl">
              {/*
                ⚠️ DER UNTERSCHEIDER STEHT VORN IM FUSS, und beides ist
                tragend. „Im Fuss", weil dort als einzigem Feld Platz
                RESERVIERT ist (drei Zeilen, feste Hoehe) — die Beizeile ist
                eine Zeile mit `text-overflow`, dort waere er das Erste, was
                verschwindet, und die Reparatur saehe nur aus, als wirkte sie.
                „Vorn", weil der Fuss nach drei Zeilen klammert: was bei einem
                sehr langen Host gekuerzt wird, ist dann das Ende der ADRESSE
                und nie die Id.
              */}
              {o.unterscheidung && (
                <span className="lb-ortkarteUnterscheidung">{o.unterscheidung}</span>
              )}
              {o.url}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}
