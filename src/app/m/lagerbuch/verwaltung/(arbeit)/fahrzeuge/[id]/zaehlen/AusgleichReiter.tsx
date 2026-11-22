"use client";

/**
 * DER REITER „Ausgleichen" (Spec 6.4) — je ganz gezähltem Artikel mit
 * Abweichung, abgelaufenem Fach oder Plus ohne Herkunft eine Zeile; je Zeile
 * „Auffüllen", „Zurücklegen", „Aussondern", die erfassten Absichten als Chips.
 *
 * ⚠️ DIE ZEILEN RECHNET `ausgleichZeilen` (`_lib/verwaltungscheck.ts`), nicht
 * dieser Reiter: der Reiterzähler, die Leiste und der Server lesen dieselbe
 * Rechnung.
 *
 * ⚠️ ALLE DREI KNÖPFE SIND NEUTRAL. Aussondern ist kein Fehler und keine
 * Primäraktion (Falle 3) — die einzige Primäraktion der Insel ist
 * „Abschließen", und erst dort wird etwas gebucht.
 */

import { useState } from "react";
import { Button } from "antd";
import { sollText } from "../../../../../_lib/domain/sollBereich";
import { ENTNAHMEBOX_ID } from "../../../../../_lib/konstanten";
import type { VerwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";
import {
  ausgleichZeilen, chargenNachZaehlung, type Ausgleich, type AusgleichZeile, type Herkunft, type ZaehlZustand,
} from "../../../../../_lib/verwaltungscheck";
import { Chip } from "../../../../../_ui/Chip";
import { Ikone } from "../../../../../_ui/ikonen";
import { AuffuellenDialog, AussondernDialog, ZuruecklegenDialog } from "./AusgleichDialoge";
import type { ReiterProps } from "./reiter";
import k from "./zaehlen.module.css";

type Art = keyof Ausgleich;

const ARTEN: readonly { art: Art; text: string }[] = [
  { art: "auffuellen", text: "Auffüllen" },
  { art: "zuruecklegen", text: "Zurücklegen" },
  { art: "aussondern", text: "Aussondern" },
];

/** Eine Absicht setzen oder (mit `undefined`) entfernen; ein Artikel ohne Absicht fällt ganz heraus. */
function mitAbsicht<A extends Art>(
  z: ZaehlZustand, artikelId: string, art: A, wert: Ausgleich[A] | undefined,
): ZaehlZustand {
  const absichten: Ausgleich = { ...z.ausgleich[artikelId] };
  if (wert === undefined) delete absichten[art];
  else absichten[art] = wert;
  const ausgleich = { ...z.ausgleich };
  if (Object.keys(absichten).length === 0) delete ausgleich[artikelId];
  else ausgleich[artikelId] = absichten;
  return { ...z, ausgleich };
}

function ortName(daten: VerwaltungscheckDaten, id: string): string {
  if (id === ENTNAHMEBOX_ID) return "Entnahmebox";
  return daten.ruecklaufZiele.find((z) => z.id === id)?.name
    ?? daten.lagerorte.find((o) => o.id === id)?.name
    ?? "anderem Ort";
}

function herkunftText(daten: VerwaltungscheckDaten, h: Herkunft): string {
  if (h.art === "handlager") return "aus dem Handlager";
  if (h.art === "ort") return `aus ${ortName(daten, h.vonLagerortId)}`;
  return "neu angeliefert";
}

/** Der Chiptext einer erfassten Absicht. */
function absichtText(daten: VerwaltungscheckDaten, art: Art, a: Ausgleich): string {
  if (art === "auffuellen" && a.auffuellen) {
    const { menge, herkunft, mitgezaehlt } = a.auffuellen;
    return `Auffüllen ${menge} ${herkunftText(daten, herkunft)}${mitgezaehlt ? " · schon mitgezählt" : ""}`;
  }
  if (art === "zuruecklegen" && a.zuruecklegen) {
    return `Zurücklegen ${a.zuruecklegen.menge} in ${ortName(daten, a.zuruecklegen.zielLagerortId)}`;
  }
  if (art === "aussondern" && a.aussondern) return `Aussondern ${a.aussondern.menge}`;
  return "";
}

function abweichungsChips(z: AusgleichZeile) {
  return (
    <>
      {z.fehlmenge > 0 ? <Chip ton="rot">{z.fehlmenge} fehlen</Chip> : null}
      {z.ueberschuss > 0 ? <Chip ton="gelb">{z.ueberschuss} zu viel</Chip> : null}
      {z.abgelaufen ? <Chip ton="rot" zeichen="verfall">Verfall abgelaufen</Chip> : null}
    </>
  );
}

export function AusgleichReiter({ daten, zustand, aendere, gesperrt }: ReiterProps) {
  const [offen, setOffen] = useState<{ art: Art; artikelId: string } | null>(null);
  const zeilen = ausgleichZeilen(daten, zustand, new Date());
  const nochNichtsGezaehlt = Object.keys(zustand.ist).length === 0;

  if (zeilen.length === 0) {
    return (
      <p className={k.hinweis} data-rolle="ausgleich-leer">
        {nochNichtsGezaehlt
          ? "Noch nichts gezählt. Zähle zuerst im Reiter „Bestand“."
          : "Nichts auszugleichen."}
      </p>
    );
  }

  const offeneZeile = offen ? zeilen.find((z) => z.artikelId === offen.artikelId) : undefined;
  const schliessen = () => setOffen(null);
  function uebernimm<A extends Art>(art: A, artikelId: string) {
    return (wert: Ausgleich[A]) => {
      aendere((z) => mitAbsicht(z, artikelId, art, wert));
      setOffen(null);
    };
  }

  return (
    <div className={k.liste}>
      {zeilen.map((z) => {
        const absichten = zustand.ausgleich[z.artikelId] ?? {};
        return (
          <div key={z.artikelId} className={k.karte} data-rolle="ausgleich-zeile" data-artikel={z.artikelId}>
            <div className={k.name}>{z.artikelName}</div>
            <p className={k.merkmale}>
              <span>
                Soll {sollText(z.sollSumme, z.obergrenze > z.sollSumme ? z.obergrenze : null)} · Ist {z.ist}
                {" "}· im Lagerbuch {z.buchstand} {z.einheit}
              </span>
              {abweichungsChips(z)}
            </p>
            {z.plusOhneHerkunft ? (
              <p className={k.hinweis} data-rolle="woher">
                Mehr als im Lagerbuch — woher? Mit „Auffüllen“ die Herkunft angeben.
              </p>
            ) : null}
            {ARTEN.some(({ art }) => absichten[art] !== undefined) ? (
              <div className={k.absichten}>
                {ARTEN.filter(({ art }) => absichten[art] !== undefined).map(({ art, text }) => (
                  <span key={art} className={k.absicht} data-rolle={`absicht-${art}`}>
                    <Chip ton="grau">{absichtText(daten, art, absichten)}</Chip>
                    <Button
                      type="text"
                      aria-label={`${text} entfernen`}
                      disabled={gesperrt}
                      icon={<Ikone name="kreuz" groesse={14} />}
                      onClick={() => aendere((s) => mitAbsicht(s, z.artikelId, art, undefined))}
                    />
                  </span>
                ))}
              </div>
            ) : null}
            <div className={k.knoepfe}>
              {ARTEN.map(({ art, text }) => (
                <Button
                  key={art}
                  data-rolle={art}
                  disabled={gesperrt}
                  onClick={() => setOffen({ art, artikelId: z.artikelId })}
                >
                  {text}
                </Button>
              ))}
            </div>
            <p className={k.merkmale} data-rolle="nach-ausgleich">
              Nach dem Ausgleich: {z.nachAusgleich} {z.einheit}
            </p>
          </div>
        );
      })}
      {offen && offeneZeile ? (
        offen.art === "auffuellen" ? (
          <AuffuellenDialog
            zeile={offeneZeile}
            daten={daten}
            vorher={zustand.ausgleich[offeneZeile.artikelId]?.auffuellen}
            onUebernehmen={uebernimm("auffuellen", offeneZeile.artikelId)}
            onSchliessen={schliessen}
          />
        ) : offen.art === "zuruecklegen" ? (
          <ZuruecklegenDialog
            zeile={offeneZeile}
            daten={daten}
            chargen={chargenNachZaehlung(daten, zustand, offeneZeile.artikelId)}
            vorher={zustand.ausgleich[offeneZeile.artikelId]?.zuruecklegen}
            onUebernehmen={uebernimm("zuruecklegen", offeneZeile.artikelId)}
            onSchliessen={schliessen}
          />
        ) : (
          <AussondernDialog
            zeile={offeneZeile}
            daten={daten}
            vorher={zustand.ausgleich[offeneZeile.artikelId]?.aussondern}
            onUebernehmen={uebernimm("aussondern", offeneZeile.artikelId)}
            onSchliessen={schliessen}
          />
        )
      ) : null}
    </div>
  );
}
