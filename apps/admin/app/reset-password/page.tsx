"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/api-client";
import { Suspense } from "react";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await resetPassword(token, password);
      router.push("/login");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao redefinir");
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label>Token</Label>
        <Input value={token} onChange={(e) => setToken(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Nova senha</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button className="w-full" type="submit">
        Redefinir
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Nova senha</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense>
            <ResetForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
