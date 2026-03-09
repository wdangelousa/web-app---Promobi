'use server';

import { Resend } from 'resend';

// Initialize Resend with the API key
const resend = new Resend(process.env.RESEND_API_KEY);

interface SendReviewLinkParams {
  email: string;
  name: string;
  orderId: number;
}

export async function sendReviewLink({ email, name, orderId }: SendReviewLinkParams) {
  try {
    const reviewLink = `https://promobidocs.com/revisar/${orderId}`;

    let recipient = email;
    if (process.env.NODE_ENV === 'development') {
      recipient = 'wdangelo81@gmail.com';
      console.log(`[sendReviewLink] Development mode: Redirecting email from ${email} to ${recipient}`);
    }

    const { data, error } = await resend.emails.send({
      from: 'Promobidocs <desk@promobidocs.com>',
      to: [recipient],
      subject: 'Sua tradução está pronta para revisão! 📄',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              .button {
                background-color: #B8763E;
                color: #ffffff;
                padding: 12px 24px;
                border-radius: 6px;
                text-decoration: none;
                font-weight: bold;
                display: inline-block;
              }
              .container {
                font-family: sans-serif;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f9fafb;
                border-radius: 8px;
              }
              .header {
                text-align: center;
                margin-bottom: 20px;
              }
              .content {
                background-color: white;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <img src="https://promobidocs.com/logo-promobidocs.png" width="200" alt="Promobidocs" style="margin-bottom: 10px;">
                <h1 style="color: #1f2937; margin-top: 0;">Tradução Pronta</h1>
              </div>
              <div class="content">
                <h2 style="color: #374151;">Olá, ${name}! 👋</h2>
                <p style="color: #4b5563; line-height: 1.5; font-size: 16px;">
                  Temos ótimas notícias! A tradução do seu pedido <strong>#${orderId}</strong> foi concluída e está pronta para sua revisão.
                </p>
                <p style="color: #4b5563; line-height: 1.5; font-size: 16px;">
                  Por favor, clique no botão abaixo para verificar o documento e aprovar ou solicitar ajustes.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${reviewLink}" class="button">
                    Revisar Tradução
                  </a>
                </div>
                <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                  Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                  <a href="${reviewLink}" style="color: #B8763E;">${reviewLink}</a>
                </p>
              </div>
              <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
                © 2026 Promobi. Todos os direitos reservados.
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Error sending email:', error);
      throw new Error(error.message);
    }

    return { success: true, data };
  } catch (error) {
    console.error('Server Action Error:', error);
    // Não lançar erro para não quebrar a UI, apenas retornar false ou logar
    return { success: false, error };
  }
}
