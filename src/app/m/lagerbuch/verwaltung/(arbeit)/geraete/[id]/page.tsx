import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, Tag } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { zeitFormat } from "@/core/zeit";
import { offeneMaengelZuGeraet } from "../../../../_lib/maengel/daten";
import type { ReactNode } from "react";
import { Seite } from "@/core/seite/Seite";
import { getDb, type DB } from "../../../../_db/client";
import { lagerortOptionen } from "../../../../_lib/lesepfade/bz";
import { standortZeile } from "../../../../_lib/konstanten";
import { geraetById } from "../../../../_lib/lesepfade/geraete";
import { Kachel } from "../../../../_ui/Kachel";
import { Kennzahlen } from "@/core/kennzahl/Kennzahl";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { GeraetAktivToggle } from "./GeraetAktivToggle";
import { GeraetForm } from "./GeraetForm";

export const dynamic = "force-dynamic";

/** Form und Form.Item bleiben ausschließlich in der Client-Insel. */
export function geraetSeitenInhalt(db: DB, id: string, jetzt: Date): ReactNode {
  const detail = geraetById(db, id, jetzt);
  if (!detail) notFound();

  const geraet = detail.geraet;
  const chip = detail.chip;
  /* `ton: "grau"` faerbt die Kante nicht (Kachel.tsx): grau ist kein
   * Ampelwert, und eine graue Kante neben rot und gruen liesse sich als
   * vierte Stufe lesen. */
  const faelligTon = chip ? chip.ton : "ok";
  /* IDA-377: was der Fahrzeug-Check (oder eine Meldung) an diesem Gerät offen hat. */
  const maengel = offeneMaengelZuGeraet(db, id);
  const datum = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <Seite typ="formular">
      <SeitenKopf
        titel={geraet.name}
        beschreibung={chip ? undefined : "Für diese Klasse ist kein Datum gepflegt."}
        zurueck={{ titel: "Geräte", href: "/verwaltung/geraete" }}
        aktionen={(
          <GeraetAktivToggle
            id={geraet.id}
            name={geraet.name}
            aktiv={geraet.aktiv}
          />
        )}
      />

      <Kennzahlen>
        <Kachel
          zahl={geraet.typ === "medizin" ? "Medizin" : "Objekt"}
          beschriftung="Gerätetyp"
        />
        <Kachel
          zahl={chip ? chip.text : "–"}
          beschriftung={geraet.typ === "medizin" ? "MTK-Fälligkeit" : "Ablauf"}
          ton={faelligTon}
        />
        <Kachel zahl={standortZeile(detail.lagerortStandort)} beschriftung="Standort" />
        <Kachel
          zahl={geraet.aktiv ? "aktiv" : "inaktiv"}
          beschriftung="Status"
          ton={geraet.aktiv ? "ok" : "gelb"}
        />
      </Kennzahlen>

      {maengel.length > 0 && (
        <Card
          title={`Offene Mängel (${maengel.length})`}
          extra={<Link href="/verwaltung/maengel">Zu den Mängeln</Link>}
          style={{ marginBlockEnd: SPACE.lg }}
          data-rolle="geraet-maengel"
        >
          {maengel.map((m) => (
            <div key={m.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SPACE.xs }}>
              {m.punkte.map((p) => <Tag key={p}>{p}</Tag>)}
              {m.beschreibung && <span>{m.beschreibung}</span>}
              <span style={{ opacity: 0.7 }}>
                {datum.format(m.createdAt)}{m.ausCheck ? " beim Check" : ""}
              </span>
            </div>
          ))}
        </Card>
      )}

      <GeraetForm
        initial={{
          id: geraet.id,
          typ: geraet.typ,
          name: geraet.name,
          barcode: geraet.barcode,
          lagerortId: geraet.lagerortId,
          anmerkung: geraet.anmerkung,
          mtkFaellig: geraet.mtkFaellig,
          beschreibung: geraet.beschreibung,
          ablaufdatum: geraet.ablaufdatum,
        }}
        lagerorte={lagerortOptionen(db)}
      />
    </Seite>
  );
}

export default async function GeraetblattSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return geraetSeitenInhalt(getDb(), id, new Date());
}

export const metadata = { title: "Gerät" };
