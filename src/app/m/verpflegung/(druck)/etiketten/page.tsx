import { headers } from "next/headers";
import { qrSvg } from "@/core/qr";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../_db/client";
import { linkBasisAus, ortZiel } from "../../_lib/ansicht";
import { ladeOrte } from "../../_lib/daten";
import { requireAdmin } from "../../_lib/zugang";
import { DruckKnopf } from "../../_ui/DruckKnopf";
import s from "../../_ui/verpflegung.module.css";

export const dynamic = "force-dynamic";

/** QR-Etiketten für die Lagerorte; `?ort=` druckt nur eines. Die Ware trägt ihre EAN, kein eigenes Etikett. */
export default async function EtikettenSeite({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/etiketten");
  const q = await searchParams;
  const alle = ladeOrte(getDb(), true);
  const orte = typeof q.ort === "string" ? alle.filter((o) => o.id === q.ort) : alle;
  const basis = linkBasisAus(await headers());
  const codes = await Promise.all(orte.map((o) => qrSvg(ortZiel(basis, o.id))));
  return (
    <>
      <div className={s.druckweg}>
        <Seitenkopf titel="Ortsetiketten" aktionen={<DruckKnopf />} />
      </div>
      {orte.length === 0 ? <p className={s.neben}>Noch keine Lagerorte.</p> : (
        <div className={s.etiketten}>
          {orte.map((o, i) => (
            <div key={o.id} className={s.etikett} data-rolle="etikett">
              <div className={s.etikettKopf}>VERPFLEGUNG</div>
              <div className={s.qr} dangerouslySetInnerHTML={{ __html: codes[i] }} />
              <strong>{o.name}</strong>
              <span className={`${s.mono} ${s.klein}`}>{o.kurz}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export const metadata = { title: "Ortsetiketten" };
