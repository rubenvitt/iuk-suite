"use client";

/**
 * pdf.js für die Vorlagenverwaltung (IDA-343), nur im Browser und erst bei Bedarf geladen. Der Worker läuft im
 * Hauptthread (`globalThis.pdfjsWorker`): eine Vertragsvorlage hat wenige Seiten, und so braucht es keine
 * Worker-URL, die jeder Bundler anders auflöst.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

let geladen: Promise<typeof import("pdfjs-dist")> | null = null;

function pdfjs() {
  geladen ??= (async () => {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs");
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return import("pdfjs-dist");
  })();
  return geladen;
}

export async function oeffnePdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  return lib.getDocument({ data: new Uint8Array(bytes) }).promise;
}

/** Rendert eine Seite (ab 0) in `canvas` mit `breite` CSS-Pixeln; gibt Maßstab (Pixel je Punkt) und Seitenmaß zurück. */
export async function rendereSeite(doc: PDFDocumentProxy, seite: number, canvas: HTMLCanvasElement, breite: number) {
  const p = await doc.getPage(seite + 1);
  const basis = p.getViewport({ scale: 1 });
  const massstab = breite / basis.width;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const vp = p.getViewport({ scale: massstab * dpr });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
  canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
  await p.render({ canvas, viewport: vp }).promise;
  return { massstab, mass: { b: basis.width, h: basis.height } };
}
