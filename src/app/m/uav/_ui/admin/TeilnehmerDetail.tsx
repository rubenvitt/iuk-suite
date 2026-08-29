"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Popconfirm, Progress, Switch, Tag } from "antd";
import { codeNeuAction, teilnehmerAendernAction, teilnehmerLoeschenAction } from "../../_actions/teilnehmer";
import { datumZeit } from "../../_lib/datum";
import type { ParticipantDetailDTO, ParticipantDTO, Teil } from "../../_lib/typen";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

const TEIL_TITEL: Record<Teil, string> = { 1: "Teil 1", 2: "Teil 2", 3: "Teil 3" };

/*
 * DIE TEILNEHMER-DETAILSEITE (Aufgabe 16) — eigene `"use client"`-Komponente,
 * nur serialisierbare Daten (`ParticipantDetailDTO`, der fertige Magic-Link-
 * String) als Prop, Server Actions direkt importiert (Falle 9).
 *
 * `magicLink()` selbst LÄUFT NICHT HIER: sie liest `prodHostsFor()`/die
 * Registry und gehört serverseitig in `page.tsx` (Aufgabe 16, `_lib/
 * magicLink.ts`). Nach „Neuen Code erzeugen" ändert sich nur der `code`-
 * Query-Parameter — Host und Schema bleiben für die Lebensdauer der Seite
 * gleich —, deshalb schreibt `codeNeuErzeugen` den neuen Code per `URL` in
 * den bestehenden Link, statt die Server-Logik ins Client-Bundle zu ziehen.
 */
export function TeilnehmerDetail({
  detail,
  magicLink: anfangsLink,
}: {
  detail: ParticipantDetailDTO;
  magicLink: string;
}) {
  const router = useRouter();
  const [teilnehmer, setTeilnehmer] = useState<ParticipantDTO>(detail.participant);
  const [link, setLink] = useState(anfangsLink);
  const [name, setName] = useState(teilnehmer.name);
  const [beginn, setBeginn] = useState(teilnehmer.beginn ?? "");
  const [aktiv, setAktiv] = useState(teilnehmer.aktiv);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function kopieren(text: string, markierung: string): void {
    navigator.clipboard?.writeText(text).then(
      () => {
        setKopiert(markierung);
        window.setTimeout(() => setKopiert((m) => (m === markierung ? null : m)), 1800);
      },
      () => {
        /* Zwischenablage ohne Berechtigung — Text bleibt im Feld sichtbar. */
      },
    );
  }

  function speichern(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();
    const gestutzterName = name.trim();
    if (!gestutzterName) return;
    setFehler(null);
    startTransition(async () => {
      try {
        const aktualisiert = await teilnehmerAendernAction(teilnehmer.id, {
          name: gestutzterName,
          beginn: beginn || null,
          aktiv,
        });
        setTeilnehmer(aktualisiert);
      } catch {
        setFehler("Speichern fehlgeschlagen.");
      }
    });
  }

  function codeNeuErzeugen(): void {
    setFehler(null);
    startTransition(async () => {
      try {
        const aktualisiert = await codeNeuAction(teilnehmer.id);
        setTeilnehmer(aktualisiert);
        const url = new URL(link);
        url.searchParams.set("code", aktualisiert.loginCode);
        setLink(url.toString());
      } catch {
        setFehler("Neuer Code konnte nicht erzeugt werden.");
      }
    });
  }

  function loeschen(): void {
    setFehler(null);
    startTransition(async () => {
      try {
        await teilnehmerLoeschenAction(teilnehmer.id);
        router.push("/admin");
      } catch {
        setFehler("Löschen fehlgeschlagen.");
      }
    });
  }

  return (
    <div style={{ display: "grid", gap: SPACE.xl }}>
      <a href="/admin">← Teilnehmer</a>

      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: SPACE.sm }}>
        <h1 style={{ ...SCHRIFT.titel, margin: 0 }}>{teilnehmer.name}</h1>
        <a href={`/api/admin/participants/${teilnehmer.id}/export`}>Detail-CSV</a>
      </div>

      <div style={{ display: "flex", gap: SPACE.xxl, flexWrap: "wrap" }}>
        <div>
          <div style={SCHRIFT.zahl}>{Math.round(detail.quote * 100)}%</div>
          <div style={SCHRIFT.neben}>
            {detail.erledigt}/{detail.gesamt} Aufgaben erledigt
          </div>
        </div>
        <div>
          <div style={SCHRIFT.neben}>Status</div>
          <Tag color={teilnehmer.aktiv ? "green" : "default"}>{teilnehmer.aktiv ? "aktiv" : "inaktiv"}</Tag>
        </div>
        <div>
          <div style={SCHRIFT.neben}>Letzte Aktivität</div>
          <div>{datumZeit(detail.letzteAktivitaet) || "—"}</div>
        </div>
        <div>
          <div style={SCHRIFT.neben}>Login-Code</div>
          <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
            <span style={SCHRIFT.zahl}>{teilnehmer.loginCode}</span>
            <Button onClick={() => kopieren(teilnehmer.loginCode, "code")}>
              {kopiert === "code" ? "Kopiert" : "Kopieren"}
            </Button>
          </div>
        </div>
        <div>
          <div style={SCHRIFT.neben}>Magic-Link</div>
          <Button onClick={() => kopieren(link, "link")}>{kopiert === "link" ? "Kopiert" : "Link kopieren"}</Button>
        </div>
      </div>

      <form
        onSubmit={speichern}
        style={{ display: "flex", gap: SPACE.md, alignItems: "flex-end", flexWrap: "wrap" }}
      >
        <div>
          <label htmlFor="tn-detail-name" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
            Name
          </label>
          <Input id="tn-detail-name" value={name} onChange={(ereignis) => setName(ereignis.target.value)} />
        </div>
        <div>
          <label htmlFor="tn-detail-beginn" style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
            Beginn
          </label>
          <input
            id="tn-detail-beginn"
            type="date"
            value={beginn}
            onChange={(ereignis) => setBeginn(ereignis.target.value)}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
          <Switch checked={aktiv} onChange={setAktiv} /> aktiv
        </label>
        <Button type="primary" htmlType="submit" loading={pending}>
          Speichern
        </Button>
        <Popconfirm
          title="Neuen Code erzeugen?"
          description="Der bisherige Login-Code und Magic-Link werden ungültig."
          okText="Erzeugen"
          cancelText="Abbrechen"
          onConfirm={codeNeuErzeugen}
        >
          <Button loading={pending}>Neuen Code erzeugen</Button>
        </Popconfirm>
        <Popconfirm
          title="Teilnehmer löschen?"
          description={`„${teilnehmer.name}“ und alle Durchführungen werden endgültig gelöscht.`}
          okText="Löschen"
          okButtonProps={{ danger: true }}
          cancelText="Abbrechen"
          onConfirm={loeschen}
        >
          <Button danger loading={pending}>
            Löschen
          </Button>
        </Popconfirm>
      </form>

      {detail.teile.length > 0 ? (
        <section>
          <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Fortschritt je Teil</h2>
          <div style={{ display: "grid", gap: SPACE.sm }}>
            {detail.teile.map((stat) => (
              <div key={stat.teil} style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
                <span style={{ width: 64 }}>{TEIL_TITEL[stat.teil]}</span>
                <Progress percent={Math.round(stat.quote * 100)} style={{ flex: 1 }} />
                <span>
                  {stat.erledigt}/{stat.gesamt}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Aufgaben</h2>
        {detail.aufgaben.length === 0 ? (
          <p style={SCHRIFT.neben}>Keine aktiven Aufgaben im Katalog.</p>
        ) : (
          ([1, 2, 3] as Teil[])
            .filter((teil) => detail.aufgaben.some((a) => a.teil === teil))
            .map((teil) => (
              <div key={teil} style={{ marginBlockEnd: SPACE.md }}>
                <h3 style={{ ...SCHRIFT.text, fontWeight: 600, margin: `0 0 ${SPACE.xs}px` }}>{TEIL_TITEL[teil]}</h3>
                <ul style={{ margin: 0, paddingInlineStart: SPACE.lg, display: "grid", gap: SPACE.xs }}>
                  {detail.aufgaben
                    .filter((a) => a.teil === teil)
                    .map((aufgabe) => (
                      <li key={aufgabe.taskId} style={{ display: "flex", justifyContent: "space-between", gap: SPACE.sm }}>
                        <span>
                          <span style={SCHRIFT.mono}>{aufgabe.nummer}</span> {aufgabe.titel}
                        </span>
                        {aufgabe.nichtAnwendbar ? (
                          <Tag color="default">nicht anwendbar</Tag>
                        ) : (
                          <span style={SCHRIFT.mono}>
                            {aufgabe.anzahl}/{aufgabe.ziel}
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            ))
        )}
      </section>
    </div>
  );
}
