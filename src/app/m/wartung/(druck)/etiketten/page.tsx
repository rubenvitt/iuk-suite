import Link from "next/link";
import { headers } from "next/headers";
import { qrSvg } from "@/core/qr";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../_db/client";
import { gruppenAuswahl, linkBasisAus, qrZiel } from "../../_lib/ansicht";
import { ladeGeraete, ladeGruppen } from "../../_lib/daten";
import { heute } from "../../_lib/heute";
import { requireVerwalter } from "../../_lib/zugang";
import { DruckKnopf } from "../../_ui/DruckKnopf";
import { GruppenFilter } from "../../_ui/GruppenFilter";
import s from "../../_ui/wartung.module.css";

export const dynamic = "force-dynamic";

/** QR-Etiketten zum Aufkleben; `?geraet=` druckt nur eines (aus der Akte). */
export default async function EtikettenSeite({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { rechte } = await requireVerwalter();
  const db = getDb();
  const q = await searchParams;
  const auswahl = gruppenAuswahl(rechte, ladeGruppen(db), q.gruppe);
  const alle = ladeGeraete(db, { gruppen: auswahl.gruppen, heute: heute() });
  const geraete = typeof q.geraet === "string" ? alle.filter((g) => g.id === q.geraet) : alle;
  const basis = linkBasisAus(await headers());
  const codes = await Promise.all(geraete.map((g) => qrSvg(qrZiel(basis, g.id))));
  return (
    <>
      <div className={s.druckweg}>
        <Seitenkopf
          titel="QR-Etiketten"
          aktionen={
            <span className={s.reihe}>
              <GruppenFilter wahl={auswahl.wahl} gewaehlt={auswahl.gewaehlt} />
              {alle.some((g) => g.kiste) && <Link href="/etiketten/kisten">Etiketten der Materialkisten</Link>}
              <DruckKnopf />
            </span>
          }
        />
      </div>
      {geraete.length === 0 ? <p className={s.neben}>Noch keine Geräte.</p> : (
        <div className={s.etiketten}>
          {geraete.map((g, i) => (
            <div key={g.id} className={s.etikett} data-rolle="etikett">
              <div className={s.etikettKopf}>GERÄTEWARTUNG</div>
              <span className={s.klein}>{g.gruppeName}</span>
              <div className={s.qr} dangerouslySetInnerHTML={{ __html: codes[i] }} />
              <strong>{g.name}</strong>
              {g.seriennr && <span className={`${s.mono} ${s.klein}`}>{g.seriennr}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export const metadata = { title: "QR-Etiketten" };
