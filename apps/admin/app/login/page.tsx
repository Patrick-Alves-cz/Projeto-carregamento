"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin.sp@evcharge.demo");
  const [password, setPassword] = useState("Demo@12345");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.35_0.08_160_/_0.25),transparent_55%)]" />
      <Card className="relative w-full max-w-sm">
        <CardHeader className="space-y-4">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="size-5" />
          </div>
          <div>
            <CardTitle className="text-xl">Entrar no painel</CardTitle>
            <CardDescription className="mt-1">
              Operação da rede de recarga — versão beta
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Demo: admin.sp@evcharge.demo / Demo@12345
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
