"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearTokens } from "@/lib/api-client";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  function logout() {
    clearTokens();
    router.push("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="font-semibold">
            EV Charge Admin
          </Link>
        </div>
        <button onClick={logout} className="text-sm text-muted-foreground hover:underline">
          Sair
        </button>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
