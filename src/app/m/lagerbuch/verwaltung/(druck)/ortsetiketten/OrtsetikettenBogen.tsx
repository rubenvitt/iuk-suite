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
 * ⚠️ DIE ADRESSE STEHT IM KLARTEXT AUF DER KARTE, und seit DRK-406 IST SIE EIN
 * GEHEIMNIS — die Karte traegt jetzt `/t/<code>`, nicht mehr `/o/<id>`. Das
 * klingt nach einem Rueckschritt gegenueber dem Regaletikett, das ausdruecklich
 * „keinen abtippbaren Identifikator" traegt, und ist keiner: der QR daneben
 * TRAEGT den Code bereits: die Zeile gibt nichts preis, was die Karte nicht
 * ohnehin hergibt. Wer die Karte in der Hand hat, hat den Zugang — mit oder
 * ohne lesbare Zeile.
 *
 * ⚠️ WAS SIE DAFUER LEISTET, LEISTET SONST NICHTS: ein Telefon mit streikender
 * Kamera kommt ueber sie weiter, und sie ist die einzige Stelle, an der spaeter
 * nachzulesen ist, WELCHER Code an dieser Karte haengt. Genau das braucht man
 * am Tag, an dem ein Code missbraucht wurde und die Frage lautet „welche Karte
 * ist das?".
 *
 * ⚠️ DIE SCHUTZMASSNAHME IST NICHT DIE ZURUECKHALTUNG, SONDERN DAS
 * ZURUECKSETZEN (Verwaltung → Zugangs-Codes → „Neu erzeugen"). Ein
 * abfotografierter Code wird gesperrt und ist danach fuer immer verbrannt; eine
 * verschwiegene Zeile haette den Missbrauch nur schwerer aufzuklaeren gemacht.
 */

type Ort = {
  id: string; name: string; meta: string;
  unterscheidung: string | null;
  url: string; qr: string;
  /** `null` = kein Code vorhanden; die Karte traegt dann ihre Ortsadresse. */
  code: string | null;
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
              {/*
                ⚠️ EIN FELD, EINE ENTSCHEIDUNG — DRK-406. QR und Fusszeile lesen
                beide dieselbe Quelle, und BEIDE hat der Server aus derselben
                Variablen gebaut (`_db/etiketten.ts`). Bis DRK-406 stand hier
                eine Weiche der Insel; sie konnte gegen den Fuss
                auseinanderlaufen, und das Ergebnis waere die teuerste Karte
                ueberhaupt gewesen: ein QR auf den einen Zugang, darunter die
                abtippbare Adresse auf den anderen. Jetzt gibt es nichts mehr,
                das auseinanderlaufen koennte.
              */}
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
              {/*
                ⚠️ DER CODE STEHT IM KLARTEXT AUF DER KARTE — die volle
                Begruendung steht im Kopf dieser Datei. Kurz: der QR daneben
                traegt ihn ohnehin, und die Zeile ist das, was ein Telefon mit
                streikender Kamera braucht.
              */}
              {o.code && <span className="lb-ortkarteCode">Code {o.code}</span>}
              {o.url}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}
