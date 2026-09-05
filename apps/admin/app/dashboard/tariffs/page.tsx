"use client";

import { FormEvent, useState } from "react";
import { useAuth } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { createTariff, deleteTariff, listTariffs, updateTariff } from "@/lib/api-client";
import { formatCurrency } from "@/lib/labels";

export default function TariffsPage() {
  const user = useAuth();
  const [tick, setTick] = useState(0);
  const [error, setError] = useState("");
  const [name, setName] = useState("Tarifa padrão");
  const [price, setPrice] = useState("1.89");
  const [minute, setMinute] = useState("0");
  const [idle, setIdle] = useState("0");
  const [parking, setParking] = useState("0");
  const [minBalance, setMinBalance] = useState("10");
  const [editingId, setEditingId] = useState<string | null>(null);
  const query = useQuery(listTariffs, [tick]);
  const companyId = user.companies[0]?.id;

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!companyId) return;
    setError("");
    try {
      const payload = {
        name,
        pricePerKwhCents: Math.round(Number(price.replace(",", ".")) * 100),
        pricePerMinuteCents: Math.round(Number(minute.replace(",", ".")) * 100) || 0,
        idleFeeCents: Math.round(Number(idle.replace(",", ".")) * 100) || 0,
        parkingPriceCents: Math.round(Number(parking.replace(",", ".")) * 100) || 0,
        minBalanceCents: Math.round(Number(minBalance.replace(",", ".")) * 100) || 1000,
      };
      if (editingId) {
        await updateTariff(editingId, payload);
        setEditingId(null);
      } else {
        await createTariff({ companyId, ...payload });
      }
      setTick((value) => value + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao criar tarifa");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tarifas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Preços vigentes da empresa. Sessões já iniciadas mantêm o snapshot.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nova tarifa</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={onCreate}>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>R$ / kWh</Label>
              <Input value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>R$ / minuto</Label>
              <Input value={minute} onChange={(e) => setMinute(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Ociosidade R$/min</Label>
              <Input value={idle} onChange={(e) => setIdle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Estacionamento R$</Label>
              <Input value={parking} onChange={(e) => setParking(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Saldo mínimo R$</Label>
              <Input value={minBalance} onChange={(e) => setMinBalance(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="submit">{editingId ? "Salvar edição" : "Criar"}</Button>
            </div>
          </form>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tabela</CardTitle>
          <CardDescription>Nome, preço, taxas e vigência</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.error ? <QueryError message={query.error} /> : null}
          {(query.data ?? []).map((tariff) => (
            <div key={tariff.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">{tariff.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(tariff.pricePerKwhCents)}/kWh · minuto {formatCurrency(tariff.pricePerMinuteCents)} ·
                  ociosidade {formatCurrency(tariff.idleFeeCents)} · mín. {formatCurrency(tariff.minBalanceCents)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(tariff.id);
                    setName(tariff.name);
                    setPrice((tariff.pricePerKwhCents / 100).toFixed(2));
                    setMinute((tariff.pricePerMinuteCents / 100).toFixed(2));
                    setIdle((tariff.idleFeeCents / 100).toFixed(2));
                    setParking(((tariff.parkingPriceCents ?? 0) / 100).toFixed(2));
                    setMinBalance((tariff.minBalanceCents / 100).toFixed(2));
                  }}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void updateTariff(tariff.id, { active: !tariff.active }).then(() => setTick((v) => v + 1))}
                >
                  {tariff.active ? "Desativar" : "Ativar"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void deleteTariff(tariff.id).then(() => setTick((v) => v + 1))}
                >
                  Remover
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
