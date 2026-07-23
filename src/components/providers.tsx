"use client";

import { useEffect } from "react";
import { SessionProvider, signOut, useSession } from "next-auth/react";

function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.error === "RefreshTokenError") {
      signOut({ callbackUrl: "/api/auth/oidc-signout" });
    }
  }, [session?.error]);

  return children;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionGuard>{children}</SessionGuard>
    </SessionProvider>
  );
}
