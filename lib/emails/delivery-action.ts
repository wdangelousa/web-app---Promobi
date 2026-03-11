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
<div class="hdr" style="background:linear-gradient(135deg, ${brand.dark} 0%, #1e1b4b 100%);">
    <div class="hdr-logo">Promobi</div>
    <div class="hdr-sub" style="color:#a5b4fc;">Ação Necessária</div>
</div>
<div class="body">
    <!-- Hero Warning -->
    <div style="text-align:center;padding:8px 0 28px;">
        <div style="font-size:56px;margin-bottom:16px;">🚚</div>
        <p style="font-size:24px;font-weight:800;color:${brand.dark};line-height:1.2;margin-bottom:8px;">
            Ação necessária para<br>sua entrega!
        </p>
        <p style="font-size:14px;color:#64748b;">Pedido #${orderId}</p>
    </div>

    <p class="para" style="text-align:center;">
        Olá <strong>${customerName}</strong>! Seu pedido está pronto para o envio, mas precisamos de uma ação sua para prosseguir com a entrega.
    </p>

    <!-- Big Action CTA -->
    <div class="cta-wrap" style="margin:32px 0;">
        <a href="${actionUrl}" class="btn" style="font-size:17px;padding:18px 44px;">
            Realizar Ação Necessária
        </a>
        <p style="font-size:12px;color:#94a3b8;margin-top:14px;">
            Clique no botão acima para resolver a pendência em nosso sistema.
        </p>
    </div>

    <!-- Alert Box -->
    <div class="box" style="background:#fff7ed;border:1px solid #fed7aa;">
        <p style="font-size:13px;font-weight:700;color:#c2410c;margin-bottom:12px;
                  text-transform:uppercase;letter-spacing:1px;">
            Por que isso é necessário?
        </p>
        <p style="font-size:14px;color:#9a3412;line-height:1.6;">
            O serviço de logística informou que sem esta ação o pacote não poderá ser entregue no prazo estimado. Por favor, complete o procedimento o quanto antes.
        </p>
    </div>

    <div class="divider"></div>
    <p class="para" style="font-size:12px;color:#94a3b8;text-align:center;">
        <strong style="color:${brand.slate};">Dúvidas?</strong>
        Entre em contato conosco respondendo a este e-mail ou via suporte em nosso site.
    </p>
</div>`;

    return wrapEmail(inner);
}
