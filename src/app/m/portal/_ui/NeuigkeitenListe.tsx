"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Result } from "antd";

import { Filterchips } from "@/core/filterchips/Filterchips";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Statuschip } from "@/core/status/Statuschip";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import type { NeuigkeitenGesehen } from "@/app/m/portal/_db/schema";
import { formatiereDatum } from "@/app/m/portal/_lib/neuigkeiten/datum";
import type { Neuigkeit, NeuigkeitenApp, NeuigkeitenSeite } from "@/app/m/portal/_lib/neuigkeiten/auswahl";
import { ALLE_APPS, istNeu } from "@/app/m/portal/_lib/neuigkeiten/neu";
import type { Notizblock } from "@/app/m/portal/_lib/neuigkeiten/typen";
import { ladeNeuigkeitenAction, merkeNeuigkeitenGesehenAction } from "@/app/m/portal/neuigkeiten/actions";

/**
 * DIE NEUIGKEITEN ALS LESBARE SEITE — Client-Insel, weil Filter und Nachladen Zustand brauchen. Die
 * Seite darüber bleibt Server Component und übergibt nur serialisierbare Daten (Falle 9).
 *
 * SEITENWEISE (IDA-391): die Insel bekommt nur die erste Seite; „Ältere anzeigen" und der App-Filter
 * fragen den Server (`neuigkeiten/actions.ts`). Der Filter kann deshalb nicht mehr in einer
 * vollständig gelieferten Liste ausblenden — eine App, deren Notizen alle weiter hinten liegen, wäre
 * sonst leer. Werte nur aus `neu.ts`, nie aus `auswahl.ts`: das zöge das Register ins Bundle.
 *
 * „NEU" vergleicht gegen den Stand VOR diesem Besuch (`neuSeit` von der Seite). Der Besuch selbst
 * wird erst nach dem Anzeigen gemerkt; die Chips bleiben bis zum nächsten Aufruf stehen.
 */
export function NeuigkeitenListe({
  erste,
  apps,
  neuSeit,
  merken,
}: {
  erste: NeuigkeitenSeite;
  apps: readonly NeuigkeitenApp[];
  neuSeit: NeuigkeitenGesehen | null;
  merken: boolean;
}) {
  const [modul, setModul] = useState<string>(ALLE_APPS);
  const [eintraege, setEintraege] = useState<Neuigkeit[]>(erste.eintraege);
  const [weitere, setWeitere] = useState(erste.weitere);
  const [laedt, setLaedt] = useState<"filter" | "aeltere" | null>(null);
  const [fehler, setFehler] = useState(false);
  // Sprungziel, auf das nach dem Nachladen gerollt wird — ein Ref, kein Zustand: es löst kein Rendern aus.
  const ziel = useRef<string | null>(null);
  // Nur die jüngste Anfrage darf die Liste setzen — ein schneller Filterwechsel überholt sonst.
  const anfrage = useRef(0);

  useEffect(() => {
    if (merken) merkeNeuigkeitenGesehenAction().catch(() => undefined);
  }, [merken]);

  // Sprungmarke auf eine Notiz, die nicht auf der ersten Seite steht: bis dorthin nachladen.
  useEffect(() => {
    const slug = decodeURIComponent(window.location.hash.slice(1));
    if (!slug || erste.eintraege.some((n) => n.slug === slug)) return;
    const nr = ++anfrage.current;
    ladeNeuigkeitenAction(ALLE_APPS, 0, slug).then((seite) => {
      if (!seite || nr !== anfrage.current) return;
      setEintraege(seite.eintraege);
      ziel.current = slug;
      setWeitere(seite.weitere);
    }, () => undefined);
  }, [erste]);

  useEffect(() => {
    if (!ziel.current) return;
    document.getElementById(ziel.current)?.scrollIntoView();
    ziel.current = null;
  }, [eintraege]);

  async function lade(art: "filter" | "aeltere", filter: string, ab: number) {
    const nr = ++anfrage.current;
    setLaedt(art);
    setFehler(false);
    try {
      const seite = await ladeNeuigkeitenAction(filter, ab);
      if (nr !== anfrage.current) return;
      if (!seite) throw new Error("keine Seite");
      setEintraege((bisher) => (ab === 0 ? seite.eintraege : [...bisher, ...seite.eintraege]));
      setWeitere(seite.weitere);
    } catch {
      if (nr === anfrage.current) setFehler(true);
    } finally {
      if (nr === anfrage.current) setLaedt(null);
    }
  }

  function wechsle(wert: string) {
    setModul(wert);
    if (wert === ALLE_APPS) {
      // Die erste Seite ohne Filter liegt schon vor.
      anfrage.current += 1;
      setEintraege(erste.eintraege);
      setWeitere(erste.weitere);
      setLaedt(null);
      setFehler(false);
      return;
    }
    void lade("filter", wert, 0);
  }

  // `Result status="info"` und kein Fehler: hier fehlt nichts, es ist schlicht noch nichts passiert.
  if (apps.length === 0) {
    return <Result data-testid="neuigkeiten-leer" status="info" title="Hier steht noch nichts" />;
  }

  const gesamt = apps.reduce((summe, a) => summe + a.anzahl, 0);

  return (
    <div
      data-testid="neuigkeiten"
      aria-busy={laedt !== null}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.lg, minInlineSize: 0 }}
    >
      {/* Ein Schalter mit „Alle" und genau einer App wäre eine Beschriftung, kein Filter. */}
      {apps.length > 1 ? (
        <div data-testid="neuigkeiten-filter" style={{ minInlineSize: 0, maxInlineSize: "100%" }}>
          <Filterchips
            aria-label="App"
            wert={modul}
            onChange={wechsle}
            optionen={[
              { wert: ALLE_APPS, label: "Alle", anzahl: gesamt },
              ...apps.map((a) => ({ wert: a.key, label: a.titel, anzahl: a.anzahl })),
            ]}
          />
        </div>
      ) : null}

      {fehler ? (
        <Alert type="error" showIcon title="Laden hat nicht geklappt. Versuch es noch einmal." />
      ) : null}

      <div
        style={{
          display: "flex", flexDirection: "column", gap: SPACE.lg,
          opacity: laedt === "filter" ? 0.6 : 1,
        }}
      >
        {eintraege.map((n) => {
          const neu = istNeu(n, neuSeit);
          return (
            // `id` = Sprungmarke: `/neuigkeiten#checkliste-als-pdf` führt auf genau diese Notiz.
            <Card key={`${n.modul}/${n.slug}`} id={n.slug} data-testid="notiz" data-modul={n.modul} data-neu={neu ? "ja" : undefined}>
              <div
                style={{
                  ...SCHRIFT.kicker,
                  color: "var(--iuk-gedaempft)",
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: SPACE.sm,
                  marginBlockEnd: SPACE.xs,
                }}
              >
                <Icons8Ikone name={n.icon} />
                <span>{n.modulTitel}</span>
                <span aria-hidden="true">·</span>
                {/* `<time>` mit Maschinendatum: die Anzeige ist ausgeschrieben, der Wert bleibt lesbar. */}
                <time dateTime={n.datum}>{formatiereDatum(n.datum)}</time>
                {neu ? <Statuschip ton="info">Neu</Statuschip> : null}
              </div>

              {/* Nacktes `<h2>`: die Seite trägt schon ein `<h1>` im `Seitenkopf`. */}
              <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.md}px`, overflowWrap: "anywhere" }}>{n.titel}</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
                {n.inhalt.map((block, i) => (
                  <NotizBlock key={i} block={block} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {weitere ? (
        <Button
          data-testid="neuigkeiten-aeltere"
          loading={laedt === "aeltere"}
          disabled={laedt === "filter"}
          onClick={() => void lade("aeltere", modul, eintraege.length)}
          style={{ alignSelf: "flex-start" }}
        >
          Ältere anzeigen
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Ein Block, eine Darstellung. Der `default`-Zweig ist kein toter Code, sondern
 * die Stelle, an der eine neue Blockart in `typen.ts` sofort auffällt: `never`
 * macht sie zu einem Typfehler, lange bevor jemand eine Notiz damit schreibt.
 */
function NotizBlock({ block }: { block: Notizblock }) {
  switch (block.art) {
    case "absatz":
      // `72ch` wie im `Seitenkopf`: eine Zeile, die über die volle Breite eines
      // Bildschirms läuft, verliert beim Zeilenwechsel den Anschluss.
      return <p style={{ ...SCHRIFT.text, maxWidth: "72ch", margin: 0 }}>{block.text}</p>;
    case "liste":
      return (
        <ul style={{ ...SCHRIFT.text, maxWidth: "72ch", margin: 0, paddingInlineStart: SPACE.xl }}>
          {block.punkte.map((punkt, i) => (
            <li key={i}>{punkt}</li>
          ))}
        </ul>
      );
    case "hinweis":
      // `type="info"` und ausdrücklich nicht `"error"`/`"warning"`: der Hinweis
      // sagt, was zu tun ist, und meldet keine Störung. Die Fehlerfarbe IST
      // ohnehin die Primärfarbe (Falle 3) — ein roter Kasten hier läse sich wie
      // eine Aufforderung, die etwas kaputtmacht.
      // `title` und nicht `message`: antd 6 hat `message` zwar noch, meldet es
      // aber zur Laufzeit als veraltet — eine Warnung, die in der CI steht und
      // niemandem nützt.
      return <Alert type="info" showIcon title={block.text} data-testid="notiz-hinweis" />;
    default: {
      const unbekannt: never = block;
      throw new Error(`Unbekannte Blockart in einer Release Note: ${JSON.stringify(unbekannt)}`);
    }
  }
}
