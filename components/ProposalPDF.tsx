// components/ProposalPDF.tsx  ·  v5 — Redesign visual completo
// Capa bronze, barras de densidade, benefícios, pricing estilizado,
// nomes limpos, acentuação completa, endereço atualizado.

import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { deriveProposalFinancialSummary } from '@/lib/proposalPricingSummary';
import { resolveStoredOrCalculatedDueDate } from '@/lib/orderDueDate';
import { cleanDocumentName } from '@/lib/proposalUtils';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bronze: '#B87333',
  bronzeLight: '#F5EDE3',
  copper: '#8B5A2B',
  gold: '#C8963E',
  dark: '#2D2A26',
  slate: '#4A4A4A',
  gray: '#6B6560',
  lightGray: '#9C9A92',
  border: '#E8D5C0',
  bgPage: '#FAFAF7',
  bgWarm: '#F5F1EB',
  white: '#FFFFFF',
  green: '#2D8B5F',
  greenLight: '#E8F5E9',
  greenBorder: '#A5D6A7',
  amber: '#D97706',
  amberBg: '#FEF3C7',
  red: '#EF4444',
  redBg: '#FEE2E2',
  blue: '#4A7FB5',
  blueBg: '#DBEAFE',
};

const DENSITY: Record<string, { label: string; color: string; bg: string }> = {
  high:     { label: 'ALTA',      color: '#D97706', bg: '#FEF3C7' },
  medium:   { label: 'MÉDIA',     color: '#B45309', bg: '#FEF3C7' },
  low:      { label: 'BAIXA',     color: '#4A7FB5', bg: '#DBEAFE' },
  blank:    { label: 'GRÁTIS',    color: '#2D8B5F', bg: '#E8F5E9' },
  scanned:  { label: 'ESCANEADA', color: '#EF4444', bg: '#FEE2E2' },
};
const getDensity = (d: string) => DENSITY[d] || DENSITY.high;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const buildRanges = (pages: any[]) => {
  if (!pages?.length) return [];
  const sorted = [...pages].sort((a: any, b: any) => a.pageNumber - b.pageNumber);
  const groups: Array<{ start: number; end: number; density: string; price: number }> = [];
  let cur = { start: sorted[0].pageNumber, end: sorted[0].pageNumber, density: sorted[0].density, price: sorted[0].price || 0 };
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    if (p.density === cur.density && p.pageNumber === cur.end + 1) {
      cur.end = p.pageNumber;
    } else {
      groups.push({ ...cur });
      cur = { start: p.pageNumber, end: p.pageNumber, density: p.density, price: p.price || 0 };
    }
  }
  groups.push(cur);
  return groups.map(g => ({
    label: g.start === g.end ? `Pág. ${g.start}` : `Págs. ${g.start}\u2013${g.end}`,
    density: g.density,
    price: g.price,
  }));
};

const displayName = (raw: string) => cleanDocumentName((raw || '').split(/[/\\]/).pop() || raw);

const safeMeta = (raw: any) => {
  try { return typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {}); }
  catch { return {}; }
};

const safeDate = (val: any) => {
  try { return new Date(val).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); }
};

const safeDateShort = (val: any) => {
  try { return new Date(val).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return ''; }
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: C.white, color: C.dark, fontSize: 10, paddingBottom: 48 },

  // Cover header
  coverHeader: { backgroundColor: C.bronze, paddingHorizontal: 36, paddingTop: 28, paddingBottom: 24 },
  coverHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logoWrap: { width: 60, height: 60 },
  logo: { width: 60, height: 60, objectFit: 'contain' },
  logoText: { fontFamily: 'Helvetica-Bold', fontSize: 20, color: C.white },
  coverBadge: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: 'rgba(255,255,255,0.8)', letterSpacing: 2, marginTop: 8 },
  coverRight: { alignItems: 'flex-end' },
  coverQuoteLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: 'rgba(255,255,255,0.6)', letterSpacing: 2 },
  coverQuoteNum: { fontFamily: 'Helvetica-Bold', fontSize: 28, color: C.white, marginTop: 2 },
  coverDate: { fontSize: 8, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  coverAccent: { height: 3, backgroundColor: C.gold },

  // Client section
  clientSection: { paddingHorizontal: 36, paddingTop: 18, paddingBottom: 14, backgroundColor: C.bgPage, borderBottomWidth: 1, borderBottomColor: C.border },
  clientName: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.dark },
  clientEmail: { fontSize: 9, color: C.gray, marginTop: 3 },
  clientValidity: { fontSize: 8, color: C.bronze, marginTop: 3 },

  // Summary pills
  pillRow: { flexDirection: 'row', paddingHorizontal: 36, paddingTop: 14, paddingBottom: 10, backgroundColor: C.bgPage },
  pill: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: C.white, marginRight: 6 },
  pillLast: { marginRight: 0 },
  pillVal: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.dark },
  pillValBronze: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.bronze },
  pillLbl: { fontSize: 7, color: C.lightGray, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Density distribution
  densDistSection: { paddingHorizontal: 36, paddingTop: 12, paddingBottom: 10 },
  densDistTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.dark, letterSpacing: 1, marginBottom: 8 },
  densDistRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  densDistLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7, width: 62, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, textAlign: 'center' },
  densDistBar: { flex: 1, height: 8, backgroundColor: C.bgWarm, borderRadius: 4, marginHorizontal: 6, overflow: 'hidden' },
  densDistFill: { height: 8, borderRadius: 4 },
  densDistCount: { fontSize: 7, color: C.gray, width: 55, textAlign: 'right' },

  // Benefits
  benefitsBox: { marginHorizontal: 36, marginTop: 8, borderWidth: 1, borderColor: C.greenBorder, borderRadius: 8, backgroundColor: C.greenLight, paddingHorizontal: 14, paddingVertical: 10 },
  benefitsTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.green, letterSpacing: 0.5, marginBottom: 6 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 },
  benefitCheck: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.green, marginRight: 6, marginTop: 1 },
  benefitText: { fontSize: 8, color: '#1B5E20', flex: 1 },
  benefitSavings: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.green },

  // Pricing
  pricingBox: { marginHorizontal: 36, marginTop: 10, borderWidth: 1, borderColor: C.border, borderRadius: 8, overflow: 'hidden' },
  pricingRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 6 },
  pricingRowAlt: { backgroundColor: C.bgPage },
  pricingLabel: { fontSize: 9, color: C.gray },
  pricingValue: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.dark },
  pricingGreen: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.green },
  pricingTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.dark, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  pricingTotalLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.lightGray, letterSpacing: 1 },
  pricingTotalValue: { fontFamily: 'Helvetica-Bold', fontSize: 22, color: C.bronze },

  // Methodology
  methBox: { marginHorizontal: 36, marginTop: 10, backgroundColor: C.bgPage, borderLeftWidth: 3, borderLeftColor: C.bronze, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8 },
  methTitle: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.bronze, letterSpacing: 0.5, marginBottom: 3 },
  methText: { fontSize: 7.5, color: C.slate, lineHeight: 1.6 },

  // Section label
  secRow: { paddingHorizontal: 28, paddingTop: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' },
  secDot: { width: 6, height: 6, backgroundColor: C.bronze, borderRadius: 3, marginRight: 8 },
  secTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.dark, letterSpacing: 1.5 },
  secLine: { flex: 1, height: 1, backgroundColor: C.border, marginLeft: 10 },

  // Document card
  card: { marginHorizontal: 20, marginBottom: 6, borderWidth: 1, borderColor: C.border, borderRadius: 8, overflow: 'hidden' },
  cardHead: { paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.border },
  cardHeadAlt: { backgroundColor: C.bgPage },
  cardLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, marginRight: 12 },
  tagBadge: { fontFamily: 'Helvetica-Bold', fontSize: 6.5, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, marginRight: 8, marginTop: 1, flexShrink: 0 },
  cardTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.dark, flex: 1, lineHeight: 1.4 },
  cardRight: { alignItems: 'flex-end', flexShrink: 0 },
  pgBadge: { flexDirection: 'row', alignItems: 'baseline', backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 3 },
  pgNum: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: C.dark },
  pgLbl: { fontSize: 7, color: C.gray, marginLeft: 3 },
  subtotal: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: C.bronze },

  // Density rows
  densBody: { paddingHorizontal: 14, paddingVertical: 5 },
  densRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  densRowLast: { marginBottom: 0 },
  densRange: { fontFamily: 'Courier', fontSize: 7.5, color: C.gray, width: 70 },
  densArrow: { fontSize: 7, color: C.lightGray, marginHorizontal: 4 },
  densBadge: { fontFamily: 'Helvetica-Bold', fontSize: 6, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 8 },
  densPrice: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.slate, marginLeft: 'auto' },

  // Excluded pages strip
  exclRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#FFFBF5', borderBottomWidth: 1, borderBottomColor: '#FDE68A' },
  exclBar: { width: 3, alignSelf: 'stretch', backgroundColor: C.bronze, borderRadius: 2, marginRight: 10, flexShrink: 0 },
  exclBody: { flex: 1 },
  exclHead: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: '#92400E' },
  exclPgs: { fontSize: 7, color: C.gray, marginTop: 1.5 },
  exclSave: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.green, marginLeft: 10, flexShrink: 0 },

  // Payment cards
  payRow: { flexDirection: 'row', marginHorizontal: 36, marginTop: 10 },
  payCard: { flex: 1, backgroundColor: C.bgPage, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: C.border, marginRight: 6 },
  payCardLast: { marginRight: 0 },
  payTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.dark, marginBottom: 2 },
  payText: { fontSize: 7, color: C.gray },

  // Continuation header
  contHead: { backgroundColor: C.bronze, paddingHorizontal: 36, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.white },
  contMeta: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
  contAccent: { height: 2, backgroundColor: C.gold },

  // Footer
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bgPage, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 36, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerAddr: { fontSize: 7, color: C.slate },
  footerContact: { fontSize: 7, color: C.gray, marginTop: 2 },
  footerRight: { alignItems: 'flex-end' },
  footerUrl: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.bronze },
  footerPage: { fontSize: 7, color: C.lightGray, marginTop: 2 },
});

// ─── DocCard ─────────────────────────────────────────────────────────────────
const DocCard = ({ doc, idx, base, isOdd }: { doc: any; idx: number; base: number; isOdd: boolean }) => {
  const raw = doc.fileName || doc.exactNameOnDoc || `Documento ${idx + 1}`;
  const name = displayName(raw);
  const isPDF = /\.pdf$/i.test(raw) || doc.analysis?.fileType !== 'image';
  const tagColor = isPDF
    ? { color: '#B91C1C', backgroundColor: '#FEE2E2' }
    : { color: '#4A7FB5', backgroundColor: '#DBEAFE' };
  const tagLabel = isPDF ? 'PDF' : 'IMG';

  const allPages = doc.analysis?.pages || [];
  const includedPgs = allPages.filter((p: any) => p.included !== false);
  const excludedPgs = allPages.filter((p: any) => p.included === false);
  const incCount = includedPgs.length || doc.count || 1;
  const excCount = excludedPgs.length;
  const excSavings = excludedPgs.reduce((s: number, p: any) => s + (p.price || 0), 0);
  const multiplier = doc.handwritten ? 1.25 : 1;
  const subtotal = ((doc.analysis?.totalPrice ?? incCount * base) * multiplier) + (doc.notarized ? 25 : 0);
  const ranges = buildRanges(includedPgs.length > 0 ? includedPgs : allPages);

  return (
    <View style={S.card}>
      <View style={[S.cardHead, isOdd ? S.cardHeadAlt : {}]}>
        <View style={S.cardLeft}>
          <Text style={[S.tagBadge, tagColor]}>{tagLabel}</Text>
          <Text style={S.cardTitle}>{name}</Text>
        </View>
        <View style={S.cardRight}>
          <View style={S.pgBadge}>
            <Text style={S.pgNum}>{incCount}</Text>
            <Text style={S.pgLbl}>{incCount === 1 ? 'pág.' : 'págs.'}</Text>
          </View>
          <Text style={S.subtotal}>${subtotal.toFixed(2)}</Text>
        </View>
      </View>

      {excCount > 0 && (
        <View style={S.exclRow}>
          <View style={S.exclBar} />
          <View style={S.exclBody}>
            <Text style={S.exclHead}>
              {excCount} {excCount === 1 ? 'página excluída' : 'páginas excluídas'} pela equipe
            </Text>
            <Text style={S.exclPgs}>Desnecessárias para o processo</Text>
          </View>
          <Text style={S.exclSave}>-${excSavings.toFixed(2)}</Text>
        </View>
      )}

      {ranges.length > 0 && (
        <View style={S.densBody}>
          {ranges.map((r: any, ri: number) => {
            const cfg = getDensity(r.density);
            return (
              <View key={ri} style={[S.densRow, ri === ranges.length - 1 ? S.densRowLast : {}]}>
                <Text style={S.densRange}>{r.label}</Text>
                <Text style={S.densArrow}>{'>'}</Text>
                <Text style={[S.densBadge, { color: cfg.color, backgroundColor: cfg.bg }]}>{cfg.label}</Text>
                <Text style={S.densPrice}>${(r.price || 0).toFixed(2)}/pág</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

// ─── Main export ──────────────────────────────────────────────────────────────
interface ProposalPDFProps {
  order: any;
  globalSettings: any;
  logoBase64?: string | null;
}

export const ProposalPDF = ({ order, globalSettings, logoBase64 }: ProposalPDFProps) => {
  const meta = safeMeta(order?.metadata);
  const docs = meta?.documents ?? [];
  const base = globalSettings?.basePrice || 9;
  const financialSummary = deriveProposalFinancialSummary({
    totalAmount: order?.totalAmount,
    extraDiscount: order?.extraDiscount,
    metadata: order?.metadata,
  });

  const totalDocs = docs.length;
  const totalAmt = financialSummary.totalPayable;
  const clientName = order?.user?.fullName || order?.clientName || 'Cliente';
  const clientEmail = order?.user?.email || order?.clientEmail || '';
  const resolvedDueDate = resolveStoredOrCalculatedDueDate({
    dueDate: order?.dueDate ?? meta?.dueDate ?? null,
    createdAt: order?.createdAt,
    urgency: order?.urgency,
    settings: globalSettings,
  });
  const dueDateLabel = resolvedDueDate ? safeDate(resolvedDueDate) : null;
  const expiresAt = order?.proposalExpiresAt
    ? safeDateShort(order.proposalExpiresAt)
    : safeDateShort(new Date(new Date(order?.createdAt || Date.now()).getTime() + 7 * 24 * 60 * 60 * 1000));

  const totalPages = docs.reduce((s: number, d: any) => {
    const ap = d.analysis?.pages || [];
    return s + (ap.length > 0 ? ap.filter((p: any) => p.included !== false).length : (d.count || 0));
  }, 0);

  const totalSavings = financialSummary.totalSavings;
  const hasSavings = totalSavings > 0.005;

  // Density distribution for cover page
  const densityCounts: Record<string, number> = {};
  let totalIncluded = 0;
  docs.forEach((d: any) => {
    (d.analysis?.pages || []).filter((p: any) => p.included !== false).forEach((p: any) => {
      const dens = p.density || 'high';
      densityCounts[dens] = (densityCounts[dens] || 0) + 1;
      totalIncluded++;
    });
  });
  const densityOrder = ['blank', 'low', 'medium', 'high', 'scanned'];
  const densityBars = densityOrder
    .filter(d => densityCounts[d] > 0)
    .map(d => ({
      density: d,
      count: densityCounts[d],
      pct: Math.round((densityCounts[d] / totalIncluded) * 100),
    }));

  // Benefits
  const benefits: Array<{ text: string; savings: number }> = [];
  if (hasSavings) {
    const totalExcluded = docs.reduce((s: number, d: any) =>
      s + (d.analysis?.pages || []).filter((p: any) => p.included === false).length, 0);
    if (totalExcluded > 0) {
      benefits.push({ text: `Auditoria Promobidocs: ${totalExcluded} páginas removidas`, savings: totalSavings });
    }
  }
  if (financialSummary.manualDiscountAmount > 0) {
    const pct = financialSummary.manualDiscountType === 'percent' ? ` (${financialSummary.manualDiscountValue}%)` : '';
    benefits.push({ text: `Desconto concedido${pct}`, savings: financialSummary.manualDiscountAmount });
  }

  // Urgency label
  const urgencyLabels: Record<string, string> = {
    standard: 'Standard', normal: 'Standard',
    urgent: 'Express (48h)', flash: 'Ultra Express (24h)',
  };
  const urgencyLabel = urgencyLabels[order?.urgency] || order?.urgency || 'Standard';

  // Pagination: page 1 = cover only (no docs), page 2+ = docs (6 per page)
  const DOCS_PER_PAGE = 6;
  const docChunks: any[][] = [];
  let i = 0;
  while (i < docs.length) { docChunks.push(docs.slice(i, i + DOCS_PER_PAGE)); i += DOCS_PER_PAGE; }
  if (docChunks.length === 0) docChunks.push([]);
  // Total pages = 1 cover + doc pages
  const totalPdfPages = 1 + docChunks.length;

  return (
    <Document>
      {/* ═══════════════════════════════════════════════════════════════
          PAGE 1: COVER (no documents)
          ═══════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        {/* ── A. COVER HEADER ──────────────────────────────────────── */}
        <View style={S.coverHeader}>
          <View style={S.coverHeaderRow}>
            <View>
              <View style={S.logoWrap}>
                {logoBase64
                  ? <Image src={logoBase64} style={S.logo} />
                  : <Text style={S.logoText}>PROMOBIDOCS</Text>
                }
              </View>
              <Text style={S.coverBadge}>TRADUÇÃO CERTIFICADA · USCIS ACCEPTED</Text>
            </View>
            <View style={S.coverRight}>
              <Text style={S.coverQuoteLabel}>COTAÇÃO</Text>
              <Text style={S.coverQuoteNum}>#{order?.id}</Text>
              <Text style={S.coverDate}>{safeDate(order?.createdAt)}</Text>
            </View>
          </View>
        </View>
        <View style={S.coverAccent} />

        {/* ── B/C. CLIENT + VALIDITY ──────────────────────────────── */}
        <View style={S.clientSection}>
          <Text style={S.clientName}>{clientName}</Text>
          {clientEmail ? <Text style={S.clientEmail}>{clientEmail}</Text> : null}
          {expiresAt ? <Text style={S.clientValidity}>Proposta válida até {expiresAt}</Text> : null}
        </View>

        {/* ── SUMMARY PILLS ───────────────────────────────────────── */}
        <View style={S.pillRow}>
          <View style={S.pill}>
            <Text style={S.pillVal}>{totalDocs}</Text>
            <Text style={S.pillLbl}>Documentos</Text>
          </View>
          <View style={S.pill}>
            <Text style={S.pillVal}>{totalPages}</Text>
            <Text style={S.pillLbl}>Páginas</Text>
          </View>
          <View style={[S.pill, S.pillLast]}>
            <Text style={S.pillValBronze}>${totalAmt.toFixed(2)}</Text>
            <Text style={S.pillLbl}>Total USD</Text>
          </View>
        </View>

        {/* ── D. DENSITY DISTRIBUTION ─────────────────────────────── */}
        {densityBars.length > 0 && (
          <View style={S.densDistSection}>
            <Text style={S.densDistTitle}>DISTRIBUIÇÃO DE DENSIDADE</Text>
            {densityBars.map((bar) => {
              const cfg = getDensity(bar.density);
              return (
                <View key={bar.density} style={S.densDistRow}>
                  <Text style={[S.densDistLabel, { color: cfg.color, backgroundColor: cfg.bg }]}>{cfg.label}</Text>
                  <View style={S.densDistBar}>
                    <View style={[S.densDistFill, { width: `${bar.pct}%`, backgroundColor: cfg.color }]} />
                  </View>
                  <Text style={S.densDistCount}>{bar.count} págs ({bar.pct}%)</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── E. BENEFITS ─────────────────────────────────────────── */}
        {benefits.length > 0 && (
          <View style={S.benefitsBox}>
            <Text style={S.benefitsTitle}>BENEFÍCIOS DESTA PROPOSTA</Text>
            {benefits.map((b, bi) => (
              <View key={bi} style={S.benefitRow}>
                <Text style={S.benefitCheck}>✓</Text>
                <Text style={S.benefitText}>{b.text}</Text>
                {b.savings > 0 && <Text style={S.benefitSavings}>-${b.savings.toFixed(2)}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* ── F. PRICING ──────────────────────────────────────────── */}
        <View style={S.pricingBox}>
          <View style={S.pricingRow}>
            <Text style={S.pricingLabel}>Subtotal tradução ({totalPages} págs)</Text>
            <Text style={S.pricingValue}>${financialSummary.billableBasePrice.toFixed(2)}</Text>
          </View>
          {financialSummary.urgencyFee > 0 && (
            <View style={[S.pricingRow, S.pricingRowAlt]}>
              <Text style={S.pricingLabel}>Taxa de urgência</Text>
              <Text style={S.pricingValue}>+${financialSummary.urgencyFee.toFixed(2)}</Text>
            </View>
          )}
          {financialSummary.notaryFee > 0 && (
            <View style={S.pricingRow}>
              <Text style={S.pricingLabel}>Notarização oficial</Text>
              <Text style={S.pricingValue}>+${financialSummary.notaryFee.toFixed(2)}</Text>
            </View>
          )}
          {financialSummary.paymentDiscountAmount > 0 && (
            <View style={[S.pricingRow, S.pricingRowAlt]}>
              <Text style={S.pricingLabel}>Desconto pagamento integral (5%)</Text>
              <Text style={S.pricingGreen}>-${financialSummary.paymentDiscountAmount.toFixed(2)}</Text>
            </View>
          )}
          {financialSummary.manualDiscountAmount > 0 && (
            <View style={S.pricingRow}>
              <Text style={S.pricingLabel}>
                Desconto {financialSummary.manualDiscountType === 'percent' ? `(${financialSummary.manualDiscountValue}%)` : 'concedido'}
              </Text>
              <Text style={S.pricingGreen}>-${financialSummary.manualDiscountAmount.toFixed(2)}</Text>
            </View>
          )}
          {financialSummary.operationalAdjustmentAmount > 0 && (
            <View style={[S.pricingRow, S.pricingRowAlt]}>
              <Text style={S.pricingLabel}>Cortesia operacional</Text>
              <Text style={S.pricingGreen}>-${financialSummary.operationalAdjustmentAmount.toFixed(2)}</Text>
            </View>
          )}
          <View style={S.pricingTotalRow}>
            <Text style={S.pricingTotalLabel}>TOTAL A PAGAR</Text>
            <Text style={S.pricingTotalValue}>${totalAmt.toFixed(2)}</Text>
          </View>
        </View>

        {/* ── G. METHODOLOGY ──────────────────────────────────────── */}
        <View style={S.methBox}>
          <Text style={S.methTitle}>METODOLOGIA: PREÇO JUSTO GARANTIDO</Text>
          <Text style={S.methText}>
            Cada página é analisada individualmente pela nossa IA. Páginas com menos
            conteúdo custam menos — páginas em branco são classificadas como Grátis.
            O preço reflete a complexidade real, nunca por estimativa genérica.
          </Text>
        </View>

        {/* ── FOOTER PAGE 1 ───────────────────────────────────────── */}
        <View style={S.footer}>
          <View>
            <Text style={S.footerAddr}>3300 Greenwald Way N, Kissimmee, FL 34741, USA</Text>
            <Text style={S.footerContact}>(321) 324-5851 · desk@promobidocs.com</Text>
          </View>
          <View style={S.footerRight}>
            <Text style={S.footerUrl}>www.promobidocs.com</Text>
            <Text style={S.footerPage}>Página 1 de {totalPdfPages}</Text>
          </View>
        </View>
      </Page>

      {/* ═══════════════════════════════════════════════════════════════
          PAGES 2+: DOCUMENT DETAIL
          ═══════════════════════════════════════════════════════════════ */}
      {docChunks.map((chunk: any[], ci: number) => {
        const pageNum = ci + 2;
        const isLastDocPage = ci === docChunks.length - 1;

        return (
          <Page key={`doc-${ci}`} size="A4" style={S.page}>
            {/* ── CONTINUATION HEADER ─────────────────────────────── */}
            <View style={S.contHead}>
              <Text style={S.contTitle}>Proposta #{order?.id} — {clientName}</Text>
              <Text style={S.contMeta}>ANÁLISE DETALHADA</Text>
            </View>
            <View style={S.contAccent} />

            {/* ── DOC CARDS ───────────────────────────────────────── */}
            {chunk.map((doc: any, di: number) => {
              const gi = ci * DOCS_PER_PAGE + di;
              return <DocCard key={gi} doc={doc} idx={gi} base={base} isOdd={di % 2 === 1} />;
            })}

            {/* ── LAST DOC PAGE: INVESTMENT TOTAL + PAYMENT ────────── */}
            {isLastDocPage && (
              <>
                {/* Investment total */}
                <View style={{ marginHorizontal: 20, marginTop: 12, backgroundColor: C.dark, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 14 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <View style={{ flex: 1, marginRight: 16 }}>
                      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.lightGray, letterSpacing: 2, marginBottom: 4 }}>INVESTIMENTO TOTAL</Text>
                      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.white }}>{clientName}</Text>
                      <Text style={{ fontSize: 8, color: C.lightGray, marginTop: 3 }}>
                        {totalDocs} docs · {totalPages} págs · Tradução Certificada USCIS · {urgencyLabel}{dueDateLabel ? ` · Prazo ${dueDateLabel}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.bronze, marginBottom: 2 }}>USD</Text>
                      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 30, color: C.bronze, lineHeight: 1 }}>${totalAmt.toFixed(2)}</Text>
                    </View>
                  </View>
                  {financialSummary.manualDiscountAmount > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(45,139,95,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(45,139,95,0.3)' }}>
                      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8, color: '#A5D6A7' }}>
                        DESCONTO {financialSummary.manualDiscountType === 'percent' ? `(${financialSummary.manualDiscountValue}%)` : 'CONCEDIDO'}
                      </Text>
                      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10, color: '#A5D6A7' }}>-${financialSummary.manualDiscountAmount.toFixed(2)}</Text>
                    </View>
                  )}
                  <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 10 }} />
                  <View style={{ flexDirection: 'row' }}>
                    {[
                      { t: 'ZELLE', s: 'Transferência instantânea' },
                      { t: 'PIX / BOLETO', s: 'Pagamento via Brasil' },
                      { t: 'CARTÃO', s: 'Crédito ou débito' },
                    ].map((p, pi, arr) => (
                      <View key={pi} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginRight: pi < arr.length - 1 ? 6 : 0 }}>
                        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.white, marginBottom: 2 }}>{p.t}</Text>
                        <Text style={{ fontSize: 6.5, color: C.lightGray }}>{p.s}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Validity */}
                {expiresAt && (
                  <View style={{ marginHorizontal: 36, marginTop: 8 }}>
                    <Text style={{ fontSize: 8, color: C.bronze, fontFamily: 'Helvetica-Bold' }}>
                      Proposta válida até {expiresAt}
                    </Text>
                  </View>
                )}

                {/* Credentials */}
                <View style={{ flexDirection: 'row', marginHorizontal: 36, marginTop: 10 }}>
                  {['Florida Notary Public', 'ATA Member', 'ATIF Member'].map((badge, bi) => (
                    <View key={bi} style={{ flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingVertical: 6, alignItems: 'center', marginRight: bi < 2 ? 6 : 0 }}>
                      <Text style={{ fontSize: 7, color: C.lightGray, fontFamily: 'Helvetica-Bold' }}>{badge}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* ── FOOTER ──────────────────────────────────────────── */}
            <View style={S.footer}>
              <View>
                <Text style={S.footerAddr}>3300 Greenwald Way N, Kissimmee, FL 34741, USA</Text>
                <Text style={S.footerContact}>(321) 324-5851 · desk@promobidocs.com</Text>
              </View>
              <View style={S.footerRight}>
                <Text style={S.footerUrl}>www.promobidocs.com</Text>
                <Text style={S.footerPage}>Página {pageNum} de {totalPdfPages}</Text>
              </View>
            </View>

          </Page>
        );
      })}
    </Document>
  );
};
