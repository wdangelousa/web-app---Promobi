import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');

interface OrderEmailProps {
    orderId: number;
    customerName: string;
    customerEmail: string;
    hasTranslation: boolean;
    hasNotary: boolean;
}

export async function sendOrderConfirmationEmail({
    orderId,
    customerName,
    customerEmail,
    hasTranslation,
    hasNotary
}: OrderEmailProps) {

    // Construct Service List String
    const services = [];
    if (hasTranslation) services.push('Tradução Certificada');
    if (hasNotary) services.push('Notarização Oficial');
    const servicesText = services.join(' + ');

    // Dynamic HTML Template
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
            .header { background-color: #0f172a; padding: 30px; text-align: center; }
            .header h1 { color: #f58220; margin: 0; font-size: 24px; font-weight: bold; } /* Orange Brand Color */
            .content { padding: 40px 30px; color: #334155; line-height: 1.6; }
            .h2 { font-size: 20px; font-weight: bold; color: #0f172a; margin-bottom: 20px; }
            .details { background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #f58220; }
            .button-container { text-align: center; margin: 40px 0; }
            .button { background-color: #f58220; color: #ffffff; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(245, 130, 32, 0.2); }
            .footer { background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
        </style>
    </head>
    <body style="background-color: #f8fafc;">
        <div class="container">
            <div class="header">
                <!-- Using Text Logo for simplicity and reliability in email clients -->
                <h1>Promobi</h1>
            </div>
            <div class="content">
                <p>Olá, <strong>${customerName}</strong>!</p>
                <p>Seu pagamento foi confirmado com sucesso. Agradecemos a confiança em nossos serviços.</p>
                
                <div class="details">
                    <p style="margin: 0;"><strong>Pedido:</strong> #${orderId}</p>
                    <p style="margin: 10px 0 0 0;"><strong>Serviços Contratados:</strong> ${servicesText}</p>
                </div>

                <p>Nossa equipe jurídica já iniciou o processamento do seu pedido. Você pode acompanhar cada etapa em tempo real através do seu painel exclusivo.</p>

                <div class="button-container">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://promobi-app.vercel.app'}/meu-pedido" class="button">
                        Acessar Dashboard
                    </a>
                </div>

                <p style="font-size: 14px; color: #64748b;">
                    Assim que seus documentos estiverem prontos, enviaremos outro e-mail com o link direto para download.
                </p>
            </div>
            <div class="footer">
                <p>Promobi Services LLC • Florida Notary Public</p>
                <p>Dúvidas? Responda a este e-mail.</p>
            </div>
        </div>
    </body>
    </html>
    `;

    try {
        const data = await resend.emails.send({
            from: 'Promobi <onboarding@resend.dev>', // Change to verified domain in production if available
            to: [customerEmail],
            subject: `Recebemos seu pedido #${orderId} - Promobi`,
            html: htmlContent,
        });

        console.log(`Email sent to ${customerEmail}:`, data);
        return { success: true, data };
    } catch (error) {
        console.error('Failed to send email:', error);
        return { success: false, error };
    }
}

interface DeliveryEmailProps {
    orderId: number;
    customerName: string;
    customerEmail: string;
    deliveryUrl: string;
    hasTranslation: boolean;
    hasNotary: boolean;
}

export async function sendDeliveryEmail({
    orderId,
    customerName,
    customerEmail,
    deliveryUrl,
    hasTranslation,
    hasNotary
}: DeliveryEmailProps) {

    const services = [];
    if (hasTranslation) services.push('Tradução Certificada');
    if (hasNotary) services.push('Notarização Oficial');
    const servicesText = services.join(' + ');

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
            .header { background-color: #0f172a; padding: 30px; text-align: center; }
            .header h1 { color: #f58220; margin: 0; font-size: 24px; font-weight: bold; }
            .content { padding: 40px 30px; color: #334155; line-height: 1.6; }
            .details { background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #22c55e; }
            .button-container { text-align: center; margin: 40px 0; }
            .button { background-color: #f58220; color: #ffffff; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(245, 130, 32, 0.2); }
            .footer { background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
        </style>
    </head>
    <body style="background-color: #f8fafc;">
        <div class="container">
            <div class="header">
                <h1>Promobi</h1>
            </div>
            <div class="content">
                <p>Olá, <strong>${customerName}</strong>!</p>
                <p>Temos ótimas notícias! O serviço de <strong>${servicesText}</strong> referente ao seu pedido <strong>#${orderId}</strong> foi concluído com sucesso.</p>
                
                <div class="details">
                    <p style="margin: 0; color: #166534;"><strong>Status:</strong> Concluído e Pronto para Download</p>
                </div>

                <p>Seus documentos foram processados e estão disponíveis no link abaixo:</p>

                <div class="button-container">
                    <a href="${deliveryUrl}" class="button">
                        Baixar Arquivos Agora
                    </a>
                </div>

                <p style="font-size: 14px; color: #64748b; text-align: center;">
                    Ou acesse seu dashboard: <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://promobi-app.vercel.app'}/meu-pedido" style="color: #f58220;">Meus Pedidos</a>
                </p>
            </div>
            <div class="footer">
                <p>Promobi Services LLC • Florida Notary Public</p>
            </div>
        </div>
    </body>
    </html>
    `;

    try {
        const data = await resend.emails.send({
            from: 'Promobi <onboarding@resend.dev>',
            to: [customerEmail],
            subject: `Entrega do Pedido #${orderId} - Promobi`,
            html: htmlContent,
        });
        console.log(`Delivery email sent to ${customerEmail}`);
        return { success: true, data };
    } catch (error) {
        console.error('Failed to send delivery email:', error);
        return { success: false, error };
    }
}
