import prisma from '../lib/prisma'

async function main() {
    console.log('Buscando orders com metadata para backfill...')

    const orders = await prisma.order.findMany({
        where: {
            metadata: { not: null },
            documents: { some: { billablePages: null } }
        },
        include: { documents: true },
    })

    console.log(`Encontrados ${orders.length} orders para processar.`)

    let updatedCount = 0
    let skippedCount = 0

    for (const order of orders) {
        let meta: any = {}
        try {
            meta = typeof order.metadata === 'string'
                ? JSON.parse(order.metadata)
                : order.metadata ?? {}
        } catch {
            console.warn(`Order #${order.id}: metadata JSON invalido, pulando.`)
            continue
        }

        const metaDocs: any[] = meta.documents ?? []

        for (const doc of order.documents) {
            if (doc.billablePages != null) {
                skippedCount++
                continue
            }

            const matchingMeta = metaDocs.find(
                (md: any) => md.fileName === doc.exactNameOnDoc
            )

            if (matchingMeta?.analysis?.pages) {
                const pages: any[] = matchingMeta.analysis.pages
                const totalPages = pages.length
                const billablePages = pages.filter(
                    (p: any) => p.included !== false
                ).length
                const excludedFromScope = billablePages === 0

                await prisma.document.update({
                    where: { id: doc.id },
                    data: { billablePages, totalPages, excludedFromScope },
                })

                const label = excludedFromScope ? '(excluded)' : `${billablePages}/${totalPages}`
                console.log(`  Order #${order.id} Doc #${doc.id} "${doc.exactNameOnDoc}" -> ${label}`)
                updatedCount++
            } else {
                await prisma.document.update({
                    where: { id: doc.id },
                    data: { billablePages: 1, totalPages: null, excludedFromScope: false },
                })
                console.log(`  Order #${order.id} Doc #${doc.id} "${doc.exactNameOnDoc}" -> sem analysis, default 1 billable`)
                updatedCount++
            }
        }
    }

    console.log(`\nDone. Atualizados: ${updatedCount} | Pulados (ja preenchidos): ${skippedCount}`)
}

main()
    .catch((e) => { console.error('Backfill falhou:', e); process.exit(1) })
    .finally(() => prisma.$disconnect())
