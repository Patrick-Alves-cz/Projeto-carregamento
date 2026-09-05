# Conexão do carregador físico

```mermaid
flowchart TB
  CP[Charge Point OCPP 1.6J] -->|Internet| WSS[wss://ocpp.seudominio.com/ocpp/IDENTITY]
  WSS --> Caddy[Caddy TLS + upgrade WebSocket]
  Caddy --> API[NestJS :3001 /ocpp/:identity]
  API --> Auth[Basic identity:secret vs bcrypt]
  Auth --> Boot[BootNotification]
  Boot --> PG[(PostgreSQL Charger / Connector)]
```

1. DNS `ocpp.seudominio.com` → VPS.
2. Caddy termina TLS e faz upgrade HTTP → WebSocket.
3. `OcppWsServer` exige path `/ocpp/{identity}`, subprotocolo `ocpp1.6` e Basic auth.
4. Identity da URL = identity cadastrada = usuário Basic.
5. Secret comparado com `ChargerCredential.credentialHash`.
6. Uma conexão viva por charger; reconectar substitui a anterior.
7. Watchdog: sem mensagem além de `OCPP_OFFLINE_THRESHOLD_MS` (180s) → OFFLINE.

Local:

```
ws://localhost:3001/ocpp/EVSE-CUIABA-001
```

Internet:

```
wss://ocpp.seudominio.com/ocpp/EVSE-CUIABA-001
```

Draw.io: [charger-connection.drawio](charger-connection.drawio)
