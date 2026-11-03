"use client";

import { Segmented } from "antd";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Nur bei mehr als einer verwalteten Gruppe; der Wert steht in `?gruppe=`, damit Links ihn mitnehmen. */
export function GruppenFilter({ wahl, gewaehlt }: { wahl: { id: string; name: string }[]; gewaehlt: string | null }) {
  const router = useRouter();
  const pfad = usePathname();
  const suche = useSearchParams();
  if (wahl.length < 2) return null;
  return (
    <Segmented
      aria-label="Gruppe"
      value={gewaehlt ?? "alle"}
      options={[{ label: "Alle Gruppen", value: "alle" }, ...wahl.map((g) => ({ label: g.name, value: g.id }))]}
      onChange={(v) => {
        const neu = new URLSearchParams(suche.toString());
        if (v === "alle") neu.delete("gruppe");
        else neu.set("gruppe", String(v));
        const q = neu.toString();
        router.push(q ? `${pfad}?${q}` : pfad);
      }}
    />
  );
}
