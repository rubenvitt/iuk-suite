"use client";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm({ devLogin }: { devLogin: boolean }) {
  const callbackUrl = useSearchParams().get("callbackUrl") ?? "/";
  const [email, setEmail] = useState("dev@localtest.me");
  const [groups, setGroups] = useState("");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">IuK-Suite Login</h1>
      <button className="rounded-md bg-[var(--color-rot)] px-4 py-2 text-white"
        onClick={() => signIn("pocket-id", { redirectTo: callbackUrl })}>
        Mit Pocket ID anmelden
      </button>
      {devLogin && (
        <form className="flex flex-col gap-2 border-t pt-4"
          onSubmit={(e) => { e.preventDefault(); signIn("dev-login", { email, groups, redirectTo: callbackUrl }); }}>
          <input aria-label="email" className="rounded border px-2 py-1" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input aria-label="groups" placeholder="comma,separated,groups" className="rounded border px-2 py-1" value={groups} onChange={(e) => setGroups(e.target.value)} />
          <button className="rounded-md bg-[var(--color-tinte)] px-4 py-2 text-white" type="submit">Dev-Login</button>
        </form>
      )}
    </main>
  );
}
