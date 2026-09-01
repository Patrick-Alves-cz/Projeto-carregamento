"use client";

import { useEffect, useState } from "react";
import { getMe, type AuthUser } from "@/lib/api-client";

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar"));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!user) return <p className="text-muted-foreground text-sm">Carregando...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Fase 1 — autenticação e dados da empresa</p>
      </div>

      <section className="rounded-lg border p-4 space-y-2">
        <h2 className="font-medium">Usuário autenticado</h2>
        <p className="text-sm">{user.profile?.fullName}</p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <p className="text-sm">Role: {user.role}</p>
      </section>

      {user.companies.length > 0 && (
        <section className="rounded-lg border p-4 space-y-2">
          <h2 className="font-medium">Empresa</h2>
          {user.companies.map((c) => (
            <div key={c.id} className="text-sm">
              <p className="font-medium">{c.name}</p>
              <p className="text-muted-foreground">Slug: {c.slug}</p>
              <p className="text-muted-foreground">Papel: {c.memberRole}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
