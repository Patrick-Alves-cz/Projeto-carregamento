import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermosPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Termos de uso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            O EV Charge Beta é um ambiente de demonstração. Ao usar o sistema, você concorda em
            utilizar contas DEMO ou as suas apenas para testes autorizados, sem dados de pagamento
            reais.
          </p>
          <p>
            Contas de operação e administração são criadas por convite. O cadastro público cria
            apenas perfil de motorista.
          </p>
          <Link href="/login" className="inline-block text-primary hover:underline">
            Voltar ao login
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
