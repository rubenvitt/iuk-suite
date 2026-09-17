"use client";
import { useState } from "react";
import { Button, Select } from "antd";
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
  istHandlager: boolean;
};

type Kaertchen = { code: string; label: string; url: string; qr: string };

/** „Ortsadresse" — der Zustand von vor DRK-395 und weiterhin die Vorgabe. */
const OHNE_KAERTCHEN = "";

export function OrtsetikettenBogen({
  orte,
  kaertchen,
}: {
  orte: Ort[];
  /**
   * PFLICHT-PROP, auch wenn `[]` der haeufige Wert ist: ein vergessenes
   * `kaertchen?` waere still `undefined`, die Wahl verschwaende wortlos, und
   * der Bogen druckte wieder ausschliesslich Ortsadressen — genau der Zustand,
   * den DRK-395 behebt.
   */
  kaertchen: Kaertchen[];
}) {
  const keys = orte.map((o) => o.id);
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set(keys));
  /**
   * WELCHES KAERTCHEN AUF DER HANDLAGER-KARTE STEHT — DRK-395.
   *
   * ⚠️ DIE VORGABE IST DIE ORTSADRESSE, und das ist keine Zurueckhaltung aus
   * Gewohnheit: ein voreingestelltes Kaertchen legte den Code beim ersten
   * Druck nach dem Rollout auf Papier, ohne dass jemand die Entscheidung
   * getroffen haette. Ein Zugang gehoert gewaehlt, nicht geerbt.
   *
   * ⚠️ DIE WAHL GILT FUER DIESEN DRUCK, sie wird nirgends gespeichert. Der
   * Zettel selbst ist die Erinnerung: der Code steht im Fuss der Karte, die am
   * Regal haengt. Eine gespeicherte Wahl waere eine zweite Wahrheit ueber
   * „welcher Code haengt dort?" — und die stimmte ab dem Tag nicht mehr, an
   * dem jemand die Karte austauscht, ohne die Verwaltung zu oeffnen.
   */
  const [kaertchenCode, setKaertchenCode] = useState<string>(OHNE_KAERTCHEN);
  const gewaehltesKaertchen = kaertchen.find((k) => k.code === kaertchenCode) ?? null;

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

      {/*
        DIE WAHL FUER DIE HANDLAGER-KARTE — DRK-395.

        ⚠️ SIE STEHT UEBER DEM BOGEN UND NICHT AUF DER KARTE. Die Karte ist das,
        was gedruckt wird; jedes Bedienelement darin muesste `lb-nichtDrucken`
        tragen und kostete am Bildschirm eine Hoehe, die es auf Papier nicht
        hat — genau die Falle, die beim Kontrollkaestchen oben ausgeschrieben
        steht (Vorschau und Ausdruck zeigten dann verschieden viel Text).

        ⚠️ KEIN `size` AM SELECT (Falle 4): `controlHeight` ist unter dem
        Druckast schon das richtige Mass, `size="large"` waere 72px.
      */}
      <div className="lb-nichtDrucken" style={{ marginBottom: SPACE.md }}>
        <label
          htmlFor="lb-ort-kaertchen"
          style={{ display: "block", marginBottom: SPACE.xs, fontWeight: 600 }}
        >
          QR auf der Handlager-Karte
        </label>
        {kaertchen.length === 0 ? (
          /*
            ⚠️ KEIN LEERES AUSWAHLFELD, SONDERN DER WEG DORTHIN. Ein Select ohne
            Eintraege sagt „geht nicht" und nicht „was fehlt" — und was fehlt,
            ist ein Zugangs-Code der Zielart „Artikel-Liste"; jede andere
            Zielart landet woanders als am Regal (`_lib/ortZiel.ts`).
          */
          <p data-testid="lb-ort-kaertchen-leer">
            Kein Zugangs-Code mit der Zielart „Artikel-Liste“ angelegt. Die Karte
            trägt deshalb ihre Ortsadresse — ein Scan verlangt dann eine
            Anmeldung.{" "}
            <a href="/verwaltung/tokens">Zugangs-Codes verwalten</a>
          </p>
        ) : (
          <>
            <Select<string>
              id="lb-ort-kaertchen"
              data-testid="lb-ort-kaertchen"
              aria-label="QR auf der Handlager-Karte"
              value={kaertchenCode}
              onChange={setKaertchenCode}
              style={{ minWidth: 320, maxWidth: "100%" }}
              options={[
                { value: OHNE_KAERTCHEN, label: "Ortsadresse — Scan verlangt eine Anmeldung" },
                ...kaertchen.map((k) => ({
                  // Bezeichnung UND Code: die Bezeichnung waehlt man, der Code
                  // ist das, was hinterher auf dem Papier steht.
                  value: k.code,
                  label: `${k.label} · ${k.code}`,
                })),
              ]}
              virtual={false}
            />
            <p style={{ marginTop: SPACE.xs, marginBottom: 0 }}>
              Mit einem Zugangs-Code führt der Scan ohne Anmeldung direkt zum
              Entnehmen. Wer die Karte abfotografiert, hat denselben Zugang wie
              mit einem laminierten Kärtchen; sperren lässt er sich unter
              Verwaltung → Zugangs-Codes.
            </p>
          </>
        )}
      </div>

      {/* ⚠️ `lb-ortbogen` TRAEGT `page: ortbogen`. Alles Gedruckte dieser Seite liegt
          darin — das Chrome und die Bedienleiste fallen ueber `lb-nichtDrucken`
          vorher weg. Das ist die Bedingung dafuer, dass Chromium die
          Seitengroesse ueberhaupt annimmt (gemessen: gemischte Groessen in
          einem Dokument ergeben Letter fuer alles). */}
      <div className="lb-ortbogen">
        {orte.map((o) => {
          /*
            ⚠️ DAS KAERTCHEN ERSETZT DEN QR NUR AUF DER HANDLAGER-KARTE, und
            `istHandlager` kommt vom SERVER — die Insel rechnet keine
            Ortskennung nach (Begruendung am Feld in `_db/etiketten.ts`).

            ⚠️ QR UND FUSS WECHSELN GEMEINSAM ODER GAR NICHT. Beide lesen
            dieselbe Variable; ein zweites `o.istHandlager && …` weiter unten
            koennte auseinanderlaufen, und das Ergebnis waere die teuerste
            Karte ueberhaupt: ein QR auf den einen Zugang, darunter die
            abtippbare Adresse auf den anderen.
          */
          const k = o.istHandlager ? gewaehltesKaertchen : null;
          return (
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
              <span className="lb-ortkarteQr" dangerouslySetInnerHTML={{ __html: k?.qr ?? o.qr }} />
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
                ⚠️ DER CODE STEHT IM KLARTEXT AUF DER KARTE, und das ist keine
                Unachtsamkeit: der QR daneben TRAEGT ihn bereits, die Zeile
                gibt also nichts preis, was die Karte nicht ohnehin hergibt.
                Sie ist das, was ein Telefon mit streikender Kamera braucht —
                und die einzige Stelle, an der spaeter nachzulesen ist, WELCHER
                Code am Regal haengt. Dieselbe Erwaegung wie bei der
                Kaertchen-Karte des Etikettenbogens, die Label und Code
                ebenfalls ausschreibt.
              */}
              {k && <span className="lb-ortkarteCode">Code {k.code}</span>}
              {k?.url ?? o.url}
            </span>
          </label>
          );
        })}
      </div>
    </>
  );
}
