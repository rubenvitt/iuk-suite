"use client";

import { useMemo, useState } from "react";
import { Card } from "antd";

import type { Dringlichkeit, Faelligkeit } from "@/core/faelligkeiten";
import { Filterchips } from "@/core/filterchips/Filterchips";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Statuschip } from "@/core/status/Statuschip";
import {
  ALLE_FAELLIGKEITEN, DRINGLICHKEIT_TEXT, filtereGruppen, woAnzeige, type FaelligkeitsFilter,
} from "@/app/m/portal/_lib/faelligkeiten/anzeige";
import type { FaelligkeitsGruppe } from "@/app/m/portal/_lib/faelligkeiten/sammeln";
import { SCHRIFT } from "@/core/theme/schrift";
import s from "./FaelligkeitenListe.module.css";

/**
 * DIE LISTE AUF „WAS STEHT AN" (IDA-297) — je Modul eine Karte, darin die Fälligkeiten, überfällige
 * zuerst. Jede Zeile führt an die Stelle im Modul, an der die Sache erledigt wird.
 *
 * Client-Insel seit IDA-391: Filter nach Modul und Dringlichkeit, Zustand hier, die Liste abgeleitet
 * (`filtereGruppen`). Die Seite übergibt nur serialisierbare Gruppen. Keine `Table`: am Telefon — wo
 * die Mitteilung hinführt — ist eine Zeilenliste die richtige Form.
 *
 * DRINGLICHKEIT ALS STATUSCHIP mit den Wörtern der Wortliste: „überfällig" im Ton `fehler` (eine
 * abgelaufene Frist ist ein echter Missstand — der Fall, für den Rot im Statuschip steht, Falle 3),
 * „bald fällig" im Ton `warnung`. Die Bedeutung trägt der Text, nie die Farbe allein.
 */
export function FaelligkeitenListe({ gruppen }: { gruppen: readonly FaelligkeitsGruppe[] }) {
  const [filter, setFilter] = useState<FaelligkeitsFilter>({ modul: ALLE_FAELLIGKEITEN, dringlichkeit: ALLE_FAELLIGKEITEN });
  const sichtbar = useMemo(() => filtereGruppen(gruppen, filter), [gruppen, filter]);

  // Die Zahlen an den Dringlichkeits-Pillen gelten für das gewählte Modul.
  const imModul = useMemo(
    () => filtereGruppen(gruppen, { modul: filter.modul, dringlichkeit: ALLE_FAELLIGKEITEN }).flatMap((g) => g.eintraege),
    [gruppen, filter.modul],
  );
  const anzahl = (d: Dringlichkeit) => imModul.filter((e) => e.dringlichkeit === d).length;
  const gesamt = gruppen.reduce((n, g) => n + g.eintraege.length, 0);

  return (
    <div className={s.liste} data-testid="faellig-liste">
      {gesamt > 0 || gruppen.length > 1 ? (
        <div className={s.filter} data-testid="faellig-filter">
          {gesamt > 0 ? (
            <Filterchips
              aria-label="Dringlichkeit"
              wert={filter.dringlichkeit}
              onChange={(dringlichkeit) => setFilter((f) => ({ ...f, dringlichkeit }))}
              optionen={[
                { wert: ALLE_FAELLIGKEITEN, label: "Alle", anzahl: imModul.length },
                { wert: "ueberfaellig", label: "Überfällig", anzahl: anzahl("ueberfaellig") },
                { wert: "bald", label: "Bald fällig", anzahl: anzahl("bald") },
              ]}
            />
          ) : null}
          {gruppen.length > 1 ? (
            <Filterchips
              aria-label="Modul"
              wert={filter.modul}
              onChange={(modul) => setFilter((f) => ({ ...f, modul }))}
              optionen={[
                { wert: ALLE_FAELLIGKEITEN, label: "Alle Module" },
                ...gruppen.map((g) => ({ wert: g.modul, label: g.titel, anzahl: g.fehler ? undefined : g.eintraege.length })),
              ]}
            />
          ) : null}
        </div>
      ) : null}

      {sichtbar.length === 0 ? (
        <p style={{ ...SCHRIFT.text, margin: 0, color: "var(--iuk-gedaempft)" }} data-testid="faellig-leer">
          {filter.dringlichkeit === "ueberfaellig" ? "Nichts ist überfällig." : "Nichts ist bald fällig."}
        </p>
      ) : null}

      {sichtbar.map((g) => (
        <Card key={g.modul} data-testid={`faellig-${g.modul}`}>
          <div className={s.kopf}>
            <h2 style={SCHRIFT.unterTitel}>{g.titel}</h2>
            <Zaehler gruppe={g} />
          </div>
          {g.fehler ? (
            <p style={{ ...SCHRIFT.text, margin: 0 }}>
              Das {g.titel} konnte gerade nicht gelesen werden. Versuch es später noch einmal oder sieh direkt im Modul nach.
            </p>
          ) : g.eintraege.length === 0 ? (
            <p style={{ ...SCHRIFT.text, margin: 0, color: "var(--iuk-gedaempft)" }}>Hier steht gerade nichts an.</p>
          ) : (
            <ul className={s.zeilen}>
              {g.eintraege.map((e) => (
                <li key={e.id}>
                  <Zeile eintrag={e} href={g.basisUrl ? `${g.basisUrl}${e.pfad}` : null} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

function Zaehler({ gruppe }: { gruppe: FaelligkeitsGruppe }) {
  if (gruppe.fehler || gruppe.eintraege.length === 0) return null;
  const ueber = gruppe.eintraege.filter((e) => e.dringlichkeit === "ueberfaellig").length;
  const bald = gruppe.eintraege.length - ueber;
  const teile = [
    ueber > 0 && `${ueber} ${DRINGLICHKEIT_TEXT.ueberfaellig}`,
    bald > 0 && `${bald} ${DRINGLICHKEIT_TEXT.bald}`,
  ].filter(Boolean);
  return <span style={{ ...SCHRIFT.neben, color: "var(--iuk-gedaempft)" }}>{teile.join(" · ")}</span>;
}

function Zeile({ eintrag: e, href }: { eintrag: Faelligkeit; href: string | null }) {
  const wo = woAnzeige(e);
  const inhalt = (
    <span className={s.inhalt}>
      <span className={s.oben}>
        <Statuschip ton={e.dringlichkeit === "ueberfaellig" ? "fehler" : "warnung"}>
          {DRINGLICHKEIT_TEXT[e.dringlichkeit]}
        </Statuschip>
        <span style={{ ...SCHRIFT.kicker, color: "var(--iuk-gedaempft)" }}>{e.art}</span>
      </span>
      <span style={{ ...SCHRIFT.text, fontWeight: 600 }}>
        <span className={s.titel}>{e.titel}</span>
        {wo && <span style={{ fontWeight: 400 }}> · {wo}</span>}
      </span>
      <span style={SCHRIFT.text}>
        {e.zustand}
        {e.person && <span style={{ color: "var(--iuk-gedaempft)" }}> · an {e.person}</span>}
      </span>
    </span>
  );
  // Ohne Host kein Link — und dann auch kein Pfeil, der einen versprechen würde.
  return href ? (
    <a href={href} className={s.zeile} data-testid="faellig-zeile">
      {inhalt}
      <Icons8Ikone name="chevron-right" groesse={20} className={s.pfeil} />
    </a>
  ) : (
    <div className={s.zeile} data-testid="faellig-zeile">{inhalt}</div>
  );
}
