"use client";

// src/app/m/radio/admin/(arbeit)/geraete/GeraeteWerkzeugleiste.tsx
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Input, Space } from "antd";
import { SUCHFELDER } from "../../../_lib/geraeteFelder";
import type { GeraetFilterWerte } from "../../../_lib/suchparameter";
import s from "../../../_ui/verwaltung.module.css";
import { aktiveFilterZahl } from "./FilterSchublade";
import { SpaltenWahl, type SpaltenOption } from "./SpaltenWahl";

/**
 * DIE WERKZEUGLEISTE DER GERAETELISTE — Nachfolgerin von `DeviceList.tsx:132-162` samt
 * `SearchFieldPicker.tsx`.
 *
 * ⛔ KIND VON INSEL 1 (E-V6): Suchtext, Suchfelder, Spaltenauswahl und Filterzahl sind
 * Zustand, den sie mit `GeraeteTabelle.tsx` teilt. `Input.Search` und `Space.Compact` sind
 * ausserdem Compound-Zugriffe — in einer Server Component HTTP 500 (Falle 1).
 *
 * ⛔ DIE ENTPRELLUNG VON 300 ms LIEGT HIER, IN DER INSEL — 1:1 aus `DeviceList.tsx:66-75`,
 * und `Spec:4631-4645` schreibt genau das fest. Sie ist der Grund, warum der Suchtext
 * ueberhaupt einen eigenen Zustand hat: ohne sie schriebe jeder Tastenanschlag die
 * Adresszeile und stiesse einen Serverlauf an.
 */

/**
 * Die Etiketten der zwoelf waehlbaren Suchfelder — 1:1 aus `SearchFieldPicker.tsx:5-18`.
 *
 * ⛔ DIE SCHLUESSEL KOMMEN AUS `SUCHFELDER` (`_lib/geraeteFelder.ts:52-65`) UND STEHEN HIER
 * NICHT ZWEITMAL. Die Datei dort schreibt den Grund aus (`_lib/geraeteFelder.ts:35-42`): waehlt jemand
 * ausschliesslich ein Feld, dessen Name der Lesepfad nicht kennt, greift der
 * Sicherheitszweig `sql\`0\`` und die Liste bleibt fuer diese Auswahl dauerhaft LEER —
 * bei gruenem typecheck, lint, build und Test. Der Fall
 * „die zwoelf waehlbaren Suchfelder tragen je ein Etikett" prueft die Deckung in beide
 * Richtungen.
 *
 * ⚠️ ZWEI ETIKETTEN SIND NICHT WOERTLICH DIE DES BESTANDS, und das ist gewollt: der Bestand
 * fuehrt `deviceType` als „Gerät" (`SearchFieldPicker.tsx:13`) und `hiorgId` als „Hiorg-ID"
 * (`:17`). Die Suite-Schluessel heissen `geraeteTyp` und `hiorgId`; die ANZEIGETEXTE bleiben
 * zeichengleich.
 */
export const SUCHFELD_ETIKETTEN: Record<string, string> = {
  rufname: "Rufname",
  issi: "ISSI",
  tei: "TEI",
  seriennummer: "Seriennummer",
  zuordnung: "Zuordnung",
  opta: "OPTA",
  funktion: "Funktion",
  geraeteTyp: "Gerät",
  lagerort: "Lagerort",
  hersteller: "Hersteller",
  bedieneinheit: "Bedieneinheit",
  hiorgId: "Hiorg-ID",
};

/** Die zwoelf Optionen in der Reihenfolge, in der der Lesepfad sie fuehrt. */
const SUCHFELD_OPTIONEN: SpaltenOption[] = SUCHFELDER.map((schluessel) => ({
  schluessel,
  etikett: SUCHFELD_ETIKETTEN[schluessel] ?? schluessel,
}));

/** ⛔ 300 ms, 1:1 aus `DeviceList.tsx:73`. */
const ENTPRELLUNG_MS = 300;

export type GeraeteWerkzeugleisteProps = {
  suchtext: string;
  suchfelder: string[];
  spalten: string[];
  spaltenOptionen: SpaltenOption[];
  filter: GeraetFilterWerte;
  darfAnlegen: boolean;
  darfExportieren: boolean;
  aufSuchtext: (naechster: string) => void;
  aufSuchfelder: (naechste: string[]) => void;
  aufSpalten: (naechste: string[]) => void;
  aufFilterOeffnen: () => void;
  aufAnlegen: () => void;
};

export function GeraeteWerkzeugleiste({
  suchtext,
  suchfelder,
  spalten,
  spaltenOptionen,
  filter,
  darfAnlegen,
  darfExportieren,
  aufSuchtext,
  aufSuchfelder,
  aufSpalten,
  aufFilterOeffnen,
  aufAnlegen,
}: GeraeteWerkzeugleisteProps) {
  const [getipptes, setGetipptes] = useState(suchtext);
  const uebernommen = useRef(suchtext);

  /*
   * Der Tanz mit `uebernommen` unterscheidet eine EXTERNE Aenderung der Adresszeile (etwa
   * der Sprung von der Uebersicht auf `?updateStand=veraltet`) von der eigenen Schreibung.
   * Nur die externe zieht das Eingabefeld nach. Bauform 1:1 aus
   * `lagerbuch/verwaltung/(arbeit)/journal/JournalFilter.tsx:52-59`.
   */
  useEffect(() => {
    if (suchtext !== uebernommen.current) {
      uebernommen.current = suchtext;
      setGetipptes(suchtext);
    }
  }, [suchtext]);

  /*
   * ⚠️ BENANNTE ABWEICHUNG A10 (nachgetragen in Fix-Runde 1 zu V13, Fund G4 der
   * Schlusspruefung): DIESE ENTPRELLUNG TRAEGT NUR DEN SUCHTEXT. Der Bestand entprellt in
   * DEMSELBEN Effekt auch die Suchfelder — `searchFields` steht dort in der
   * Abhaengigkeitsliste und in der Zuweisung
   * (`radio-admin/client/src/features/devices/DeviceList.tsx:66-75`, Zuweisung `:71`,
   * selbst aufgeschlagen). Die Suite reicht `aufSuchfelder` dagegen direkt durch
   * (`GeraeteTabelle.tsx`, Eigenschaft `aufSuchfelder`), also ein `router.replace` je Haken.
   *
   * ⛔ ES IST KEIN SPEC-BRUCH: `Spec:4631-4645` und `briefs/V13.md` nennen die 300 ms
   * ausdruecklich nur fuer `q`. Es ist aber eine messbare Abweichung vom 1:1-Posten, und sie
   * steht deshalb hier und nicht nur im Bericht. ⚠️ Der Aufklapper bleibt beim Umschalten
   * offen (`SpaltenWahl.tsx`, 1:1 `CheckboxDropdown.tsx:17-21`) — wer drei Felder waehlt,
   * loest drei Rundlaeufe aus.
   */
  useEffect(() => {
    const begriff = getipptes.trim();
    if (begriff === uebernommen.current) return;
    const uhr = setTimeout(() => {
      uebernommen.current = begriff;
      aufSuchtext(begriff);
    }, ENTPRELLUNG_MS);
    return () => clearTimeout(uhr);
    // `aufSuchtext` ist bei jedem Rendern eine neue Funktion; sie gehoert deshalb NICHT in
    // die Abhaengigkeiten — sonst startete die Entprellung bei jedem Rendern neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getipptes]);

  return (
    <div className={s.werkzeugleiste}>
      <Space wrap>
        {/*
          `Space.Compact` und `Input.Search` 1:1 aus `DeviceList.tsx:135-143`. ⛔ OHNE `size`
          — Falle 4: `FullShell` traegt `controlHeight: 44`, und die Hoehe wird geerbt, nicht
          geschrieben (`_ui/AusleihRahmen.test.tsx:210-214` setzt das modulweit durch).
        */}
        <Space.Compact className={s.suchfeld}>
          <Input.Search
            allowClear
            aria-label="Suche"
            placeholder="Suche…"
            value={getipptes}
            onChange={(e) => setGetipptes(e.target.value)}
            onSearch={(wert) => {
              uebernommen.current = wert.trim();
              aufSuchtext(wert.trim());
            }}
          />
          <SpaltenWahl
            optionen={SUCHFELD_OPTIONEN}
            wert={suchfelder}
            aufAenderung={aufSuchfelder}
            knopfEtikett="Suchfelder"
            knopfRolle="radio-suchfeldwahl"
            listenRolle="radio-suchfeldliste"
          />
        </Space.Compact>
        {/*
          Der Filterzaehler am Knopf, 1:1 `DeviceList.tsx:144-146`. ⛔ OHNE `size="small"` —
          dieselbe Falle 4.
        */}
        <Badge count={aktiveFilterZahl(filter)}>
          <Button data-rolle="radio-filterknopf" onClick={aufFilterOeffnen}>
            Filter
          </Button>
        </Badge>
      </Space>
      <Space wrap>
        <SpaltenWahl
          optionen={spaltenOptionen}
          wert={spalten}
          aufAenderung={aufSpalten}
          knopfEtikett="Spalten"
          knopfRolle="radio-spaltenwahl"
          listenRolle="radio-spaltenliste"
        />
        {/*
          ⛔ EINE ANZEIGE-ENTSCHEIDUNG, KEINE SPERRE (1:1 `DeviceList.tsx:150`,
          `{isAdmin && …}`): die Sperren sind `requireRadioAdmin()` in `geraetAnlegenAction`
          (`admin/actions.ts:447`) und der eigene Riegel von `geraete/export/route.ts` (V22).
        */}
        {darfExportieren && (
          <Button data-rolle="radio-geraete-export" href="/admin/geraete/export" download>
            Exportieren
          </Button>
        )}
        {darfAnlegen && (
          <Button type="primary" data-rolle="radio-geraet-anlegen" onClick={aufAnlegen}>
            Gerät anlegen
          </Button>
        )}
      </Space>
    </div>
  );
}
