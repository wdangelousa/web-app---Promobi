/**
 * lib/emails/base.ts
 * Shared HTML building blocks used by all transactional email templates.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://promobidocs.com';

// ── Brand tokens ──────────────────────────────────────────────────────────────
export const brand = {
    primary: '#B8763E',
    primaryLight: '#D49B6A',
    primaryDark: '#8B5A2B',
    secondary: '#1e293b',
    accent: '#f59e0b',
    dark: '#0f172a',
    slate: '#334155',
    light: '#f8fafc',
    muted: '#64748b',
    border: '#e2e8f0',
    green: '#10b981',
    blue: '#3b82f6',
    appUrl: APP_URL,
    gradient: 'linear-gradient(135deg, #B8763E 0%, #8B5A2B 100%)',
    glassGradient: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0.7) 100%)',
    shadow: '0 10px 40px -10px rgba(0, 0, 0, 0.15)',
    innerShadow: 'inset 0 2px 4px rgba(255, 255, 255, 0.2)',
};

// ── Shared CSS injected into every email <head> ───────────────────────────────
export const baseStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    
    * { 
        box-sizing: border-box; 
        margin: 0; 
        padding: 0; 
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }
    
    body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background-color: #f8fafc;
        color: ${brand.slate};
        padding: 60px 0;
        line-height: 1.5;
    }

    .wrapper { 
        width: 100%;
        table-layout: fixed;
        background-color: #f8fafc;
        padding: 40px 16px; 
    }

    .card { 
        max-width: 600px; 
        margin: 0 auto; 
        background: #ffffff;
        border-radius: 24px; 
        overflow: hidden;
        box-shadow: ${brand.shadow};
        border: 1px solid ${brand.border};
    }

    /* Header & Hero */
    .hdr { 
        background: ${brand.dark}; 
        padding: 64px 32px; 
        text-align: center;
        background-image: linear-gradient(to bottom, rgba(15, 23, 42, 0.8), rgba(15, 23, 42, 1)), radial-gradient(at top left, ${brand.primaryDark}, transparent);
    }
    .hdr-logo { 
        font-size: 32px; 
        font-weight: 900; 
        color: #ffffff;
        letter-spacing: -1.5px; 
        margin-bottom: 12px;
        text-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .hdr-logo span { color: ${brand.primary}; }
    .hdr-sub { 
        font-size: 14px; 
        font-weight: 700; 
        color: ${brand.primaryLight};
        letter-spacing: 3px; 
        text-transform: uppercase; 
        opacity: 0.9;
    }

    /* Status Icons */
    .hero-icon-container {
        width: 72px;
        height: 72px;
        margin: -36px auto 32px;
        background: #ffffff;
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 12px 24px rgba(0,0,0,0.06);
        border: 1px solid ${brand.border};
        position: relative;
        z-index: 10;
    }

    /* Body */
    .body { padding: 48px 48px; }
    .greeting { 
        font-size: 26px; 
        font-weight: 900; 
        color: ${brand.dark}; 
        margin-bottom: 20px; 
        letter-spacing: -0.75px; 
        line-height: 1.2;
    }
    .para { 
        font-size: 16px; 
        line-height: 1.7; 
        color: ${brand.slate}; 
        margin-bottom: 28px; 
    }

    /* Data Display Grid */
    .data-grid { 
        background: #f8fafc;
        border-radius: 20px; 
        padding: 32px; 
        margin: 36px 0;
        border: 1px solid ${brand.border};
    }
    .data-row { 
        display: flex; 
        justify-content: space-between; 
        padding: 14px 0; 
        border-bottom: 1px solid #e2e8f0;
    }
    .data-row:last-child { border-bottom: none; }
    .data-label { color: ${brand.muted}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .data-value { color: ${brand.dark}; font-size: 15px; font-weight: 700; text-align: right; }

    /* Glass Action Box */
    .action-box {
        background: rgba(248, 250, 252, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid ${brand.border};
        border-radius: 20px;
        padding: 40px 32px;
        text-align: center;
        margin: 40px 0;
    }

    /* CTA button */
    .cta-container { text-align: center; margin: 40px 0; }
    .btn { 
        display: inline-block; 
        background: ${brand.gradient};
        color: #ffffff !important; 
        text-decoration: none;
        padding: 20px 48px; 
        border-radius: 14px;
        font-size: 16px; 
        font-weight: 800;
        box-shadow: 0 10px 25px rgba(184, 118, 62, 0.35);
        transition: all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
        letter-spacing: -0.2px;
    }

    /* Metadata Footer */
    .footer { 
        background: #f1f5f9; 
        padding: 48px 40px; 
        border-top: 1px solid ${brand.border}; 
        text-align: center;
    }
    .footer-brand { 
        color: ${brand.dark}; 
        font-weight: 900; 
        font-size: 20px; 
        margin-bottom: 16px;
        letter-spacing: -1px;
    }
    .footer-line { 
        font-size: 13px; 
        color: ${brand.muted}; 
        line-height: 1.8; 
    }
    .footer-link {
        color: ${brand.primary};
        text-decoration: none;
        font-weight: 700;
        transition: opacity 0.2s;
    }
    .footer-certs { 
        margin-top: 32px; 
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
    }
    .cert-badge { 
        display: inline-block;
        padding: 8px 16px; 
        background: #ffffff;
        border: 1px solid ${brand.border}; 
        border-radius: 100px;
        font-size: 11px; 
        font-weight: 700; 
        color: ${brand.slate};
        box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    }

    @media only screen and (max-width: 600px) {
        body { padding: 0; }
        .body { padding: 40px 24px; }
        .greeting { font-size: 22px; }
        .card { border-radius: 0; border: none; }
        .wrapper { padding: 0; }
        .hdr { padding: 56px 24px; }
    }
`;

// ── Components ───────────────────────────────────────────────────────────────

/**
 * Renders a premium header with the brand logo.
 */
export function renderHeader(subtitle?: string): string {
    return `
    <div class="hdr">
        <div class="hdr-logo">PRO<span>MOBI</span></div>
        ${subtitle ? `<div class="hdr-sub">${subtitle}</div>` : ''}
    </div>
    `;
}

/**
 * Renders a centered hero icon (SVG source).
 */
export function renderHeroIcon(svgPath: string, color: string = brand.primary): string {
    return `
    <div class="hero-icon-container">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="${svgPath}" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    </div>
    `;
}

/**
 * Renders a summarized data grid.
 */
export function renderSummaryTable(rows: { label: string; value: string }[]): string {
    return `
    <div class="data-grid">
        ${rows.map(row => `
            <div class="data-row">
                <div class="data-label">${row.label}</div>
                <div class="data-value">${row.value}</div>
            </div>
        `).join('')}
    </div>
    `;
}

/**
 * Shared Footer HTML.
 */
export const footerHtml = `
<div class="footer">
    <div class="footer-brand">PRO<span>MOBI</span></div>
    <div class="footer-line">
        <strong>Promobidocs Services LLC</strong><br>
        Winter Garden / Horizon West · Kissimmee, FL · United States
    </div>
    <div class="footer-line" style="margin-top:16px;">
        Possui alguma dúvida?<br>
        Responda este e-mail ou chame no WhatsApp:<br>
        <a href="https://wa.me/14076396154" class="footer-link">+1 (407) 639-6154</a>
    </div>
    <div class="footer-certs">
        <span class="cert-badge">✓ Florida Notary Public</span>
        <span class="cert-badge">✓ ATA Member</span>
        <span class="cert-badge">✓ USCIS Certified</span>
    </div>
    <div class="footer-line" style="margin-top:32px; font-size:11px; opacity:0.6;">
        &copy; ${new Date().getFullYear()} Promobi. Todos os direitos reservados.
    </div>
</div>
`;

// ── Full page wrapper ─────────────────────────────────────────────────────────
export function wrapEmail(innerHtml: string): string {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <style>${baseStyles}</style>
</head>
<body>
<div class="wrapper">
    <div class="card">
        ${innerHtml}
        ${footerHtml}
    </div>
</div>
</body>
</html>`;
}
