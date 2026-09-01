import { APP_NAME } from "@evcharge/shared";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="text-muted-foreground text-sm">Painel administrativo — Fase 0</p>
        <div className="rounded-lg border p-4 text-left text-sm">
          <p className="font-medium">Status</p>
          <p className="text-muted-foreground mt-1">Fase 1 — acesse o painel administrativo.</p>
          <a href="/login" className="mt-3 inline-block text-sm underline">
            Ir para login
          </a>
        </div>
      </div>
    </main>
  );
}
