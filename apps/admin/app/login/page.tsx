"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import {
  isPasswordStrong,
  PASSWORD_POLICY_MESSAGE,
  postLoginPath,
} from "@evcharge/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordRequirements } from "@/components/password-requirements";
import { login, registerDriver } from "@/lib/api-client";

type Step = "chooser" | "email-login" | "email-register";

function GoogleIcon() {
  return (
    <svg aria-hidden className="size-5" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg aria-hidden className="size-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.22 3.03-.9.94-2.16 1.5-3.35 1.41-.1-1.12.42-2.3 1.2-3.1.9-.95 2.25-1.55 3.37-1.34zM20.76 17.35c-.55 1.25-.82 1.8-1.53 2.91-.99 1.54-2.39 3.46-4.13 3.48-1.54.02-1.94-1-4.04-1-2.1 0-2.55.98-4.08 1.02-1.72.04-3.04-1.67-4.04-3.2-2.8-4.3-3.1-9.34-1.37-12 1.22-1.9 3.15-3.01 4.96-3.01 1.85 0 3.01 1.02 4.54 1.02 1.48 0 2.38-1.02 4.52-1.02 1.61 0 3.32.88 4.54 2.39-3.99 2.19-3.34 7.9-.37 9.41z" />
    </svg>
  );
}

export default function LoginPage() {
  const [step, setStep] = useState<Step>("chooser");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoHint, setDemoHint] = useState("");

  useEffect(() => {
    setDemoHint(
      "Demo motorista: driver1@evcharge.demo / Demo@12345\nDemo operação: admin.sp@evcharge.demo / Demo@12345",
    );
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    if (oauth === "google_missing") {
      setError("Google ainda não está configurado. Coloque GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.");
    } else if (oauth === "error") {
      setError("Não foi possível entrar com Google. Tente de novo ou use e-mail e senha.");
    }
    void (async () => {
      try {
        const res = await fetch("/api/proxy/auth/me", { credentials: "include" });
        if (!res.ok) return;
        const user = (await res.json()) as { role?: string };
        window.location.replace(postLoginPath(user.role));
      } catch {
        // sessão ausente
      }
    })();
  }, []);

  function go(next: Step) {
    setError("");
    setInfo("");
    setStep(next);
  }

  function startGoogle() {
    setError("");
    setInfo("");
    window.location.assign("/api/auth/google");
  }

  function socialSoon(provider: "Apple") {
    setError("");
    setInfo(
      `${provider} estará disponível assim que as chaves OAuth forem configuradas. Por enquanto use Google ou e-mail e senha.`,
    );
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const data = await login(email, password);
      window.location.assign(data.redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (!isPasswordStrong(password)) {
      setError(PASSWORD_POLICY_MESSAGE);
      return;
    }
    setLoading(true);
    setError("");
    setInfo("");
    try {
      const data = await registerDriver({ fullName, email, password });
      window.location.assign(data.redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a conta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.35_0.08_160_/_0.25),transparent_55%)]" />
      <Card className="relative w-full max-w-sm border-border/80 bg-card/95 shadow-xl backdrop-blur">
        <CardHeader className="space-y-3">
          {step !== "chooser" ? (
            <button
              type="button"
              onClick={() => go("chooser")}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Voltar
            </button>
          ) : null}
          <div>
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {step === "email-register" ? "Criar conta" : "Entre ou cadastre-se"}
            </CardTitle>
            <CardDescription className="mt-2 text-sm leading-relaxed">
              Ao continuar, você está de acordo com nossos{" "}
              <Link href="/termos" className="font-medium text-primary underline-offset-4 hover:underline">
                termos de uso
              </Link>{" "}
              e{" "}
              <Link
                href="/privacidade"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                privacidade
              </Link>
              .
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {info ? (
            <Alert>
              <AlertDescription>{info}</AlertDescription>
            </Alert>
          ) : null}

          {step === "chooser" ? (
            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full justify-center gap-3 rounded-xl border-border/80 bg-background text-base font-medium"
                onClick={startGoogle}
              >
                <GoogleIcon />
                Continuar com Google
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-12 w-full justify-center gap-3 rounded-xl text-base font-medium"
                onClick={() => socialSoon("Apple")}
              >
                <AppleIcon />
                Continuar com Apple
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-12 w-full justify-center gap-3 rounded-xl text-base font-medium"
                onClick={() => go("email-login")}
              >
                <Mail className="size-5" />
                Continuar com e-mail
              </Button>
              <p className="pt-2 text-center text-sm text-muted-foreground">
                Não consegue acessar?{" "}
                <Link href="/forgot-password" className="font-medium text-primary hover:underline">
                  Recuperar senha
                </Link>
              </p>
              {demoHint ? (
                <p className="whitespace-pre-line text-center text-xs text-muted-foreground">{demoHint}</p>
              ) : null}
            </div>
          ) : null}

          {step === "email-login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
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
              <Button type="submit" className="h-11 w-full rounded-xl" disabled={loading}>
                {loading ? "Entrando…" : "Entrar"}
              </Button>
              <p className="text-center text-sm">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => go("email-register")}
                >
                  Criar conta com e-mail
                </button>
              </p>
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/forgot-password" className="text-primary hover:underline">
                  Recuperar senha
                </Link>
              </p>
            </form>
          ) : null}

          {step === "email-register" ? (
            <form onSubmit={handleRegister} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cadastro público cria conta de motorista. Operação entra por convite.
              </p>
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  required
                  minLength={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-email">E-mail</Label>
                <Input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password">Senha</Label>
                <Input
                  id="register-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <PasswordRequirements password={password} />
              </div>
              <Button
                type="submit"
                className="h-11 w-full rounded-xl"
                disabled={loading || !isPasswordStrong(password)}
              >
                {loading ? "Criando…" : "Criar conta"}
              </Button>
              <p className="text-center text-sm">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => go("email-login")}
                >
                  Já tenho conta
                </button>
              </p>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
