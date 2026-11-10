"use client";

import { useState } from "react";
import { App, Button, Form, Input, InputNumber, Modal, Segmented, Select } from "antd";
import { Filterchips } from "@/core/filterchips/Filterchips";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { fingerabdruck } from "@/core/entwurf/ablage";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, nachText, trifftWert, werteAlsFilter, Zeilenaktionen } from "@/core/tabelle";
import { artikelAendernAction, artikelAktivAction, artikelAnlegenAction, nachschlagenAction } from "../_actions/verwaltung";
import { EINHEITEN, KATEGORIEN, MHD_ART_TEXT, mengeText, zahlText, type MhdArt } from "../_lib/mhd";
import type { ArtikelDTO } from "../_lib/typen";
import { Chip } from "./teile";
import { useAktion } from "./useAktion";
import s from "./verpflegung.module.css";

type Sicht = "aktiv" | "vorlaeufig" | "inaktiv";

interface Werte {
  name: string;
  ean: string;
  kategorie: string;
  einheit: string;
  mhdArt: MhdArt;
  rotTage: number;
  gelbTage: number;
  mindest: number | null;
}

const NEU: Werte = { name: "", ean: "", kategorie: "Konserven", einheit: "Stück", mhdArt: "mhd", rotTage: 7, gelbTage: 30, mindest: null };

function werteAus(a: ArtikelDTO): Werte {
  return { name: a.name, ean: a.ean ?? "", kategorie: a.kategorie, einheit: a.einheit, mhdArt: a.mhdArt, rotTage: a.rotTage, gelbTage: a.gelbTage, mindest: a.mindest };
}

/** Die Artikelliste mit Formular. Vorläufige Artikel (am Telefon angelegt) stehen oben, bis jemand sie prüft. */
export function ArtikelVerwaltung({ artikel, bestand }: { artikel: ArtikelDTO[]; bestand: Record<string, number> }) {
  const { message } = App.useApp();
  const { laeuft, feldFehler, setFeldFehler, fuehreAus } = useAktion();
  const [sicht, setSicht] = useState<Sicht>(artikel.some((a) => a.vorlaeufig && a.aktiv) ? "vorlaeufig" : "aktiv");
  const [offen, setOffen] = useState<ArtikelDTO | "neu" | null>(null);
  const [suche, setSuche] = useState(false);
  const [form] = Form.useForm<Werte>();
  /*
   * IDA-358: die Eingaben im Dialog liegen je Artikel auf dem Gerät, bis das Speichern bestätigt ist; das nächste
   * Öffnen desselben Artikels stellt sie wieder her. `geaendert` ist `null`, solange nichts getippt ist — das
   * Formular ist für alle Artikel dasselbe (`forceRender`), also beginnt jedes Öffnen ohne Entwurf.
   * Nicht `useFormEntwurf`: dessen Stand ließe sich beim Wechsel auf einen anderen Artikel nicht leeren.
   */
  const [geaendert, setGeaendert] = useState<Werte | null>(null);
  const ausgang = offen === null ? null : offen === "neu" ? NEU : werteAus(offen);
  const entwurf = useEntwurf<Werte | null>({
    schluessel: offen === null ? null : `verpflegung:artikel:${offen === "neu" ? "neu" : `${offen.id}:${fingerabdruck(ausgang)}`}`,
    stand: geaendert,
    wiederherstellen: (w) => {
      if (w) form.setFieldsValue(w);
      else if (ausgang) form.setFieldsValue(ausgang);
      setGeaendert(w);
    },
  });
  const zeilen = artikel.filter((a) => (sicht === "inaktiv" ? !a.aktiv : a.aktiv && (sicht === "aktiv" || a.vorlaeufig)));
  const vorlaeufig = artikel.filter((a) => a.aktiv && a.vorlaeufig).length;

  const oeffne = (a: ArtikelDTO | "neu") => {
    setFeldFehler({});
    form.setFieldsValue(a === "neu" ? NEU : werteAus(a));
    setGeaendert(null);
    setOffen(a);
  };

  const nachschlagen = async () => {
    const ean = String(form.getFieldValue("ean") ?? "").trim();
    if (!ean) return;
    setSuche(true);
    try {
      const fund = await nachschlagenAction(ean);
      if (!fund) { message.info("In der Lebensmitteldatenbank nicht gefunden."); return; }
      form.setFieldsValue({ name: fund.name, ...(fund.kategorie ? { kategorie: fund.kategorie } : {}), ...(fund.einheit ? { einheit: fund.einheit } : {}) });
      setGeaendert(form.getFieldsValue()); // `setFieldsValue` meldet kein `onValuesChange` (IDA-358)
    } catch {
      message.error("Die Lebensmitteldatenbank ist gerade nicht erreichbar.");
    } finally {
      setSuche(false);
    }
  };

  const speichern = (w: Werte) => {
    const eingabe = { ...w, ean: (w.ean ?? "").trim(), mindest: w.mindest ? w.mindest : null };
    const ziel = offen;
    fuehreAus(
      () => (ziel === "neu" || ziel === null ? artikelAnlegenAction(eingabe) : artikelAendernAction(ziel.id, eingabe)),
      ziel === "neu" ? "Artikel angelegt." : "Gespeichert.",
      () => { entwurf.verwerfen(); setOffen(null); },
    );
  };

  const fehler = (feld: keyof Werte) => (feldFehler[feld] ? { validateStatus: "error" as const, help: feldFehler[feld] } : {});

  return (
    <>
      <Seitenkopf
        titel="Artikel"
        aktionen={
          <span className={s.reihe}>
            <Filterchips<Sicht>
              aria-label="Auswahl"
              wert={sicht}
              onChange={setSicht}
              optionen={[{ wert: "aktiv", label: "Aktiv" }, { wert: "vorlaeufig", label: "Vorläufig", anzahl: vorlaeufig }, { wert: "inaktiv", label: "Inaktiv" }]}
            />
            <Button type="primary" icon={<Icons8Ikone name="plus" groesse={16} />} onClick={() => oeffne("neu")}>Artikel anlegen</Button>
          </span>
        }
      />
      <Kartentabelle<ArtikelDTO>
        rowKey="id"
        aria-label="Artikel"
        dataSource={zeilen}
        leer={{
          nichts: sicht === "vorlaeufig" ? "Nichts zu prüfen" : sicht === "inaktiv" ? "Keine inaktiven Artikel" : "Noch keine Artikel",
          figur: sicht === "vorlaeufig" ? "erledigt" : "verpflegung",
          gefiltert: sicht === "inaktiv" ? "Keine inaktiven Artikel." : "Kein Artikel passt zum Filter.",
          // Aktiv/Inaktiv sind Filterchips über einem Bestand, der existiert: leer
          // heißt dort „nichts passt", kein Ruhezustand. „Vorläufig" ist die
          // Prüfliste — leer ist sie erledigt, also Figur.
          aktiv: sicht !== "vorlaeufig" && artikel.length > 0 ? true : undefined,
        }}
        karte={{ titel: "name", kennzeichen: ["stand"] }}
        columns={[
          { title: "Artikel", key: "name", defaultSortOrder: "ascend", sorter: nachText<ArtikelDTO>((a) => a.name), // IDA-393: die EAN als leise zweite Zeile unter dem Namen statt als eigene Spalte.
            render: (_: unknown, a: ArtikelDTO) => (
              <div>
                <strong>{a.name}</strong>
                {a.ean ? <div className={`${s.mono} ${s.neben}`}>{a.ean}</div> : null}
              </div>
            ) },
          { title: "Stand", key: "stand", render: (_: unknown, a: ArtikelDTO) => (a.vorlaeufig ? <Chip farbe="gelb">vorläufig</Chip> : a.aktiv ? <Chip farbe="ok">geprüft</Chip> : <Chip farbe="grau">inaktiv</Chip>) },
          {
            title: "Kategorie", key: "kategorie", filters: werteAlsFilter(zeilen, (a) => a.kategorie), onFilter: trifftWert<ArtikelDTO>((a) => a.kategorie),
            render: (_: unknown, a: ArtikelDTO) => a.kategorie,
          },
          {
            title: "Ampel", key: "ampel",
            render: (_: unknown, a: ArtikelDTO) => <span className={s.ziffern}>{a.mhdArt === "verbrauch" ? "Verbr." : "MHD"} · rot {a.rotTage} · gelb {a.gelbTage}</span>,
          },
          {
            title: "Bestand", key: "bestand", align: "right",
            render: (_: unknown, a: ArtikelDTO) => {
              const b = bestand[a.id] ?? 0;
              const knapp = a.mindest !== null && b < a.mindest;
              // IDA-382: der Mindestbestand trägt sein Wort, statt als „18 / 12“ unbeschriftet daneben zu stehen.
              return (
                <span className={`${s.ziffern} ${knapp ? s.textGelb : ""}`}>
                  {mengeText(b, a.einheit)}{a.mindest !== null && <span className={s.neben}> · Mindestbestand {zahlText(a.mindest)}</span>}
                </span>
              );
            },
          },
          {
            title: "Aktion", key: "aktion",
            render: (_: unknown, a: ArtikelDTO) => {
              const oeffnen = { key: "oeffnen", label: a.vorlaeufig ? "Prüfen" : "Bearbeiten", onClick: () => oeffne(a) };
              return (
                <Zeilenaktionen
                  name={a.name}
                  laeuft={laeuft}
                  haupt={a.vorlaeufig ? oeffnen : undefined}
                  aktionen={[
                    ...(a.vorlaeufig ? [] : [oeffnen]),
                    {
                      key: "aktiv",
                      label: a.aktiv ? "Deaktivieren" : "Aktivieren",
                      onClick: () => fuehreAus(() => artikelAktivAction(a.id, !a.aktiv), a.aktiv ? "Deaktiviert." : "Wieder aktiv."),
                    },
                  ]}
                />
              );
            },
          },
        ]}
      />
      <Modal
        open={offen !== null}
        title={offen === "neu" ? "Artikel anlegen" : offen?.vorlaeufig ? "Artikel prüfen" : "Artikel bearbeiten"}
        okText={offen !== "neu" && offen?.vorlaeufig ? "Geprüft speichern" : "Speichern"}
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        onOk={() => form.submit()}
        onCancel={() => setOffen(null)}
        forceRender
      >
        <Form<Werte> form={form} layout="vertical" onFinish={speichern} requiredMark={false} onValuesChange={(_g, alle) => setGeaendert(alle)}>
          <EntwurfHinweis entwurf={entwurf} />
          <Form.Item label="EAN (Strichcode)" {...fehler("ean")}>
            <span className={s.reihe} style={{ flexWrap: "nowrap" }}>
              <Form.Item name="ean" noStyle><Input inputMode="numeric" autoComplete="off" maxLength={14} /></Form.Item>
              <Button loading={suche} onClick={nachschlagen}>Nachschlagen</Button>
            </span>
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Bitte ausfüllen." }]} {...fehler("name")}>
            <Input maxLength={120} />
          </Form.Item>
          <div className={s.filter}>
            <Form.Item name="kategorie" label="Kategorie" {...fehler("kategorie")}>
              <Select options={KATEGORIEN.map((k) => ({ value: k, label: k }))} />
            </Form.Item>
            <Form.Item name="einheit" label="Einheit" {...fehler("einheit")}>
              <Select options={EINHEITEN.map((e) => ({ value: e, label: e }))} />
            </Form.Item>
          </div>
          <Form.Item name="mhdArt" label="Datum auf der Packung" {...fehler("mhdArt")}>
            <Segmented<MhdArt> block options={(Object.keys(MHD_ART_TEXT) as MhdArt[]).map((m) => ({ value: m, label: MHD_ART_TEXT[m] }))} />
          </Form.Item>
          <div className={s.filter}>
            <Form.Item name="rotTage" label="Rot ab (Tage vorher)" {...fehler("rotTage")}>
              <InputNumber min={0} max={365} precision={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="gelbTage" label="Gelb ab (Tage vorher)" {...fehler("gelbTage")}>
              <InputNumber min={0} max={730} precision={0} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="mindest" label="Mindestbestand" {...fehler("mindest")}>
              <InputNumber min={0} max={100000} style={{ width: "100%" }} placeholder="keiner" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  );
}
