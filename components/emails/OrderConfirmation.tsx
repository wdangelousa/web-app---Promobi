import * as React from 'react';

interface OrderConfirmationEmailProps {
    orderId: number;
    customerName: string;
    totalAmount: number;
    paymentMethod: string;
}

export const OrderConfirmationEmail: React.FC<OrderConfirmationEmailProps> = ({
    orderId,
    customerName,
    totalAmount,
    paymentMethod,
}) => (
    <div style={{ fontFamily: 'sans-serif', lineHeight: '1.6', color: '#333' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ backgroundColor: '#0f172a', padding: '20px', textAlign: 'center' }}>
                <h1 style={{ color: '#ffffff', margin: 0, fontSize: '24px' }}>Promobi</h1>
            </div>

            {/* Body */}
            <div style={{ padding: '30px' }}>
                <h2 style={{ color: '#0f172a', marginTop: 0 }}>Recebemos seu pedido!</h2>
                <p>Olá, <strong>{customerName}</strong>.</p>
                <p>
                    Obrigado por escolher a Promobi. Seu pedido <strong>#{orderId}</strong> foi recebido com sucesso e nossa equipe já foi notificada.
                </p>

                <div style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '6px', margin: '20px 0' }}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#475569' }}>Detalhes do Pedido</h3>
                    <p style={{ margin: '5px 0' }}><strong>Número:</strong> #{orderId}</p>
                    <p style={{ margin: '5px 0' }}><strong>Valor Total:</strong> {paymentMethod === 'PARCELADO_USA' ? 'R$' : '$'} {totalAmount.toFixed(2)}</p>
                    <p style={{ margin: '5px 0' }}><strong>Pagamento via:</strong> {paymentMethod === 'STRIPE' ? 'Cartão / Wallet (USD)' : 'Parcelado USA (BRL)'}</p>
                </div>

                <p>
                    Estamos analisando seus documentos. Você receberá uma nova atualização por e-mail assim que a tradução/notarização for iniciada.
                </p>

                <a href="https://promobi.com" style={{ display: 'inline-block', backgroundColor: '#f58220', color: '#ffffff', textDecoration: 'none', padding: '12px 24px', borderRadius: '6px', fontWeight: 'bold', marginTop: '10px' }}>
                    Acessar Painel do Cliente
                </a>
            </div>

            {/* Footer */}
            <div style={{ backgroundColor: '#f1f5f9', padding: '20px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                <p style={{ margin: 0 }}>© 2024 Promobi Services. Todos os direitos reservados.</p>
                <p style={{ margin: '5px 0 0 0' }}>Orlando, FL - USA</p>
            </div>
        </div>
    </div>
);
