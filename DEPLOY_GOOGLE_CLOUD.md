# Deploy no Google Cloud Free Tier

Este guia publica o Conecta RHiD em uma VM gratuita do Google Cloud, usando Docker e Caddy para HTTPS.

## 1. Criar a VM

No Google Cloud Console:

1. Acesse `Compute Engine`.
2. Crie uma VM.
3. Use uma região elegível ao Free Tier:
   - `us-west1`
   - `us-central1`
   - `us-east1`
4. Tipo da máquina: `e2-micro`.
5. Sistema: Ubuntu LTS.
6. Disco: Standard persistent disk, até 30 GB.
7. Libere tráfego HTTP e HTTPS.

## 2. Apontar o domínio

Pegue o IP externo da VM e, no Registro.br, configure:

```txt
Tipo: A
Nome: ponto
Destino: IP_DA_VM
```

Aguarde a propagação do DNS.

## 3. Instalar Docker na VM

Conecte por SSH na VM e rode:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

## 4. Baixar o projeto

```bash
git clone https://github.com/jonasmatheus1998-a11y/Conecta-RHiD.git
cd Conecta-RHiD
```

## 5. Configurar senha de produção

Edite `docker-compose.yml` e troque:

```txt
ADMIN_PASSWORD: troque-esta-senha
```

Use uma senha forte.

## 6. Subir o sistema

```bash
docker compose up -d --build
```

Teste localmente na VM:

```bash
curl http://127.0.0.1:8080/api/health
```

## 7. Instalar Caddy para HTTPS

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

## 8. Configurar Caddy

Crie o arquivo:

```bash
sudo nano /etc/caddy/Caddyfile
```

Conteúdo:

```txt
ponto.conectaiba.com.br {
  reverse_proxy 127.0.0.1:8080
}
```

Reinicie:

```bash
sudo systemctl reload caddy
```

## 9. Testar

Acesse:

```txt
https://ponto.conectaiba.com.br
```

Depois teste:

- Login admin.
- Cadastro/edição de funcionário.
- Login de funcionário pelo celular.
- Registro com câmera e GPS.

## Observações

- Câmera e GPS exigem HTTPS.
- O banco fica em volume Docker persistente.
- Faça backup periódico do banco.
- Para teste gratuito, mantenha apenas recursos elegíveis ao Free Tier.
