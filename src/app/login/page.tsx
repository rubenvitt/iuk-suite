import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { devLoginEnabled } from "@/core/auth/devLogin";
import { devGroupChoices } from "@/core/auth/devGroups";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  // Ein unlesbares Sitzungs-Cookie darf die Anmeldeseite NICHT zerlegen: auth()
  // wirft JWTSessionError ("no matching decryption secret"), sobald das Cookie mit
  // einem anderen AUTH_SECRET verschlüsselt wurde. Ohne dieses catch bekäme genau
  // die Seite, auf der man das Problem beheben würde, einen Fehler statt eines
  // Formulars — nach einer Secret-Rotation sperrt das jeden Nutzer aus, und lokal
  // nach jedem Wechsel des Entwicklungs-Secrets. Kaputtes Cookie = keine Sitzung.
  let session = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  if (session?.user) redirect("/");
  // LoginForm nutzt useSearchParams() — Next 16 verlangt dafür eine Suspense-Boundary,
  // sonst schlägt `pnpm build` fehl ("useSearchParams should be wrapped in a suspense boundary").
  // pnpm typecheck fängt das NICHT; erst der Build.
  // Die Gruppenauswahl wird HIER berechnet und als Prop übergeben, nicht im
  // Formular deklariert: `login-form.tsx` trägt `"use client"`, ein Wert von
  // dort käme in dieser Server Component als Client-Referenz an (Falle 6).
  // `devGroupChoices` liest `process.env` und gehört ohnehin auf den Server.
  const devLogin = devLoginEnabled();
  return (
    <Suspense fallback={null}>
      <LoginForm devLogin={devLogin} gruppenAuswahl={devLogin ? devGroupChoices() : []} />
    </Suspense>
  );
}
