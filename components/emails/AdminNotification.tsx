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
    <div style={{ fontFamily: 'sans-serif', lineHeight: '1.5', color: '#333' }}>
        <h2 style={{ color: '#0f172a' }}>🔔 Novo Pedido Recebido: #{orderId}</h2>
        <p>Um novo pedido foi criado no sistema.</p>

        <ul>
            <li><strong>Cliente:</strong> {customerName} ({customerEmail})</li>
            <li><strong>Valor:</strong> {totalAmount.toFixed(2)}</li>
            <li><strong>ID:</strong> {orderId}</li>
        </ul>

        <p style={{ marginTop: '20px' }}>
            <a href={`https://promobi.com/admin/orders/${orderId}`} style={{ color: '#2563eb', fontWeight: 'bold' }}>
                Ver no Painel Admin →
            </a>
        </p>
    </div>
);
