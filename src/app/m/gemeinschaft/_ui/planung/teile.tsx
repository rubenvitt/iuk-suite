/**
 * Kleine Bausteine der Planung, die Server Components UND Client-Inseln benutzen: reine Funktionen ohne
 * Hook und ohne Direktive (Falle 6). antd nur mit Komponenten, die in RSC sicher sind (`Progress`, Falle 1);
 * Zeichen nur `Icons8Ikone` (Falle 7).
 */
import Link from "next/link";
import { Progress } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import type { Vertragsstand } from "../../_lib/uebersicht";
import {
  datumsblock, fortschritt, kalendertagMittel, kuerzel, zeitraumText, type MitgliedWahl, type VorhabenKarteDTO,
} from "../../_lib/vorhabenTypen";
import s from "./planung.module.css";

export type Ton = "ok" | "gelb" | "grau";

export function Chip({ ton, children }: { ton: Ton | "projekt"; children: React.ReactNode }) {
  return <span className={`${s.chip} ${s[ton]}`}>{children}</span>;
}

export function ArtChip({ art }: { art: "event" | "projekt" }) {
  return art === "event" ? <Chip ton="grau">Event</Chip> : <Chip ton="projekt">Projekt</Chip>;
}

const VERTRAG: Record<Vertragsstand, { text: string; ton: Ton }> = {
  offen: { text: "Vertrag offen", ton: "gelb" },
  verschickt: { text: "Vertrag verschickt", ton: "grau" },
  unterschrieben: { text: "Vertrag unterschrieben", ton: "ok" },
};

export function VertragChip({ stand }: { stand: Vertragsstand }) {
  return <Chip ton={VERTRAG[stand].ton}>{VERTRAG[stand].text}</Chip>;
}

/** Wie viele offene Aufgaben noch niemanden haben — oder „besetzt“. */
export function BesetztChip({ offen }: { offen: number }) {
  return offen > 0 ? <Chip ton="gelb">{offen} ohne Zuständige</Chip> : <Chip ton="ok">besetzt</Chip>;
}

export function Datumsblock({ ms }: { ms: number }) {
  const d = datumsblock(ms);
  return (
    <span className={s.datumsblock} aria-hidden="true">
      <span>{d.monat}</span><b>{d.tag}</b><span>{d.wochentag}</span>
    </span>
  );
}

export function Person({ m }: { m: MitgliedWahl | null | undefined }) {
  if (!m) return null;
  return (
    <span className={s.person}>
      <span className={s.kreis} aria-hidden="true">{kuerzel(m.name)}</span>
      <span>{m.name}</span>
    </span>
  );
}

/** Eine Karte in Events-, Projekte- und Projektliste (POC `VorhabenKarte`). Ganz ein Link auf `/v/<id>`. */
export function VorhabenKarte({ v }: { v: VorhabenKarteDTO }) {
  const zeile = v.art === "event"
    ? zeitraumText(v.von!, v.bis!) + (v.ort ? ` · ${v.ort}` : "")
    : (v.ziel ? `fertig bis ${kalendertagMittel(v.ziel)}` : "ohne Zieltermin") + (v.events ? ` · ${v.events} ${v.events === 1 ? "Event" : "Events"}` : "");
  return (
    <Link href={`/v/${v.id}`} className={`${s.vorhabenKarte} ${v.vorbei ? s.vorbei : ""}`} data-vorhaben={v.id}>
      {v.art === "event"
        ? <Datumsblock ms={v.von!} />
        : <span className={s.projektZeichen} aria-hidden="true"><Icons8Ikone name="folder" groesse={26} /></span>}
      <span className={s.vkText}>
        <span className={s.vkTitel}>{v.titel}</span>
        <span className={s.neben}>{zeile}</span>
        {v.projekt ? <span className={s.neben}>Teil von „{v.projekt.titel}“</span> : null}
        <span className={s.vkFuss}>
          <Person m={v.verantwortlich} />
          <span className={s.neben}>{v.aufgaben ? `${v.erledigt} von ${v.aufgaben} Aufgaben erledigt` : "noch keine Aufgaben"}</span>
          {v.ohneZustaendige > 0 && !v.vorbei ? <Chip ton="gelb">{v.ohneZustaendige} ohne Zuständige</Chip> : null}
          {v.vorbei ? <Chip ton="grau">vorbei</Chip> : null}
        </span>
        {v.art === "projekt" && v.aufgaben > 0
          ? <Progress percent={fortschritt(v)} showInfo={false} strokeColor="var(--gp-graphit)" aria-label={`${fortschritt(v)} Prozent erledigt`} />
          : null}
      </span>
    </Link>
  );
}
