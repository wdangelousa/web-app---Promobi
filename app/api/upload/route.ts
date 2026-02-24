/**
 * app/api/upload/route.ts
 * Accepts a multipart/form-data POST with a single `file` field.
 * Uploads it to Supabase Storage and returns the public URL.
 * Called by the frontend BEFORE createOrder so Document records have real URLs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ── MIME type helper ──────────────────────────────────────────────────────────
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
        const formData = await req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Storage not configured' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Build a collision-free path: orders/pending/{timestamp}-{sanitized-name}
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `orders/pending/${Date.now()}-${safeName}`;
        const contentType = file.type || getMimeType(file.name);

        const buffer = Buffer.from(await file.arrayBuffer());

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, buffer, { contentType, upsert: false });

        if (uploadError) {
            console.error('[upload] Supabase error:', uploadError);
            return NextResponse.json({ error: uploadError.message }, { status: 500 });
        }

        const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(storagePath);

        return NextResponse.json({
            url: urlData.publicUrl,
            storagePath,
            exactNameOnDoc: file.name,
            contentType,
        });

    } catch (err: any) {
        console.error('[upload] Unexpected error:', err);
        return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
    }
}
