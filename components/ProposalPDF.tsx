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

const styles = StyleSheet.create({
    page: {
        padding: 50,
        fontFamily: 'Helvetica',
        fontSize: 10,
        color: '#1e293b',
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 40,
        borderBottom: 3,
        borderBottomColor: '#f58220',
        paddingBottom: 20,
    },
    logo: {
        width: 140,
    },
    headerInfo: {
        textAlign: 'right',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0f172a',
        marginBottom: 4,
    },
    quoteNumber: {
        fontSize: 11,
        color: '#475569',
        fontWeight: 'bold',
    },
    date: {
        fontSize: 9,
        color: '#94a3b8',
        marginTop: 2,
    },
    clientBlock: {
        marginBottom: 35,
        borderLeft: 4,
        borderLeftColor: '#f58220',
        paddingLeft: 15,
        paddingVertical: 5,
    },
    clientLabel: {
        fontSize: 8,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
    },
    clientName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    clientEmail: {
        fontSize: 10,
        color: '#64748b',
        marginTop: 2,
    },
    tableLabel: {
        fontSize: 9,
        fontWeight: 'bold',
        color: '#0f172a',
        textTransform: 'uppercase',
        marginBottom: 10,
        letterSpacing: 0.5,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#0f172a',
        padding: 10,
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
    },
    tableHeaderCell: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 9,
        textTransform: 'uppercase',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
        padding: 10,
        alignItems: 'center',
    },
    tableCell: {
        fontSize: 9,
    },
    colFile: { width: '45%' },
    colPages: { width: '15%', textAlign: 'center' },
    colDensity: { width: '25%', textAlign: 'center' },
    colPrice: { width: '15%', textAlign: 'right' },

    transparencyClause: {
        marginTop: 15,
        padding: 12,
        backgroundColor: '#f8fafc',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    clauseTitle: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#475569',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    clauseText: {
        fontSize: 8,
        lineHeight: 1.5,
        color: '#64748b',
        fontStyle: 'italic',
    },

    financialWrapper: {
        marginTop: 30,
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    summaryTable: {
        width: '45%',
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    summaryLabel: {
        fontSize: 10,
        color: '#64748b',
    },
    summaryValue: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#1e293b',
    },
    totalHighlight: {
        backgroundColor: '#f8fafc',
        marginTop: 10,
        padding: 15,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#0f172a',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    totalLabel: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    totalValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#f58220',
    },

    paymentBox: {
        marginTop: 40,
        padding: 15,
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#cbd5e1',
    },
    paymentMethods: {
        flexDirection: 'row',
        gap: 15,
        marginTop: 10,
    },
    paymentTag: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#475569',
        backgroundColor: '#f1f5f9',
        padding: '3 8',
        borderRadius: 4,
    },

    footer: {
        position: 'absolute',
        bottom: 30,
        left: 50,
        right: 50,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        paddingTop: 15,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    footerContact: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#0f172a',
    },
    footerAddress: {
        fontSize: 8,
        color: '#94a3b8',
    }
});

interface ProposalPDFProps {
    order: any;
    globalSettings: any;
    logoBase64?: string | null;
}

export const ProposalPDF = ({ order, globalSettings, logoBase64 }: ProposalPDFProps) => {
    const metadata = typeof order.metadata === 'string' ? JSON.parse(order.metadata) : order.metadata;
    const documents = metadata?.documents || [];
    const breakdown = metadata?.breakdown || {};

    return (
        <Document title={`Proposta-Promobi-${order.id}`}>
            <Page size="A4" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <View>
                        {logoBase64 ? (
                            <Image src={logoBase64} style={styles.logo} />
                        ) : (
                            <Text style={{ color: '#f58220', fontWeight: 'bold', fontSize: 24 }}>PROMOBi</Text>
                        )}
                    </View>
                    <View style={styles.headerInfo}>
                        <Text style={styles.title}>Proposta de Serviços de Tradução Certificada</Text>
                        <Text style={styles.quoteNumber}>COTAÇÃO Nº {order.id}</Text>
                        <Text style={styles.date}>{new Date(order.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
                    </View>
                </View>

                {/* Client Block */}
                <View style={styles.clientBlock}>
                    <Text style={styles.clientLabel}>Preparado para:</Text>
                    <Text style={styles.clientName}>{order.user?.fullName?.toUpperCase() || 'CLIENTE'}</Text>
                    <Text style={styles.clientEmail}>{order.email}</Text>
                </View>

                {/* Raio-X Table */}
                <Text style={styles.tableLabel}>Raio-X Técnico dos Documentos</Text>

                <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderCell, styles.colFile]}>Nome do Arquivo</Text>
                    <Text style={[styles.tableHeaderCell, styles.colPages]}>Págs</Text>
                    <Text style={[styles.tableHeaderCell, styles.colDensity]}>Composição</Text>
                    <Text style={[styles.tableHeaderCell, styles.colPrice]}>Subtotal</Text>
                </View>

                {documents.map((doc: any, index: number) => {
                    // Extract strictly the final filename
                    const fileName = doc.fileName.split(/[/\\]/).pop() || doc.fileName;
                    const density = doc.analysis?.density || 'high';
                    const isScanned = doc.analysis?.pages?.some((p: any) => p.density === 'scanned') || density === 'scanned';

                    return (
                        <View key={index} style={styles.tableRow}>
                            <Text style={[styles.tableCell, styles.colFile]}>{fileName}</Text>
                            <Text style={[styles.tableCell, styles.colPages]}>{doc.count || 1}</Text>
                            <Text style={[styles.tableCell, styles.colDensity, { color: isScanned ? '#b91c1c' : '#475569' }]}>
                                {isScanned ? 'SCANNED (100%)' : `DENSIDADE ${density.toUpperCase()}`}
                            </Text>
                            <Text style={[styles.tableCell, styles.colPrice]}>
                                ${((doc.analysis?.totalPrice || 0) + (doc.notarized ? (globalSettings?.notaryFee || 25) : 0)).toFixed(2)}
                            </Text>
                        </View>
                    );
                })}

                {/* Transparency Clause */}
                <View style={styles.transparencyClause}>
                    <Text style={styles.clauseTitle}>Auditoria de Preço Justo</Text>
                    <Text style={styles.clauseText}>
                        Páginas escaneadas (não-pesquisáveis) requerem extração e formatação manual (DTP) por nossa equipe. Devido a este processamento humano, estas páginas são classificadas como "Alta Densidade".
                    </Text>
                </View>

                {/* Financial Summary */}
                <View style={styles.financialWrapper}>
                    <View style={styles.summaryTable}>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Subtotal</Text>
                            <Text style={styles.summaryValue}>${(breakdown.basePrice || 0).toFixed(2)}</Text>
                        </View>
                        {breakdown.notaryFee > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Taxas Notariais</Text>
                                <Text style={styles.summaryValue}>${(breakdown.notaryFee || 0).toFixed(2)}</Text>
                            </View>
                        )}
                        {breakdown.urgencyFee > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Urgência ({order.urgency})</Text>
                                <Text style={styles.summaryValue}>${(breakdown.urgencyFee || 0).toFixed(2)}</Text>
                            </View>
                        )}

                        <View style={styles.totalHighlight}>
                            <Text style={styles.totalLabel}>INVESTIMENTO TOTAL</Text>
                            <Text style={styles.totalValue}>${order.totalAmount?.toFixed(2)}</Text>
                        </View>
                    </View>
                </View>

                {/* Payment & Next Steps */}
                <View style={styles.paymentBox}>
                    <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#0f172a' }}>Métodos de Pagamento Disponíveis:</Text>
                    <View style={styles.paymentMethods}>
                        <Text style={styles.paymentTag}>ZELLE</Text>
                        <Text style={styles.paymentTag}>PIX / BOLETO</Text>
                        <Text style={styles.paymentTag}>STRIPE (CARTÃO)</Text>
                    </View>
                    <Text style={{ fontSize: 8, color: '#64748b', marginTop: 15, lineHeight: 1.4 }}>
                        A tradução será iniciada imediatamente após a confirmação do pagamento. O kit digital certificado será enviado para {order.email}.
                    </Text>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <View>
                        <Text style={styles.footerContact}>WhatsApp: (321) 324-5851 • info@promobi.us</Text>
                        <Text style={styles.footerAddress}>4700 Millenia Blvd, Orlando, FL 32839, USA</Text>
                    </View>
                    <Text style={{ fontSize: 8, color: '#f58220', fontWeight: 'bold' }}>www.promobi.us</Text>
                </View>
            </Page>
        </Document>
    );
};
