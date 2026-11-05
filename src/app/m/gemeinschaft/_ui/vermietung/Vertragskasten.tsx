"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Popconfirm, Segmented } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Statuschip } from "@/core/status/Statuschip";
import { dokumentErstellenAction, vertragEntfernenAction, vertragStandAction } from "../../_actions/vermietung";
import { DOKUMENT_TITEL, type AnfrageDTO, type DokumentKurz } from "../../_lib/vermietungTypen";
import type { VertragStand } from "../../_lib/vermietungText";
import s from "./vermietung.module.css";

const STAENDE: { value: VertragStand; label: string }[] = [
  { value: "offen", label: "Offen" }, { value: "verschickt", label: "Verschickt" }, { value: "unterschrieben", label: "Unterschrieben" },
];

export const groesse = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

/**
 * Die Dokumente einer Zusage im Flyin (IDA-343, IDA-354): beim Mietvertrag der Stand, je Dokument erstellen bzw.
 * öffnen (Ausfüllseite), die unterschriebene Fassung herunterladen oder eine eingescannte ablegen. Hochladen und
 * Herunterladen laufen über den Route Handler `vermietung/vertrag/<id>?art=` (Größe und Magic Bytes prüft der Server).
 */
export function Vertragskasten({ a }: { a: AnfrageDTO }) {
  const { message } = App.useApp();
  const router = useRouter();

  async function stand(v: VertragStand) {
    const r = await vertragStandAction(a.id, v);
    if (!r.ok) { message.warning(r.fehler); return; }
    router.refresh();
  }

  return (
    <div className={s.vertrag} data-testid="vertrag">
      <div className={s.feldname}>Stand des Mietvertrags</div>
      <Segmented<VertragStand> block value={a.vertrag} onChange={stand} options={STAENDE} aria-label="Stand des Mietvertrags" />
      {a.dokumente.map((d) => <Dokumentzeile key={d.art} id={a.id} d={d} />)}
    </div>
  );
}

function Dokumentzeile({ id, d }: { id: string; d: DokumentKurz }) {
  const { message } = App.useApp();
  const router = useRouter();
  const datei = useRef<HTMLInputElement>(null);
  const [laeuft, setLaeuft] = useState(false);
  const pfad = `/vermietung/vertrag/${id}?art=${d.art}`;
  const seite = `/vermietung/dokument/${id}/${d.art}`;

  async function erstellen() {
    setLaeuft(true);
    try {
      const r = await dokumentErstellenAction(id, d.art);
      if (!r.ok) { message.warning(r.fehler); return; }
      router.push(seite);
    } finally {
      setLaeuft(false);
    }
  }

  async function hochladen(f: File) {
    setLaeuft(true);
    try {
      const form = new FormData();
      form.append("datei", f);
      const antwort = await fetch(pfad, { method: "POST", body: form });
      const rumpf = (await antwort.json().catch(() => null)) as { ok: boolean; fehler?: string } | null;
      if (!antwort.ok || !rumpf?.ok) { message.warning(rumpf?.fehler ?? "Das Ablegen hat nicht geklappt. Bitte die Seite neu laden."); return; }
      message.success("Dokument abgelegt.");
      router.refresh();
    } catch {
      message.warning("Das Ablegen hat nicht geklappt. Prüf bitte die Verbindung.");
    } finally {
      setLaeuft(false);
      if (datei.current) datei.current.value = "";
    }
  }

  async function entfernen() {
    const r = await vertragEntfernenAction(id, d.art);
    if (!r.ok) { message.warning(r.fehler); return; }
    message.success("Datei entfernt.");
    router.refresh();
  }

  const chip = d.datei ? <Statuschip ton="ok">Unterschrieben</Statuschip>
    : d.stand === "freigegeben" ? <Statuschip ton="info">Freigegeben</Statuschip>
    : d.stand === "entwurf" ? <Statuschip>Entwurf</Statuschip> : null;

  return (
    <div className={s.dokument} data-testid={`dokument-${d.art}`}>
      <div className={s.zeile}><strong>{DOKUMENT_TITEL[d.art]}</strong>{chip}</div>
      <input ref={datei} type="file" accept="application/pdf" hidden aria-hidden="true" data-testid={`dokument-${d.art}-datei`}
        onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void hochladen(f); }} />
      <div className={s.zeile}>
        {d.stand ? <Button href={seite} icon={<Icons8Ikone name="pencil" groesse={18} />}>{d.datei ? "Ansehen" : "Ausfüllen"}</Button>
          : d.vorlage && !d.datei ? <Button loading={laeuft} onClick={() => void erstellen()} icon={<Icons8Ikone name="plus" groesse={18} />}>Erstellen</Button> : null}
        {d.datei ? (
          <>
            <Button href={pfad} icon={<Icons8Ikone name="download" groesse={18} />}>{groesse(d.datei.groesse)}</Button>
            <Button onClick={() => datei.current?.click()} loading={laeuft}>Ersetzen</Button>
            <Popconfirm title="Datei entfernen?" okText="Entfernen" cancelText="Abbrechen" onConfirm={entfernen}>
              <Button type="text" icon={<Icons8Ikone name="trash" groesse={18} />} aria-label="Datei entfernen" />
            </Popconfirm>
          </>
        ) : (
          <Button type="text" icon={<Icons8Ikone name="upload" groesse={18} />} loading={laeuft} onClick={() => datei.current?.click()}>Unterschrieben ablegen</Button>
        )}
      </div>
    </div>
  );
}
