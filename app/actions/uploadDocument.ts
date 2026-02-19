'use server';

import { createClient } from '@supabase/supabase-js';
import prisma from '@/lib/prisma';

export async function uploadDocument(formData: FormData) {
    const file = formData.get('file') as File;
    const orderId = formData.get('orderId') as string;
    const docType = formData.get('docType') as string;

    if (!file || !orderId || !docType) {
        throw new Error('Missing required fields');
    }

    // Verificar variáveis de ambiente
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase environment variables');
    }

    // Inicializar cliente Supabase com Service Role Key para bypass de RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Gerar nome único para o arquivo
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop();
    const fileName = `${orderId}/${docType}-${timestamp}.${fileExtension}`;

    // Converter File para Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload para o Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, buffer, {
            contentType: file.type,
            upsert: false,
        });

    if (uploadError) {
        console.error('Supabase Upload Error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Obter URL Pública
    const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // Salvar registro no Prisma
    const document = await prisma.document.create({
        data: {
            orderId: parseInt(orderId), // Converter string para Int
            docType: docType,
            originalFileUrl: publicUrl,
            exactNameOnDoc: file.name,
        },
    });

    return {
        publicUrl,
        documentId: document.id,
    };
}
