"use client";

import Link from "next/link";
import { Button, Popconfirm } from "antd";
import { mangelZustand } from "../_lib/fristen";
import { tagInZone } from "../_lib/heute";
import type { MangelDTO } from "../_lib/typen";
import { Chip, datum, ZustandChip } from "./teile";
import s from "./wartung.module.css";

/** Ein Mangel mit Foto und „Behoben“ — in der Akte ohne Gerätename, in der Mängelliste mit. */
export function MangelEintrag({ m, mitGeraet, laeuft, onBehoben }: {
  m: MangelDTO;
  mitGeraet?: boolean;
  laeuft?: boolean;
  onBehoben?: (id: string) => void;
}) {
  return (
    <div className={s.mangel} data-rolle="mangel">
      <div className={s.quer}>
        <div>
          {mitGeraet && (
            <div>
              <Link href={`/geraete/${m.geraetId}`}><strong>{m.geraetName}</strong></Link>
              <span className={s.neben}> · {m.ort} · {m.gruppeName}</span>
            </div>
          )}
          <div style={{ marginTop: 4 }}>
            {m.behobenAm === null
              ? <ZustandChip z={mangelZustand(m.einsatzbereit)} />
              : <Chip farbe="ok">Behoben</Chip>}
          </div>
        </div>
        {m.behobenAm === null && onBehoben && (
          <Popconfirm
            title="Mangel behoben?"
            okText="Behoben"
            cancelText="Abbrechen"
            onConfirm={() => onBehoben(m.id)}
          >
            <Button disabled={laeuft}>Behoben</Button>
          </Popconfirm>
        )}
      </div>
      <p>{m.text}</p>
      {m.foto && (
        <a href={`/maengel/foto/${m.id}`} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- geschütztes Foto aus dem Route Handler */}
          <img src={`/maengel/foto/${m.id}`} alt="Foto zum Mangel" className={s.foto} loading="lazy" />
        </a>
      )}
      <div className={`${s.neben} ${s.klein}`}>
        Gemeldet {datum(tagInZone(m.gemeldetAm))} von {m.gemeldetVon}
        {m.behobenAm !== null ? ` · behoben ${datum(tagInZone(m.behobenAm))}${m.behobenVon ? ` von ${m.behobenVon}` : ""}` : ""}
      </div>
    </div>
  );
}
