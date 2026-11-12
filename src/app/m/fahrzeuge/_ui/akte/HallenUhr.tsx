"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zeitFormat } from "@/core/zeit";

/** Die Stände kommen vom Server; etwa jede Minute holt die Tafel sie neu. */
export const HALLE_TAKT_MS = 60_000;
const UHR_TAKT_MS = 15_000;

/**
 * Uhr und Takt der Hallentafel. Die Uhr steht erst nach dem Laden da (leer im Server-HTML), damit Server
 * und Browser nicht zwei verschiedene Minuten schreiben; die Zone ist die der Suite (`zeitFormat`, je
 * Aufruf). `router.refresh()` rendert die Server-Seite neu, ohne die Seite zu laden.
 */
export function HallenUhr({ className }: { className?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");

  useEffect(() => {
    const zeige = () => setText(zeitFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(Date.now()));
    zeige();
    const uhr = setInterval(zeige, UHR_TAKT_MS);
    const takt = setInterval(() => router.refresh(), HALLE_TAKT_MS);
    return () => { clearInterval(uhr); clearInterval(takt); };
  }, [router]);

  return <span className={className} data-rolle="hallen-uhr">{text}</span>;
}
