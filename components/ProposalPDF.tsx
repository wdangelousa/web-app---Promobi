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
import path from 'path';

// Helper to get absolute path for fonts in server-side
const getFontPath = (fontName: string) => path.join(process.cwd(), 'public', 'fonts', fontName);

// --- Font Registration ---
try {
    Font.register({
        family: 'Playfair Display',
        fonts: [
            { src: getFontPath('PlayfairDisplay-Bold.ttf'), fontWeight: 700 },
            { src: getFontPath('PlayfairDisplay-Black.ttf'), fontWeight: 900 }
        ]
    });

    Font.register({
        family: 'DM Sans',
        fonts: [
            { src: getFontPath('DMSans-Regular.ttf'), fontWeight: 400 },
            { src: getFontPath('DMSans-Medium.ttf'), fontWeight: 500 },
            { src: getFontPath('DMSans-Medium.ttf'), fontWeight: 600 }
        ]
    });

    Font.register({
        family: 'DM Mono',
        src: getFontPath('DMMono-Regular.ttf')
    });
} catch (e) {
    console.error("Font registration failed, falling back to defaults:", e);
}

const styles = StyleSheet.create({
    page: {
        fontFamily: 'DM Sans',
        backgroundColor: '#FFFFFF',
        color: '#1A1D23',
        paddingBottom: 80, // Space for sticky footer
    },
    // BLOCO 1 — CABEÇALHO
    header: {
        backgroundColor: '#1A1D23',
        padding: '30 40',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
    },
    headerAccent: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: '#E8751A',
    },
    logo: {
        height: 50,
        width: 'auto',
    },
    headerRight: {
        textAlign: 'right',
    },
    headerLabel: {
        fontSize: 10,
        color: '#E8751A',
        fontWeight: 600,
        letterSpacing: 2,
        marginBottom: 2,
    },
    headerNumber: {
        fontFamily: 'Playfair Display',
        fontSize: 32,
        fontWeight: 700,
        color: '#FFFFFF',
    },
    headerDate: {
        fontFamily: 'DM Mono',
        fontSize: 9,
        color: '#A0AEC0',
        marginTop: 4,
    },
    // BLOCO 2 — IDENTIFICAÇÃO DO CLIENTE
    clientSection: {
        padding: '40 40 20 40',
    },
    clientLabel: {
        fontSize: 8,
        color: '#5A6070',
        letterSpacing: 3,
        textTransform: 'uppercase',
        marginBottom: 10,
    },
    clientNameWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    clientBar: {
        width: 4,
        height: 28,
        backgroundColor: '#E8751A',
        marginRight: 10,
    },
    clientName: {
        fontFamily: 'Playfair Display',
        fontSize: 24,
        fontWeight: 700,
        color: '#1A1D23',
    },
    clientSub: {
        fontSize: 12,
        color: '#5A6070',
        marginLeft: 14,
    },
    // BLOCO 3 — RAIO-X TÉCNICO
    sectionTitle: {
        paddingHorizontal: 40,
        marginTop: 20,
        marginBottom: 15,
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionTitleText: {
        fontSize: 12,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 1,
        color: '#1A1D23',
        marginRight: 10,
    },
    sectionTitleLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#E8751A',
        opacity: 0.3,
    },
    // Tabela
    tableHeader: {
        backgroundColor: '#1A1D23',
        flexDirection: 'row',
        marginHorizontal: 40,
        padding: '8 12',
    },
    tableHeaderText: {
        fontSize: 8,
        color: '#FFFFFF',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    tableRow: {
        flexDirection: 'row',
        marginHorizontal: 40,
        padding: '12 12',
        borderBottomWidth: 1,
        borderBottomColor: '#E8EAEE',
        alignItems: 'center',
    },
    tableRowZebra: {
        backgroundColor: '#F5F6F8',
    },
    tableCell: {
        fontSize: 10,
        color: '#1A1D23',
    },
    colFile: { width: '35%' },
    colPages: { width: '10%', textAlign: 'center' },
    colComposition: { width: '10%', textAlign: 'center' },
    colDensity: { width: '30%' },
    colSubtotal: { width: '15%', textAlign: 'right' },

    fileName: {
        fontSize: 10,
        fontWeight: 500,
        color: '#1A1D23',
    },
    fileIcon: {
        fontSize: 8,
        fontWeight: 600,
        marginRight: 4,
        padding: '2 4',
        borderRadius: 3,
    },
    iconPDF: { backgroundColor: '#FEE2E2', color: '#B91C1C' },
    iconDOC: { backgroundColor: '#E0F2FE', color: '#0369A1' },

    pageCount: {
        fontFamily: 'DM Mono',
        fontSize: 10,
    },
    badgePill: {
        fontSize: 8,
        fontWeight: 600,
        color: '#E8751A',
        backgroundColor: 'rgba(232, 117, 26, 0.12)',
        padding: '3 6',
        borderRadius: 10,
        alignSelf: 'center',
    },
    densityDetails: {
        fontFamily: 'DM Mono',
        fontSize: 8,
        color: '#5A6070',
        lineHeight: 1.4,
    },
    subtotal: {
        fontFamily: 'DM Mono',
        fontSize: 11,
        fontWeight: 600,
    },
    // BLOCO 4 — AUDITORIA
    auditCard: {
        marginHorizontal: 40,
        marginTop: 20,
        backgroundColor: '#F5F6F8',
        borderLeftWidth: 4,
        borderLeftColor: '#E8751A',
        padding: 15,
        borderRadius: 4,
    },
    auditTitle: {
        fontSize: 9,
        fontWeight: 600,
        color: '#E8751A',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 6,
    },
    auditText: {
        fontSize: 10,
        color: '#5A6070',
        lineHeight: 1.5,
    },
    // BLOCO 5 — INVESTIMENTO TOTAL
    totalCard: {
        marginHorizontal: 40,
        marginTop: 30,
        backgroundColor: '#1A1D23',
        borderRadius: 12,
        padding: '25 35',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
    },
    totalCardGlow: {
        position: 'absolute',
        top: -40,
        right: -40,
        width: 140,
        height: 140,
        backgroundColor: '#E8751A',
        opacity: 0.08,
        borderRadius: 70,
    },
    totalLeft: {},
    totalLabel: {
        fontSize: 10,
        fontWeight: 600,
        color: '#A0AEC0',
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 5,
    },
    totalSub: {
        fontSize: 11,
        color: '#718096',
    },
    totalValue: {
        fontFamily: 'Playfair Display',
        fontSize: 40,
        fontWeight: 700,
        color: '#E8751A',
    },
    // BLOCO 6 — MÉTODOS DE PAGAMENTO
    paymentSection: {
        paddingHorizontal: 40,
        marginTop: 30,
    },
    paymentLabel: {
        fontSize: 9,
        fontWeight: 600,
        color: '#5A6070',
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    paymentCards: {
        flexDirection: 'row',
        gap: 12,
    },
    paymentCard: {
        flex: 1,
        borderWidth: 1.5,
        borderColor: '#E8EAEE',
        borderRadius: 10,
        padding: 12,
    },
    paymentTitle: {
        fontSize: 10,
        fontWeight: 600,
        color: '#1A1D23',
        marginBottom: 4,
    },
    paymentText: {
        fontSize: 8,
        color: '#5A6070',
    },
    // BLOCO 7 — RODAPÉ
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#F5F6F8',
        padding: '25 40',
        borderTopWidth: 1,
        borderTopColor: '#E8EAEE',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    footerLeft: {},
    footerAddress: {
        fontSize: 8,
        color: '#1A1D23',
        marginBottom: 4,
    },
    footerContact: {
        fontSize: 8,
        color: '#5A6070',
    },
    footerLink: {
        fontSize: 9,
        fontWeight: 600,
        color: '#E8751A',
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

    const totalPages = documents.reduce((acc: number, doc: any) => acc + (doc.count || 0), 0);
    const totalDocs = documents.length;

    return (
        <Document title={`Proposta-Promobi-${order.id}`}>
            <Page size="A4" style={styles.page}>
                {/* BLOCO 1 — CABEÇALHO */}
                <View style={styles.header}>
                    <View>
                        {logoBase64 ? (
                            <Image src={logoBase64} style={styles.logo} />
                        ) : (
                            <Text style={{ color: '#E8751A', fontWeight: 900, fontSize: 22 }}>PROMOBi</Text>
                        )}
                    </View>
                    <View style={styles.headerRight}>
                        <Text style={styles.headerLabel}>COTAÇÃO</Text>
                        <Text style={styles.headerNumber}>#{order.id}</Text>
                        <Text style={styles.headerDate}>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</Text>
                    </View>
                    <View style={styles.headerAccent} />
                </View>

                {/* BLOCO 2 — IDENTIFICAÇÃO DO CLIENTE */}
                <View style={styles.clientSection}>
                    <Text style={styles.clientLabel}>PROPOSTA PREPARADA PARA</Text>
                    <View style={styles.clientNameWrapper}>
                        <View style={styles.clientBar} />
                        <Text style={styles.clientName}>{order.user?.fullName || 'Cliente Promobi'}</Text>
                    </View>
                    <Text style={styles.clientSub}>Serviços de Tradução Certificada · Pacote Completo</Text>
                </View>

                {/* BLOCO 3 — RAIO-X TÉCNICO */}
                <View style={styles.sectionTitle}>
                    <Text style={styles.sectionTitleText}>Raio-X Técnico dos Documentos</Text>
                    <View style={styles.sectionTitleLine} />
                </View>

                <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderText, styles.colFile]}>ARQUIVO</Text>
                    <Text style={[styles.tableHeaderText, styles.colPages]}>PÁGS</Text>
                    <Text style={[styles.tableHeaderText, styles.colComposition]}>COMP.</Text>
                    <Text style={[styles.tableHeaderText, styles.colDensity]}>DENSIDADE (POR PÁGINA)</Text>
                    <Text style={[styles.tableHeaderText, styles.colSubtotal]}>SUBTOTAL</Text>
                </View>

                {documents.map((doc: any, idx: number) => {
                    const fileName = doc.fileName.split(/[/\\]/).pop() || doc.fileName;
                    const isPDF = fileName.toLowerCase().endsWith('.pdf');
                    const isZebra = idx % 2 !== 0;

                    // Density Detail Logic
                    let densityDetail = "Pág. 1 -> Alta Densidade";
                    if (doc.analysis?.pages) {
                        const pages = doc.analysis.pages;
                        if (pages.length === 1) {
                            const p = pages[0];
                            const desc = p.density === 'scanned' ? '(escaneada)' : p.density === 'high' ? '(formatação complexa)' : '';
                            densityDetail = `Pág. 1 → ${p.density === 'scanned' ? 'Alta' : p.density.charAt(0).toUpperCase() + p.density.slice(1)} Densidade ${desc}`;
                        } else {
                            // Simple grouping for multiple pages
                            const firstP = pages[0];
                            const lastP = pages[pages.length - 1];
                            const allSame = pages.every((p: any) => p.density === firstP.density);
                            if (allSame) {
                                const desc = firstP.density === 'scanned' ? '(escaneadas, DTP completo)' : '';
                                densityDetail = `Págs. 1–${pages.length} → ${firstP.density === 'scanned' ? 'Alta' : firstP.density.charAt(0).toUpperCase() + firstP.density.slice(1)} Densidade ${desc}`;
                            } else {
                                densityDetail = pages.map((p: any) => `Pág. ${p.pageNumber}: ${p.density.toUpperCase()}`).join(', ');
                            }
                        }
                    }

                    return (
                        <View key={idx} style={[styles.tableRow, isZebra && styles.tableRowZebra]}>
                            <View style={[styles.colFile, { flexDirection: 'row', alignItems: 'center' }]}>
                                <Text style={[styles.fileIcon, isPDF ? styles.iconPDF : styles.iconDOC]}>
                                    {isPDF ? 'PDF' : 'DOC'}
                                </Text>
                                <Text style={styles.fileName}>{fileName}</Text>
                            </View>
                            <Text style={[styles.tableCell, styles.colPages, styles.pageCount]}>{doc.count || 1}</Text>
                            <View style={styles.colComposition}>
                                <Text style={styles.badgePill}>⚡ HIGH</Text>
                            </View>
                            <View style={styles.colDensity}>
                                <Text style={styles.densityDetails}>{densityDetail || 'Densidade Alta'}</Text>
                            </View>
                            <Text style={[styles.tableCell, styles.colSubtotal, styles.subtotal]}>
                                ${((doc.analysis?.totalPrice || 0) + (doc.notarized ? (globalSettings?.notaryFee || 25) : 0)).toFixed(2)}
                            </Text>
                        </View>
                    );
                })}

                {/* BLOCO 4 — AUDITORIA DE PREÇO JUSTO */}
                <View style={styles.auditCard}>
                    <Text style={styles.auditTitle}>Auditoria de Preço Justo</Text>
                    <Text style={styles.auditText}>
                        Páginas escaneadas (não-pesquisáveis) requerem extração e formatação manual (DTP) por nossa equipe. Devido a este processamento humano, estas páginas são classificadas como "Alta Densidade", com custo unitário variável conforme complexidade tipográfica e de layout.
                    </Text>
                </View>

                {/* BLOCO 5 — INVESTIMENTO TOTAL */}
                <View style={styles.totalCard}>
                    <View style={styles.totalCardGlow} />
                    <View style={styles.totalLeft}>
                        <Text style={styles.totalLabel}>INVESTIMENTO TOTAL</Text>
                        <Text style={styles.totalSub}>{totalPages} páginas · {totalDocs} documentos · Tradução certificada</Text>
                    </View>
                    <Text style={styles.totalValue}>${order.totalAmount?.toFixed(2)}</Text>
                </View>

                {/* BLOCO 6 — MÉTODOS DE PAGAMENTO */}
                <View style={styles.paymentSection}>
                    <Text style={styles.paymentLabel}>FORMAS DE PAGAMENTO</Text>
                    <View style={styles.paymentCards}>
                        <View style={styles.paymentCard}>
                            <Text style={styles.paymentTitle}>💚 ZELLE</Text>
                            <Text style={styles.paymentText}>Transferência instantânea EUA</Text>
                        </View>
                        <View style={styles.paymentCard}>
                            <Text style={styles.paymentTitle}>🇧🇷 PIX / BOLETO</Text>
                            <Text style={styles.paymentText}>Pagamento via Brasil</Text>
                        </View>
                        <View style={styles.paymentCard}>
                            <Text style={styles.paymentTitle}>💳 STRIPE</Text>
                            <Text style={styles.paymentText}>Cartão de crédito ou débito</Text>
                        </View>
                    </View>
                </View>

                {/* BLOCO 7 — RODAPÉ */}
                <View style={styles.footer}>
                    <View style={styles.footerLeft}>
                        <Text style={styles.footerAddress}>4700 Millenia Blvd, Orlando, FL 32839, USA</Text>
                        <Text style={styles.footerContact}>(321) 324-5851 · info@promobi.us</Text>
                    </View>
                    <Text style={styles.footerLink}>www.promobi.us</Text>
                </View>
            </Page>
        </Document>
    );
};
