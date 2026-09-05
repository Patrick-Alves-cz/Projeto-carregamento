# Instalar um carregador físico no EV Charge

Este texto é para o técnico: *tenho um carregador OCPP 1.6J; como ligo no EV Charge?*

A tela do fabricante muda. **Não inventamos nomes de menu de marca.** Use os campos equivalentes abaixo.

## Pré-requisitos

- Carregador compatível com **OCPP 1.6 JSON (1.6J)** sobre WebSocket
- Acesso à internet (saída HTTPS/WSS, porta 443)
- Backend EV Charge publicado com WSS (não `localhost` no equipamento de campo)
- Identity cadastrada no Admin (ex.: `EVSE-CUIABA-001`)
- Credencial gerada no Admin (usuário = identity, senha = secret de uso único)
- Acesso ao painel web/local do carregador (IP, app do fabricante ou USB)

OCPP 2.0.1 **não** é suportado neste beta.

## O que o operador faz no EV Charge antes

1. Cria a estação (empresa, endereço, coordenadas).
2. Cria o charger na estação:
   - `identity` estável (vai na URL)
   - `providerId` = `ocpp16`
   - conectores com números iguais aos do hardware (1, 2, …)
3. Abre o charger no Admin → **Gerar credencial OCPP**.
4. Anota (fora do Git):
   - OCPP URL
   - Identity / username
   - Password (secret)
   - Protocolo OCPP 1.6J

## Campos que normalmente existem no carregador

A interface varia. Procure por *OCPP*, *CSMS*, *Backend*, *Central System*:

| Campo típico | O que preencher |
|---|---|
| OCPP URL / Server URL / CSMS URL | `wss://ocpp.seudominio.com/ocpp/EVSE-CUIABA-001` |
| Charge Point Identity / ChargeBox ID | `EVSE-CUIABA-001` (igual ao cadastro e ao path) |
| Username | Em geral a **mesma identity** |
| Password / Authorization key | Secret gerado no Admin (não o JWT de usuário) |
| Protocol / OCPP version | OCPP 1.6 JSON / 1.6J |
| Transport | WebSocket (não SOAP) |
| Security profile | Basic auth no handshake, se o menu oferecer |

Alguns equipamentos montam a URL sozinhos (`wss://host/ocpp/` + identity). Outros exigem a URL **completa incluindo a identity**. Se o Boot não chegar, teste as duas formas com o suporte do fabricante — sem inventar parâmetros.

## Exemplo de configuração (conceitual)

```
OCPP URL:     wss://ocpp.exemplo.com/ocpp/EVSE-CUIABA-001
Identity:     EVSE-CUIABA-001
Username:     EVSE-CUIABA-001
Password:     (secret gerado no Admin; nunca no Git)
Protocol:     OCPP 1.6J
WebSocket:    sim
Basic auth:   sim
```

Local (laboratório / simulador):

```
OCPP URL:     ws://localhost:3001/ocpp/EVSE-CUIABA-001
Identity:     EVSE-CUIABA-001
Password:     DemoCharger@12345   # apenas seed de desenvolvimento
```

Carregador de rua **não** deve apontar para localhost.

## Depois de salvar

1. O equipamento abre WSS.
2. Admin deve mostrar `ocppOnline: true` após Boot + StatusNotification.
3. Connector passa de `UNAVAILABLE`/`OFFLINE` para o status real (`AVAILABLE`, etc.).
4. Faça um RemoteStart de teste com um motorista de homologação.

Se não conectar: [troubleshooting.md](troubleshooting.md).

## Configuração específica por fabricante

Não há perfil homologado de marca neste repositório. Não use tabelas inventadas (ABB, Weg, Intelbras, etc.). Consulte o manual OCPP **do seu** equipamento e mapeie para a tabela genérica acima.

## Segurança

- Troque o secret de seed antes de produção.
- Cada charger tem o próprio secret.
- Rotacionar credencial derruba a senha antiga na hora.
- Não compartilhe o secret no WhatsApp em texto permanente; trate como senha de equipamento.
