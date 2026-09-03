"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createStation } from "@/lib/api-client";

export default function NewStationPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    postalCode: "",
    latitude: "-23.5505",
    longitude: "-46.6333",
    accessType: "PUBLIC",
    openingHours: "24 horas",
    amenities: "wifi,estacionamento",
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const station = await createStation({
        name: form.name,
        address: form.address,
        city: form.city || undefined,
        postalCode: form.postalCode || undefined,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        accessType: form.accessType as "PUBLIC" | "PRIVATE" | "RESTRICTED",
        amenities: form.amenities.split(",").map((item) => item.trim()).filter(Boolean),
        openingHours: { label: form.openingHours },
      });
      router.push(`/dashboard/stations/${station.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Não foi possível criar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nova estação</h1>
        <p className="mt-1 text-sm text-muted-foreground">Cadastro operacional mínimo da unidade.</p>
      </div>
      <form className="space-y-4" onSubmit={submit}>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Field label="Nome" value={form.name} onChange={(name) => setForm((c) => ({ ...c, name }))} />
        <Field label="Endereço" value={form.address} onChange={(address) => setForm((c) => ({ ...c, address }))} />
        <Field label="Cidade" value={form.city} onChange={(city) => setForm((c) => ({ ...c, city }))} />
        <Field label="CEP" value={form.postalCode} onChange={(postalCode) => setForm((c) => ({ ...c, postalCode }))} />
        <Field label="Latitude" value={form.latitude} onChange={(latitude) => setForm((c) => ({ ...c, latitude }))} />
        <Field label="Longitude" value={form.longitude} onChange={(longitude) => setForm((c) => ({ ...c, longitude }))} />
        <div className="space-y-2">
          <Label>Acesso</Label>
          <select
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={form.accessType}
            onChange={(event) => setForm((c) => ({ ...c, accessType: event.target.value }))}
          >
            <option value="PUBLIC">Público</option>
            <option value="PRIVATE">Privado</option>
            <option value="RESTRICTED">Restrito</option>
          </select>
        </div>
        <Field
          label="Horário"
          value={form.openingHours}
          onChange={(openingHours) => setForm((c) => ({ ...c, openingHours }))}
        />
        <Field
          label="Comodidades (vírgula)"
          value={form.amenities}
          onChange={(amenities) => setForm((c) => ({ ...c, amenities }))}
        />
        <Button disabled={saving} type="submit">
          {saving ? "Salvando…" : "Criar estação"}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
