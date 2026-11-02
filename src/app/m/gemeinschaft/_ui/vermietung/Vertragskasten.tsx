"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Popconfirm, Segmented } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { vertragEntfernenAction, vertragStandAction } from "../../_actions/vermietung";
import type { AnfrageDTO } from "../../_lib/vermietungTypen";
import type { VertragStand } from "../../_lib/vermietungText";
import s from "./vermietung.module.css";

const STAENDE: { value: VertragStand; label: string }[] = [
  { value: "offen", label: "Offen" }, { value: "verschickt", label: "Verschickt" }, { value: "unterschrieben", label: "Unterschrieben" },
];

const groesse = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

/**
 * Der Mietvertrag einer Zusage, schlank: Stand und eine abgelegte PDF. Hochladen und Herunterladen laufen über den
 * Route Handler `vermietung/vertrag/<id>` (Größe und Magic Bytes prüft der Server).
 */
export function Vertragskasten({ a }: { a: AnfrageDTO }) {
  const { message } = App.useApp();
  const router = useRouter();
  const datei = useRef<HTMLInputElement>(null);
  const [laeuft, setLaeuft] = useState(false);
  const pfad = `/vermietung/vertrag/${a.id}`;

  async function stand(v: VertragStand) {
    const r = await vertragStandAction(a.id, v);
    if (!r.ok) { message.warning(r.fehler); return; }
    router.refresh();
  }

  async function hochladen(f: File) {
    setLaeuft(true);
    try {
      const form = new FormData();
      form.append("datei", f);
      const antwort = await fetch(pfad, { method: "POST", body: form });
      const rumpf = (await antwort.json().catch(() => null)) as { ok: boolean; fehler?: string } | null;
      if (!antwort.ok || !rumpf?.ok) { message.warning(rumpf?.fehler ?? "Das Ablegen hat nicht geklappt. Bitte die Seite neu laden."); return; }
      message.success("Vertrag abgelegt.");
      router.refresh();
    } catch {
      message.warning("Das Ablegen hat nicht geklappt. Prüf bitte die Verbindung.");
    } finally {
      setLaeuft(false);
      if (datei.current) datei.current.value = "";
    }
  }

  async function entfernen() {
    const r = await vertragEntfernenAction(a.id);
    if (!r.ok) { message.warning(r.fehler); return; }
    message.success("Datei entfernt.");
    router.refresh();
  }

  return (
    <div className={s.vertrag} data-testid="vertrag">
      <div className={s.feldname}>Mietvertrag</div>
      <Segmented<VertragStand> block value={a.vertrag} onChange={stand} options={STAENDE} aria-label="Stand des Mietvertrags" />
      <input ref={datei} type="file" accept="application/pdf" hidden aria-hidden="true" data-testid="vertrag-datei"
        onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void hochladen(f); }} />
      {a.datei ? (
        <div className={s.zeile}>
          <Button href={pfad} icon={<Icons8Ikone name="download" groesse={18} />}>{a.datei.name}</Button>
          <span className={s.neben}>{groesse(a.datei.groesse)}</span>
          <Button onClick={() => datei.current?.click()} loading={laeuft}>Ersetzen</Button>
          <Popconfirm title="Datei entfernen?" okText="Entfernen" cancelText="Abbrechen" onConfirm={entfernen}>
            <Button type="text" icon={<Icons8Ikone name="trash" groesse={18} />}>Entfernen</Button>
          </Popconfirm>
        </div>
      ) : (
        <Button icon={<Icons8Ikone name="upload" groesse={18} />} loading={laeuft} onClick={() => datei.current?.click()}>Unterschriebenen Vertrag ablegen (PDF)</Button>
      )}
      <div className={s.neben}>PDF, höchstens 10 MB</div>
    </div>
  );
}
