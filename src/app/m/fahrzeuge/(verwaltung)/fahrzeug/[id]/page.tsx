import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Seite } from "@/core/seite/Seite";
import { getDb } from "../../../_db/client";
import { ladeAkte } from "../../../_lib/akte/daten";
import { heute } from "../../../_lib/akte/heute";
import { auswerten } from "../../../_lib/akte/regeln";
import { akteVerweise } from "../../../_lib/akte/verweise";
import { requireFahrzeugeHost } from "../../../_lib/host";
import { darfFahrzeugeVerwalten, requireFahrzeugeZugang } from "../../../_lib/zugang";
import { Fahrzeugakte } from "../../../_ui/akte/Fahrzeugakte";

export const dynamic = "force-dynamic";

/**
 * Die Akte eines Fahrzeugs (IDA-299). Lesen darf, wer Zugang zum Modul hat — auch die Akte eines
 * Fahrzeugs außer Dienst; alles Ändernde hängt an `darfVerwalten` und wird in jeder Action noch einmal
 * geprüft. Eine unbekannte Kennung ist ein 404. Über dieser Seite liegt keine `loading.tsx`, und das muss
 * so bleiben: unter einer Ladegrenze käme das 404 mit Status 200 an (Falle 23).
 */
export default async function FahrzeugakteSeite({ params }: { params: Promise<{ id: string }> }) {
  requireFahrzeugeHost(await headers());
  const viewer = await requireFahrzeugeZugang();
  const { id } = await params;
  const db = getDb();
  const akte = ladeAkte(db, id);
  if (!akte) notFound();
  const tag = heute();
  return (
    <Seite typ="uebersicht">
      <Fahrzeugakte
        eintrag={{ akte, stand: auswerten(akte, tag) }}
        darfVerwalten={darfFahrzeugeVerwalten(viewer.groups)}
        heute={tag}
        verweise={akteVerweise(db, akte.fahrzeug, viewer.groups)}
      />
    </Seite>
  );
}

export const metadata = { title: "Fahrzeugakte" };
