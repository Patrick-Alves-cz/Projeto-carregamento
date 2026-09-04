"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvitation, previewInvitation } from "@/lib/api-client";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    previewInvitation(params.token)
      .then((invite) => {
        setEmail(invite.email);
        setRole(invite.role);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Convite inválido"));
  }, [params.token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await acceptInvitation(params.token, { fullName, password });
      router.push("/login");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível aceitar");
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Aceitar convite</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <p className="text-sm text-muted-foreground">
              {email} · {role}
            </p>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit">
              Criar conta
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
