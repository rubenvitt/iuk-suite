"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { Button, Card, Input, Popconfirm, Segmented, Switch } from "antd";
import {
  antwortAktion, kontaktiertAktion, loeschenAktion, notizAktion, rueckfrageAktion, statusAktion,
} from "../_lib/ehrlich/aktionen";
import type { Detail, ListenZeile } from "../_lib/ehrlich/daten";
import { ANTWORTWEG_WORT, STATUS_WORT } from "../_lib/ehrlich/themen";
import type { EhrlichStatus } from "../_db/schema";
import { T } from "./typo";

export type Filter = "offen" | "erledigt" | "alle";

const KARTE = {
  header: { ...T.kicker, minHeight: 40, paddingInline: 20, borderBottomColor: "var(--fb-split)" },
  body: { padding: "var(--fb-kartenpolster)" },
} satisfies Record<string, CSSProperties>;

const LISTENKARTE = { ...KARTE, body: { padding: 0 } } satisfies Record<string, CSSProperties>;

const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** `JJJJ-MM-TT` → „Mo, 03.11.2026" — ein Kalendertag, gerechnet in UTC, damit keine Zone ihn verschiebt. */
function kurzesDatum(tag: string): string {
  const [j, m, t] = tag.split("-").map(Number);
  const wt = WT[new Date(Date.UTC(j, m - 1, t)).getUTCDay()];
  return `${wt}, ${String(t).padStart(2, "0")}.${String(m).padStart(2, "0")}.${j}`;
}

function adresse(filter: Filter, m?: number): string {
  const p = new URLSearchParams();
  if (filter !== "offen") p.set("filter", filter);
  if (m !== undefined) p.set("m", String(m));
  const q = p.toString();
  return `/ehrlich-gesagt${q ? `?${q}` : ""}`;
}

export function EhrlichVerwaltung({ liste, detail, filter }: { liste: ListenZeile[]; detail: Detail | null; filter: Filter }) {
  const router = useRouter();
  const offen = liste.filter((z) => z.status !== "erledigt");
  const sichtbar = filter === "alle" ? liste : filter === "offen" ? offen : liste.filter((z) => z.status === "erledigt");

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBlock: "-8px 16px" }}>
        <Link href="/ehrlich-gesagt/aushang">QR-Code und Aushang</Link>
      </div>
      <div className="eg-raster" data-detail={detail ? "" : undefined}>
        <div className="eg-spalte-liste">
          <Card
            variant="outlined"
            title="EINGANG"
            styles={LISTENKARTE}
            extra={
              <Segmented<Filter>
                value={filter}
                onChange={(f) => router.push(adresse(f, detail?.id))}
                options={[
                  { value: "offen", label: `Offen (${offen.length})` },
                  { value: "erledigt", label: "Erledigt" },
                  { value: "alle", label: "Alle" },
                ]}
              />
            }
          >
            {sichtbar.length === 0 ? (
              <p className="eg-leer">{filter === "erledigt" ? "Noch nichts erledigt." : filter === "offen" ? "Keine offenen Mitteilungen." : "Noch keine Mitteilungen."}</p>
            ) : (
              <ul className="eg-liste" data-testid="eingang">
                {sichtbar.map((z) => (
                  <li key={z.id}>
                    <Link
                      className="eg-zeile"
                      href={adresse(filter, z.id)}
                      aria-current={z.id === detail?.id ? "true" : undefined}
                      data-neu={z.status === "neu" ? "" : undefined}
                      scroll={false}
                    >
                      <span className="eg-stat" data-s={z.status} aria-hidden="true" />
                      <span>
                        <span className="eg-kopf">
                          <span className="eg-datum">{kurzesDatum(z.tag)}</span>
                          {z.thema ? <span className="eg-chip">{z.thema}</span> : null}
                          <span>{STATUS_WORT[z.status]}</span>
                        </span>
                        <span className="eg-auszug">{z.auszug}</span>
                        <span className="eg-unten" style={{ display: "block" }}>
                          {z.antwortweg === "name" ? z.name : "anonym"} · {ANTWORTWEG_WORT[z.antwortweg]}
                          {z.gespraech === "rueckfrage" ? <> · <b>neue Rückfrage</b></> : z.gespraech === "beantwortet" ? " · beantwortet" : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        {detail ? (
          <div className="eg-spalte-detail">
            <DetailAnsicht key={detail.id} d={detail} zurueck={adresse(filter)} />
          </div>
        ) : null}
      </div>
    </>
  );
}

function DetailAnsicht({ d, zurueck }: { d: Detail; zurueck: string }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [notiz, setNotiz] = useState("");
  const [antwort, setAntwort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  const tu = (aktion: () => Promise<unknown>, danach?: () => void) =>
    starte(async () => {
      setFehler(null);
      try {
        const ok = await aktion();
        if (ok === false) setFehler("Das hat nicht geklappt. Lade die Seite neu.");
        else danach?.();
      } catch {
        setFehler("Das hat nicht geklappt. Lade die Seite neu.");
      }
      router.refresh();
    });

  const letzte = d.gespraech.at(-1);
  const kontaktiert = d.notizen.some((n) => n.kontakt);

  return (
    <>
      <div className="eg-zurueck">
        <Link href={zurueck}>‹ Eingang</Link>
      </div>
      <Card variant="outlined" title="MITTEILUNG" styles={KARTE} extra={<span className="eg-meta">{kurzesDatum(d.tag)}</span>}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {d.thema ? <span className="eg-chip">{d.thema}</span> : <span className="eg-chip" data-umriss="">ohne Thema</span>}
          <span className="eg-chip" data-umriss="">{d.antwortweg === "name" ? "mit Namen" : "anonym"}</span>
        </div>
        <p className="eg-volltext" data-testid="volltext">{d.text}</p>
        <hr className="eg-trenner" />
        <p className="eg-meta" style={{ margin: 0 }}>
          {d.antwortweg === "name" ? `Von ${d.name}` : "Anonym"} · {ANTWORTWEG_WORT[d.antwortweg]}
        </p>
      </Card>

      {d.antwortweg === "code" ? (
        <Card
          variant="outlined"
          title="GESPRÄCH ÜBER ABHOLCODE"
          styles={KARTE}
          extra={letzte?.von === "person" ? <span className="eg-chip">neue Rückfrage</span> : letzte ? <span className="eg-chip" data-umriss="">beantwortet</span> : null}
        >
          {d.gespraech.length > 0 ? (
            <ul className="eg-eintraege">
              {d.gespraech.map((n) => (
                <li key={n.id}>
                  <span className="eg-meta">
                    {n.von === "vp" ? `Antwort · ${n.autor ?? "Vertrauensperson"}` : "Rückfrage der Person"} · {kurzesDatum(n.tag)}
                  </span>
                  <p>{n.text}</p>
                </li>
              ))}
            </ul>
          ) : null}
          <Input.TextArea
            aria-label="Antwort"
            autoSize={{ minRows: 3, maxRows: 10 }}
            maxLength={2000}
            value={antwort}
            onChange={(e) => setAntwort(e.target.value)}
          />
          <div className="eg-knoepfe">
            <Button type="primary" disabled={antwort.trim() === "" || laeuft} onClick={() => tu(() => antwortAktion(d.id, antwort), () => setAntwort(""))}>
              Antwort freigeben
            </Button>
          </div>
          <hr className="eg-trenner" />
          <label style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44 }}>
            <Switch checked={d.rueckfrageErlaubt} disabled={laeuft} onChange={(an) => tu(() => rueckfrageAktion(d.id, an))} />
            <span>Rückfrage erlauben</span>
          </label>
        </Card>
      ) : null}

      {d.antwortweg === "name" ? (
        <Card variant="outlined" title="RÜCKMELDUNG GEWÜNSCHT" styles={KARTE} extra={kontaktiert ? <span className="eg-chip" data-umriss="">kontaktiert</span> : null}>
          <p style={{ margin: 0 }}>
            <b>{d.name}</b>
            <br />
            Erreichbar: {d.kontakt || "keine Angabe"}
          </p>
          <div className="eg-knoepfe">
            <Button disabled={kontaktiert || laeuft} onClick={() => tu(() => kontaktiertAktion(d.id))}>
              {kontaktiert ? "Als kontaktiert vermerkt" : "Als kontaktiert vermerken"}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card variant="outlined" title="BEARBEITUNG" styles={KARTE}>
        <div style={{ ...T.kicker, marginBottom: 8 }}>Status</div>
        <Segmented<EhrlichStatus>
          value={d.status}
          disabled={laeuft}
          onChange={(s) => tu(() => statusAktion(d.id, s))}
          options={(["neu", "bearbeitung", "erledigt"] as const).map((s) => ({ value: s, label: STATUS_WORT[s] }))}
        />
        <hr className="eg-trenner" />
        <div style={{ ...T.kicker, marginBottom: 8 }}>Interne Notizen</div>
        {d.notizen.length > 0 ? (
          <ul className="eg-eintraege">
            {d.notizen.map((n) => (
              <li key={n.id}>
                <span className="eg-meta">{n.autor} · {kurzesDatum(n.tag)}</span>
                <p>{n.text}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <Input.TextArea
          aria-label="Neue Notiz"
          autoSize={{ minRows: 2, maxRows: 8 }}
          maxLength={2000}
          placeholder="Nur für die Vertrauenspersonen sichtbar"
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
        />
        <div className="eg-knoepfe">
          <Button disabled={notiz.trim() === "" || laeuft} onClick={() => tu(() => notizAktion(d.id, notiz), () => setNotiz(""))}>
            Notiz speichern
          </Button>
        </div>
      </Card>

      {fehler ? <p role="alert" style={{ margin: 0 }}>{fehler}</p> : null}

      <section className="eg-gefahr">
        <div style={T.kicker}>Gefahrenzone</div>
        <p style={{ margin: "6px 0 0" }}>
          Löscht die Mitteilung samt Gespräch und Notizen.{d.antwortweg === "code" ? " Der Abholcode zeigt danach nichts mehr an." : ""}
        </p>
        <div className="eg-knoepfe">
          <Popconfirm
            title="Mitteilung löschen?"
            description="Das lässt sich nicht rückgängig machen."
            okText="Löschen"
            cancelText="Abbrechen"
            onConfirm={() => tu(() => loeschenAktion(d.id), () => router.push(zurueck))}
          >
            <Button danger disabled={laeuft}>Mitteilung löschen</Button>
          </Popconfirm>
        </div>
      </section>
    </>
  );
}
