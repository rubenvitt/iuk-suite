"use client";

import { useEffect, useMemo } from "react";
import { Button } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import s from "../wartung.module.css";

const KANTE_CLIENT = 1600;

/**
 * Verkleinert ein Telefonbild vor dem Hochladen (Vorbild `lagerbuch/_ui/MangelFormular.tsx`). Kann der
 * Browser es nicht lesen, geht das Original hoch; der Server rechnet jedes Bild ohnehin neu.
 */
export async function verkleinere(datei: File): Promise<Blob> {
  try {
    const bild = await createImageBitmap(datei, { imageOrientation: "from-image" });
    const faktor = Math.min(1, KANTE_CLIENT / Math.max(bild.width, bild.height));
    const leinwand = document.createElement("canvas");
    leinwand.width = Math.round(bild.width * faktor);
    leinwand.height = Math.round(bild.height * faktor);
    leinwand.getContext("2d")?.drawImage(bild, 0, 0, leinwand.width, leinwand.height);
    bild.close();
    const blob = await new Promise<Blob | null>((fertig) => leinwand.toBlob(fertig, "image/jpeg", 0.82));
    return blob ?? datei;
  } catch {
    return datei;
  }
}

/** Ein Foto aufnehmen oder wählen, mit Vorschau und Entfernen. */
export function FotoWahl({ datei, setDatei, name }: { datei: File | null; setDatei: (d: File | null) => void; name: string }) {
  const vorschau = useMemo(() => (datei ? URL.createObjectURL(datei) : null), [datei]);
  useEffect(() => () => { if (vorschau) URL.revokeObjectURL(vorschau); }, [vorschau]);

  if (datei && vorschau) {
    return (
      <div className={s.fotoVorschau}>
        {/* eslint-disable-next-line @next/next/no-img-element -- lokale Vorschau aus einer Blob-Adresse */}
        <img src={vorschau} alt="Foto zum Mangel" className={s.foto} />
        <Button className={s.fotoWeg} shape="circle" aria-label="Foto entfernen" onClick={() => setDatei(null)} icon={<Icons8Ikone name="close" groesse={16} />} />
      </div>
    );
  }
  return (
    <label className={s.fotoknopf}>
      <Icons8Ikone name="image" groesse={20} /> Foto aufnehmen
      <input
        type="file"
        name={name}
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const d = e.target.files?.[0];
          if (d) setDatei(d);
          e.target.value = "";
        }}
      />
    </label>
  );
}
