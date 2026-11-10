"use client";

import { useMemo, useRef, useState } from "react";
import { Button, Card, Collapse } from "antd";
import { Ruhezustand } from "@/core/ruhe";

import { KACHEL_GRUND, TINTE } from "@/core/favicon/zeichen";
import { Icons8Ikone, type Icons8Name } from "@/core/ikonen/Icons8Ikone";
import type { LauncherEintrag } from "@/core/shell/types";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { merkeDienstAufrufAction, setzeAngeheftetAction } from "@/app/m/portal/actions";
import {
  istViel,
  mitVerwaltungAmModul,
  ordneAlle,
  persoenlich,
  type Auswahl,
  type GeordneterEintrag,
} from "@/core/shell/launcherAuswahl";

const OHNE_AUSWAHL: Auswahl = { angeheftet: [], zuletzt: [] };

/**
 * DAS PORTAL ALS VOLLFLÄCHIGE ANSICHT DERSELBEN LISTE, die der Umschalter als
 * Popover zeigt. Eine Wahrheit, zwei Darstellungen.
 *
 * Client-Insel: Anheften und Aufklappen brauchen Zustand. Die Seite darüber
 * bleibt Server Component und übergibt fertige Daten.
 *
 * KEIN EIGENES SUCHFELD MEHR (IDA-391): „Springen zu" im Menü findet dieselben
 * Apps und Dienste und dazu die Inhalte der Module (`Navigator`). Zwei Felder
 * mit fast derselben Aufgabe auf einer Seite ließen raten, welches was kann.
 *
 * KEIN `Alert type="error"` im Leerzustand: `colorError === colorPrimary ===
 * #c8000f`, ein fehlender Zugang sähe damit aus wie eine Primäraktion — und
 * er ist keine Störung, sondern eine Auskunft (Falle 3).
 */
export function DiensteRaster({
  eintraege,
  ansprechpartner,
  auswahl = OHNE_AUSWAHL,
  bereiche = [],
}: {
  eintraege: LauncherEintrag[];
  ansprechpartner: string | null;
  /** Angeheftet und Zuletzt der Person (IDA-338); wirkt erst ab `VIELE_EINTRAEGE_AB` Einträgen. */
  auswahl?: Auswahl;
  /** Reihenfolge der App-Bereiche, als Namen über die RSC-Grenze gereicht. */
  bereiche?: readonly string[];
}) {
  // IDA-338: die persönliche Ordnung. `angeheftet` lebt hier, damit ein Klick sofort wirkt; die
  // Aktion schreibt dahinter und meldet den gespeicherten Stand zurück.
  const [angeheftet, setAngeheftet] = useState(auswahl.angeheftet);
  const viel = istViel(eintraege);
  const geordnet = useMemo(() => mitVerwaltungAmModul(eintraege), [eintraege]);
  const eigene = useMemo(
    () => persoenlich(geordnet, { angeheftet, zuletzt: auswahl.zuletzt }),
    [geordnet, angeheftet, auswahl.zuletzt],
  );
  const alle = useMemo(() => ordneAlle(geordnet, bereiche), [geordnet, bereiche]);
  const hatEigene = eigene.angeheftet.length + eigene.zuletzt.length > 0;
  // Zu steht „Alle“ nur, wenn etwas angeheftet ist (IDA-391): Anheften ist eine bewusste Wahl,
  // „Zuletzt“ entsteht von selbst und ersetzt die Übersicht nicht. Entschieden wird einmal beim
  // Laden: das erste Anheften darf die Liste nicht unter der Hand zuklappen.
  const [alleSichtbar, setAlleOffen] = useState(() => eigene.angeheftet.length === 0);

  // Jeder Klick zählt hoch; eine Antwort gilt nur, solange kein neuerer Klick unterwegs ist —
  // sonst setzte der Stand des ersten Klicks den zweiten zurück.
  const anheftKlick = useRef(0);
  function anheften(key: string, an: boolean) {
    const vorher = angeheftet;
    const nummer = ++anheftKlick.current;
    setAngeheftet(an ? [...vorher.filter((k) => k !== key), key] : vorher.filter((k) => k !== key));
    setzeAngeheftetAction(key, an).then(
      (gespeichert) => {
        if (nummer === anheftKlick.current) setAngeheftet(gespeichert ?? vorher);
      },
      () => {
        if (nummer === anheftKlick.current) setAngeheftet(vorher);
      },
    );
  }

  function merkeDienst(key: string) {
    if (!key.startsWith("dienst:")) return;
    // Feuer und vergessen: ein Dienst öffnet im neuen Tab, ein Fehler hier kostet nur „Zuletzt“.
    merkeDienstAufrufAction(key).catch(() => undefined);
  }

  function kachel(e: LauncherEintrag) {
    const zeichen = e.icon ?? "link";
    return (
      // Der Link liegt AUSSEN: antds Card rendert kein <a>, und die Kachel ist die einzige
      // Navigation ins Ziel. Die Spalten stellt `.portal-kacheln` (portal.css).
      <a
        key={e.key}
        href={e.href}
        target={e.extern ? "_blank" : undefined}
        rel={e.extern ? "noopener noreferrer" : undefined}
        data-testid="service-tile"
        onClick={() => merkeDienst(e.key)}
        className="portal-kachel-link"
        style={{ display: "block", blockSize: "100%" }}
      >
        {/* Die beiden Klassen tragen die Kachelkante und den
            Fokusabgriff aus `portal.css` — `e2e/portal.spec.ts`
            misst sie in Ruhe und im Hover, und die Kaskade
            dahinter besitzt kein Quelltext-Scan. Ohne sie fällt
            der Test, nicht der Build.

            KEIN Kicker mit `e.abschnitt` auf der Kachel: die
            Rubrik steht jetzt als Abschnittsüberschrift darüber,
            und zweimal dasselbe Wort wäre Dekoration im Gewand
            von Struktur. */}
        <Card
          hoverable
          size="small"
          className="portal-kachel"
          style={{ blockSize: "100%" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
            {!e.extern ? (
              <AppZeichen url={e.appIconUrl} zeichen={zeichen} />
            ) : e.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={e.iconUrl}
                alt=""
                width={20}
                height={20}
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            ) : (
              <Icons8Ikone name={zeichen} />
            )}
            {/* Ganze Wörter (IDA-391): `hyphens: auto` trennte am Telefon
                „Statusmoni-tor“. Die Spalten (`.portal-kacheln`) sind so breit,
                dass ein App-Name passt; die Version rutscht dafür unter den
                Titel, statt ihn zu verengen. Die Regeln stehen in portal.css. */}
            <span className="portal-kachel-kopf">
              <span
                data-testid="kachel-titel"
                className="portal-kachel-titel"
                style={{ ...SCHRIFT.unterTitel, fontSize: 16 }}
              >
                {e.title}
              </span>
              {e.version ? (
                <span
                  data-testid="kachel-version"
                  className="portal-kachel-version"
                  style={{ ...SCHRIFT.neben, color: "var(--iuk-gedaempft)" }}
                >
                  {e.version}
                </span>
              ) : null}
            </span>
          </div>
          {e.beschreibung ? (
            <div
              style={{
                ...SCHRIFT.neben,
                color: "var(--iuk-gedaempft)",
                marginBlockStart: SPACE.xs,
              }}
            >
              {e.beschreibung}
            </div>
          ) : null}
        </Card>
      </a>
    );
  }

  function pinKnopf(e: LauncherEintrag) {
    const an = angeheftet.includes(e.key);
    return (
      <Button
        type="text"
        data-testid="anheften"
        className="portal-anheften"
        aria-pressed={an}
        aria-label={an ? `${e.title} lösen` : `${e.title} anheften`}
        title={an ? "Lösen" : "Anheften"}
        icon={<Icons8Ikone name="pin" />}
        onClick={() => anheften(e.key, !an)}
      />
    );
  }

  function zeile(e: GeordneterEintrag) {
    return (
      <div key={e.key} data-testid="portal-zeile" className="portal-zeile">
        <a
          href={e.href}
          target={e.extern ? "_blank" : undefined}
          rel={e.extern ? "noopener noreferrer" : undefined}
          className="portal-zeile-link"
          onClick={() => merkeDienst(e.key)}
        >
          {!e.extern ? (
            <AppZeichen url={e.appIconUrl} zeichen={e.icon ?? "link"} groesse={28} />
          ) : e.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.iconUrl} alt="" width={20} height={20} referrerPolicy="no-referrer" loading="lazy" />
          ) : (
            <Icons8Ikone name={e.icon ?? "link"} />
          )}
          <span className="portal-zeile-titel">{e.title}</span>
        </a>
        {e.verwaltung ? (
          <a href={e.verwaltung.href} className="portal-zweitlink" aria-label={e.verwaltung.titel}>
            Verwaltung
          </a>
        ) : null}
        {pinKnopf(e)}
      </div>
    );
  }

  function ueberschrift(titel: string, anzahl?: number) {
    return (
      <h2
        data-testid="portal-abschnitt"
        style={{ ...SCHRIFT.kicker, color: "var(--iuk-gedaempft)", marginBlock: "0 12px" }}
      >
        {titel}
        {anzahl !== undefined ? <span className="portal-anzahl">{anzahl}</span> : null}
      </h2>
    );
  }

  function persoenlicheAnsicht() {
    return (
      <>
        {eigene.angeheftet.length > 0 ? (
          <section data-testid="portal-angeheftet">
            {ueberschrift("Angeheftet")}
            <div className="portal-kacheln">{eigene.angeheftet.map(kachel)}</div>
          </section>
        ) : (
          // Eine Zeile statt Figur (IDA-391): die Figur schob „Alle“ aus dem ersten Bild. Das
          // Zeichen ist das des Knopfs an jeder Zeile — es zeigt, womit man anheftet.
          <p data-testid="portal-ohne-angeheftet" className="portal-ohne-angeheftet">
            <Icons8Ikone name="pin" />
            Noch nichts angeheftet
          </p>
        )}
        {eigene.zuletzt.length > 0 ? (
          <section data-testid="portal-zuletzt">
            {ueberschrift("Zuletzt")}
            <div className="portal-zeilen">{eigene.zuletzt.map(zeile)}</div>
          </section>
        ) : null}
        {hatEigene ? (
          <button
            type="button"
            data-testid="portal-alle"
            className="portal-aufklapper"
            aria-expanded={alleSichtbar}
            onClick={() => setAlleOffen((v) => !v)}
          >
            <span style={SCHRIFT.kicker}>Alle Apps & Dienste</span>
            <span className="portal-anzahl">{geordnet.length}</span>
            <Icons8Ikone name={alleSichtbar ? "chevron-up" : "chevron-down"} />
          </button>
        ) : null}
        {alleSichtbar ? (
          <div data-testid="portal-alle-liste" style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
            {alle.apps.map(([titel, liste]) => (
              <section key={titel}>
                {ueberschrift(titel)}
                <div className="portal-zeilen">{liste.map(zeile)}</div>
              </section>
            ))}
            {alle.dienste.length > 0 ? (
              <section>
                {ueberschrift("Weitere Dienste", alle.dienste.reduce((n, [, l]) => n + l.length, 0))}
                <Collapse
                  bordered={false}
                  className="portal-kategorien"
                  items={alle.dienste.map(([titel, liste]) => ({
                    key: titel,
                    label: (
                      <span className="portal-kategorie">
                        <span>{titel}</span>
                        <span className="portal-kategorie-namen" data-testid="portal-kategorie-namen">{liste.map((e) => e.title).join(" · ")}</span>
                      </span>
                    ),
                    children: <div className="portal-zeilen">{liste.map(zeile)}</div>,
                  }))}
                />
              </section>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

  const abschnitte = useMemo(() => {
    const map = new Map<string, LauncherEintrag[]>();
    for (const e of eintraege) {
      const bisher = map.get(e.abschnitt);
      if (bisher) bisher.push(e);
      else map.set(e.abschnitt, [e]);
    }
    return [...map.entries()];
  }, [eintraege]);

  // Nichts freigeschaltet: kein leeres Raster, sondern eine Auskunft.
  if (eintraege.length === 0) {
    return (
      <div data-testid="portal-leer">
        <Ruhezustand figur="portal" titel="Für dich ist noch nichts freigeschaltet" />
        {ansprechpartner ? (
          <p data-testid="portal-kontakt" style={{ ...SCHRIFT.neben, color: "var(--iuk-gedaempft)", margin: 0 }}>
            Ansprechpartner: {ansprechpartner}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-testid="portal-grid"
      style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}
    >
      {viel ? (
        persoenlicheAnsicht()
      ) : (
        abschnitte.map(([titel, liste]) => (
          <section key={titel}>
            {/* `--iuk-gedaempft` statt `opacity`: Deckkraft dimmt den Kontrast
                unprüfbar mit und hat keinen Dunkelzweig (übernommen aus der
                Typografie-Runde, die diese Seite zuletzt angefasst hat). */}
            <h2
              data-testid="portal-abschnitt"
              style={{ ...SCHRIFT.kicker, color: "var(--iuk-gedaempft)", marginBlock: "0 12px" }}
            >
              {titel}
            </h2>
            <div className="portal-kacheln">{liste.map(kachel)}</div>
          </section>
        ))
      )}
    </div>
  );
}

/** Kante des App-Icons auf der Kachel; der Radius ist der der Kachel im Icon (112/512). */
const APP_ZEICHEN = 40;
const APP_RADIUS = Math.round((APP_ZEICHEN * 112) / 512);

/*
 * DAS APP-ICON EINES SUITE-MODULS — dasselbe wie auf dem Startbildschirm
 * (`core/favicon/app-icon.ts`). Module ohne eigenes Zeichen bekommen ihr
 * Icons8-Zeichen auf derselben Kachel, damit die Reihe der Apps einheitlich
 * bleibt.
 *
 * Die Kachel ist in beiden Themen weiß, wie das Icon selbst — es ist ein
 * eingebranntes Bild, kein Bedienelement. Die Haarlinie in `--iuk-linie` hebt
 * sie im hellen Thema von der weißen Card ab.
 */
function AppZeichen({ url, zeichen, groesse = APP_ZEICHEN }: { url?: string; zeichen: Icons8Name; groesse?: number }) {
  const rahmen = {
    inlineSize: groesse,
    blockSize: groesse,
    flex: "none",
    borderRadius: groesse === APP_ZEICHEN ? APP_RADIUS : Math.round((groesse * 112) / 512),
    boxShadow: "0 0 0 1px var(--iuk-linie)",
  } as const;
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img data-testid="app-zeichen" src={url} alt="" width={groesse} height={groesse} style={rahmen} />
    );
  }
  return (
    <span
      data-testid="app-zeichen"
      style={{
        ...rahmen,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: KACHEL_GRUND,
        color: TINTE,
      }}
    >
      <Icons8Ikone name={zeichen} groesse={Math.round(groesse * 0.6)} />
    </span>
  );
}
