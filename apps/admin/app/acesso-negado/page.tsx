"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { logout } from "@/lib/api-client";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="size-5" />
          </div>
          <CardTitle>Acesso negado</CardTitle>
          <CardDescription>
            Esta área não está disponível para o seu perfil. O endereço da URL não altera permissões — o servidor decide.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild>
            <Link href="/">Ir para a área correta</Link>
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await logout();
              window.location.assign("/login");
            }}
          >
            Sair
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
