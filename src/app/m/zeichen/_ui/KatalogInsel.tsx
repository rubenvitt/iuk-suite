"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { entferneZeichen, merkeZeichen } from "../actions";
import {
  findeZeichen,
  grundformen,
  kapitelListe,
  organisationen,
  sucheZeichen,
  type ZeichenId,
} from "../_lib/katalog";
import s from "./zeichen.module.css";

/*
 * DIE KATALOG-INSEL — Suche, drei Filter, Raster, Detailbereich auf DERSELBEN
 * Seite. Aufgabe 9 rendert genau diese Komponente ein zweites Mal auf `/offline`,
 * mit gesetztem `offline`-Prop und ohne <Shell>; `/offline` verdoppelt die
 * Katalogflaeche deshalb NICHT.
 *
 * ⛔ SERVER UND CLIENT RUFEN DIESELBE `sucheZeichen()` AUF DEMSELBEN GENERAT AUF.
 * Das ist der Grund, warum diese Insel per SSR rendert und ohne Mismatch
 * hydriert, und der Grund, warum die Filterfunktion in `_lib/` OHNE "use client"
 * liegt. Wer die Suche hierher kopiert, hat zwei Codepfade fuer dieselbe Frage —
 * und der Unterschied meldet sich als Hydrationsfehler im Browser, nicht als
 * roter Test.
 *
 * ⛔ KEIN `router.push`, WEDER FUER DIE AUSWAHL NOCH FUER DIE FILTER. Auf
 * `/offline` ist genau EINE Navigationsroute im Cache; ein `push` loeste einen
 * RSC-Abruf aus, den es ohne Netz nicht gibt, und der Navigationsrueckfall
 * lieferte dieselbe Flaeche erneut. Die Adresszeile wird stattdessen mit
 * `window.history.replaceState` nachgezogen — Next unterstuetzt das
 * ausdruecklich, es loest keine Server-Runde aus, und es bleibt EIN Codepfad fuer
 * online und offline.
 *
 * ⛔ KEIN antd-`Table`, KEIN `Listy`, KEIN `Select`, KEIN `Input.Search`. Die
 * ersten beiden verlangen eine Funktion als Prop (Falle 9) — hier waere das
 * unschaedlich, weil dies eine Client-Komponente ist, aber die Flaeche wandert
 * mit Aufgabe 9 unter eine zweite Huelle, und dieselben Bausteine sollen dort
 * dieselben bleiben. `Select` und `Input.Search` sind Compound-Zugriffe bzw.
 * Portal-Bauformen, deren Wert in einem versteckten Feld liegt; ein natives
 * <select> ist vor der Hydration bedienbar und im Test ohne `queryPortal`
 * pruefbar.
 *
 * ⛔ KEIN Import aus `@ant-design/icons`, nirgends im Modul (Falle 7).
 *
 * ⛔ AN KEINEM BEDIENELEMENT STEHT `size` (Falle 4): `FullShell` legt
 * `ARBEITSDICHTE` (44/48) um den Inhalt, und eigenes Markup traegt `min-height:
 * 44px` als Literal in `zeichen.module.css`.
 */

/* Einmal beim Modulladen — reine Funktionen ueber eine Konstante. */
const KAPITEL = kapitelListe();
const ORGANISATIONEN = organisationen();
const GRUNDFORMEN = grundformen();

/**
 * Wie viele Kacheln auf einmal im Baum haengen.
 *
 * NICHT GEMESSEN, und deshalb konservativ: gemessen ist nur, dass alle 246 SVGs
 * zusammen 381.541 B roh sind — wie ein Tablet 246 gleichzeitig eingehaengte
 * SVG-Baeume verkraftet, hat niemand nachgesehen. 48 fuellt auf jedem Geraet mehr
 * als einen Bildschirm, und der Knopf darunter hebt die Schranke. Wer sie misst,
 * darf sie streichen.
 */
const RASTER_SCHRITT = 48;

export function KatalogInsel({
  offline = false,
  gemerkt = [],
}: {
  /** Auf `/offline` (Aufgabe 9): kein Schreiben, keine ungecachten Ziele. */
  offline?: boolean;
  /** Die eigenen Merk-IDs, von der RSC-Huelle gelesen. */
  gemerkt?: readonly ZeichenId[];
}) {
  const suchparameter = useSearchParams();

  /*
   * ERSTSTAND AUS DER URL — Server und Client lesen DIESELBEN Parameter, rufen
   * DIESELBE Funktion auf und rendern deshalb dasselbe erste Bild.
   *
   * Der Suchtext bleibt danach im lokalen Zustand: ein `push` je Tastendruck
   * waere eine Navigation je Tastendruck, und offline gaebe es dafuer kein Ziel.
   */
  const [text, setText] = useState(() => suchparameter.get("q") ?? "");
  const [kapitel, setKapitel] = useState(() => suchparameter.get("kapitel") ?? "");
  const [organisation, setOrganisation] = useState(() => suchparameter.get("org") ?? "");
  const [grundform, setGrundform] = useState(() => suchparameter.get("form") ?? "");
  const [gewaehlt, setGewaehlt] = useState(() => suchparameter.get("z") ?? "");
  const [grenze, setGrenze] = useState(RASTER_SCHRITT);
  const [merkstand, setMerkstand] = useState<readonly string[]>(gemerkt);
  const [schreibt, schreibe] = useTransition();

  const { treffer, gesamt } = useMemo(
    () =>
      sucheZeichen({
        text,
        kapitel: kapitel === "" ? undefined : kapitel,
        organisation: organisation === "" ? undefined : organisation,
        grundform: grundform === "" ? undefined : grundform,
      }),
    [text, kapitel, organisation, grundform],
  );

  const detail = gewaehlt === "" ? null : findeZeichen(gewaehlt);
  const istGemerkt = detail !== null && merkstand.includes(detail.id);

  /** Die Adresszeile nachziehen — OHNE Navigation, siehe Kopfkommentar. */
  function spiegele(schluessel: string, wert: string): void {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (wert === "") url.searchParams.delete(schluessel);
    else url.searchParams.set(schluessel, wert);
    window.history.replaceState(null, "", url);
  }

  function waehle(id: string): void {
    setGewaehlt(id);
    spiegele("z", id);
  }

  return (
    <div className={s.modul}>
      {/* Ein <div role="search">, KEIN <form>: ein Formular schickte bei Enter
          eine echte GET-Navigation los — offline ins Leere. */}
      <div className={s.suchzeile} role="search">
        <label className={s.feld}>
          <span style={SCHRIFT.kicker}>Suchen</span>
          <input
            type="search"
            className={s.eingabe}
            data-testid="zeichen-suche"
            value={text}
            placeholder="Titel, Kürzel oder Bedeutung"
            onChange={(e) => setText(e.target.value)}
          />
        </label>

        <label className={s.feld}>
          <span style={SCHRIFT.kicker}>Kapitel</span>
          <select
            className={s.eingabe}
            data-testid="zeichen-filter-kapitel"
            value={kapitel}
            onChange={(e) => {
              setKapitel(e.target.value);
              spiegele("kapitel", e.target.value);
            }}
          >
            <option value="">Alle Kapitel</option>
            {KAPITEL.map((k) => (
              <option key={k.name} value={k.name}>
                {k.name} ({k.anzahl})
              </option>
            ))}
          </select>
        </label>

        <label className={s.feld}>
          <span style={SCHRIFT.kicker}>Organisation</span>
          <select
            className={s.eingabe}
            data-testid="zeichen-filter-organisation"
            value={organisation}
            onChange={(e) => {
              setOrganisation(e.target.value);
              spiegele("org", e.target.value);
            }}
          >
            <option value="">Alle Organisationen</option>
            {ORGANISATIONEN.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className={s.feld}>
          <span style={SCHRIFT.kicker}>Grundform</span>
          <select
            className={s.eingabe}
            data-testid="zeichen-filter-grundform"
            value={grundform}
            onChange={(e) => {
              setGrundform(e.target.value);
              spiegele("form", e.target.value);
            }}
          >
            <option value="">Alle Grundformen</option>
            {GRUNDFORMEN.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* `aria-live`, damit ein Bildschirmleser die Zahl nach dem Tippen
          mitbekommt — das Raster darunter meldet sich selbst nicht. */}
      <p
        style={{ ...SCHRIFT.neben, marginBlockEnd: SPACE.md }}
        data-testid="zeichen-trefferzahl"
        aria-live="polite"
      >
        {treffer.length} von {gesamt} Zeichen
      </p>

      {/* Das Layout des Detailbereichs (Raster, Abstaende) steht in
          `.detailbereich` — siehe die Messung im Kopf jener Regel: eine LEERE
          Klasse taucht in der Exportkarte des CSS-Moduls gar nicht auf. */}
      {detail !== null && (
        <section className={s.detailbereich} data-testid="zeichen-detailbereich">
          <div className={s.detailblatt}>
            {/* Serverseitig erzeugtes, eingechecktes Markup aus dem Generat —
                dieselbe Vertrauenslage wie `qr/QrDisplay.tsx`. Ein vom Client
                geliefertes SVG kaeme NIE hierher (Spec §4.3). */}
            <div className={s.zeichengross} dangerouslySetInnerHTML={{ __html: detail.svg }} />
          </div>
          <h2 style={SCHRIFT.unterTitel}>{detail.titel}</h2>
          <p style={SCHRIFT.text}>{detail.bedeutung}</p>
          <dl className={s.daten}>
            <dt style={SCHRIFT.kicker}>Kapitel</dt>
            <dd style={SCHRIFT.text}>{detail.kapitel}</dd>
            <dt style={SCHRIFT.kicker}>Abschnitt</dt>
            <dd style={SCHRIFT.text}>{detail.abschnitt}</dd>
            {/* „—" statt des Wortes „undefined": `symbolKindLabel` und
                `ORGANIZATION_LABELS` liefern gemessen still `undefined` fuer
                unbekannte Werte; der Generator hat das auf `null` gedreht. */}
            <dt style={SCHRIFT.kicker}>Organisation</dt>
            <dd style={SCHRIFT.text}>{detail.organisation ?? "—"}</dd>
          </dl>

          {detail.reviewNotiz !== null && (
            <p className={s.hinweis} style={SCHRIFT.neben} data-testid="zeichen-reviewnotiz">
              {detail.reviewNotiz}
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.sm, alignItems: "center" }}>
            {offline ? (
              <p style={SCHRIFT.neben}>
                Merken braucht eine Verbindung. Nachschlagen und Durchsuchen gehen ohne.
              </p>
            ) : (
              <>
                <Button
                  data-testid="zeichen-merken"
                  loading={schreibt}
                  onClick={() =>
                    schreibe(async () => {
                      if (istGemerkt) {
                        await entferneZeichen(detail.id);
                        setMerkstand((m) => m.filter((x) => x !== detail.id));
                      } else {
                        await merkeZeichen(detail.id);
                        setMerkstand((m) => [...m, detail.id]);
                      }
                    })
                  }
                >
                  {istGemerkt ? "Aus der Merkliste nehmen" : "Merken"}
                </Button>
                {/* NUR ONLINE: `/katalog/[id]` liegt nicht im Cache, und der
                    Navigationsrueckfall des Workers schickte den Aufruf auf
                    `/offline` zurueck — dieselbe Flaeche, wie ein Fehler wirkend. */}
                <Link
                  href={`/m/zeichen/katalog/${encodeURIComponent(detail.id)}`}
                  style={SCHRIFT.text}
                >
                  Ganze Seite öffnen
                </Link>
              </>
            )}
            <Button
              data-testid="zeichen-detail-schliessen"
              onClick={() => {
                setGewaehlt("");
                spiegele("z", "");
              }}
            >
              Schließen
            </Button>
          </div>
        </section>
      )}

      {treffer.length === 0 ? (
        <p style={SCHRIFT.text} data-testid="zeichen-leer">
          Kein Zeichen passt dazu. Weniger Wörter oder ein Filter weniger helfen meistens.
        </p>
      ) : (
        <ul className={s.raster} data-testid="zeichen-raster">
          {treffer.slice(0, grenze).map((z) => (
            <li key={z.id} className={s.kachel}>
              <button
                type="button"
                className={s.kachelKnopf}
                data-testid={`zeichen-kachel-${z.id}`}
                aria-pressed={z.id === gewaehlt}
                onClick={() => waehle(z.id)}
              >
                {/* `aria-hidden` am Bild: das SVG traegt aus dem Generator
                    `aria-labelledby` auf Titel und Beschreibung, und der Titel
                    steht direkt darunter noch einmal als Text. Ohne das
                    Attribut liest ein Bildschirmleser jede Kachel doppelt vor. */}
                <span
                  className={s.zeichenflaeche}
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: z.svg }}
                />
                <span style={SCHRIFT.text}>{z.titel}</span>
                <span style={SCHRIFT.neben}>{z.abschnitt}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {treffer.length > grenze && (
        <Button
          data-testid="zeichen-mehr"
          style={{ marginBlockStart: SPACE.md }}
          onClick={() => setGrenze((g) => g + RASTER_SCHRITT)}
        >
          Weitere {Math.min(RASTER_SCHRITT, treffer.length - grenze)} anzeigen
        </Button>
      )}
    </div>
  );
}
