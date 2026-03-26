import 'dotenv/config'
import pg from 'pg'

const ACTIVE_STATUSES = [
  'TRANSLATING',
  'READY_FOR_REVIEW',
  'PAID',
  'MANUAL_TRANSLATION_NEEDED',
  'NOTARIZING',
]

function normalizeUrgency(raw) {
  return String(raw || 'standard').trim().toLowerCase()
}

function resolveBusinessDays(urgency) {
  const normalized = normalizeUrgency(urgency)

  if (normalized === 'flash' || normalized === 'rush' || normalized === 'rushes') {
    return 1
  }
  if (normalized === 'urgent') {
    return 2
  }

  return 10
}

function addBusinessDays(startDate, businessDays) {
  const result = new Date(startDate)
  let remaining = Math.max(0, Math.floor(businessDays))

  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day === 0 || day === 6) continue
    remaining -= 1
  }

  return result
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não está definido.')
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    console.log('Buscando pedidos ativos sem dueDate...')

    const { rows } = await client.query(
      `
        SELECT id, status, urgency, "paidAt", "createdAt", "dueDate"
        FROM "Order"
        WHERE status = ANY($1::text[])
          AND "dueDate" IS NULL
        ORDER BY id ASC
      `,
      [ACTIVE_STATUSES],
    )

    if (rows.length === 0) {
      console.log('Nenhum pedido para backfill.')
      return
    }

    for (const row of rows) {
      const paidAt = row.paidAt ? new Date(row.paidAt) : new Date(row.createdAt)
      const dueDate = addBusinessDays(paidAt, resolveBusinessDays(row.urgency))

      await client.query(
        `
          UPDATE "Order"
          SET "dueDate" = $1,
              "paidAt" = COALESCE("paidAt", "createdAt")
          WHERE id = $2
        `,
        [dueDate.toISOString(), row.id],
      )

      console.log(
        `[backfill-deadlines] order=${row.id} status=${row.status} urgency=${row.urgency ?? 'standard'} ` +
        `paidAt=${paidAt.toISOString()} dueDate=${dueDate.toISOString()}`,
      )
    }

    console.log(`Backfill concluído. ${rows.length} pedido(s) atualizado(s).`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Backfill de deadlines falhou:', error)
  process.exit(1)
})
