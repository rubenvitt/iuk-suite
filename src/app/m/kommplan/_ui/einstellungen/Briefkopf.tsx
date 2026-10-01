"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Popconfirm } from "antd";
import { entferneLogoAction, speichereOrganisationAction } from "../../_actions/briefkopf";
import { LAENGE_ORGANISATION } from "../../_lib/angaben";
import { NETZFEHLER, type EinfachErgebnis, type LogoErgebnis } from "../../_lib/ergebnis";
import { LOGO_ANNAHME, LOGO_TYP_NAME, type LogoTyp } from "../../_lib/logo/logoTyp";


/**
 * BRIEFKOPF BEARBEITEN (Spec §4.4; Umsetzungsplan Phase 4, Entscheidungen 3–6). Organisation per Server
 * Action; das Logo geht an den Route Handler `POST /logo` (Server Actions nehmen höchstens 1 MB). Nach
 * jedem Erfolg `router.refresh()` — die Vorschau darüber ist eine Server Component. Meldungen stehen in
 * EINEM Statusplatz unter dem Formular; eine Ablehnung als Warnung (nie rot, Falle 3), ein Erfolg als Text —
 * vorher sahen beide gleich aus (Review Phase 4).
 */
export function BriefkopfFormular({ organisation, logo }: { organisation: string | null; logo: { typ: LogoTyp; bytes: number } | null }) {
  const router = useRouter();
  const basis = useId();
  const datei = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(organisation ?? "");
  const [meldung, setMeldung] = useState<{ text: string; ok: boolean } | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const nach = (r: EinfachErgebnis | LogoErgebnis, gut: string) => {
    setLaeuft(false);
    setMeldung(r.ok ? { text: gut, ok: true } : { text: r.fehler, ok: false });
    if (r.ok) router.refresh();
  };
  async function speichereName(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLaeuft(true);
    nach(await speichereOrganisationAction({ organisation: name }).catch((): EinfachErgebnis => ({ ok: false, fehler: NETZFEHLER })), "Organisation gespeichert.");
  }
  async function lade(f: File) {
    setLaeuft(true);
    const fd = new FormData();
    fd.set("logo", f);
    let r: LogoErgebnis;
    try { r = await (await fetch("/logo", { method: "POST", body: fd })).json(); } catch { r = { ok: false, fehler: NETZFEHLER }; }
    if (datei.current) datei.current.value = ""; // dieselbe Datei darf gleich noch einmal gewählt werden
    nach(r, r.ok ? `Logo übernommen (${LOGO_TYP_NAME[r.typ]}).` : "");
  }
  async function entferne() {
    setLaeuft(true);
    nach(await entferneLogoAction().catch((): EinfachErgebnis => ({ ok: false, fehler: NETZFEHLER })), "Logo entfernt.");
  }

  return (
    <div className="kp-formular kp-einstellungen">
      <form aria-label="Organisation" onSubmit={speichereName} className="kp-formular">
        <label className="kp-feldname" htmlFor={`${basis}-org`}>Organisation</label>
        <Input id={`${basis}-org`} name="organisation" value={name} maxLength={LAENGE_ORGANISATION} onChange={(e) => setName(e.target.value)}
          placeholder="leer lassen, wenn im Kopf kein Name stehen soll" />
        <div className="kp-formular-knoepfe"><Button type="primary" htmlType="submit" disabled={laeuft}>Speichern</Button></div>
      </form>
      <section aria-label="Logo" className="kp-formular">
        <p className="kp-feldname">Logo</p>
        <p className="kp-logo-stand">{logo ? `Logo: ${LOGO_TYP_NAME[logo.typ]}, ${Math.max(1, Math.round(logo.bytes / 1024))} KB` : "Kein Logo hinterlegt."}</p>
        <p className="kp-hilfe">PNG, JPEG, WebP oder SVG, höchstens 1 MB. Es steht rechts oben auf jedem gedruckten Blatt; ein SVG wird vorher bereinigt.</p>
        <input ref={datei} id={`${basis}-datei`} className="kp-dateifeld" type="file" name="logo" accept={LOGO_ANNAHME} tabIndex={-1} aria-hidden="true"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void lade(f); }} />
        <div className="kp-formular-knoepfe">
          <Button onClick={() => datei.current?.click()} disabled={laeuft}>{logo ? "Logo ersetzen" : "Logo hochladen"}</Button>
          {logo ? (
            <Popconfirm title="Logo entfernen?" description="Der Kopf zeigt dann kein Logo mehr." okText="Entfernen" cancelText="Abbrechen" onConfirm={() => void entferne()}>
              <Button disabled={laeuft}>Logo entfernen</Button>
            </Popconfirm>
          ) : null}
        </div>
      </section>
      {meldung?.ok ? <p className="kp-hinweis" role="status">{meldung.text}</p> : null}
      {meldung && !meldung.ok ? <Alert type="warning" showIcon role="status" title={meldung.text} /> : null}
    </div>
  );
}
