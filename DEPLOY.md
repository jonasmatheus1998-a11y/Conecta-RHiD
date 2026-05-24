# Deploy do Conecta RHiD

## Domínio recomendado

Use o subdomínio:

```txt
ponto.conectaiba.com.br
```

## Requisitos da hospedagem

- Node.js 24 ou superior.
- HTTPS ativo.
- Disco persistente para manter o arquivo SQLite.
- Variáveis de ambiente configuráveis.

## Opção recomendada: VPS com Docker

Em uma VPS Linux com Docker e Docker Compose:

```bash
docker compose up -d --build
```

Antes de iniciar, edite `docker-compose.yml` e troque:

```txt
ADMIN_PASSWORD=troque-esta-senha
```

O banco fica em um volume Docker chamado `conecta-rhid-data`.

## Opção simples para teste real: Render

O projeto inclui `render.yaml`, então você pode usar Blueprint no Render.

Passos:

1. Suba este projeto para um repositório GitHub.
2. No Render, clique em `New +`.
3. Escolha `Blueprint`.
4. Conecte o repositório.
5. Confirme o serviço `conecta-rhid`.
6. Preencha a variável secreta `ADMIN_PASSWORD`.
7. Faça o deploy.

O Blueprint cria:

- Web Service Docker.
- Health check em `/api/health`.
- Disco persistente de 1 GB em `/data`.
- `DATABASE_PATH=/data/conecta-rhid.sqlite`.

Depois do deploy, teste o endereço temporário do Render antes de configurar o domínio.

## Variáveis de ambiente

```txt
PORT=8080
DATABASE_PATH=/caminho/persistente/conecta-rhid.sqlite
ADMIN_EMAIL=admin@conecta.com
ADMIN_PASSWORD=senha-forte-aqui
```

Troque `ADMIN_PASSWORD` antes de publicar.

## Comando de start

```bash
npm start
```

Use esse comando se a hospedagem rodar Node.js diretamente, sem Docker.

## Health check

Configure a hospedagem para monitorar:

```txt
/api/health
```

## DNS no Registro.br

Se a hospedagem fornecer um hostname:

```txt
Tipo: CNAME
Nome: ponto
Destino: hostname-da-hospedagem
```

Se a hospedagem fornecer IP fixo:

```txt
Tipo: A
Nome: ponto
Destino: IP_DO_SERVIDOR
```

## HTTPS

Em VPS, use Nginx ou Caddy como proxy reverso para:

```txt
http://127.0.0.1:8080
```

O domínio público deve ficar assim:

```txt
https://ponto.conectaiba.com.br
```

Caddy costuma ser a opção mais simples porque gera HTTPS automaticamente.

Exemplo de Caddyfile:

```txt
ponto.conectaiba.com.br {
  reverse_proxy 127.0.0.1:8080
}
```

## Checklist antes de produção

- Trocar `ADMIN_PASSWORD`.
- Cadastrar os funcionários reais.
- Trocar as senhas iniciais dos funcionários.
- Confirmar que `/api/health` responde.
- Confirmar que câmera e GPS funcionam no celular via HTTPS.
- Configurar backup periódico do banco SQLite.

## Observação importante

Câmera e GPS precisam de HTTPS em produção. `localhost` funciona apenas para testes locais.
