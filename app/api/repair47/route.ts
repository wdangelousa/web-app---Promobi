import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    let logs: string[] = [];
    const log = (msg: string) => { console.log(msg); logs.push(msg); };

    try {
        const targetOrderId = 47;
        log(`Buscando documentos do Pedido ID: ${targetOrderId}...`);

        let order = await prisma.order.findUnique({
            where: { id: targetOrderId },
            include: { documents: true }
        });

        if (!order) {
            log(`Pedido ${targetOrderId} não encontrado. Tentando 1047...`);
            order = await prisma.order.findUnique({
                where: { id: 1047 },
                include: { documents: true }
            });
            if (!order) return NextResponse.json({ error: "Nenhum pedido encontrado", logs });
        }

        for (const doc of order.documents) {
            if (doc.originalFileUrl && doc.originalFileUrl !== "PENDING_UPLOAD") {
                const urlParts = doc.originalFileUrl.split('/documents/');
                if (urlParts.length > 1) {
                    const filePath = urlParts[1].split('?')[0];
                    const { data } = supabase.storage.from('documents').getPublicUrl(filePath);

                    if (data.publicUrl && data.publicUrl !== doc.originalFileUrl) {
                        log(`Corrigindo URL no Doc ID ${doc.id}... de \n${doc.originalFileUrl}\n para \n${data.publicUrl}`);
                        await prisma.document.update({
                            where: { id: doc.id },
                            data: { originalFileUrl: data.publicUrl }
                        });
                        log(`✔️ Vínculo refeito.`);
                    } else {
                        log(`Doc ${doc.id} OK: ${doc.originalFileUrl}`);
                    }
                }
            }
        }

        return NextResponse.json({ success: true, logs });
    } catch (e: any) {
        return NextResponse.json({ error: e.message, logs });
    }
}
