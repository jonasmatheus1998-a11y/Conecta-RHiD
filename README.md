# Conecta RHiD

Sistema simples de ponto eletrônico da Conecta Educação e Tecnologia para uma equipe inicial de 5 funcionários.

## Como abrir

Inicie o servidor local:

```bash
node server.js
```

Depois acesse `http://localhost:8080`.

Em produção, use um endereço com HTTPS, por exemplo:

```txt
https://ponto.conectaiba.com.br
```

## Acessos iniciais

- Administrador: `admin@conecta.com` / `admin123`
- Funcionários: `CET-001` até `CET-005` / `123456`

## O que já faz

- Cadastro e edição de funcionários.
- Registro de entrada, intervalo, volta do intervalo e saída.
- Exige foto do funcionário pela câmera no momento da batida.
- Exige coordenadas de GPS no momento da batida.
- Validação da sequência correta das batidas.
- Total de horas do dia.
- Relatório mensal por funcionário.
- Exportação CSV dos registros.
- Backup JSON dos dados.
- Backend centralizado em Node.js.
- Banco de dados SQLite em `data/conecta-rhid.sqlite`.
- Sessões de login no servidor.

## Permissões necessárias

O navegador precisa autorizar câmera e localização. Se uma das permissões for negada, o ponto não será registrado.

Para funcionar melhor em celulares e outros computadores, o ideal é publicar o sistema em um endereço seguro `https://` ou rodar em `localhost` durante testes.

## Onde os dados ficam

Os dados ficam salvos no banco SQLite do servidor, incluindo fotos em formato compactado e coordenadas GPS. Isso permite usar vários dispositivos com dados sincronizados.

## Próximos passos recomendados

- Colocar os nomes reais dos 5 funcionários.
- Definir se o sistema precisa de login por senha.
- Publicar o servidor em hospedagem com HTTPS.
- Apontar `ponto.conectaiba.com.br` para a hospedagem.
- Trocar as senhas iniciais antes de usar em produção.

## DNS sugerido

No Registro.br, crie um subdomínio para o sistema de ponto:

```txt
Nome: ponto
Tipo: CNAME
Destino: endereço informado pela hospedagem
```

Se a hospedagem fornecer IP fixo, use registro `A`:

```txt
Nome: ponto
Tipo: A
Destino: IP do servidor
```
