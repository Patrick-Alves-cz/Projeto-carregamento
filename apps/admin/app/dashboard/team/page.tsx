"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { createInvitation, getTeam, revokeInvitation } from "@/lib/api-client";
import { roleLabel } from "@/lib/labels";

export default function TeamPage() {
  const user = useAuth();
  const companyId = user.companies[0]?.id;
  const [tick, setTick] = useState(0);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"OPERATOR" | "ADMIN">("OPERATOR");
  const [demoLink, setDemoLink] = useState("");
  const [error, setError] = useState("");
  const query = useQuery(() => getTeam(companyId), [companyId, tick]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    if (!companyId) return;
    setError("");
    try {
      const created = await createInvitation({ email, companyId, role });
      setDemoLink(created.acceptUrl ? `${window.location.origin}${created.acceptUrl}` : created.token ?? "");
      setEmail("");
      setTick((value) => value + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao convidar");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Equipe</h1>
        <p className="mt-1 text-sm text-muted-foreground">Convites de operador e admin. Sem e-mail real nesta fase.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Convidar</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={invite}>
            <div className="space-y-2 md:col-span-2">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as "OPERATOR" | "ADMIN")}
              >
                <option value="OPERATOR">Operator</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit">Convidar</Button>
            </div>
          </form>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
          {demoLink ? <p className="mt-3 text-sm text-muted-foreground">Link DEMO: {demoLink}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Membros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {query.error ? <QueryError message={query.error} /> : null}
          {(query.data?.members ?? []).map((member) => (
            <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">{member.fullName}</p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
              <Badge variant="outline">{roleLabel(member.role)}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Convites pendentes</CardTitle>
          <CardDescription>Revogar invalida o token imediatamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(query.data?.invitations ?? []).map((invite) => (
            <div key={invite.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">{invite.email}</p>
                <p className="text-sm text-muted-foreground">
                  {invite.role} · {invite.status}
                </p>
              </div>
              {invite.status === "PENDING" ? (
                <Button size="sm" variant="outline" onClick={() => void revokeInvitation(invite.id).then(() => setTick((v) => v + 1))}>
                  Revogar
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
