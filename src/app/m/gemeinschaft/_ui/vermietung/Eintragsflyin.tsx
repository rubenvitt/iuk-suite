"use client";

import { useRouter } from "next/navigation";
import { App, Button, Drawer, Popconfirm, Space } from "antd";
import { Statuschip } from "@/core/status/Statuschip";
import { flyinBreite } from "@/core/theme/flyin";
import { sperrzeitLoeschenAction } from "../../_actions/vermietung";
import { konflikte, type Eintrag } from "../../_lib/belegung";
import type { AnfrageDTO } from "../../_lib/vermietungTypen";
import { eingangText, zeitraumText } from "../../_lib/vermietungText";
import type { Entscheidung } from "./Entscheidung";
import { Konfliktliste, Zustandschip } from "./teile";
import { Vertragskasten } from "./Vertragskasten";
import s from "./vermietung.module.css";

function Feld({ name, children }: { name: string; children: React.ReactNode }) {
  return <div><div className={s.feldname}>{name}</div><div className={s.text}>{children}</div></div>;
}

/**
 * Die Einzelheiten eines Eintrags der Belegung im Flyin: eine Anfrage mit Angaben, Überschneidungen, Vertrag und
 * Entscheidung, oder eine Sperrzeit (löschbar; eine aus einem Event nur am Event änderbar). Fokus nach Falle 24.
 */
export function Eintragsflyin({ eintrag, anfragen, eintraege, schliessen, entscheidung }: {
  eintrag: Eintrag | null; anfragen: readonly AnfrageDTO[]; eintraege: readonly Eintrag[]; schliessen: () => void; entscheidung: Entscheidung;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const a = eintrag?.art === "anfrage" ? anfragen.find((x) => x.id === eintrag.id) ?? null : null;

  async function sperreLoeschen(id: string) {
    const r = await sperrzeitLoeschenAction(id);
    if (!r.ok) { message.warning(r.fehler); return; }
    message.success("Sperrzeit gelöscht.");
    schliessen();
    router.refresh();
  }

  const fuss = a && a.status === "angefragt" ? (
    <Space wrap>
      <Button type="primary" onClick={() => { void entscheidung.zusagen(a, eintrag ? konflikte(eintrag, eintraege) : []); }}>Zusagen</Button>
      <Button onClick={() => entscheidung.begruenden(a, "ablehnen")}>Ablehnen</Button>
    </Space>
  ) : null;

  return (
    <Drawer open={!!eintrag} onClose={schliessen} size={flyinBreite(480)} title={eintrag ? (eintrag.art === "sperre" ? "Sperrzeit" : eintrag.titel) : ""}
      extra={eintrag ? <Zustandschip zustand={eintrag.zustand} /> : null} footer={fuss}
      autoFocus={false} focusable={{ focusTriggerAfterClose: false }} destroyOnHidden>
      {eintrag ? (
        <div className={s.details} data-testid="eintrag-details">
          <Feld name="Wann">{zeitraumText(eintrag.von, eintrag.bis)}</Feld>
          {eintrag.art === "sperre" ? (
            <>
              <Feld name="Grund">{eintrag.titel}</Feld>
              {eintrag.eventId ? (
                <>
                  <div className={s.neben}>Kommt aus einem Event der Gemeinschaft. Ändern oder freigeben geht nur dort.</div>
                  <div><Button href={`/v/${eintrag.eventId}`}>Zum Event</Button></div>
                </>
              ) : (
                <div>
                  <Popconfirm title="Sperrzeit löschen?" okText="Löschen" cancelText="Abbrechen" onConfirm={() => sperreLoeschen(eintrag.id)}>
                    <Button>Sperrzeit löschen</Button>
                  </Popconfirm>
                </div>
              )}
              <Konfliktliste e={eintrag} eintraege={eintraege} />
            </>
          ) : a ? (
            <>
              <Feld name="Personen">{a.personen}</Feld>
              <Feld name="Ansprechperson">{a.person} <Statuschip>{a.mitglied ? "Mitglied" : "Extern"}</Statuschip></Feld>
              <Feld name="Kontakt">{a.kontakt}</Feld>
              {a.hinweis ? <Feld name="Nachricht">{a.hinweis}</Feld> : null}
              {a.begruendung ? <Feld name={a.status === "abgelehnt" ? "Begründung der Absage" : "Begründung"}>{a.begruendung}</Feld> : null}
              <Feld name="Eingegangen">{eingangText(a.eingegangenAm)}</Feld>
              <Feld name="Statusseite der Person"><a href={`/status/${a.code}`} target="_blank" rel="noreferrer">/status/{a.code}</a></Feld>
              {a.status === "angefragt" || a.status === "zugesagt" ? <Konfliktliste e={eintrag} eintraege={eintraege} /> : null}
              {a.status === "zugesagt" ? <Vertragskasten a={a} /> : null}
              {a.status === "zugesagt" ? <div><Button onClick={() => entscheidung.begruenden(a, "zuruecknehmen")}>Zusage zurücknehmen</Button></div> : null}
            </>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
