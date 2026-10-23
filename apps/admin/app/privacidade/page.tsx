import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacidadePage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Privacidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            No beta, guardamos e-mail, nome, telefone opcional e dados necessários para sessões de
            recarga e operação. Senhas são armazenadas com hash; nunca enviamos senha em texto puro.
          </p>
          <p>
            Pagamentos permanecem em modo mock/sandbox. Não use cartão ou PIX reais neste ambiente.
          </p>
          <Link href="/login" className="inline-block text-primary hover:underline">
            Voltar ao login
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
