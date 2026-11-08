import Link from "next/link";
import { headers } from "next/headers";
import { Button } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { getDb } from "../../../_db/client";
import { ladeEinsatz } from "../../../_lib/daten";
import { einsatzText, mitAnlassKnopf, unterwegsText } from "../../../_lib/unterwegsText";
import { loginZiel, verwaltetGruppe } from "../../../_lib/zugang";
import { ArtZeichen, FristChip, groesseText, Kicker, OrtText, stundenText, ZustandChip } from "../../../_ui/teile";
import { AnlassKnopf } from "../../../_ui/telefon/AnlassKnopf";
import s from "../../../_ui/wartung.module.css";
import { geraetOeffentlich } from "./laden";

export const dynamic = "force-dynamic";

/**
 * Der Steckbrief am Gerät — das, was der QR-Code öffnet. Ohne Modulzugang (auch ohne Anmeldung) Kopf, Hinweise,
 * Unterlagen, bei einer Materialkiste ihr Inhalt und „Mangel melden“ (IDA-300, IDA-335); Fristen, Mängeltexte und
 * Prüfung erst mit Zugang (IDA-337).
 */
export default async function Steckbrief({ params }: { params: Promise<{ id: string }> }) {
  const { g, pruefung, checkliste, punkteJe, offen, unterlagen, unterwegs, rechte, viewer, zugang } = await geraetOeffentlich(params);
  // Die fällige Prüfung zuerst und hervorgehoben, die anderen darunter (IDA-369); ohne Punkte geht keine.
  const pruefungen = g.staende.filter((f) => f.vorlage.wer === "intern" && (punkteJe[f.vorlage.id] ?? 0) > 0)
    .sort((a, b) => Number(b.vorlage.id === pruefung?.vorlage.id) - Number(a.vorlage.id === pruefung?.vorlage.id));
  const mitAnlass = mitAnlassKnopf(g);
  const einsatz = g.kiste ? null : ladeEinsatz(getDb(), g.id);
  const verwaltet = zugang && verwaltetGruppe(rechte, g.gruppeId);
  // Die Inhaltsliste steht auch auf dem Etikett der Kiste, also auch ohne Anmeldung (IDA-335).
  const inhalt = g.kiste && (
    <section className={s.karte} aria-label="Inhalt">
      <Kicker className={s.karteTitel}>Inhalt</Kicker>
      {checkliste.length === 0 ? <p className={s.neben} style={{ margin: 0 }}>Noch keine Inhaltsliste.</p> : (
        <ul className={s.inhaltListe}>
          {checkliste.map((p) => (
            <li key={p.id} className={s.inhaltPosten} data-rolle="inhalt-posten">
              <span className={s.soll}>{p.soll} ×</span>
              <span>{p.text}{p.hinweis && <span className={`${s.neben} ${s.klein}`}> · {p.hinweis}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      {verwaltet && (
        <Button block href={`/g/${g.id}/inhalt`} icon={<Icons8Ikone name="pencil" groesse={20} />} style={{ marginTop: 12 }}>
          {checkliste.length === 0 ? "Inhalt erfassen" : "Inhalt bearbeiten"}
        </Button>
      )}
    </section>
  );
  const kopf = (
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
  );

  // „Unterwegs“ sieht jeder; Name und Zweck nur mit Zugang. Die Knöpfe gibt es nur mit Zugang und nur an einer Kiste;
  // ein Gerät zeigt hier, seit wann und bei wem es im Einsatz ist, und meldet sich mit „Wird eingesetzt“/„Zurück“.
  const unterwegsKarte = (mitKnoepfen: boolean) => {
    const text = g.kiste ? unterwegsText(unterwegs, mitKnoepfen) : einsatz && einsatzText(einsatz, mitKnoepfen);
    const kannEntnehmen = mitKnoepfen && g.kiste && !unterwegs.ganz && checkliste.length > 0;
    const kannZuruecklegen = mitKnoepfen && g.kiste && !!text;
    if (!text && !kannEntnehmen) return null;
    return (
      <section className={s.karte} aria-label="Unterwegs">
        {text && <div className={s.meldung} role="status" data-rolle="unterwegs">{text}</div>}
        {(kannEntnehmen || kannZuruecklegen) && (
          <div className={s.knopfstapel} style={text ? { marginTop: 12 } : undefined}>
            {kannEntnehmen && <Button block href={`/g/${g.id}/entnehmen`} icon={<Icons8Ikone name="package" groesse={20} />}>Entnehmen</Button>}
            {kannZuruecklegen && (
              <Button block href={unterwegs.ganz ? `/g/${g.id}/pruefung?rueckgabe=${unterwegs.ganz.id}` : `/g/${g.id}/zuruecklegen`} icon={<Icons8Ikone name="checkmark" groesse={20} />}>Zurücklegen</Button>
            )}
          </div>
        )}
      </section>
    );
  };

  const anleitung = (
    <>
      {g.hinweise && (
        <section className={s.karte}>
          <Kicker className={s.karteTitel}>Hinweise</Kicker>
          <p className={s.hinweise}>{g.hinweise}</p>
        </section>
      )}
      {unterlagen.length > 0 && (
        <section className={s.karte}>
          <Kicker className={s.karteTitel}>Unterlagen</Kicker>
          <ul className={s.zeilen} aria-label="Unterlagen">
            {unterlagen.map((u) => (
              <li key={u.id}>
                <a href={`/g/${g.id}/unterlagen/${u.id}`} className={s.unterlage}>
                  <Icons8Ikone name={u.typ === "pdf" ? "document" : "image"} groesse={20} />
                  <span className={s.unterlageTitel}>{u.titel}</span>
                  <span className={`${s.neben} ${s.klein}`}>{u.typ === "pdf" ? "PDF" : "Bild"} · {groesseText(u.bytes)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );

  if (!zugang) {
    const anmelden = `/login?callbackUrl=${encodeURIComponent(loginZiel(await headers(), `/g/${g.id}`))}`;
    return (
      <div className={s.telefon}>
        {kopf}
        {unterwegsKarte(false)}
        {anleitung}
        {inhalt}
        <section className={s.karte}>
          <div className={s.knopfstapel}>
            <Button type="primary" block href={`/g/${g.id}/mangel`} icon={<Icons8Ikone name="warning" groesse={20} />}>Mangel melden</Button>
            {viewer === null && <Button block href={anmelden}>Anmelden</Button>}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={s.telefon}>
      {kopf}

      {unterwegsKarte(true)}

      {anleitung}

      {mitAnlass && (
        <section className={s.karte}>
          <AnlassKnopf geraetId={g.id} imEinsatz={g.imEinsatz} />
        </section>
      )}

      {pruefungen.map((f, i) => {
        const n = punkteJe[f.vorlage.id] ?? 0;
        return (
          <section key={f.vorlage.id} className={s.karte} aria-label={f.vorlage.name}>
            <Kicker className={s.karteTitel}>{f.vorlage.name}</Kicker>
            <div className={s.quer}><span>{f.text}</span><FristChip f={f} /></div>
            <div className={s.neben} style={{ margin: "4px 0 12px" }}>{n} {g.kiste ? (n === 1 ? "Position" : "Positionen") : n === 1 ? "Punkt" : "Punkte"}</div>
            <Button type={i === 0 ? "primary" : "default"} block href={pruefungen.length > 1 ? `/g/${g.id}/pruefung?art=${f.vorlage.id}` : `/g/${g.id}/pruefung`}
              icon={<Icons8Ikone name="checklist" groesse={20} />}>
              {g.kiste ? "Durchzählen" : "Prüfung starten"}
            </Button>
          </section>
        );
      })}

      {inhalt}

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

      {verwaltet && <Link href={`/geraete/${g.id}`} className={s.zurueck}>Zur Akte</Link>}
    </div>
  );
}

export const metadata = { title: "Gerät" };
