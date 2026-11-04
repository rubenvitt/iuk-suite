// Der Worker von pdf.js bringt keine Typen mit; `pdfSeiten.ts` reicht das Modul nur an `globalThis.pdfjsWorker`.
declare module "pdfjs-dist/build/pdf.worker.min.mjs";
