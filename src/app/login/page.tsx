import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { devLoginEnabled } from "@/core/auth/devLogin";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  // LoginForm nutzt useSearchParams() — Next 16 verlangt dafür eine Suspense-Boundary,
  // sonst schlägt `pnpm build` fehl ("useSearchParams should be wrapped in a suspense boundary").
  // pnpm typecheck fängt das NICHT; erst der Build.
  return (
    <Suspense fallback={null}>
      <LoginForm devLogin={devLoginEnabled()} />
    </Suspense>
  );
}
