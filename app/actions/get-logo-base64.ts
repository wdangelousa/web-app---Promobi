'use server';

import fs from 'fs';
import path from 'path';

export async function getLogoBase64() {
    try {
        const logoPath = path.join(process.cwd(), 'public', 'logo.png');
        if (!fs.existsSync(logoPath)) {
            console.warn("Logo file not found at:", logoPath);
            return null;
        }
        const logoBuffer = fs.readFileSync(logoPath);
        const base64Logo = logoBuffer.toString('base64');
        return `data:image/png;base64,${base64Logo}`;
    } catch (error) {
        console.error("Error reading logo for PDF:", error);
        return null;
    }
}
