/**
 * lib/emails/base.ts
 * Shared HTML building blocks used by all transactional email templates.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://promobi.vercel.app';

// ── Brand tokens ──────────────────────────────────────────────────────────────
export const brand = {
    primary: '#f58220',
    dark: '#0f172a',
    slate: '#334155',
    light: '#f8fafc',
    muted: '#94a3b8',
    green: '#16a34a',
    appUrl: APP_URL,
};

// ── Shared CSS injected into every email <head> ───────────────────────────────
export const baseStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
        background-color: ${brand.light};
        color: ${brand.slate};
        -webkit-font-smoothing: antialiased;
    }
    .wrapper  { background-color: ${brand.light}; padding: 40px 16px; }
    .card     { max-width: 580px; margin: 0 auto; background: #fff;
                border-radius: 16px; overflow: hidden;
                box-shadow: 0 4px 24px rgba(0,0,0,0.07); }

    /* Header */
    .hdr      { background: ${brand.dark}; padding: 28px 32px; text-align: center; }
    .hdr-logo { font-size: 22px; font-weight: 800; color: ${brand.primary};
                letter-spacing: -0.5px; }
    .hdr-sub  { font-size: 11px; font-weight: 600; color: #64748b;
                letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }

    /* Body */
    .body     { padding: 40px 32px; }
    .greeting { font-size: 18px; font-weight: 700; color: ${brand.dark}; margin-bottom: 12px; }
    .para     { font-size: 15px; line-height: 1.7; color: ${brand.slate}; margin-bottom: 16px; }

    /* Info box */
    .box      { border-radius: 10px; padding: 20px 24px; margin: 24px 0; }
    .box-row  { display: flex; justify-content: space-between; align-items: center;
                font-size: 14px; padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }
    .box-row:last-child { border-bottom: none; }
    .box-label { color: ${brand.muted}; font-weight: 500; }
    .box-value { color: ${brand.dark}; font-weight: 600; }

    /* Status pill */
    .pill     { display: inline-block; padding: 4px 12px; border-radius: 100px;
                font-size: 12px; font-weight: 700; letter-spacing: 0.5px; }

    /* CTA button */
    .cta-wrap { text-align: center; margin: 32px 0 24px; }
    .btn      { display: inline-block; background: ${brand.primary};
                color: #fff !important; text-decoration: none;
                padding: 16px 36px; border-radius: 10px;
                font-size: 15px; font-weight: 700;
                box-shadow: 0 4px 12px rgba(245,130,32,0.35); }

    /* Divider */
    .divider  { height: 1px; background: #e2e8f0; margin: 28px 0; }

    /* Footer */
    .footer   { background: ${brand.dark}; padding: 28px 32px; }
    .footer-brand { color: ${brand.primary}; font-weight: 800; font-size: 16px; margin-bottom: 12px; }
    .footer-line  { font-size: 12px; color: #64748b; line-height: 1.6; }
    .footer-certs { display: inline-flex; gap: 12px; margin-top: 14px; }
    .cert-badge   { padding: 5px 12px; background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.1); border-radius: 100px;
                    font-size: 11px; font-weight: 700; color: #94a3b8;
                    letter-spacing: 0.5px; }
`;

// ── Footer HTML (same across all emails) ─────────────────────────────────────
export const footerHtml = `
<div class="footer">
    <div style="text-align:center;">
        <div class="footer-brand">Promobi</div>
        <div class="footer-line">
            <strong style="color:#94a3b8;">Promobi Services LLC</strong><br>
            Winter Garden / Horizon West · Orlando, FL · United States
        </div>
        <div class="footer-line" style="margin-top:8px;">
            Questions? Reply to this email or WhatsApp us at
            <a href="https://wa.me/14076396154" style="color:${brand.primary};text-decoration:none;">+1 (407) 639-6154</a>
        </div>
        <div class="footer-certs">
            <span class="cert-badge">✓ Florida Notary Public</span>
            <span class="cert-badge">✓ ATA Member</span>
            <span class="cert-badge">✓ USCIS Certified</span>
        </div>
    </div>
</div>
`;

// ── Full page wrapper ─────────────────────────────────────────────────────────
export function wrapEmail(innerHtml: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
