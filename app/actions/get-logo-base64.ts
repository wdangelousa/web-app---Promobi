'use server';

import * as fs from 'fs';
import * as path from 'path';

export async function getLogoBase64() {
    try {
        // Use logo-promobi-transparent.png (RGBA with alpha channel)
        const candidates = ['logo-promobi-transparent.png', 'logo-promobi.png', 'logo.png'];
        let logoPath = '';
        for (const name of candidates) {
            const p = path.join(process.cwd(), 'public', name);
            if (fs.existsSync(p)) { logoPath = p; break; }
        }

        if (!logoPath) {
            console.warn('[getLogoBase64] No logo file found in public/');
            return null;
        }

        const logoBuffer = fs.readFileSync(logoPath);
        const base64 = logoBuffer.toString('base64');

        // Detect actual format from magic bytes (file extension may lie)
        const isJPEG = logoBuffer[0] === 0xFF && logoBuffer[1] === 0xD8;
        const isPNG = logoBuffer[0] === 0x89 && logoBuffer[1] === 0x50;
        const mime = isPNG ? 'image/png' : isJPEG ? 'image/jpeg' : 'image/png';

        console.log(`[getLogoBase64] Loaded ${logoPath} (${logoBuffer.length} bytes, ${mime})`);
        return `data:${mime};base64,${base64}`;
    } catch (error) {
        console.error('[getLogoBase64] Error:', error);
        return null;
    }
}
