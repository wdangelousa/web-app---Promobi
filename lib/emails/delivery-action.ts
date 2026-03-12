/**
 * lib/emails/delivery-action.ts
 * Email sent when the courier is ready but the customer needs to take an action.
 */
import { wrapEmail, brand } from './base';

export interface DeliveryActionRequiredProps {
    orderId: number;
    customerName: string;
    actionUrl: string;
    actionType?: 'address' | 'pickup' | 'signature';
}

export function renderDeliveryActionRequired({
    orderId,
    customerName,
    actionUrl,
    actionType = 'address',
}: DeliveryActionRequiredProps): string {
    const actionLabel = actionType === 'pickup' ? 'Coleta Disponível' :
        actionType === 'signature' ? 'Assinatura Necessária' :
            'Endereço Necessário';

    const inner = `
<div class="hdr" style="background:#1e1b4b;">
    <div class="hdr-logo" style="color:#ffffff;">Promobi</div>
    <div class="hdr-sub" style="color:#a5b4fc;">Ação Necessária</div>
</div>
<div class="body">
    <div style="text-align:center;padding:8px 0 28px;">
        <div style="font-size:56px;line-height:1;margin-bottom:16px;">🚚</div>
        <p style="font-size:24px;font-weight:800;color:${brand.dark};line-height:1.2;margin:0 0 8px 0;">
            Ação necessária para<br>sua entrega!
        </p>
        <p style="font-size:14px;color:#64748b;margin:0;">Pedido #${orderId}</p>
    </div>

    <p class="para" style="text-align:center;margin-bottom:24px;">
        Olá <strong>${customerName}</strong>! Seu pedido está pronto para o envio, mas precisamos de uma ação sua para prosseguir com a entrega.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;">
        <tr>
            <td align="center">
                <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td align="center" bgcolor="#3b82f6" style="border-radius:8px;">
                            <a href="${actionUrl}" style="display:inline-block; padding:18px 44px; color:#ffffff; font-size:17px; font-weight:bold; text-decoration:none;">
                                Realizar Ação Necessária
                            </a>
                        </td>
                    </tr>
                </table>
                <p style="font-size:12px;color:#94a3b8;margin:14px 0 0 0;">
                    Clique no botão acima para resolver a pendência em nosso sistema.
                </p>
            </td>
        </tr>
    </table>

    <div class="box" style="background:#fff7ed;border:1px solid #fed7aa;padding:20px;border-radius:8px;margin-bottom:30px;">
        <p style="font-size:13px;font-weight:700;color:#c2410c;margin:0 0 12px 0; text-transform:uppercase;letter-spacing:1px;">
            Por que isso é necessário?
        </p>
        <p style="font-size:14px;color:#9a3412;line-height:1.6;margin:0;">
            O serviço de logística informou que sem esta ação o pacote não poderá ser entregue no prazo estimado. Por favor, complete o procedimento o quanto antes.
        </p>
    </div>

    <div class="divider"></div>
    <p class="para" style="font-size:12px;color:#94a3b8;text-align:center;margin-top:20px;">
        <strong style="color:${brand.slate};">Dúvidas?</strong><br>
        Entre em contato conosco respondendo a este e-mail ou via suporte em nosso site.
    </p>
</div>`;

    return wrapEmail(inner);
}