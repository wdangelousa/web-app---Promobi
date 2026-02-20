
import * as deepl from 'deepl-node';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

// Initialize DeepL Translator lazily
const translator = DEEPL_API_KEY ? new deepl.Translator(DEEPL_API_KEY) : null;

// Lazy Supabase client — only instantiated at request time (avoids build error)
function getSupabaseClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
    }
    return createClient(url, key);
}

// Detect MIME type from filename extension
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
    };
    return map[ext] ?? 'application/pdf';
}

export async function translateDocument(
    fileUrl: string,
    sourceFileName: string,
    targetLang: deepl.TargetLanguageCode = 'en-US'
): Promise<{ translatedUrl: string | null, error?: string }> {

    // Guard: skip placeholder URLs
    if (!fileUrl || fileUrl === 'PENDING_UPLOAD') {
        return { translatedUrl: null, error: 'File not yet uploaded' };
    }

    if (!translator) {
        console.error('[DeepL] API Key missing — cannot translate.');
        return { translatedUrl: null, error: 'DeepL API Key missing' };
    }

    const tempDir = os.tmpdir();
    const tempInputPath = path.join(tempDir, `input-${Date.now()}-${sourceFileName}`);
    const tempOutputPath = path.join(tempDir, `translated-${Date.now()}-${sourceFileName}`);

    try {
        console.log(`[DeepL] Starting translation for: ${sourceFileName}`);

        // 1. Download source file
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);

        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(tempInputPath, buffer);

        // 2. Translate via DeepL
        await translator.translateDocument(
            tempInputPath,
            tempOutputPath,
            null,       // source lang: auto-detect
            targetLang
        );

        console.log(`[DeepL] Translation completed locally.`);

        // 3. Upload translated file to Supabase
        const translatedBuffer = await fs.readFile(tempOutputPath);
        const contentType = getMimeType(sourceFileName);
        const translatedFileName = `translations/translated-${Date.now()}-${sourceFileName}`;

        const supabase = getSupabaseClient();
        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(translatedFileName, translatedBuffer, { contentType, upsert: false });

        if (uploadError) throw new Error(`Supabase Upload Error: ${uploadError.message}`);

        // 4. Return public URL
        const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(translatedFileName);

        return { translatedUrl: urlData.publicUrl };

    } catch (error: any) {
        console.error(`[DeepL] Error translating ${sourceFileName}:`, error);
        return { translatedUrl: null, error: error.message };
    } finally {
        // Cleanup temp files — ignore errors
        await fs.unlink(tempInputPath).catch(() => { });
        await fs.unlink(tempOutputPath).catch(() => { });
    }
}
