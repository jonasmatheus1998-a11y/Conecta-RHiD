# Deploy com Supabase + Vercel

Esta é a opção gratuita recomendada para testar o Conecta RHiD online, com vários aparelhos sincronizados.

## 1. Criar o banco no Supabase

1. Abra o projeto no Supabase.
2. Vá em `SQL Editor`.
3. Crie uma nova query.
4. Cole todo o conteúdo de `supabase/schema.sql`.
5. Execute.

Isso cria:

- Tabela de administradores.
- Tabela de funcionários.
- Tabela de registros de ponto.
- Tabela de sessões.
- Funções RPC usadas pelo app.
- Funcionários iniciais com e-mails `funcionario1@conectaiba.com.br` até `funcionario5@conectaiba.com.br`.
- Admin inicial `admin@conecta.com` / `admin123`.

Troque a senha do administrador depois do primeiro acesso.

Se o banco já existia antes da versão com login por e-mail, rode também o arquivo:

```txt
supabase/add-employee-email-and-excel-report.sql
```

Depois disso, edite cada funcionário no painel administrativo e coloque o e-mail real de acesso.

## 2. Conferir configuração do app

O arquivo `index.html` já contém:

```txt
SUPABASE URL: https://tscbihdgkftbzzhkypwq.supabase.co
PUBLISHABLE KEY: configurada no app
```

## 3. Subir no GitHub

Envie os arquivos atualizados para o repositório:

```txt
https://github.com/jonasmatheus1998-a11y/Conecta-RHiD
```

Se o Git local não autenticar, use `Add file > Upload files` no site do GitHub.

## 4. Publicar na Vercel

1. Crie conta em `https://vercel.com`.
2. Clique em `Add New > Project`.
3. Importe o repositório `Conecta-RHiD`.
4. Framework: `Other`.
5. Build command: deixe vazio.
6. Output directory: deixe vazio.
7. Deploy.

Depois do deploy, teste o endereço temporário da Vercel.

## 5. Configurar domínio

Na Vercel, adicione o domínio:

```txt
ponto.conectaiba.com.br
```

A Vercel vai informar qual DNS configurar no Registro.br.

Normalmente será um `CNAME`:

```txt
Tipo: CNAME
Nome: ponto
Destino: cname.vercel-dns.com
```

Use exatamente o destino mostrado pela Vercel.

## 6. Testar

No endereço final:

```txt
https://ponto.conectaiba.com.br
```

Teste:

- Login admin.
- Cadastro de funcionário.
- Login de funcionário.
- Registro com câmera e GPS pelo celular.
- Relatório mensal.
- Exportação Excel.

## Observações

- Câmera e GPS exigem HTTPS.
- As fotos estão sendo salvas como texto base64 no banco. Para uso maior, evoluir para Supabase Storage.
- O plano gratuito do Supabase pode pausar projeto inativo após um período sem uso.
