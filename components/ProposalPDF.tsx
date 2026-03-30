// components/ProposalPDF.tsx · v6 — Reescrito do zero
// Página 1 = capa (sem docs). Páginas 2..N-1 = docs (10/página). Última = investimento.

import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { deriveProposalFinancialSummary } from '@/lib/proposalPricingSummary';
import { resolveStoredOrCalculatedDueDate } from '@/lib/orderDueDate';
import { cleanDocumentName } from '@/lib/proposalUtils';

// ─── Colors ──────────────────────────────────────────────────────────────────
const C = {
  bronze: '#B87333', copper: '#8B5A2B', gold: '#C8963E',
  text: '#1F1A14', sub: '#6B6055', muted: '#A89C90',
  border: '#E8D5C0', cream: '#F5F1EB', page: '#FAFAF7', white: '#FFFFFF',
  green: '#2D8B5F', greenBg: '#E8F5E9', greenBorder: '#A5D6A7',
  coral: '#D4785A', red: '#C94A4A', blue: '#4A7FB5',
  amber: '#D97706', amberBg: '#FEF3C7',
};

const DENSITY: Record<string, { label: string; color: string; bg: string }> = {
  high:     { label: 'ALTA',      color: C.coral, bg: '#FDE8E0' },
  medium:   { label: 'MÉDIA',     color: C.amber, bg: C.amberBg },
  low:      { label: 'BAIXA',     color: C.blue,  bg: '#DBEAFE' },
  blank:    { label: 'GRÁTIS',    color: C.green, bg: C.greenBg },
  scanned:  { label: 'ESCANEADA', color: C.red,   bg: '#FEE2E2' },
};
const getDen = (d: string) => DENSITY[d] || DENSITY.high;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const safeMeta = (raw: any) => {
  try { return typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {}); } catch { return {}; }
};
const fmtDate = (val: any) => {
  try { return new Date(val).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return ''; }
};
const fmtDateShort = (val: any) => {
  try { return new Date(val).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return ''; }
};
const docName = (raw: string, idx: number) =>
  cleanDocumentName((raw || '').split(/[/\\]/).pop() || `Documento ${idx + 1}`);

const buildRanges = (pages: any[]) => {
  if (!pages?.length) return [];
  const sorted = [...pages].sort((a: any, b: any) => a.pageNumber - b.pageNumber);
  const groups: { start: number; end: number; density: string; price: number }[] = [];
  let cur = { start: sorted[0].pageNumber, end: sorted[0].pageNumber, density: sorted[0].density, price: sorted[0].price || 0 };
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    if (p.density === cur.density && p.pageNumber === cur.end + 1) { cur.end = p.pageNumber; }
    else { groups.push({ ...cur }); cur = { start: p.pageNumber, end: p.pageNumber, density: p.density, price: p.price || 0 }; }
  }
  groups.push(cur);
  return groups.map(g => ({
    label: g.start === g.end ? `Pág. ${g.start}` : `Págs. ${g.start}\u2013${g.end}`,
    density: g.density, price: g.price,
  }));
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: C.white, color: C.text, fontSize: 9, paddingBottom: 44 },

  // Cover header
  coverHdr: { backgroundColor: C.bronze, paddingHorizontal: 36, paddingTop: 24, paddingBottom: 20 },
  coverRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { width: 56, height: 56, objectFit: 'contain' },
  coverBadge: { fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: 'rgba(255,255,255,0.75)', letterSpacing: 2, marginTop: 6 },
  coverRight: { alignItems: 'flex-end' },
  coverQuoteLbl: { fontFamily: 'Helvetica-Bold', fontSize: 6, color: 'rgba(255,255,255,0.5)', letterSpacing: 3 },
  coverQuoteNum: { fontFamily: 'Helvetica-Bold', fontSize: 26, color: C.white, marginTop: 1 },
  coverDate: { fontSize: 7.5, color: 'rgba(255,255,255,0.65)', marginTop: 3 },
  accent: { height: 3, backgroundColor: C.gold },

  // Client
  clientBox: { paddingHorizontal: 36, paddingTop: 14, paddingBottom: 10, backgroundColor: C.page, borderBottomWidth: 1, borderBottomColor: C.border },
  clientName: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.text },
  clientEmail: { fontSize: 8, color: C.sub, marginTop: 2 },
  clientExpiry: { fontSize: 7.5, color: C.bronze, marginTop: 2, fontFamily: 'Helvetica-Bold' },

  // Pills
  pillRow: { flexDirection: 'row', paddingHorizontal: 36, paddingTop: 12, gap: 6 },
  pill: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 7, paddingVertical: 8, alignItems: 'center', backgroundColor: C.white },
  pillVal: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: C.text },
  pillBronze: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: C.bronze },
  pillLbl: { fontSize: 6.5, color: C.muted, marginTop: 2, letterSpacing: 0.5 },

  // Density bars
  densSection: { paddingHorizontal: 36, paddingTop: 10 },
  densTitle: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.text, letterSpacing: 1.2, marginBottom: 6 },
  densRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  densLabel: { fontFamily: 'Helvetica-Bold', fontSize: 6, width: 56, paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 3, textAlign: 'center' },
  densBar: { flex: 1, height: 7, backgroundColor: C.cream, borderRadius: 3, marginHorizontal: 5, overflow: 'hidden' },
  densFill: { height: 7, borderRadius: 3 },
  densCount: { fontSize: 6.5, color: C.sub, width: 50, textAlign: 'right' },

  // Benefits
  benefitsBox: { marginHorizontal: 36, marginTop: 8, borderWidth: 1, borderColor: C.greenBorder, borderRadius: 6, backgroundColor: C.greenBg, paddingHorizontal: 12, paddingVertical: 8 },
  benefitsTitle: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.green, letterSpacing: 0.5, marginBottom: 4 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  benefitText: { fontSize: 7.5, color: '#1B5E20', flex: 1 },
  benefitAmt: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: C.green },

  // Pricing
  priceBox: { marginHorizontal: 36, marginTop: 8, borderWidth: 1, borderColor: C.border, borderRadius: 6, overflow: 'hidden' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 5 },
  priceAlt: { backgroundColor: C.page },
  priceLbl: { fontSize: 8, color: C.sub },
  priceVal: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.text },
  priceGreen: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.green },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.text },
  totalLbl: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.muted, letterSpacing: 1.5 },
  totalVal: { fontFamily: 'Helvetica-Bold', fontSize: 20, color: C.bronze },

  // Methodology
  methBox: { marginHorizontal: 36, marginTop: 8, backgroundColor: C.page, borderLeftWidth: 3, borderLeftColor: C.bronze, borderRadius: 3, paddingHorizontal: 10, paddingVertical: 6 },
  methTitle: { fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: C.bronze, letterSpacing: 0.5, marginBottom: 2 },
  methText: { fontSize: 7, color: C.sub, lineHeight: 1.5 },

  // Doc pages header
  contHdr: { backgroundColor: C.bronze, paddingHorizontal: 36, paddingVertical: 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.white },
  contSub: { fontSize: 7, color: 'rgba(255,255,255,0.65)' },

  // Section label
  secRow: { paddingHorizontal: 28, paddingTop: 10, paddingBottom: 6, flexDirection: 'row', alignItems: 'center' },
  secDot: { width: 5, height: 5, backgroundColor: C.bronze, borderRadius: 3, marginRight: 7 },
  secLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.text, letterSpacing: 1.2 },
  secLine: { flex: 1, height: 1, backgroundColor: C.border, marginLeft: 8 },

  // Doc row (compact)
  docRow: { marginHorizontal: 20, borderBottomWidth: 0.5, borderBottomColor: C.border, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  docRowAlt: { backgroundColor: C.cream },
  docLeft: { flex: 1, marginRight: 10 },
  docTopRow: { flexDirection: 'row', alignItems: 'center' },
  docTag: { fontFamily: 'Helvetica-Bold', fontSize: 5.5, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, marginRight: 6 },
  docTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.text, flex: 1 },
  docMeta: { fontSize: 6.5, color: C.muted, marginTop: 2 },
  docRight: { alignItems: 'flex-end' },
  docPages: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.sub },
  docPrice: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.bronze, marginTop: 1 },

  // Footer
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopWidth: 0.5, borderTopColor: C.border, paddingHorizontal: 36, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.white },
  footerL: { fontSize: 6.5, color: C.sub },
  footerR: { fontSize: 6.5, color: C.muted, textAlign: 'right' },
});

// ─── Footer component ────────────────────────────────────────────────────────
const Footer = ({ pageNum, total }: { pageNum: number; total: number }) => (
  <View style={S.footer}>
    <View>
      <Text style={S.footerL}>3300 Greenwald Way N, Kissimmee, FL 34741, USA</Text>
      <Text style={{ ...S.footerL, marginTop: 1 }}>(321) 324-5851 · desk@promobidocs.com · www.promobidocs.com</Text>
    </View>
    <Text style={S.footerR}>Página {pageNum} de {total}</Text>
  </View>
);

// ─── Main component ──────────────────────────────────────────────────────────
interface Props { order: any; globalSettings: any; logoBase64?: string | null; }

export const ProposalPDF = ({ order, globalSettings, logoBase64 }: Props) => {
  const meta = safeMeta(order?.metadata);
  const docs = meta?.documents ?? [];
  const base = globalSettings?.basePrice || 9;
  const fin = deriveProposalFinancialSummary({
    totalAmount: order?.totalAmount, extraDiscount: order?.extraDiscount, metadata: order?.metadata,
  });

  const clientName = order?.user?.fullName || 'Cliente';
  const clientEmail = order?.user?.email || '';
  const dueDate = resolveStoredOrCalculatedDueDate({
    dueDate: order?.dueDate ?? meta?.dueDate, createdAt: order?.createdAt,
    urgency: order?.urgency, settings: globalSettings,
  });
  const dueDateLabel = dueDate ? fmtDate(dueDate) : null;
  const expiresAt = order?.proposalExpiresAt
    ? fmtDateShort(order.proposalExpiresAt)
    : fmtDateShort(new Date(new Date(order?.createdAt || Date.now()).getTime() + 7 * 86400000));

  const totalPages = docs.reduce((s: number, d: any) => {
    const ap = d.analysis?.pages || [];
    return s + (ap.length > 0 ? ap.filter((p: any) => p.included !== false).length : (d.count || 0));
  }, 0);

  // Density distribution
  const densCounts: Record<string, number> = {};
  let totalInc = 0;
  docs.forEach((d: any) => {
    (d.analysis?.pages || []).filter((p: any) => p.included !== false).forEach((p: any) => {
      densCounts[p.density || 'high'] = (densCounts[p.density || 'high'] || 0) + 1;
      totalInc++;
    });
  });
  const densOrder = ['blank', 'low', 'medium', 'high', 'scanned'];
  const densBars = densOrder.filter(d => densCounts[d] > 0).map(d => ({
    density: d, count: densCounts[d], pct: Math.round((densCounts[d] / totalInc) * 100),
  }));

  // Benefits
  const benefits: { text: string; amt: number }[] = [];
  if (fin.totalSavings > 0.01) {
    const excl = docs.reduce((s: number, d: any) =>
      s + (d.analysis?.pages || []).filter((p: any) => p.included === false).length, 0);
    if (excl > 0) benefits.push({ text: `Auditoria: ${excl} páginas removidas`, amt: fin.totalSavings });
  }
  if (fin.manualDiscountAmount > 0) {
    const pct = fin.manualDiscountType === 'percent' ? ` (${fin.manualDiscountValue}%)` : '';
    benefits.push({ text: `Desconto concedido${pct}`, amt: fin.manualDiscountAmount });
  }

  // Urgency
  const urgMap: Record<string, string> = { standard: 'Standard', normal: 'Standard', urgent: 'Express (48h)', flash: 'Ultra Express (24h)' };
  const urgLabel = urgMap[order?.urgency] || 'Standard';

  // Pagination: 10 docs per page
  const PER = 10;
  const docChunks: any[][] = [];
  for (let i = 0; i < docs.length; i += PER) docChunks.push(docs.slice(i, i + PER));
  if (!docChunks.length) docChunks.push([]);
  const totalPdf = 1 + docChunks.length; // cover + doc pages (last doc page has investment)

  return (
    <Document>

      {/* ═══════════════════════════════ PAGE 1: COVER ═══════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <View style={S.coverHdr}>
          <View style={S.coverRow}>
            <View>
              {logoBase64 ? <Image src={logoBase64} style={S.logo} /> : <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 18, color: C.white }}>PROMOBIDOCS</Text>}
              <Text style={S.coverBadge}>TRADUÇÃO CERTIFICADA · USCIS ACCEPTED</Text>
            </View>
            <View style={S.coverRight}>
              <Text style={S.coverQuoteLbl}>COTAÇÃO</Text>
              <Text style={S.coverQuoteNum}>#{order?.id}</Text>
              <Text style={S.coverDate}>{fmtDate(order?.createdAt)}</Text>
            </View>
          </View>
        </View>
        <View style={S.accent} />

        <View style={S.clientBox}>
          <Text style={S.clientName}>{clientName}</Text>
          {clientEmail ? <Text style={S.clientEmail}>{clientEmail}</Text> : null}
          {expiresAt ? <Text style={S.clientExpiry}>Proposta válida até {expiresAt}</Text> : null}
        </View>

        <View style={S.pillRow}>
          <View style={S.pill}><Text style={S.pillVal}>{docs.length}</Text><Text style={S.pillLbl}>DOCUMENTOS</Text></View>
          <View style={S.pill}><Text style={S.pillVal}>{totalPages}</Text><Text style={S.pillLbl}>PÁGINAS</Text></View>
          <View style={S.pill}><Text style={S.pillBronze}>${fin.totalPayable.toFixed(2)}</Text><Text style={S.pillLbl}>TOTAL USD</Text></View>
        </View>

        {densBars.length > 0 && (
          <View style={S.densSection}>
            <Text style={S.densTitle}>DISTRIBUIÇÃO DE DENSIDADE</Text>
            {densBars.map(bar => {
              const cfg = getDen(bar.density);
              return (
                <View key={bar.density} style={S.densRow}>
                  <Text style={[S.densLabel, { color: cfg.color, backgroundColor: cfg.bg }]}>{cfg.label}</Text>
                  <View style={S.densBar}><View style={[S.densFill, { width: `${bar.pct}%`, backgroundColor: cfg.color }]} /></View>
                  <Text style={S.densCount}>{bar.count} págs ({bar.pct}%)</Text>
                </View>
              );
            })}
          </View>
        )}

        {benefits.length > 0 && (
          <View style={S.benefitsBox}>
            <Text style={S.benefitsTitle}>BENEFÍCIOS DESTA PROPOSTA</Text>
            {benefits.map((b, i) => (
              <View key={i} style={S.benefitRow}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.green, marginRight: 5 }}>✓</Text>
                <Text style={S.benefitText}>{b.text}</Text>
                <Text style={S.benefitAmt}>-${b.amt.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={S.priceBox}>
          <View style={S.priceRow}><Text style={S.priceLbl}>Subtotal tradução ({totalPages} págs)</Text><Text style={S.priceVal}>${fin.billableBasePrice.toFixed(2)}</Text></View>
          {fin.urgencyFee > 0 && <View style={[S.priceRow, S.priceAlt]}><Text style={S.priceLbl}>Taxa de urgência</Text><Text style={S.priceVal}>+${fin.urgencyFee.toFixed(2)}</Text></View>}
          {fin.notaryFee > 0 && <View style={S.priceRow}><Text style={S.priceLbl}>Notarização oficial</Text><Text style={S.priceVal}>+${fin.notaryFee.toFixed(2)}</Text></View>}
          {fin.paymentDiscountAmount > 0 && <View style={[S.priceRow, S.priceAlt]}><Text style={S.priceLbl}>Desconto pagamento integral (5%)</Text><Text style={S.priceGreen}>-${fin.paymentDiscountAmount.toFixed(2)}</Text></View>}
          {fin.manualDiscountAmount > 0 && <View style={S.priceRow}><Text style={S.priceLbl}>Desconto {fin.manualDiscountType === 'percent' ? `(${fin.manualDiscountValue}%)` : 'concedido'}</Text><Text style={S.priceGreen}>-${fin.manualDiscountAmount.toFixed(2)}</Text></View>}
          {fin.operationalAdjustmentAmount > 0 && <View style={[S.priceRow, S.priceAlt]}><Text style={S.priceLbl}>Cortesia operacional</Text><Text style={S.priceGreen}>-${fin.operationalAdjustmentAmount.toFixed(2)}</Text></View>}
          <View style={S.totalRow}><Text style={S.totalLbl}>TOTAL A PAGAR</Text><Text style={S.totalVal}>${fin.totalPayable.toFixed(2)}</Text></View>
        </View>

        <View style={S.methBox}>
          <Text style={S.methTitle}>METODOLOGIA: PREÇO JUSTO GARANTIDO</Text>
          <Text style={S.methText}>Cada página é analisada pela nossa IA. Páginas com menos conteúdo custam menos — páginas em branco são Grátis. O preço reflete a complexidade real.</Text>
        </View>

        <Footer pageNum={1} total={totalPdf} />
      </Page>

      {/* ═══════════════════════════════ PAGES 2+: DOCS ═══════════════════════════════ */}
      {docChunks.map((chunk, ci) => {
        const pageNum = ci + 2;
        const isLast = ci === docChunks.length - 1;

        return (
          <Page key={`d${ci}`} size="A4" style={S.page}>
            <View style={S.contHdr}>
              <Text style={S.contTitle}>Proposta #{order?.id} — {clientName}</Text>
              <Text style={S.contSub}>Página {pageNum} de {totalPdf}</Text>
            </View>
            <View style={S.accent} />

            <View style={S.secRow}>
              <View style={S.secDot} /><Text style={S.secLabel}>ANÁLISE DETALHADA POR DOCUMENTO</Text><View style={S.secLine} />
            </View>

            {chunk.map((doc: any, di: number) => {
              const gi = ci * PER + di;
              const name = docName(doc.fileName || doc.exactNameOnDoc || '', gi);
              const allPgs = doc.analysis?.pages || [];
              const incPgs = allPgs.filter((p: any) => p.included !== false);
              const pgCount = incPgs.length || doc.count || 1;
              const mult = doc.handwritten ? 1.25 : 1;
              const sub = ((doc.analysis?.totalPrice ?? pgCount * base) * mult) + (doc.notarized ? 25 : 0);
              const isPDF = doc.analysis?.fileType !== 'image';
              const ranges = buildRanges(incPgs.length > 0 ? incPgs : allPgs);

              return (
                <View key={gi} style={[S.docRow, di % 2 === 1 ? S.docRowAlt : {}]} wrap={false}>
                  <View style={S.docLeft}>
                    <View style={S.docTopRow}>
                      <Text style={[S.docTag, isPDF ? { color: '#B91C1C', backgroundColor: '#FEE2E2' } : { color: C.blue, backgroundColor: '#DBEAFE' }]}>
                        {isPDF ? 'PDF' : 'IMG'}
                      </Text>
                      <Text style={S.docTitle}>{name}</Text>
                    </View>
                    {ranges.length > 0 && (
                      <Text style={S.docMeta}>
                        {ranges.map(r => `${r.label} > ${getDen(r.density).label}`).join(' · ')}
                      </Text>
                    )}
                  </View>
                  <View style={S.docRight}>
                    <Text style={S.docPages}>{pgCount} pág{pgCount > 1 ? 's' : ''}.</Text>
                    <Text style={S.docPrice}>${sub.toFixed(2)}</Text>
                  </View>
                </View>
              );
            })}

            {/* ── LAST PAGE: INVESTMENT TOTAL ──────────────────────── */}
            {isLast && (
              <>
                <View style={{ marginHorizontal: 20, marginTop: 12, backgroundColor: C.text, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, marginRight: 14 }}>
                      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: C.muted, letterSpacing: 2, marginBottom: 3 }}>INVESTIMENTO TOTAL</Text>
                      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 13, color: C.white }}>{clientName}</Text>
                      <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>{docs.length} docs · {totalPages} págs · Tradução Certificada USCIS · {urgLabel}{dueDateLabel ? ` · ${dueDateLabel}` : ''}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.bronze }}>USD</Text>
                      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 28, color: C.bronze, lineHeight: 1 }}>${fin.totalPayable.toFixed(2)}</Text>
                    </View>
                  </View>
                  {fin.manualDiscountAmount > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(45,139,95,0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, marginTop: 8, borderWidth: 1, borderColor: 'rgba(45,139,95,0.3)' }}>
                      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, color: '#A5D6A7' }}>DESCONTO {fin.manualDiscountType === 'percent' ? `(${fin.manualDiscountValue}%)` : ''}</Text>
                      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#A5D6A7' }}>-${fin.manualDiscountAmount.toFixed(2)}</Text>
                    </View>
                  )}
                  <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 8 }} />
                  <View style={{ flexDirection: 'row' }}>
                    {[
                      { t: 'ZELLE', s: 'Transferência instantânea' },
                      { t: 'PIX / BOLETO', s: 'Pagamento via Brasil' },
                      { t: 'CARTÃO', s: 'Crédito ou débito' },
                    ].map((p, pi, arr) => (
                      <View key={pi} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginRight: pi < arr.length - 1 ? 5 : 0 }}>
                        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: C.white, marginBottom: 1 }}>{p.t}</Text>
                        <Text style={{ fontSize: 6, color: C.muted }}>{p.s}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {expiresAt && <View style={{ marginHorizontal: 36, marginTop: 6 }}><Text style={{ fontSize: 7, color: C.bronze, fontFamily: 'Helvetica-Bold' }}>Proposta válida até {expiresAt}</Text></View>}

                <View style={{ flexDirection: 'row', marginHorizontal: 36, marginTop: 8 }}>
                  {['Florida Notary Public', 'ATA Member', 'ATIF Member'].map((b, bi) => (
                    <View key={bi} style={{ flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 5, paddingVertical: 5, alignItems: 'center', marginRight: bi < 2 ? 5 : 0 }}>
                      <Text style={{ fontSize: 6.5, color: C.muted, fontFamily: 'Helvetica-Bold' }}>{b}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Footer pageNum={pageNum} total={totalPdf} />
          </Page>
        );
      })}
    </Document>
  );
};
