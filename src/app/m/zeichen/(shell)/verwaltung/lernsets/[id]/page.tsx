import { notFound } from "next/navigation";
import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../../../_db/client";
import { einLernsetMitEintraegen } from "../../../../_db/lernen";
import { findeZeichen } from "../../../../_lib/katalog";
import { fragbareZeichen } from "../../../../_lib/lernen/fragen";
import { LernsetEintraege } from "../../../../_ui/LernsetEintraege";
import s from "../../../../_ui/zeichen.module.css";

/**
 * DIE LERNSET-VERWALTUNG — DETAIL. `moduleAdminPageOrNotFound` als erste Anweisung
 * (Falle-9-freies Muster wie die Liste). `params.id` kommt aus einer Datenbank-ID
 * (nanoid), keine Katalog-ID — die Prozentkodierungsfalle aus `zeichenIdAusPfad`
 * (Falle in `_lib/katalog.ts`) betrifft diesen Pfad nicht.
 */
export const dynamic = "force-dynamic";

export default async function LernsetDetailSeite(props: { params: Promise<{ id: string }> }) {
  await moduleAdminPageOrNotFound("zeichen");

  const { id } = await props.params;
  const db = getDb();
  const gefunden = einLernsetMitEintraegen(db, id);
  if (!gefunden) notFound();
  const { set, eintraege } = gefunden;

  const eintraegeAnzeige = eintraege.map((e) => {
    const zeichen = findeZeichen(e.zeichenId);
    return {
      zeichenId: e.zeichenId,
      titel: zeichen ? zeichen.titel : e.titelSchnappschuss,
      verwaist: zeichen === null,
    };
  });

  const vorhandeneIds = new Set(eintraege.map((e) => e.zeichenId));
  const optionen = fragbareZeichen()
    .filter((z) => !vorhandeneIds.has(z.id))
    .map((z) => ({ id: z.id, titel: z.titel }));

  return (
    <div className={s.modul}>
      <Seitenkopf
        titel={set.titel}
        beschreibung={`Kürzel „${set.slug}“ — Zeichen für dieses Lernset pflegen.`}
        zurueck={{ titel: "Lernsets", href: "/m/zeichen/verwaltung/lernsets" }}
      />
      <LernsetEintraege set={set} eintraege={eintraegeAnzeige} optionen={optionen} />
    </div>
  );
}
