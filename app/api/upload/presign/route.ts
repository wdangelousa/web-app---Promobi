/**
 * app/api/upload/presign/route.ts
 * Returns a Supabase signed upload URL so the client can upload large files
 * directly to Supabase Storage, bypassing Next.js body-size limits.
 *
 * Flow:
 *   1. Client POST { filename } → gets { signedUrl, publicUrl, token, storagePath }
 *   2. Client PUT file → signedUrl (directly to Supabase, no Next.js in the loop)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc: 'application/msword',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ppt: 'application/vnd.ms-powerpoint',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        txt: 'text/plain',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
    };
    return map[ext] ?? 'application/octet-stream';
}

export async function POST(req: NextRequest) {
    try {
        const { filename } = await req.json();

        if (!filename) {
            return NextResponse.json({ error: 'filename required' }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Storage not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `orders/pending/${Date.now()}-${safeName}`;
        const contentType = getMimeType(filename);

        const { data, error } = await supabase.storage
            .from('documents')
            .createSignedUploadUrl(storagePath);

        if (error || !data) {
            console.error('[presign] Supabase error:', error);
            return NextResponse.json({ error: error?.message ?? 'Failed to create signed URL' }, { status: 500 });
        }

        const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(storagePath);

        return NextResponse.json({
            signedUrl: data.signedUrl,
            token: data.token,
            storagePath,
            publicUrl: urlData.publicUrl,
            contentType,
            exactNameOnDoc: filename,
        });

    } catch (err: any) {
        console.error('[presign] Unexpected error:', err);
        return NextResponse.json({ error: err.message || 'Presign failed' }, { status: 500 });
    }
}
