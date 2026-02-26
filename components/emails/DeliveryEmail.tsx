import * as React from 'react';

interface DeliveryEmailProps {
    customerName: string;
    orderId: number;
    downloadLink: string;
}

export const DeliveryEmail: React.FC<DeliveryEmailProps> = ({
    customerName,
    orderId,
    downloadLink,
}) => (
    <div style={{ backgroundColor: '#f8fafc', padding: '40px 0', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>

            {/* Header */}
            <div style={{ backgroundColor: '#0f172a', padding: '30px', textAlign: 'center' }}>
                <img src="https://web-app-promobi.vercel.app/logo_abelha.png" width="180" alt="Promobi" style={{ marginBottom: '15px' }} />
                <h1 style={{ color: '#ffffff', margin: 0, fontSize: '24px', fontWeight: 'bold' }}>Sua Documentação Chegou</h1>
            </div>

            {/* Body */}
            <div style={{ padding: '40px 30px', color: '#334155', lineHeight: '1.6' }}>

                <p style={{ fontSize: '18px', margin: '0 0 20px 0' }}>Olá, <strong>{customerName}</strong>.</p>

                <p style={{ marginBottom: '24px' }}>
                    Temos o prazer de informar que sua solicitação <strong>#{orderId}</strong> foi processada com sucesso por nossa equipe jurídica.
                </p>

                <p style={{ marginBottom: '32px' }}>
                    Seus documentos foram traduzidos, revisados e notarizados oficialmente na Flórida. Abaixo você encontra o link seguro para download do arquivo PDF unificado.
                </p>

                {/* CTA Button */}
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <a
                        href={downloadLink}
                        style={{
                            backgroundColor: '#f5b000',
                            color: '#000000',
                            padding: '16px 32px',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            fontWeight: 'bold',
                            fontSize: '16px',
                            display: 'inline-block',
                            boxShadow: '0 4px 6px rgba(245, 176, 0, 0.2)'
                        }}
                    >
                        Baixar Documentação Oficial
                    </a>
                </div>

                {/* Security Warning */}
                <div style={{ backgroundColor: '#fffcf0', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #f5b000', fontSize: '14px', color: '#855a00' }}>
                    <strong>Aviso de Segurança:</strong> Este link expirará em breve para proteger seus dados. Recomendamos que você baixe e salve o arquivo em um local seguro imediatamente.
                </div>

                <p style={{ marginTop: '30px', fontSize: '14px', color: '#64748b' }}>
                    Se precisar de vias físicas (Hard Copies) ou tiver qualquer dúvida sobre a aceitação na USCIS, nossa equipe está à disposição.
                </p>
            </div>

            {/* Footer */}
            <div style={{ backgroundColor: '#f1f5f9', padding: '20px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
                <p style={{ margin: '0 0 8px 0' }}>Promobi Services LLC • Florida Notary Public</p>
                <p style={{ margin: 0 }}>Orlando, FL • OAB/SP Affiliate</p>
            </div>

        </div>
    </div>
);
