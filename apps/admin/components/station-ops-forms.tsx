"use client";

import { useState } from "react";
import { CONNECTOR_TYPES, CONNECTOR_TYPE_LABELS } from "@evcharge/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCharger,
  createConnector,
  updateCharger,
  updateConnector,
  updateStation,
  type Station,
} from "@/lib/api-client";

export function StationOpsForms({ station, onSaved }: { station: Station; onSaved: () => void }) {
  const [error, setError] = useState("");
  const [stationForm, setStationForm] = useState({
    name: station.name,
    address: station.address,
    city: station.city ?? "",
    postalCode: station.postalCode ?? "",
    latitude: String(station.latitude),
    longitude: String(station.longitude),
    status: station.status,
    accessType: station.accessType ?? "PUBLIC",
    amenities: station.amenities.join(","),
    openingHours: station.openingHoursLabel ?? "",
  });
  const [chargerForm, setChargerForm] = useState({
    serialNumber: "",
    model: "",
    maxPowerKw: "50",
  });
  const [connectorForm, setConnectorForm] = useState({
    chargerId: station.chargers[0]?.id ?? "",
    number: "1",
    type: "CCS2",
    maxPowerKw: "50",
  });

  async function saveStation(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await updateStation(station.id, {
        name: stationForm.name,
        address: stationForm.address,
        city: stationForm.city || undefined,
        postalCode: stationForm.postalCode || undefined,
        latitude: Number(stationForm.latitude),
        longitude: Number(stationForm.longitude),
        status: stationForm.status as "ACTIVE" | "MAINTENANCE" | "INACTIVE",
        accessType: stationForm.accessType as "PUBLIC" | "PRIVATE" | "RESTRICTED",
        amenities: stationForm.amenities.split(",").map((item) => item.trim()).filter(Boolean),
        openingHours: { label: stationForm.openingHours },
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao salvar estação");
    }
  }

  async function saveCharger(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await createCharger({
        stationId: station.id,
        serialNumber: chargerForm.serialNumber,
        model: chargerForm.model || undefined,
        maxPowerKw: Number(chargerForm.maxPowerKw),
      });
      setChargerForm({ serialNumber: "", model: "", maxPowerKw: "50" });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao criar carregador");
    }
  }

  async function saveConnector(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await createConnector({
        chargerId: connectorForm.chargerId,
        number: Number(connectorForm.number),
        type: connectorForm.type,
        maxPowerKw: Number(connectorForm.maxPowerKw),
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao criar conector");
    }
  }

  return (
    <div className="space-y-8 border-t pt-8">
      <h2 className="text-lg font-semibold">Cadastro operacional</h2>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <form className="grid gap-3 sm:grid-cols-2" onSubmit={saveStation}>
        <Field label="Nome" value={stationForm.name} onChange={(name) => setStationForm((c) => ({ ...c, name }))} />
        <Field label="Endereço" value={stationForm.address} onChange={(address) => setStationForm((c) => ({ ...c, address }))} />
        <Field label="Cidade" value={stationForm.city} onChange={(city) => setStationForm((c) => ({ ...c, city }))} />
        <Field label="CEP" value={stationForm.postalCode} onChange={(postalCode) => setStationForm((c) => ({ ...c, postalCode }))} />
        <div className="space-y-2">
          <Label>Status</Label>
          <select
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={stationForm.status}
            onChange={(event) => setStationForm((c) => ({ ...c, status: event.target.value }))}
          >
            <option value="ACTIVE">Operando</option>
            <option value="MAINTENANCE">Manutenção</option>
            <option value="INACTIVE">Inativa</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Acesso</Label>
          <select
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={stationForm.accessType}
            onChange={(event) => setStationForm((c) => ({ ...c, accessType: event.target.value }))}
          >
            <option value="PUBLIC">Público</option>
            <option value="PRIVATE">Privado</option>
            <option value="RESTRICTED">Restrito</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit">Salvar estação</Button>
        </div>
      </form>

      <form className="grid gap-3 sm:grid-cols-3" onSubmit={saveCharger}>
        <Field
          label="Novo carregador (serial)"
          value={chargerForm.serialNumber}
          onChange={(serialNumber) => setChargerForm((c) => ({ ...c, serialNumber }))}
        />
        <Field label="Modelo" value={chargerForm.model} onChange={(model) => setChargerForm((c) => ({ ...c, model }))} />
        <Field
          label="Potência kW"
          value={chargerForm.maxPowerKw}
          onChange={(maxPowerKw) => setChargerForm((c) => ({ ...c, maxPowerKw }))}
        />
        <div className="sm:col-span-3">
          <Button type="submit" variant="outline">
            Adicionar carregador
          </Button>
        </div>
      </form>

      {station.chargers.map((charger) => (
        <form
          key={charger.id}
          className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            try {
              await updateCharger(charger.id, {
                model: String(formData.get("model") || charger.model || ""),
                maxPowerKw: Number(formData.get("maxPowerKw")),
              });
              onSaved();
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : "Falha ao editar carregador");
            }
          }}
        >
          <p className="w-full font-mono text-sm">{charger.serialNumber}</p>
          <Field name="model" label="Modelo" defaultValue={charger.model ?? ""} />
          <Field name="maxPowerKw" label="kW" defaultValue={String(charger.maxPowerKw)} />
          <Button type="submit" size="sm" variant="outline">
            Salvar
          </Button>
        </form>
      ))}

      <form className="grid gap-3 sm:grid-cols-4" onSubmit={saveConnector}>
        <div className="space-y-2">
          <Label>Carregador</Label>
          <select
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={connectorForm.chargerId}
            onChange={(event) => setConnectorForm((c) => ({ ...c, chargerId: event.target.value }))}
          >
            {station.chargers.map((charger) => (
              <option key={charger.id} value={charger.id}>
                {charger.serialNumber}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Número"
          value={connectorForm.number}
          onChange={(number) => setConnectorForm((c) => ({ ...c, number }))}
        />
        <div className="space-y-2">
          <Label>Tipo</Label>
          <select
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={connectorForm.type}
            onChange={(event) => setConnectorForm((c) => ({ ...c, type: event.target.value }))}
          >
            {CONNECTOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {CONNECTOR_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="kW"
          value={connectorForm.maxPowerKw}
          onChange={(maxPowerKw) => setConnectorForm((c) => ({ ...c, maxPowerKw }))}
        />
        <div className="sm:col-span-4">
          <Button type="submit" variant="outline">
            Adicionar conector
          </Button>
        </div>
      </form>

      {station.chargers.flatMap((charger) =>
        charger.connectors.map((connector) => (
          <form
            key={connector.id}
            className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              try {
                await updateConnector(connector.id, {
                  type: String(formData.get("type")),
                  maxPowerKw: Number(formData.get("maxPowerKw")),
                });
                onSaved();
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "Falha ao editar conector");
              }
            }}
          >
            <p className="w-full text-sm">
              {charger.serialNumber} · conector {connector.number}
            </p>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select name="type" defaultValue={connector.type} className="h-9 rounded-md border bg-transparent px-3 text-sm">
                {CONNECTOR_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CONNECTOR_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <Field name="maxPowerKw" label="kW" defaultValue={String(connector.maxPowerKw)} />
            <Button type="submit" size="sm" variant="outline">
              Salvar
            </Button>
          </form>
        )),
      )}
    </div>
  );
}

function Field({
  label,
  value,
  defaultValue,
  name,
  onChange,
}: {
  label: string;
  value?: string;
  defaultValue?: string;
  name?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {onChange ? (
        <Input value={value} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input name={name} defaultValue={defaultValue} />
      )}
    </div>
  );
}
