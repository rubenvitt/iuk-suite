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
          onSubmit={async (e) => {
            e.preventDefault();
            // Dev-login only: post the credentials WITHOUT letting next-auth perform the
            // redirect. Auth.js derives its redirect base URL from the server-side request
            // origin (localhost in dev, since Next's Request doesn't reflect the client Host
            // header), so its own redirect would bounce the browser off the requesting
            // *.localtest.me host. With redirect:false the session cookie is set by the fetch
            // response, and we navigate on the CURRENT origin instead — keeping the browser on
            // the host that initiated the login. Production-safe (this branch never renders when
            // AUTH_DEV_LOGIN is unset) and it leaves the real Pocket-ID button's redirect intact.
            await signIn("dev-login", { email, groups, redirect: false });
            window.location.assign(callbackUrl);
          }}>
          <input aria-label="email" className="rounded border px-2 py-1" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input aria-label="groups" placeholder="comma,separated,groups" className="rounded border px-2 py-1" value={groups} onChange={(e) => setGroups(e.target.value)} />
          <button className="rounded-md bg-[var(--color-tinte)] px-4 py-2 text-white" type="submit">Dev-Login</button>
        </form>
      )}
    </main>
  );
}
