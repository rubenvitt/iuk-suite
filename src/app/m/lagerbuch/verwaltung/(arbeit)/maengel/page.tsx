/**
 * MÄNGEL (IDA-298) — was Helfer nach dem Scan eines Ortsetiketts gemeldet haben. Offene zuerst, älteste
 * oben; darunter die zuletzt erledigten, damit ein versehentliches „Erledigt" zurückzunehmen ist.
 *
 * Gegatet durch das Layout der Gruppe `(arbeit)`. Die Fotos liefert ein eigener Handler, der selbst
 * prüft (`foto/[id]/[nummer]/route.ts`).
 */
import { Card } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat, type ZeitFormat } from "@/core/zeit";
import { getDb } from "../../../_db/client";
import { erledigteMaengel, offeneMaengel, type MangelZeile } from "../../../_lib/maengel/daten";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { ErledigteMaengel, OffeneMaengel, type MangelKarte } from "./MaengelListe";

export const dynamic = "force-dynamic";

function alsKarte(m: MangelZeile, format: ZeitFormat): MangelKarte {
  return {
    id: m.id,
    ort: m.ort,
    ortAktiv: m.ortAktiv,
    punkte: m.punkte,
    beschreibung: m.beschreibung,
    melderName: m.melderName,
    fotos: m.fotos,
    gemeldet: format.format(m.createdAt),
    erledigt: m.erledigtAt ? format.format(m.erledigtAt) : null,
    erledigtVermerk: m.erledigtVermerk,
  };
}

export default function MaengelSeite() {
  const db = getDb();
  const format = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const offen = offeneMaengel(db).map((m) => alsKarte(m, format));
  const erledigt = erledigteMaengel(db).map((m) => alsKarte(m, format));

  return (
    <>
      <SeitenKopf
        titel="Mängel"
        beschreibung="Von Helfern gemeldet, nachdem sie das Ortsetikett an einem Schrank, Fahrzeug oder einer Tasche gescannt haben."
      />
      <Card title={`Offen (${offen.length})`} style={{ marginBlockEnd: SPACE.lg }}>
        <OffeneMaengel maengel={offen} />
      </Card>
      <Card title="Zuletzt erledigt">
        <ErledigteMaengel maengel={erledigt} />
      </Card>
    </>
  );
}
