export interface DeliveryProps {
  orderId: string | number;
  customerName: string;
  deliveryUrl: string;
  serviceType: 'translation' | 'notarization';
  pageCount?: number;
}

export function renderDelivery(props: DeliveryProps) {
  const { orderId, customerName, deliveryUrl, serviceType } = props;
  const currentYear = new Date().getFullYear();
  const serviceName = serviceType === 'notarization' ? 'Notarização' : 'Tradução Certificada';
  const pageCount = "1";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sua ${serviceName} está pronta!</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6f9; padding: 40px 0;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
          
          <tr>
            <td align="center" style="background-color: #0F1117; padding: 40px 20px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: -0.5px;">🎉 Sua ${serviceName} está pronta!</h1>
              <p style="color: #f5b000; margin: 10px 0 0 0; font-size: 14px; font-weight: bold;">Pedido #${orderId} · ${pageCount} página(s)</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; font-size: 18px; color: #333333;">Olá, <strong>${customerName}</strong>!</p>
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #555555;">
                Temos o prazer de informar que seus documentos foram processados e estão disponíveis para download. Você pode acessá-los diretamente através do link seguro abaixo.
              </p>

              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0 30px 0;">
                    <a href="${deliveryUrl}" style="background-color: #f5b000; color: #111827; padding: 18px 30px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 16px;">⬇ Baixar Kit de Documentos</a>
                  </td>
                </tr>
              </table>

              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8f9fc; border: 1px solid #e1e4e8; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #888888;">Detalhes do Pedido</h3>
                    <p style="margin: 5px 0; font-size: 15px; color: #333333;"><strong>Serviço:</strong> ${serviceName}</p>
                    <p style="margin: 5px 0; font-size: 15px; color: #333333;"><strong>Pedido:</strong> #${orderId}</p>
                  </td>
                </tr>
              </table>

              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #eeeeee; padding-top: 25px;">
                <tr>
                  <td style="font-size: 14px; color: #777777; line-height: 1.5;">
                    <strong style="color: #333333;">Próximos Passos:</strong> Recomendamos salvar seus documentos em um local seguro no seu computador ou armazenamento em nuvem após o download.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 30px 40px 30px; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #999999;">
                Obrigado por escolher a <strong>Promobidocs</strong>.<br>
                Precisa de ajuda? <a href="mailto:desk@promobidocs.com" style="color: #f5b000; text-decoration: none; font-weight: bold;">Fale com o suporte</a>
              </p>
              <div style="margin-top: 25px; border-top: 1px solid #eeeeee; padding-top: 20px;">
                <p style="margin: 0; font-size: 12px; color: #bbbbbb;">&copy; ${currentYear} Promobidocs. Todos os direitos reservados.</p>
              </div>
            </td>
          </tr>

        </table>
        </td>
    </tr>
  </table>
</body>
</html>`;
}