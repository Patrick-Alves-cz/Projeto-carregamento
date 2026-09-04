"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPassword } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await forgotPassword(email);
    setMessage(result.message);
    setToken(result.resetToken ?? "");
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Recuperar acesso</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
            {token ? (
              <p className="text-sm">
                Token DEMO: {token}{" "}
                <Link className="text-primary" href={`/reset-password?token=${encodeURIComponent(token)}`}>
                  redefinir
                </Link>
              </p>
            ) : null}
            <Button className="w-full" type="submit">
              Enviar
            </Button>
            <Link href="/login" className="block text-center text-sm text-muted-foreground">
              Voltar
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
