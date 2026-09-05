# Manual do Admin

Painel: `http://localhost:3000` (local) ou `https://admin.seudominio.com`.

Login via BFF: cookies `evcharge_access` / `evcharge_refresh` httpOnly. Contas DRIVER são recusadas no painel.

## Login

Use um papel administrativo. Demo:

| Papel | Email |
|---|---|
| SUPER_ADMIN | `superadmin@evcharge.demo` |
| ADMIN | `admin.sp@evcharge.demo` |
| OPERATOR | `operator.sp@evcharge.demo` (também RJ/MT) |

Senha de desenvolvimento: `Demo@12345`.

## Telas

| Área | O que faz |
|---|---|
| Visão geral | KPIs e atalhos |
| Mapa da rede | Estações e status |
| Operação | Sessões ao vivo, health |
| Incidentes | Abrir/tratar falhas |
| Manutenção | Janelas de bloqueio |
| Estações | CRUD, empresa, geo |
| Carregadores | Lista, detalhe OCPP, credencial, comandos |
| Tarifas | Preços da empresa |
| Pagamentos | Intenções, status, refund |
| Financeiro | Reconciliação (`PaymentReconciliationCase`) |
| Métodos | Métodos tokenizados (visão operacional) |
| Reservas / Fila | Agenda e waitlist |
| Equipe | Convites e membros |

## Chargers e OCPP

No detalhe do charger OCPP:

- ONLINE/OFFLINE (`ocppOnline`)
- Health e confiabilidade
- Conectores e sessão/`OcppTransaction` atual
- **Gerar credencial OCPP** (secret uma vez)
- Remote Start/Stop, ChangeAvailability, Reset (com confirmação)

Ações demo (offline/fault/restore) **não** valem para `providerId=ocpp16`.

## Papéis

| Papel | Pode |
|---|---|
| **SUPER_ADMIN** | Todas as empresas; criar empresa; ver toda a rede |
| **ADMIN** | Administrar a própria empresa: cadastros, equipe, tarifas, financeiro, OCPP, refund |
| **OPERATOR** | Operar a empresa: estações/chargers, comandos OCPP, sessões, incidentes, manutenção, reservas. Sem provisionar outros admins |
| **DRIVER** | Sem acesso a este painel. Só o app Driver |

Isolamento: OPERATOR/ADMIN não veem chargers de outra company. SUPER_ADMIN ignora o recorte.

## Financeiro

Refund exige motivo e gera auditoria. Casos de reconciliação não apagam sessões. Asaas em sandbox até chave de produção.

## Segurança operacional

- Não cole JWT nem secret OCPP em tickets públicos
- Rotacionar credencial derruba o carregador até reconfigurar a senha
- Reset Hard é destrutivo no equipamento — confirme no hardware
