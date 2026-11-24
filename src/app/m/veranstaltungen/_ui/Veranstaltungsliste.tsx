"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Drawer } from "antd";
import { zeitspanne } from "@/app/m/schichtplan/_lib/zeit";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { flyinBreite } from "@/core/theme/flyin";
import { ART_TITEL, STATUS_TITEL, type VeranstaltungDTO } from "../_lib/typen";
import { VeranstaltungFormular } from "./VeranstaltungFormular";
import { useTokensAmBody } from "./useTokensAmBody";
import s from "./veranstaltungen.module.css";

type Offen = { art: "neu" } | { art: "aendern"; v: VeranstaltungDTO } | null;

function Karte({ v, onAendern }: { v: VeranstaltungDTO; onAendern: () => void }) {
  return (
    <Card title={<span className={v.status === "abgesagt" ? s.abgesagtName : undefined}>{v.name}</span>}
      extra={<span className={`${s.chip} ${s[v.status]}`}>{STATUS_TITEL[v.status]}</span>}>
      <div className={s.inhalt}>
        <span>{zeitspanne(v.von, v.bis, true)}</span>
        <span className={s.neben}>{[ART_TITEL[v.art], v.ort || "Ort offen", v.veranstalter].filter(Boolean).join(" · ")}</span>
        {v.bemerkung ? <span className={s.neben}>{v.bemerkung}</span> : null}
        <Button onClick={onAendern} style={{ alignSelf: "flex-start" }}>Ändern</Button>
      </div>
    </Card>
  );
}

/** Die Übersicht: kommende und laufende Veranstaltungen zuerst, vergangene darunter (jüngste zuerst). */
export function Veranstaltungsliste({ liste, darfLoeschen, jetzt }: { liste: VeranstaltungDTO[]; darfLoeschen: boolean; jetzt: number }) {
  const router = useRouter();
  useTokensAmBody();
  const [offen, setOffen] = useState<Offen>(null);
  const kommend = liste.filter((v) => v.bis >= jetzt);
  const vergangen = liste.filter((v) => v.bis < jetzt).reverse();
  const fertig = () => { setOffen(null); router.refresh(); };
  const abschnitt = (titel: string, eintraege: VeranstaltungDTO[]) => (
    <section className={s.modul} aria-label={titel}>
      <span className={s.kicker}>{titel}</span>
      <div className={s.karten}>{eintraege.map((v) => <Karte key={v.id} v={v} onAendern={() => setOffen({ art: "aendern", v })} />)}</div>
    </section>
  );
  return (
    <div className={s.modul}>
      <Seitenkopf
        titel="Veranstaltungen"
        aktionen={<Button type="primary" onClick={() => setOffen({ art: "neu" })} icon={<Icons8Ikone name="plus" groesse={16} />}>Neue Veranstaltung</Button>}
      />
      {liste.length === 0 ? <Card><span className={s.neben}>Noch keine Veranstaltung.</span></Card> : null}
      {kommend.length ? abschnitt("Kommend", kommend) : null}
      {vergangen.length ? abschnitt("Vergangen", vergangen) : null}
      <Drawer open={offen !== null} onClose={() => setOffen(null)} size={flyinBreite(560)} destroyOnHidden autoFocus={false} focusable={{ focusTriggerAfterClose: false }}
        title={offen?.art === "aendern" ? "Veranstaltung ändern" : "Neue Veranstaltung"}>
        {offen ? <VeranstaltungFormular key={offen.art === "aendern" ? offen.v.id : "neu"} veranstaltung={offen.art === "aendern" ? offen.v : null} darfLoeschen={darfLoeschen} onFertig={fertig} /> : null}
      </Drawer>
    </div>
  );
}
