
import * as deepl from 'deepl-node';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Initialize DeepL Translator
// Note: We use a null check here but the function will throw if key is missing
const translator = DEEPL_API_KEY ? new deepl.Translator(DEEPL_API_KEY) : null;

// Initialize Supabase Admin
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function translateDocument(
    fileUrl: string,
    sourceFileName: string,
    targetLang: deepl.TargetLanguageCode = 'en-US' // Default to English (US)
): Promise<{ translatedUrl: string | null, error?: string }> {

    if (!translator) {
        console.error("DeepL API Key missing.");
        return { translatedUrl: null, error: "DeepL API Key missing" };
    }

    const tempDir = os.tmpdir();
    const tempInputPath = path.join(tempDir, `input-${Date.now()}-${sourceFileName}`);
    const tempOutputPath = path.join(tempDir, `translated-${Date.now()}-${sourceFileName}`);

    try {
        console.log(`[DeepL] Starting translation for: ${sourceFileName}`);

        // 1. Download file from Supabase (or external URL)
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);

        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(tempInputPath, buffer);

        // 2. Send to DeepL
        // TODO: Handle 'formality' if needed for PT/EN
        await translator.translateDocument(
            tempInputPath,
            tempOutputPath,
            null, // Source lang (auto-detect)
            targetLang
        );

        console.log(`[DeepL] Translation completed locally.`);

        // 3. Upload translated file to Supabase
        const translatedBuffer = await fs.readFile(tempOutputPath);
        const translatedFileName = `translations/translated-${Date.now()}-${sourceFileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('documents')
            .upload(translatedFileName, translatedBuffer, {
                contentType: 'application/pdf', // Assuming PDF, could detect
                upsert: false
            });

        if (uploadError) throw new Error(`Supabase Upload Error: ${uploadError.message}`);

        // 4. Get Public URL
        const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(translatedFileName);

        return { translatedUrl: urlData.publicUrl };

    } catch (error: any) {
        console.error(`[DeepL] Error translating ${sourceFileName}:`, error);
        return { translatedUrl: null, error: error.message };
    } finally {
        // Cleanup temp files
        try {
            await fs.unlink(tempInputPath).catch(() => { });
            await fs.unlink(tempOutputPath).catch(() => { });
        } catch (e) {
            console.error("Error cleaning up temp files:", e);
        }
    }
}
