"use client";

import { Filterchips } from "@/core/filterchips/Filterchips";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Nur bei mehr als einer verwalteten Gruppe; der Wert steht in `?gruppe=`, damit Links ihn mitnehmen. */
export function GruppenFilter({ wahl, gewaehlt }: { wahl: { id: string; name: string }[]; gewaehlt: string | null }) {
  const router = useRouter();
  const pfad = usePathname();
  const suche = useSearchParams();
  if (wahl.length < 2) return null;
  return (
    <Filterchips<string>
      aria-label="Gruppe"
      wert={gewaehlt ?? "alle"}
      optionen={[{ label: "Alle Gruppen", wert: "alle" }, ...wahl.map((g) => ({ label: g.name, wert: g.id }))]}
      onChange={(v) => {
        const neu = new URLSearchParams(suche.toString());
        if (v === "alle") neu.delete("gruppe");
        else neu.set("gruppe", v);
        const q = neu.toString();
        router.push(q ? `${pfad}?${q}` : pfad);
      }}
    />
  );
}
