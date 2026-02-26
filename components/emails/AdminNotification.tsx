import * as React from 'react';

interface AdminNotificationEmailProps {
    orderId: number;
    customerName: string;
    customerEmail: string;
    totalAmount: number;
}

export const AdminNotificationEmail: React.FC<AdminNotificationEmailProps> = ({
    orderId,
    customerName,
    customerEmail,
    totalAmount,
}) => (
    <div style={{ fontFamily: 'sans-serif', lineHeight: '1.5', color: '#333', padding: '20px', border: '1px solid #eee', borderRadius: '8px' }}>
        <div style={{ backgroundColor: '#0f172a', padding: '15px', color: 'white', borderRadius: '6px 6px 0 0', textAlign: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, color: '#f5b000' }}>🔔 Novo Pedido: #{orderId}</h2>
        </div>
        <p>Um novo pedido foi criado no sistema.</p>

        <ul style={{ listStyle: 'none', padding: 0 }}>
            <li style={{ marginBottom: '8px' }}><strong>Cliente:</strong> {customerName} ({customerEmail})</li>
            <li style={{ marginBottom: '8px' }}><strong>Valor:</strong> ${totalAmount.toFixed(2)}</li>
            <li style={{ marginBottom: '8px' }}><strong>ID:</strong> {orderId}</li>
        </ul>

        <p style={{ marginTop: '20px', textAlign: 'center' }}>
            <a href={`https://promobi.us/admin/orders/${orderId}`} style={{ backgroundColor: '#f5b000', color: '#000', padding: '10px 20px', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold' }}>
                Ver no Painel Admin →
            </a>
        </p>
    </div>
);
