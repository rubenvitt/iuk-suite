import Link from "next/link";
import { Button } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { verwaltetGruppe } from "../../../_lib/zugang";
import { ArtZeichen, FristChip, Kicker, OrtText, stundenText, ZustandChip } from "../../../_ui/teile";
import s from "../../../_ui/wartung.module.css";
import { geraetOder404 } from "./laden";

export const dynamic = "force-dynamic";

/** Der Steckbrief am Gerät — das, was der QR-Code öffnet. */
export default async function Steckbrief({ params }: { params: Promise<{ id: string }> }) {
  const { g, checkliste, offen, rechte } = await geraetOder404(params);
  const pruefung = g.staende.find((f) => f.vorlage.wer === "intern");
  return (
    <div className={s.telefon}>
      <section className={s.karte}>
        <div className={s.geraetKopf}>
          <span className={s.artmarke}><ArtZeichen ikone={g.ikone} groesse={28} /></span>
          <div style={{ minWidth: 0 }}>
            <h1 className={s.geraetName} style={{ margin: 0 }}>{g.name}</h1>
            <div className={s.neben}>{[g.hersteller, g.typ].filter(Boolean).join(" ")}{g.hersteller || g.typ ? " · " : ""}{g.gruppeName}</div>
          </div>
        </div>
        <div className={s.reihe} style={{ marginTop: 12 }}>
          <ZustandChip z={g.zustand} />
          <span className={s.neben}><OrtText ortArt={g.ortArt} ort={g.ort} /></span>
          {g.stunden !== null && <span className={`${s.neben} ${s.ziffern}`}>{stundenText(g.stunden)}</span>}
        </div>
      </section>

      {pruefung && checkliste.length > 0 && (
        <section className={s.karte}>
          <Kicker className={s.karteTitel}>{pruefung.vorlage.name}</Kicker>
          <div className={s.quer}><span>{pruefung.text}</span><FristChip f={pruefung} /></div>
          <div className={s.neben} style={{ margin: "4px 0 12px" }}>{checkliste.length} Punkte</div>
          <Button type="primary" block href={`/g/${g.id}/pruefung`} icon={<Icons8Ikone name="checklist" groesse={20} />}>
            Prüfung starten
          </Button>
        </section>
      )}

      <section className={s.karte}>
        <div className={s.knopfstapel}>
          <Button block href={`/g/${g.id}/mangel`} icon={<Icons8Ikone name="warning" groesse={20} />}>Mangel melden</Button>
          {(g.stunden !== null || g.stundenPflicht) && (
            <Button block href={`/g/${g.id}/stunden`} icon={<Icons8Ikone name="clock" groesse={20} />}>Betriebsstunden eintragen</Button>
          )}
        </div>
        {offen.length > 0 && (
          <div className={s.meldung} style={{ marginTop: 12 }} role="status">
            <strong>{offen.length === 1 ? "1 offener Mangel" : `${offen.length} offene Mängel`}:</strong> {offen[0].text}
          </div>
        )}
      </section>

      <section className={s.karte}>
        <Kicker className={s.karteTitel}>Fristen</Kicker>
        <ul className={s.zeilen}>
          {g.staende.map((f) => (
            <li key={f.vorlage.id} className={`${s.zeile} ${s.quer}`}>
              <span>{f.vorlage.name}<div className={`${s.neben} ${s.klein}`}>{f.text}</div></span>
              <FristChip f={f} />
            </li>
          ))}
        </ul>
      </section>

      {verwaltetGruppe(rechte, g.gruppeId) && <Link href={`/geraete/${g.id}`} className={s.zurueck}>Zur Akte</Link>}
    </div>
  );
}
