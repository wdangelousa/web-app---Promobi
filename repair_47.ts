import { PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'

const prisma = new PrismaClient()
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const targetOrderId = 47;
    console.log(`Buscando documentos do Pedido ID: ${targetOrderId}...`);

    const order = await prisma.order.findUnique({
        where: { id: targetOrderId },
        include: { documents: true }
    });

    if (!order) {
        console.error(`Pedido ${targetOrderId} não encontrado. Tentando 1047...`);
        const orderAlt = await prisma.order.findUnique({
            where: { id: 1047 },
            include: { documents: true }
        });
        if (!orderAlt) return;
        return processOrder(orderAlt);
    } else {
        return processOrder(order);
    }

    async function processOrder(orderObj: any) {
        for (const doc of orderObj.documents) {
            if (doc.originalFileUrl && doc.originalFileUrl !== "PENDING_UPLOAD") {
                const urlParts = doc.originalFileUrl.split('/documents/');
                if (urlParts.length > 1) {
                    const filePath = urlParts[1].split('?')[0];
                    const { data } = supabase.storage.from('documents').getPublicUrl(filePath);

                    if (data.publicUrl && data.publicUrl !== doc.originalFileUrl) {
                        console.log(`Corrigindo URL no Doc ID ${doc.id}... de \n${doc.originalFileUrl}\n para \n${data.publicUrl}\n`);
                        await prisma.document.update({
                            where: { id: doc.id },
                            data: { originalFileUrl: data.publicUrl }
                        });
                        console.log(`✔️ Vínculo refeito.`);
                    } else {
                        console.log(`Doc ${doc.id} OK: ${doc.originalFileUrl}`);
                    }
                }
            }
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
