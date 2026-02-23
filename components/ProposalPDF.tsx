// components/ProposalPDF.tsx
//
// ✅ FIX "Unknown font format": Removidas TODAS as fontes customizadas (.ttf)
// que falham na Vercel (o filesystem /public não existe no Lambda runtime).
// Usando apenas fontes built-in do @react-pdf/renderer:
//   - Helvetica / Helvetica-Bold / Helvetica-Oblique
//   - Courier (monospace, para números e código)
// O design mantém a identidade visual via cores e layout.

import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const C = {
  orange: '#E8751A',
  dark:   '#1A1D23',
  gray:   '#5A6070',
  light:  '#F5F6F8',
  border: '#E8EAEE',
  white:  '#FFFFFF',
  muted:  '#A0AEC0',
  dimmed: '#718096',
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    backgroundColor: C.white,
    color: C.dark,
    paddingBottom: 90,
    fontSize: 10,
  },

  // ── HEADER ─────────────────────────────────────────────────────────────
  header: {
    backgroundColor: C.dark,
    paddingHorizontal: 40,
    paddingVertical: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerAccent: { height: 3, backgroundColor: C.orange },
  logo:         { height: 44, width: 'auto' },
  logoFallback: { color: C.orange, fontFamily: 'Helvetica-Bold', fontSize: 22 },
  headerRight:  { alignItems: 'flex-end' },
  headerLabel:  { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.orange, letterSpacing: 2, marginBottom: 3 },
  headerNumber: { fontFamily: 'Helvetica-Bold', fontSize: 30, color: C.white },
  headerDate:   { fontFamily: 'Courier', fontSize: 8, color: C.muted, marginTop: 3 },

  // ── CLIENT ─────────────────────────────────────────────────────────────
  clientSection: { paddingHorizontal: 40, paddingTop: 34, paddingBottom: 16 },
  clientLabel:   { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.gray, letterSpacing: 3, marginBottom: 10 },
  clientRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  clientBar:     { width: 4, height: 26, backgroundColor: C.orange, marginRight: 10 },
  clientName:    { fontFamily: 'Helvetica-Bold', fontSize: 22, color: C.dark },
  clientSub:     { fontSize: 11, color: C.gray, marginLeft: 14 },

  // ── SECTION TITLE ──────────────────────────────────────────────────────
  sectionTitle:     { paddingHorizontal: 40, marginTop: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  sectionTitleText: { fontFamily: 'Helvetica-Bold', fontSize: 9, letterSpacing: 1, color: C.dark, marginRight: 10 },
  sectionTitleLine: { flex: 1, height: 1, backgroundColor: C.orange, opacity: 0.3 },

  // ── TABLE ──────────────────────────────────────────────────────────────
  tableHead:     { backgroundColor: C.dark, flexDirection: 'row', marginHorizontal: 40, paddingHorizontal: 12, paddingVertical: 7 },
  tableHeadCell: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.white, letterSpacing: 0.5 },
  tableRow:      { flexDirection: 'row', marginHorizontal: 40, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border, alignItems: 'center' },
  tableRowAlt:   { backgroundColor: C.light },

  colFile:     { width: '36%' },
  colPages:    { width: '9%',  textAlign: 'center' },
  colComp:     { width: '10%', textAlign: 'center' },
  colDensity:  { width: '30%' },
  colSubtotal: { width: '15%', textAlign: 'right' },

  fileRow:    { flexDirection: 'row', alignItems: 'center' },
  fileTag:    { fontFamily: 'Helvetica-Bold', fontSize: 7, marginRight: 5, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 3 },
  tagPDF:     { backgroundColor: '#FEE2E2', color: '#B91C1C' },
  tagDOC:     { backgroundColor: '#E0F2FE', color: '#0369A1' },
  tagLNK:     { backgroundColor: '#D1FAE5', color: '#065F46' },
  fileName:   { fontSize: 9, color: C.dark },

  monoCell:   { fontFamily: 'Courier', fontSize: 10, color: C.dark },
  badge:      { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.orange, backgroundColor: 'rgba(232,117,26,0.12)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8 },
  densityTxt: { fontFamily: 'Courier', fontSize: 7, color: C.gray, lineHeight: 1.4 },
  subtotalTxt:{ fontFamily: 'Helvetica-Bold', fontSize: 11, color: C.dark },

  // ── AUDIT ──────────────────────────────────────────────────────────────
  auditBox:   { marginHorizontal: 40, marginTop: 16, backgroundColor: C.light, borderLeftWidth: 4, borderLeftColor: C.orange, padding: 14, borderRadius: 4 },
  auditTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.orange, letterSpacing: 1, marginBottom: 5 },
  auditText:  { fontSize: 9, color: C.gray, lineHeight: 1.5 },

  // ── TOTAL ──────────────────────────────────────────────────────────────
  totalBox:   { marginHorizontal: 40, marginTop: 24, backgroundColor: C.dark, borderRadius: 10, paddingHorizontal: 32, paddingVertical: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.muted, letterSpacing: 2, marginBottom: 4 },
  totalSub:   { fontSize: 9, color: C.dimmed },
  totalValue: { fontFamily: 'Helvetica-Bold', fontSize: 36, color: C.orange },

  // ── PAYMENT ────────────────────────────────────────────────────────────
  paySection: { paddingHorizontal: 40, marginTop: 24 },
  payLabel:   { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.gray, letterSpacing: 2, marginBottom: 10 },
  payRow:     { flexDirection: 'row', gap: 10 },
  payCard:    { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 8, padding: 10 },
  payTitle:   { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.dark, marginBottom: 3 },
  payText:    { fontSize: 8, color: C.gray },

  // ── FOOTER ─────────────────────────────────────────────────────────────
  footer:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.light, paddingHorizontal: 40, paddingVertical: 18, borderTopWidth: 1, borderTopColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerAddress: { fontSize: 8, color: C.dark, marginBottom: 3 },
  footerContact: { fontSize: 8, color: C.gray },
  footerLink:    { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.orange },
});

// ─── helpers ──────────────────────────────────────────────────────────────────

const safeMetadata = (raw: any) => {
  try {
    if (!raw) return {};
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return {}; }
};

const safeDatePT = (val: any) => {
  try { return new Date(val).toLocaleDateString('pt-BR'); }
  catch { return new Date().toLocaleDateString('pt-BR'); }
};

const densityLabel = (doc: any, isLink: boolean): string => {
  const pages = doc.analysis?.pages;
  if (!pages?.length) return isLink ? 'Documento via link externo' : 'Pag. 1 -> Alta Densidade';
  const allSame = pages.every((p: any) => p.density === pages[0].density);
  const fmt = (d: string) => d === 'scanned' ? 'Alta (escaneada)' : d.charAt(0).toUpperCase() + d.slice(1);
  if (pages.length === 1) return `Pag. 1 -> ${fmt(pages[0].density)} Densidade`;
  if (allSame) return `Pags. 1-${pages.length} -> ${fmt(pages[0].density)} Densidade`;
  return pages.map((p: any) => `P${p.pageNumber}:${p.density.toUpperCase()}`).join(' | ');
};

// ─── component ────────────────────────────────────────────────────────────────

interface ProposalPDFProps {
  order: any;
  globalSettings: any;
  logoBase64?: string | null;
}

export const ProposalPDF = ({ order, globalSettings, logoBase64 }: ProposalPDFProps) => {
  const metadata   = safeMetadata(order?.metadata);
  const documents  = metadata?.documents ?? [];
  const totalPages = documents.reduce((s: number, d: any) => s + (d.count || 0), 0);
  const totalDocs  = documents.length;
  const totalAmt   = typeof order?.totalAmount === 'number' ? order.totalAmount : 0;

  return (
    <Document title={`Proposta-Promobi-${order?.id}`}>
      <Page size="A4" style={styles.page}>

        {/* HEADER */}
        <View style={styles.header}>
          <View>
            {logoBase64
              ? <Image src={logoBase64} style={styles.logo} />
              : <Text style={styles.logoFallback}>PROMOBi</Text>}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerLabel}>COTACAO</Text>
            <Text style={styles.headerNumber}>#{order?.id}</Text>
            <Text style={styles.headerDate}>{safeDatePT(order?.createdAt)}</Text>
          </View>
        </View>
        <View style={styles.headerAccent} />

        {/* CLIENT */}
        <View style={styles.clientSection}>
          <Text style={styles.clientLabel}>PROPOSTA PREPARADA PARA</Text>
          <View style={styles.clientRow}>
            <View style={styles.clientBar} />
            <Text style={styles.clientName}>{order?.user?.fullName || 'Cliente Promobi'}</Text>
          </View>
          <Text style={styles.clientSub}>Servicos de Traducao Certificada · Pacote Completo</Text>
        </View>

        {/* TABLE */}
        <View style={styles.sectionTitle}>
          <Text style={styles.sectionTitleText}>RAIO-X TECNICO DOS DOCUMENTOS</Text>
          <View style={styles.sectionTitleLine} />
        </View>

        <View style={styles.tableHead}>
          <Text style={[styles.tableHeadCell, styles.colFile]}>ARQUIVO</Text>
          <Text style={[styles.tableHeadCell, styles.colPages]}>PAGS</Text>
          <Text style={[styles.tableHeadCell, styles.colComp]}>COMP.</Text>
          <Text style={[styles.tableHeadCell, styles.colDensity]}>DENSIDADE</Text>
          <Text style={[styles.tableHeadCell, styles.colSubtotal]}>SUBTOTAL</Text>
        </View>

        {documents.length === 0
          ? <View style={styles.tableRow}><Text style={{ color: C.gray }}>Nenhum documento.</Text></View>
          : documents.map((doc: any, idx: number) => {
              const rawName  = doc.fileName || doc.exactNameOnDoc || `Documento ${idx + 1}`;
              const fileName = (rawName.split(/[/\\]/).pop() || rawName) as string;
              const isPDF    = fileName.toLowerCase().endsWith('.pdf');
              const isLink   = !!doc.externalLink;
              const subtotal = (doc.analysis?.totalPrice || (doc.count || 1) * (globalSettings?.basePrice || 9))
                             + (doc.notarized ? (globalSettings?.notaryFee || 25) : 0);

              return (
                <View key={idx} style={[styles.tableRow, idx % 2 !== 0 ? styles.tableRowAlt : {}]}>
                  <View style={[styles.colFile, styles.fileRow]}>
                    <Text style={[styles.fileTag, isLink ? styles.tagLNK : isPDF ? styles.tagPDF : styles.tagDOC]}>
                      {isLink ? 'LNK' : isPDF ? 'PDF' : 'DOC'}
                    </Text>
                    <Text style={styles.fileName} {...({ numberOfLines: 1 } as any)}>{fileName}</Text>
                  </View>
                  <Text style={[styles.monoCell, styles.colPages]}>{doc.count || 1}</Text>
                  <View style={[styles.colComp, { alignItems: 'center' }]}>
                    <Text style={styles.badge}>HIGH</Text>
                  </View>
                  <View style={styles.colDensity}>
                    <Text style={styles.densityTxt}>{densityLabel(doc, isLink)}</Text>
                  </View>
                  <Text style={[styles.subtotalTxt, styles.colSubtotal]}>${subtotal.toFixed(2)}</Text>
                </View>
              );
            })
        }

        {/* AUDIT */}
        <View style={styles.auditBox}>
          <Text style={styles.auditTitle}>AUDITORIA DE PRECO JUSTO</Text>
          <Text style={styles.auditText}>
            Paginas escaneadas requerem extracao e formatacao manual (DTP) pela nossa equipe.
            Classificadas como Alta Densidade com custo unitario conforme complexidade de layout.
          </Text>
        </View>

        {/* TOTAL */}
        <View style={styles.totalBox}>
          <View>
            <Text style={styles.totalLabel}>INVESTIMENTO TOTAL</Text>
            <Text style={styles.totalSub}>{totalPages} pags. · {totalDocs} docs · Traducao certificada</Text>
          </View>
          <Text style={styles.totalValue}>${totalAmt.toFixed(2)}</Text>
        </View>

        {/* PAYMENT */}
        <View style={styles.paySection}>
          <Text style={styles.payLabel}>FORMAS DE PAGAMENTO</Text>
          <View style={styles.payRow}>
            {[
              { title: 'ZELLE',        sub: 'Transferencia instantanea EUA' },
              { title: 'PIX / BOLETO', sub: 'Pagamento via Brasil'          },
              { title: 'STRIPE',       sub: 'Cartao de credito ou debito'   },
            ].map((p, i) => (
              <View key={i} style={styles.payCard}>
                <Text style={styles.payTitle}>{p.title}</Text>
                <Text style={styles.payText}>{p.sub}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
          <View>
            <Text style={styles.footerAddress}>4700 Millenia Blvd, Orlando, FL 32839, USA</Text>
            <Text style={styles.footerContact}>(321) 324-5851 · info@promobi.us</Text>
          </View>
          <Text style={styles.footerLink}>www.promobi.us</Text>
        </View>

      </Page>
    </Document>
  );
};
