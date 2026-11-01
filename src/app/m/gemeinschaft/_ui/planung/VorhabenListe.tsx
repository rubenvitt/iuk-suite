"use client";

import { useState } from "react";
import { Button, Empty, Segmented } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import type { FormularDaten, VorhabenArt, VorhabenKarteDTO } from "../../_lib/vorhabenTypen";
import { useTokensAmBody } from "./fokus";
import s from "./planung.module.css";
import { VorhabenKarte } from "./teile";
import { useVorhabenFlyin, VorhabenFlyin } from "./VorhabenFormular";

const TEXTE: Record<VorhabenArt, { titel: string; beschreibung: string; neu: string }> = {
  event: {
    titel: "Events",
    beschreibung: "Termine mit Datum und Uhrzeit. Ein Event kann zu einem Projekt gehören und die Bar belegen.",
    neu: "Event anlegen",
  },
  projekt: {
    titel: "Projekte",
    beschreibung: "Vorhaben über mehrere Wochen ohne festen Tag, mit Aufgabenliste. Events können dazugehören.",
    neu: "Projekt anlegen",
  },
};

/** Events (kommend/vorbei) oder Projekte als Karten, dazu „… anlegen“ im Flyin (POC `Liste`). */
export function VorhabenListe({ art, kommend, vorbei = [], daten }: {
  art: VorhabenArt; kommend: VorhabenKarteDTO[]; vorbei?: VorhabenKarteDTO[]; daten: FormularDaten;
}) {
  useTokensAmBody();
  const flyin = useVorhabenFlyin();
  const [zeit, setZeit] = useState<"kommend" | "vorbei">("kommend");
  const t = TEXTE[art];
  const liste = art === "event" && zeit === "vorbei" ? vorbei : kommend;
  return (
    <div className={s.modul}>
      <Seitenkopf
        titel={t.titel}
        beschreibung={t.beschreibung}
        aktionen={<Button type="primary" icon={<Icons8Ikone name="plus" groesse={18} />} onClick={() => flyin.oeffne({ art })}>{t.neu}</Button>}
      />
      {art === "event" ? (
        <Segmented value={zeit} onChange={(w) => setZeit(w as "kommend" | "vorbei")} style={{ justifySelf: "start" }}
          options={[{ value: "kommend", label: `Kommend (${kommend.length})` }, { value: "vorbei", label: `Vorbei (${vorbei.length})` }]} />
      ) : null}
      {liste.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={art === "projekt" ? "Noch keine Projekte." : zeit === "kommend" ? "Keine kommenden Events. Leg mit „Event anlegen“ eins an." : "Noch keine vergangenen Events."} />
      ) : (
        <div className={s.karten}>{liste.map((v) => <VorhabenKarte key={v.id} v={v} />)}</div>
      )}
      <VorhabenFlyin zustand={flyin.zustand} schliesse={flyin.schliesse} daten={daten} />
    </div>
  );
}
