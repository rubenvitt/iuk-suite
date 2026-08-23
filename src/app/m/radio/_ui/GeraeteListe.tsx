"use client";

import { useMemo, useState } from "react";
import { Button, Input } from "antd";
import {
  filtereGeraete,
  gruppiereNachStandort,
  STATUS_FILTER,
  STATUS_FILTER_ETIKETT,
  type StatusFilter,
} from "../_lib/filter";
import { Ikone } from "./ikonen";
import { GeraeteZeile, type ZeilenGeraet } from "./GeraeteZeile";
import s from "./ausleihe.module.css";

/**
 * DIE INSEL DER GERAETEUEBERSICHT — Suche, Statusfilter, Standortgruppen (Spec 1 §4.5,
 * `docs/superpowers/specs/2026-08-17-radio-modul-design.md:3596-3637`).
 *
 * ⛔ `"use client"`, UND DER GRUND IST GEMESSEN, NICHT STILISTISCH (Spec:3620-3625): unter
 * hundert Geraeten ist eine Filterung im Browser sofort und netzlos; ein Server-Roundtrip je
 * Tastendruck waere auf einem Telefon spuerbar. ⛔ Die REINEN Funktionen liegen deshalb
 * ausdruecklich NICHT hier, sondern in `_lib/filter.ts` OHNE Direktive — beide Seiten der
 * RSC-Grenze lesen sie (die Seite berechnet `suchschluessel` vor, diese Insel sucht darin),
 * und ein Wert aus einem Client-Modul kaeme in einer Server Component als Client-Referenz an
 * (Falle 6, `CLAUDE.md`, Punkt 6; `_lib/filter.ts:8-14`).
 *
 * ⛔ DIE INSEL BEKOMMT NUR SERIALISIERBARE PROPS (Falle 9, `CLAUDE.md:52-70`). Keine
 * Funktion ueberquert die Grenze: der Tap ist ein `next/link` (`GeraeteZeile.tsx`), nicht
 * ein durchgereichter Handler, und der Aktualisieren-Knopf haengt an einer DIREKT
 * importierten Server Action (`_ui/AktualisierenKnopf.tsx`).
 *
 * ⛔ KEINE `Table` (Entscheidung E4, Spec:3667-3670) und KEIN `@ant-design/icons`
 * (Entscheidung E5, Falle 7) — die Zeichen kommen aus `_ui/ikonen.tsx`.
 *
 * ⛔ KEIN `size` AUF EINEM BEDIENELEMENT (Falle 4, `CLAUDE.md:18-22`): diese Flaeche laeuft
 * ohne `FullShell` und erbt `controlHeight: TAP = 56` (`src/core/theme/theme.ts:50-51`);
 * `size="large"` waere 72. Die zwei Nachbaumasze 44 und 64 sind CSS-Klassen
 * (`ausleihe.module.css`, Entscheidung E8) — ⛔ kein zweiter `ConfigProvider`.
 *
 * ⛔ DER SUCHTEXT STEHT NICHT IN DER URL (Spec:3633-3635, `_lib/filter.ts:22-24`). Er lebt
 * in `useState` und ist fluechtig; ein Rufname oder Entleihername im Verlauf eines geteilten
 * Telefons ist eine Spur, die niemand braucht. ⛔ Und er steht auch nicht in
 * `localStorage` — Node 26 verdeckt dort jsdoms Fassung, und die Insel braucht ihn nicht
 * ueber einen Seitenwechsel hinaus (`vitest.config.ts:54-87`).
 */

/**
 * Was die Insel von einer Zeile braucht: was die ZEILE zeigt, plus den vorberechneten
 * Suchschluessel.
 *
 * ⛔ EIGENER SATZ, KEIN BEZUG AUF `GeraetMitLeihstand` (`_db/leihen.ts:92-101`) — dieselbe
 * Begruendung wie an `ZeilenGeraet` (`GeraeteZeile.tsx`): ein neues Feld des Lesemodells
 * kommt hier nicht von selbst an. ⛔ Und `_db/leihen.ts` zoege ueber seine Importe Drizzle
 * und die Moduldatenbank in das Client-Bundle.
 */
export type ListenGeraet = ZeilenGeraet & { readonly suchschluessel: string };

/** Der Anfangszustand der Filterleiste — alle Geraete, kein Suchtext. */
const OHNE_FILTER: StatusFilter = "ALL";

export function GeraeteListe({ geraete }: { geraete: readonly ListenGeraet[] }) {
  const [suchtext, setSuchtext] = useState("");
  const [status, setStatus] = useState<StatusFilter>(OHNE_FILTER);
  /**
   * Die zugeklappten Gruppen, nach Schluessel. Vorgabe ist OFFEN
   * (`DeviceGroup.tsx:13`, `defaultOpen = true`): eine Liste, die zugeklappt startet, sieht
   * auf einem Telefon aus wie eine leere.
   */
  const [zugeklappt, setZugeklappt] = useState<readonly string[]>([]);

  const treffer = useMemo(
    () => filtereGeraete(geraete, { suchtext, status }),
    [geraete, suchtext, status],
  );
  const gruppen = useMemo(() => gruppiereNachStandort(treffer), [treffer]);

  /** `DeviceGroupedList.tsx:31` — GETRIMMT, sonst hielte ein Leerzeichen alles offen. */
  const suchtextAktiv = suchtext.trim().length > 0;

  function zuruecksetzen(): void {
    setSuchtext("");
    setStatus(OHNE_FILTER);
  }

  return (
    <div className={s.liste} data-rolle="radio-liste">
      <div className={s.filterleiste}>
        {/*
          ⛔ `allowClear` STATT EINES EIGENEN 44er-KNOPFS (`DeviceFilterBar.tsx:54-63`,
          antd-Zuordnung in `briefs/KOPF.md`): antd bringt Tastaturbedienung und
          Bildschirmleser-Beschriftung des Loeschkreuzes mit, ein Nachbau nicht.
          ⛔ KEIN `size` — siehe Kopf dieser Datei.
        */}
        <Input
          className={s.suchfeld}
          type="search"
          inputMode="search"
          allowClear
          autoComplete="off"
          spellCheck={false}
          aria-label="Geräte suchen"
          placeholder="Rufname oder Standort…"
          value={suchtext}
          onChange={(e) => setSuchtext(e.target.value)}
          data-rolle="radio-suche"
        />

        <div role="group" aria-label="Nach Status filtern" className={s.filterreihe}>
          {/*
            ⛔ DIE VIER NAMEN UND IHRE BESCHRIFTUNGEN KOMMEN AUS `_lib/filter.ts:47-71` UND
            WERDEN HIER NICHT WIEDERHOLT (`_lib/filter.ts:58-61`): „Defekt·Wartung" ist EIN
            Wort mit einem Mittelpunkt, und die naheliegende Erfindung „Defekt/Wartung" waere
            still falsch.
            ⛔ `aria-pressed` IST DIE ZUSAGE, die Klasse folgt daraus
            (`ausleihe.module.css`, `.filterknopf[aria-pressed="true"]`) — nicht umgekehrt.
            Dieselbe Anordnung wie beim `aria-current` der Fussnavigation
            (`AusleihRahmen.tsx:172-175`).

            ⚠️ HIER STEHEN ZWEI BINDENDE SAETZE GEGENEINANDER, UND DAS STEHT DA, STATT STILL
            ENTSCHIEDEN ZU WERDEN. `docs/design/README.md:266` verlangt „echte Radiogruppen
            statt Knopfreihen (ein Tabstop pro Gruppe, Pfeiltasten waehlen nativ)"; die vier
            Filter sind fachlich genau das — sie schliessen einander aus. Gebaut ist trotzdem
            die KNOPFREIHE des Bestands (`DeviceFilterBar.tsx:66-85`: `role="group"` plus
            `aria-pressed`), weil Spec:3600 fuer diesen Fluss „wandert fachlich unveraendert
            mit" schreibt und `_lib/filter.ts:43-45` die Insel ausdruecklich eine „Knopfreihe"
            nennt. ⛔ Der Unterschied ist NICHT kosmetisch: eine Radiogruppe braucht rollenden
            `tabIndex` und Pfeiltasten-Bedienung, also ein anderes Bedienmodell als das
            portierte. ⬜ WER DAS UMSTELLT, BRAUCHT EINE BETREIBERENTSCHEIDUNG — der Bericht
            zu A18 fuehrt den Posten; A19 und A20 bauen ihre Auswahlflaechen nach derselben
            Zeile, damit das Modul nicht zwei Bedienmodelle fuer dieselbe Sache fuehrt.
          */}
          {STATUS_FILTER.map((wert) => (
            <button
              key={wert}
              type="button"
              className={s.filterknopf}
              aria-pressed={status === wert}
              onClick={() => setStatus(wert)}
              data-rolle="radio-statusfilter"
              data-wert={wert}
            >
              {STATUS_FILTER_ETIKETT[wert]}
            </button>
          ))}
        </div>

        {/*
          DIE TREFFERZEILE, 1:1 aus `DeviceFilterBar.tsx:88-90`.
          ⛔ `role="status" aria-live="polite"` UND NICHT `role="alert"` — anders als am Gate
          (`_ui/GateFormular.tsx:124-146`, REVIEW-A11 Fund W3). Der Unterschied ist der
          gemessene Anlass jener Entscheidung: der Gate-Fehler entsteht erst NACH einem
          Antippen und kommt zusammen mit seiner Region in den Baum, weshalb eine hoefliche
          Region ihn oft verschluckt. Diese Zeile steht von Anfang an da und aendert nur
          ihren Text — eine `assertive`-Region, die bei jedem Tastendruck dazwischenredet,
          waere hier der Fehler.
        */}
        <p className={s.trefferzeile} role="status" aria-live="polite" data-rolle="radio-trefferzeile">
          {treffer.length === geraete.length
            ? `${geraete.length} Geräte`
            : `${treffer.length} von ${geraete.length} Geräten`}
        </p>
      </div>

      {treffer.length === 0 ? (
        /*
          ⛔ EIN ANDERER LEERZUSTAND ALS DER DER SEITE. „Es sind noch keine Geräte erfasst"
          (`_lib/meldungen.ts:312-313`) gilt, wenn es GAR KEINE Geraete gibt, und steht als
          antd `Empty` auf der Server-Seite; hier gibt es welche, nur keinen Treffer — und
          nur hier gibt es etwas zurueckzusetzen (`DeviceGroupedList.tsx:17-28`).
          ⛔ DER SATZ NENNT DEN SUCHTEXT (`DeviceGroupedList.tsx:22`): „Keine Treffer" ueber
          einer vollen Liste laesst niemanden erkennen, warum.
        */
        <div className={s.leerTreffer} data-rolle="radio-leer-treffer">
          <Ikone name="paket-offen" groesse={40} />
          <p>
            {suchtextAktiv
              ? `Keine Treffer für „${suchtext.trim()}“`
              : "Keine Geräte für diesen Filter"}
          </p>
          <Button onClick={zuruecksetzen} data-rolle="radio-filter-zuruecksetzen">
            Filter zurücksetzen
          </Button>
        </div>
      ) : gruppen.length <= 1 ? (
        /*
          ⛔ EINE EINZIGE GRUPPE WIRD FLACH GERENDERT (`DeviceGroupedList.tsx:34-36`). Ein
          Kopf „Fahrzeughalle" ueber allem, was es gibt, ist eine Zeile, die der Mensch lesen
          muss, ohne dass sie etwas sagt.
        */
        <div className={s.zeilen}>
          {gruppen[0]?.geraete.map((geraet) => (
            <GeraeteZeile key={geraet.id} geraet={geraet} />
          ))}
        </div>
      ) : (
        <div className={s.gruppen}>
          {gruppen.map((gruppe) => {
            /*
              ⛔ BEI AKTIVEM SUCHTEXT SIND ALLE GRUPPEN ZWANGSWEISE OFFEN UND IHRE KOEPFE
              NICHT KLICKBAR (`DeviceGroupedList.tsx:31`, `DeviceGroup.tsx:15`, `:22`). Wer
              sucht, will das Ergebnis sehen; ein Kopf, der sich zuklappen liesse, verstecke
              genau die Treffer, nach denen die Person gerade gesucht hat.
            */
            const offen = suchtextAktiv || !zugeklappt.includes(gruppe.schluessel);
            return (
              /*
                ⚠️ DER SCHLUESSEL KANN KOLLIDIEREN, UND DAS STEHT HIER STATT ES ZU
                BEHAUPTEN: `gruppiereNachStandort` setzt `schluessel: etikett` fuer benannte
                Standorte und `__none__` fuer die Sammelgruppe (`_lib/filter.ts:190-201`).
                Ein Geraet mit dem Standort `__none__` ergaebe zusammen mit einem ohne
                Standort zwei Gruppen mit demselben `key` — React warnte, die Reihenfolge
                bliebe. Das VERHALTEN ist der Alt-Quelle treu (`device-filter.ts:88` gegen
                `:91`); ein eigener Schluessel hier waere ein zweiter Gruppierungsort.
              */
              <section
                key={gruppe.schluessel}
                role="group"
                aria-label={gruppe.etikett}
                className={s.gruppe}
              >
                <button
                  type="button"
                  className={s.gruppenkopf}
                  aria-expanded={offen}
                  disabled={suchtextAktiv}
                  onClick={() =>
                    setZugeklappt((bisher) =>
                      bisher.includes(gruppe.schluessel)
                        ? bisher.filter((k) => k !== gruppe.schluessel)
                        : [...bisher, gruppe.schluessel],
                    )
                  }
                  data-rolle="radio-gruppenkopf"
                  data-gruppe={gruppe.schluessel}
                >
                  <Ikone name="chevron-unten" groesse={16} />
                  <Ikone name="ortsnadel" groesse={16} />
                  <span>{gruppe.etikett}</span>
                  <span className={s.gruppenZahl}>({gruppe.geraete.length})</span>
                </button>
                {offen && (
                  <div className={s.zeilen}>
                    {gruppe.geraete.map((geraet) => (
                      <GeraeteZeile key={geraet.id} geraet={geraet} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
