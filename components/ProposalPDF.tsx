'use client';

import React from 'react';
import {
    Document,
    Page,
    Text,
    View,
    StyleSheet,
    Image,
    Font
} from '@react-pdf/renderer';

// Register Fonts (Optional: Use standard ones or register Google Fonts if needed)
// For now, using standard sans-serif

const styles = StyleSheet.create({
    page: {
        padding: 40,
        fontFamily: 'Helvetica',
        fontSize: 10,
        color: '#334155',
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
        borderBottom: 2,
        borderBottomColor: '#f58220',
        paddingBottom: 15,
    },
    logo: {
        width: 120,
    },
    headerTitle: {
        textAlign: 'right',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#0f172a',
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 10,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    clientSection: {
        marginBottom: 25,
        backgroundColor: '#f8fafc',
        padding: 15,
        borderRadius: 8,
    },
    sectionLabel: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#94a3b8',
        textTransform: 'uppercase',
        marginBottom: 5,
        letterSpacing: 0.5,
    },
    clientName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    clientDetail: {
        fontSize: 10,
        color: '#475569',
        marginTop: 2,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        padding: 8,
        borderRadius: 4,
        marginBottom: 8,
    },
    tableHeaderCell: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 9,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        padding: 8,
        alignItems: 'center',
    },
    tableCell: {
        fontSize: 9,
    },
    colFile: { width: '50%' },
    colPages: { width: '15%', textAlign: 'center' },
    colDensity: { width: '20%', textAlign: 'center' },
    colPrice: { width: '15%', textAlign: 'right' },

    densityBadge: {
        fontSize: 8,
        fontWeight: 'bold',
        padding: '2 6',
        borderRadius: 4,
        textAlign: 'center',
    },
    densityHigh: { backgroundColor: '#fee2e2', color: '#b91c1c' },
    densityMedium: { backgroundColor: '#fef9c3', color: '#a16207' },
    densityLow: { backgroundColor: '#dcfce7', color: '#15803d' },
    densityBlank: { backgroundColor: '#f1f5f9', color: '#64748b' },
    densityScanned: { backgroundColor: '#fee2e2', color: '#b91c1c' },

    summarySection: {
        marginTop: 30,
        alignSelf: 'flex-end',
        width: '40%',
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 2,
        borderTopColor: '#0f172a',
    },
    totalLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    totalValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#f58220',
    },
    paymentInstructions: {
        marginTop: 40,
        padding: 15,
        backgroundColor: '#f8fafc',
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#cbd5e1',
    },
    paymentTitle: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#0f172a',
        marginBottom: 8,
    },
    paymentText: {
        fontSize: 9,
        lineHeight: 1.4,
        color: '#475569',
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 40,
        right: 40,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        paddingTop: 10,
        textAlign: 'center',
    },
    footerText: {
        fontSize: 8,
        color: '#94a3b8',
    }
});

interface ProposalPDFProps {
    order: any;
    globalSettings: any;
}

export const ProposalPDF = ({ order, globalSettings }: ProposalPDFProps) => {
    const metadata = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : order.metadata;
    const documents = metadata?.documents || [];
    const breakdown = metadata?.breakdown || {};

    return (
        <Document title={`Proposta-Comercial-Promobi-${order.id}`}>
            <Page size="A4" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <View>
                        {/* Note: In production, use absolute URL for image or local path */}
                        <Image
                            src={`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/logo.png`}
                            style={styles.logo}
                        />
                    </View>
                    <View style={styles.headerTitle}>
                        <Text style={styles.title}>Proposta Comercial</Text>
                        <Text style={styles.subtitle}>Pedido #{order.id} • {new Date(order.createdAt).toLocaleDateString()}</Text>
                    </View>
                </View>

                {/* Client Info */}
                <View style={styles.clientSection}>
                    <Text style={styles.sectionLabel}>Preparado para:</Text>
                    <Text style={styles.clientName}>{order.user?.fullName}</Text>
                    <Text style={styles.clientDetail}>{order.email}</Text>
                    {order.phone && <Text style={styles.clientDetail}>{order.phone}</Text>}
                </View>

                {/* Raio-X Table */}
                <Text style={[styles.sectionLabel, { marginBottom: 10 }]}>Detalhamento Técnico (Raio-X)</Text>

                <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderCell, styles.colFile]}>Documento</Text>
                    <Text style={[styles.tableHeaderCell, styles.colPages]}>Págs</Text>
                    <Text style={[styles.tableHeaderCell, styles.colDensity]}>Densidade</Text>
                    <Text style={[styles.tableHeaderCell, styles.colPrice]}>Subtotal</Text>
                </View>

                {documents.map((doc: any, index: number) => {
                    // Simple average density logic for table
                    const density = doc.analysis?.density || 'high';
                    const densityStyle = density === 'high' ? styles.densityHigh :
                        density === 'medium' ? styles.densityMedium :
                            density === 'low' ? styles.densityLow :
                                density === 'blank' ? styles.densityBlank : styles.densityScanned;

                    return (
                        <View key={index} style={styles.tableRow}>
                            <Text style={[styles.tableCell, styles.colFile]}>{doc.fileName}</Text>
                            <Text style={[styles.tableCell, styles.colPages]}>{doc.count || 1}</Text>
                            <View style={[styles.colDensity, { alignItems: 'center' }]}>
                                <Text style={[styles.densityBadge, densityStyle]}>
                                    {density === 'scanned' ? 'SCANNED' : density.toUpperCase()}
                                </Text>
                            </View>
                            <Text style={[styles.tableCell, styles.colPrice]}>
                                ${((doc.analysis?.totalPrice || 0) + (doc.notarized ? (globalSettings?.notaryFee || 25) : 0)).toFixed(2)}
                            </Text>
                        </View>
                    );
                })}

                {/* Financial Summary */}
                <View style={styles.summarySection}>
                    <View style={styles.summaryRow}>
                        <Text style={{ fontSize: 9 }}>Subtotal Documentos</Text>
                        <Text style={{ fontSize: 9, fontWeight: 'bold' }}>${(breakdown.basePrice || 0).toFixed(2)}</Text>
                    </View>
                    {breakdown.notaryFee > 0 && (
                        <View style={styles.summaryRow}>
                            <Text style={{ fontSize: 9 }}>Taxas Notariais</Text>
                            <Text style={{ fontSize: 9, fontWeight: 'bold' }}>${(breakdown.notaryFee || 0).toFixed(2)}</Text>
                        </View>
                    )}
                    {breakdown.urgencyFee > 0 && (
                        <View style={styles.summaryRow}>
                            <Text style={{ fontSize: 9, color: '#f58220' }}>Taxa de Urgência ({order.urgency?.toUpperCase()})</Text>
                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#f58220' }}>${(breakdown.urgencyFee || 0).toFixed(2)}</Text>
                        </View>
                    )}
                    {breakdown.totalDiscountApplied > 0 && (
                        <View style={styles.summaryRow}>
                            <Text style={{ fontSize: 9, color: '#15803d' }}>Desconto (Pagamento Integral)</Text>
                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#15803d' }}>-${(breakdown.totalDiscountApplied || 0).toFixed(2)}</Text>
                        </View>
                    )}

                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Investimento Total</Text>
                        <Text style={styles.totalValue}>${order.totalAmount?.toFixed(2)}</Text>
                    </View>
                </View>

                {/* Payment Instructions */}
                <View style={styles.paymentInstructions}>
                    <Text style={styles.paymentTitle}>Opções de Pagamento e Próximos Passos</Text>
                    <Text style={styles.paymentText}>
                        1. Selecione sua forma de pagamento preferida (Zelle, Stripe ou Pix via Dashboard).{"\n"}
                        2. Após a confirmação do pagamento, nossa equipe iniciará a tradução imediatamente.{"\n"}
                        3. Você receberá o kit digital certificado via e-mail e poderá acompanhar o status em tempo real.{"\n"}
                        4. Validade USCIS garantida para todas as traduções certificadas Promobi.
                    </Text>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        Promobi Group LLC • Florida, USA • www.promobi.us • info@promobi.us
                    </Text>
                </View>
            </Page>
        </Document>
    );
};
