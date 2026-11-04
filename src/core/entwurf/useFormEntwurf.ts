"use client";

import { useCallback, useState } from "react";
import type { FormInstance } from "antd";
import { useEntwurf, type Entwurf } from "./useEntwurf";

/**
 * `useEntwurf` für ein antd-`Form` — IDA-358. Anschließen in drei Zeilen:
 *
 *   const entwurf = useFormEntwurf(form, `modul:zweck:${id}`);
 *   <Form form={form} onValuesChange={entwurf.onValuesChange} …>
 *   nach bestätigtem Erfolg: entwurf.verwerfen()   (oder `senden`/`antwort` mitgeben)
 *
 * Der Stand sind die Formularwerte, wie antd sie in `onValuesChange` meldet;
 * dayjs-Werte (DatePicker) überstehen die Ablage (`ablage.ts`). Datei-Uploads
 * (`Upload`-Listen) sind darin nur Metadaten — die Datei selbst liegt nicht auf
 * dem Gerät. Wer einen Upload im Formular hat, nimmt dessen Feld per `ohne` aus.
 *
 * `verwerfen` setzt das Formular per `resetFields` auf seine `initialValues`.
 */
export function useFormEntwurf<V extends object, N = V, R = unknown>(
  form: FormInstance<V>,
  schluessel: string | null,
  opt: {
    senden?: (nutzlast: N, sendungId: string) => Promise<R>;
    antwort?: (ergebnis: R) => boolean;
    /** Felder, die nicht auf dem Gerät landen sollen (Uploads, Geheimnisse). */
    ohne?: (keyof V)[];
  } = {},
): Entwurf<N> & { onValuesChange: (geaendert: Partial<V>, alle: V) => void } {
  const [werte, setWerte] = useState<Partial<V> | null>(null);
  const ohne = opt.ohne;
  const entwurf = useEntwurf<Partial<V> | null, N, R>({
    schluessel,
    stand: werte,
    wiederherstellen: (s) => {
      if (s) form.setFieldsValue(s as Parameters<FormInstance<V>["setFieldsValue"]>[0]);
      else form.resetFields();
      setWerte(s);
    },
    senden: opt.senden,
    antwort: opt.antwort,
  });
  const onValuesChange = useCallback((_g: Partial<V>, alle: V) => {
    if (!ohne?.length) {
      setWerte(alle);
      return;
    }
    const kopie = { ...alle } as Partial<V>;
    for (const k of ohne) delete kopie[k];
    setWerte(kopie);
  }, [ohne]);
  return { ...entwurf, onValuesChange };
}
