// BEAMER-SEITE DES LIVE-QUIZ (`/beamer/<moderations-secret>`, allein im Browser oder im
// Slidev-iframe). Öffentlich, ohne Anmeldung: das Secret ist der Zugang (§5.6). Diese Server
// Component liest nur den Stand beim Laden und reicht ihn als serialisierbare Sicht an `Beamer`;
// alles Weitere kommt aus dem Strom. Das Laden legt KEINE Runde an (§5.3: Slidev rendert
// Nachbarfolien vorab) — die entsteht erst mit dem ersten Schritt.
//
// Einbettbar: die Suite setzt keine `frame-ancestors` (§5.6). Ohne `loading.tsx` daneben, damit
// `notFound()` ein echtes 404 bleibt (Falle 23, `CLAUDE.md`).
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/app/m/feedback/_db/client";
import { heutigeRunde, quizPerSecret } from "@/app/m/feedback/_db/quiz";
import { beitrittAdresseAus } from "@/app/m/feedback/_lib/quiz/adresse";
import { SECRET_MAX } from "@/app/m/feedback/_lib/quiz/http";
import { beamerSicht, vorStartSicht } from "@/app/m/feedback/_lib/quiz/sichten";
import { holeAutoEndeNach, leseStand } from "@/app/m/feedback/_lib/quiz/stand";
import { Beamer } from "./Beamer";

export default async function QuizBeamerSeite({ params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const db = getDb();
  const quiz = secret.length <= SECRET_MAX ? quizPerSecret(db, secret) : undefined;
  if (!quiz) notFound();
  const jetzt = new Date();
  holeAutoEndeNach(db, jetzt);
  // Wie der Strom (`strom/route.ts`): die Runde von heute, offen oder schon beendet.
  const runde = heutigeRunde(db, quiz.id, jetzt);
  const stand = runde ? leseStand(db, runde.id) : null;
  const anfang = stand ? beamerSicht(stand.daten, quiz.titel, jetzt) : vorStartSicht(quiz.titel, quiz.modus, quiz.fragen, jetzt);
  return <Beamer anfang={anfang} beitrittAdresse={beitrittAdresseAus(await headers())} />;
}

export const metadata = { title: "Live-Quiz" };
