# Franklin

MVP interno de propostas e operacao de pedidos em Next.js + Prisma.

## Stack

- Next.js 16
- React 19
- Prisma 6
- PostgreSQL
- Supabase Auth + Storage
- Stripe
- Resend
- Anthropic

## Requisitos

- Node.js 20+
- npm 10+
- banco PostgreSQL acessivel

Importante:

- O projeto usa `provider = "postgresql"` em [`prisma/schema.prisma`](./prisma/schema.prisma).
- Nao ha fallback funcional para SQLite/local file hoje.
- O comentario `DATABASE_URL="file:./dev.db"` no `.env` antigo nao representa um setup suportado pelo codigo atual.

## Variaveis de ambiente

Copie `.env.example` para `.env` e preencha os valores reais.

### Obrigatorias para o projeto subir

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Obrigatorias para o fluxo critico de hoje

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

### Obrigatorias se quiser traducao automatica

- `ANTHROPIC_API_KEY`

### Obrigatorias se quiser preview/kit/entrega estruturada em PDF

- `GOTENBERG_URL` ou um Gotenberg acessivel no fallback local

### Recomendadas

- `NEXT_PUBLIC_APP_URL`
- `INTERNAL_APP_URL`
- `RESEND_API_KEY`
- `ADMIN_EMAIL`
- `EMAIL_FROM`
- `USE_STRUCTURED_TRANSLATION`
- `ENABLE_STRUCTURED_PREVIEW`
- `ENABLE_STRUCTURED_PREVIEW_KIT`

## Setup minimo

1. Instale dependencias:

```bash
npm install
```

2. Crie o `.env`:

```bash
cp .env.example .env
```

3. Ajuste as variaveis obrigatorias no `.env`.

4. Gere o client Prisma:

```bash
npx prisma generate
```

5. Aplique migrations:

```bash
npx prisma migrate deploy
```

6. Suba o app:

```bash
npm run dev
```

7. Validacoes basicas:

```bash
npx prisma migrate status
npm run build
```

## Fluxo minimo recomendado para hoje

1. Subir o app com PostgreSQL configurado.
2. Confirmar login do painel via Supabase.
3. Testar upload de documento.
4. Criar um pedido.
5. Testar checkout Stripe.
6. Confirmar que o webhook de pagamento aponta para `/api/webhooks/payment-confirmation`.
7. Abrir o pedido no painel e validar o workbench.

## Observacoes operacionais

- O endpoint antigo `/api/webhooks/stripe` esta deprecated.
- O fluxo legado de envio manual esta bloqueado; o caminho esperado e o fluxo estruturado do workbench.
- Nao existe seed Prisma formal hoje. O sistema depende do banco existente e de defaults/fallbacks do codigo.
