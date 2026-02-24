// components/ProposalPDF.tsx  ·  v4 — Redesign completo
// Fixes: nome completo no hero, pills 2×2, páginas excluídas compactas,
//        savings box no final, metodologia não split, density ranges só de
//        páginas incluídas.

import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  orange:      '#E8751A',
  orangeLight: '#FEF0E6',
  dark:        '#0F1117',
  slate:       '#374151',
  gray:        '#6B7280',
  lightGray:   '#9CA3AF',
  border:      '#E5E7EB',
  bgLight:     '#F9FAFB',
  bgMid:       '#F3F4F6',
  white:       '#FFFFFF',
  green:       '#059669',
  greenLight:  '#D1FAE5',
  greenBg:     '#F0FDF4',
  greenBorder: '#6EE7B7',
  amber:       '#92400E',
  amberBg:     '#FEF3C7',
  amberBorder: '#FDE68A',
  redLight:    '#FEE2E2',
  blueLight:   '#DBEAFE',
  red:         '#B91C1C',
  blue:        '#1D4ED8',
};

// ─── Density config ───────────────────────────────────────────────────────────
const DENSITY: Record<string, { label: string; color: string; bg: string; pct: string }> = {
  high:    { label: 'ALTA',      color: '#B91C1C', bg: '#FEE2E2', pct: '100%' },
  medium:  { label: 'MEDIA',     color: '#92400E', bg: '#FEF3C7', pct: '50%'  },
  low:     { label: 'BAIXA',     color: '#065F46', bg: '#D1FAE5', pct: '25%'  },
  blank:   { label: 'EM BRANCO', color: '#6B7280', bg: '#F3F4F6', pct: 'Free' },
  scanned: { label: 'ESCANEADA', color: '#1D4ED8', bg: '#DBEAFE', pct: '100%' },
};
const getDensity = (d: string) => DENSITY[d] || DENSITY.high;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Build consecutive density ranges — only from INCLUDED pages
const buildRanges = (pages: any[]) => {
  if (!pages?.length) return [];
  const sorted = [...pages].sort((a: any, b: any) => a.pageNumber - b.pageNumber);
  const groups: Array<{ start: number; end: number; density: string }> = [];
  let cur = { start: sorted[0].pageNumber, end: sorted[0].pageNumber, density: sorted[0].density };
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    if (p.density === cur.density && p.pageNumber === cur.end + 1) {
      cur.end = p.pageNumber;
    } else {
      groups.push({ ...cur });
      cur = { start: p.pageNumber, end: p.pageNumber, density: p.density };
    }
  }
  groups.push(cur);
  return groups.map(g => ({
    label: g.start === g.end ? `Pag. ${g.start}` : `Pags. ${g.start}–${g.end}`,
    density: g.density,
  }));
};

// Compact excluded pages label: list ≤4, otherwise summarise as range
const fmtExcluded = (excluded: any[]) => {
  if (!excluded.length) return '';
  const nums = excluded.map((p: any) => p.pageNumber).sort((a: number, b: number) => a - b);
  if (nums.length <= 4) return `Pags. ${nums.join(', ')}`;
  return `${nums.length} pags. (${nums[0]}–${nums[nums.length - 1]})`;
};

const displayName = (raw: string) => (raw || '').split(/[/\\]/).pop() || raw;

const safeMeta = (raw: any) => {
  try { return typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {}); }
  catch { return {}; }
};

const safeDate = (val: any) => {
  try { return new Date(val).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); }
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: C.white, color: C.dark, fontSize: 10, paddingBottom: 56 },

  // Page 1 header
  header:        { backgroundColor: C.dark, paddingHorizontal: 36, paddingTop: 24, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerAccent:  { height: 3, backgroundColor: C.orange },
  logoWrap:      { width: 148, height: 42 },
  logo:          { width: 148, height: 42, objectFit: 'contain', objectPositionX: 0 },
  logoText:      { fontFamily: 'Helvetica-Bold', fontSize: 18, color: C.orange },
  headerTagline: { fontSize: 7, color: C.lightGray, marginTop: 5, letterSpacing: 0.5 },
  headerRight:   { alignItems: 'flex-end' },
  headerBadge:   { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.orange, letterSpacing: 2, marginBottom: 2 },
  headerId:      { fontFamily: 'Helvetica-Bold', fontSize: 30, color: C.white },
  headerDate:    { fontFamily: 'Courier', fontSize: 8, color: C.lightGray, marginTop: 3 },

  // Hero — heroLeft: flex:1 is the key fix that prevents name from being clipped
  hero:        { backgroundColor: C.bgLight, paddingHorizontal: 36, paddingTop: 20, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLeft:    { flex: 1, marginRight: 18 },
  heroLabel:   { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.gray, letterSpacing: 2.5, marginBottom: 7 },
  heroNameRow: { flexDirection: 'row', alignItems: 'flex-start' },
  heroAccent:  { width: 4, height: 24, backgroundColor: C.orange, borderRadius: 2, marginRight: 10, flexShrink: 0, marginTop: 2 },
  heroName:    { fontFamily: 'Helvetica-Bold', fontSize: 20, color: C.dark, flex: 1, lineHeight: 1.3 },
  heroEmail:   { fontSize: 8, color: C.gray, marginTop: 5, marginLeft: 14 },

  // 2 × 2 pill grid — fixed 260pt wide
  heroGrid:   { width: 260 },
  pillRow:    { flexDirection: 'row' },
  pillRowGap: { marginTop: 8 },
  pill:       { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: C.white },
  pillL:      { marginLeft: 8 },
  pillGreen:  { borderColor: C.greenBorder, backgroundColor: C.greenBg },
  pillOrange: { borderColor: C.orange, backgroundColor: C.orangeLight },
  pillVal:    { fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.dark },
  pillValGr:  { fontFamily: 'Helvetica-Bold', fontSize: 13, color: C.green },
  pillValOr:  { fontFamily: 'Helvetica-Bold', fontSize: 13, color: C.orange },
  pillLbl:    { fontSize: 7, color: C.gray, marginTop: 2 },

  // Section label
  secRow:   { paddingHorizontal: 28, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' },
  secDot:   { width: 6, height: 6, backgroundColor: C.orange, borderRadius: 3, marginRight: 8 },
  secTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.dark, letterSpacing: 1.5 },
  secLine:  { flex: 1, height: 1, backgroundColor: C.border, marginLeft: 10 },

  // Document card
  card:      { marginHorizontal: 20, marginBottom: 8, borderWidth: 1, borderColor: C.border, borderRadius: 8, overflow: 'hidden' },
  cardHead:  { backgroundColor: C.bgMid, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.border },
  cardLeft:  { flexDirection: 'row', alignItems: 'flex-start', flex: 1, marginRight: 12 },
  tagBadge:  { fontFamily: 'Helvetica-Bold', fontSize: 7, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, marginRight: 8, marginTop: 1, flexShrink: 0 },
  cardTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.dark, flex: 1, lineHeight: 1.4 },
  cardRight: { alignItems: 'flex-end', flexShrink: 0 },
  pgBadge:   { flexDirection: 'row', alignItems: 'baseline', backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginBottom: 4 },
  pgNum:     { fontFamily: 'Helvetica-Bold', fontSize: 12, color: C.dark },
  pgLbl:     { fontSize: 7, color: C.gray, marginLeft: 3 },
  subtotal:  { fontFamily: 'Helvetica-Bold', fontSize: 13, color: C.dark },

  // Excluded pages — compact amber strip
  exclRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#FFFBF5', borderBottomWidth: 1, borderBottomColor: C.amberBorder },
  exclBar:  { width: 3, alignSelf: 'stretch', backgroundColor: C.orange, borderRadius: 2, marginRight: 10, flexShrink: 0 },
  exclBody: { flex: 1 },
  exclHead: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: C.amber },
  exclPgs:  { fontSize: 7, color: C.gray, marginTop: 1.5 },
  exclSave: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.green, marginLeft: 10, flexShrink: 0 },

  // Density rows (included pages only)
  densBody:    { paddingHorizontal: 14, paddingVertical: 7 },
  densRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  densRowLast: { marginBottom: 0 },
  densRange:   { fontFamily: 'Courier', fontSize: 8, color: C.gray, width: 80 },
  densArrow:   { fontSize: 7, color: C.lightGray, marginHorizontal: 5 },
  densBadge:   { fontFamily: 'Helvetica-Bold', fontSize: 6.5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginRight: 8 },
  densPct:     { fontFamily: 'Courier', fontSize: 8, color: C.gray, flex: 1 },
  densPrice:   { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.slate },

  // Savings box (last page, after all cards)
  savingsBox:   { marginHorizontal: 20, marginTop: 12, borderWidth: 1, borderColor: C.greenBorder, borderRadius: 8, overflow: 'hidden', backgroundColor: C.greenBg },
  savingsHead:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.greenBorder },
  savingsLeft:  { flex: 1, marginRight: 16 },
  savingsTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.green, letterSpacing: 0.8 },
  savingsSub:   { fontSize: 7, color: '#065F46', marginTop: 2 },
  savingsAmt:   { fontFamily: 'Helvetica-Bold', fontSize: 22, color: C.green },
  savingsStats: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.greenBorder },
  statItem:     { flex: 1, alignItems: 'center' },
  statDiv:      { width: 1, backgroundColor: C.greenBorder },
  statNum:      { fontFamily: 'Helvetica-Bold', fontSize: 18, color: C.dark },
  statNumGr:    { fontFamily: 'Helvetica-Bold', fontSize: 18, color: C.green },
  statLbl:      { fontSize: 7, color: C.gray, marginTop: 2, textAlign: 'center' },
  savingsDesc:  { paddingHorizontal: 16, paddingVertical: 9, fontSize: 7.5, color: '#065F46', lineHeight: 1.6 },

  // Methodology note — page 1 only, not on single-page proposals
  methBox:   { marginHorizontal: 20, marginTop: 8, backgroundColor: C.bgLight, borderLeftWidth: 3, borderLeftColor: C.orange, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8 },
  methTitle: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.orange, letterSpacing: 0.5, marginBottom: 3 },
  methText:  { fontSize: 7.5, color: C.slate, lineHeight: 1.6 },

  // Total investment
  totalBox:    { marginHorizontal: 20, marginTop: 12, backgroundColor: C.dark, borderRadius: 10, paddingHorizontal: 26, paddingVertical: 18 },
  totalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  totalLabel:  { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.lightGray, letterSpacing: 2, marginBottom: 4 },
  totalName:   { fontFamily: 'Helvetica-Bold', fontSize: 15, color: C.white },
  totalMeta:   { fontSize: 8, color: C.lightGray, marginTop: 3 },
  totalRight:  { alignItems: 'flex-end' },
  totalCurr:   { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.orange, marginBottom: 2 },
  totalVal:    { fontFamily: 'Helvetica-Bold', fontSize: 34, color: C.orange, lineHeight: 1 },
  totalDiv:    { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  payRow:      { flexDirection: 'row' },
  payCard:     { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginRight: 8 },
  payCardLast: { marginRight: 0 },
  payTitle:    { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.white, marginBottom: 3 },
  payText:     { fontSize: 7, color: C.lightGray },

  // Footer — absolute, every page
  footer:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bgMid, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 36, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerAddr:    { fontSize: 7, color: C.slate },
  footerContact: { fontSize: 7, color: C.gray, marginTop: 2 },
  footerRight:   { alignItems: 'flex-end' },
  footerUrl:     { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.orange },
  footerPage:    { fontSize: 7, color: C.lightGray, marginTop: 2 },

  // Continuation header (pages 2+)
  contHead:   { backgroundColor: C.dark, paddingHorizontal: 36, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contLeft:   { flexDirection: 'row', alignItems: 'center' },
  contDot:    { width: 5, height: 5, backgroundColor: C.orange, borderRadius: 3, marginRight: 7 },
  contTitle:  { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.white },
  contMeta:   { fontSize: 8, color: C.lightGray },
  contAccent: { height: 2, backgroundColor: C.orange },
});

// ─── DocCard component ────────────────────────────────────────────────────────
const DocCard = ({ doc, idx, base }: { doc: any; idx: number; base: number }) => {
  const raw    = doc.fileName || doc.exactNameOnDoc || `Documento ${idx + 1}`;
  const name   = displayName(raw);
  const isLink = !!doc.externalLink;
  const isPDF  = /\.pdf$/i.test(raw);

  const tagColor = isLink
    ? { color: C.blue, backgroundColor: C.blueLight }
    : isPDF
    ? { color: C.red,  backgroundColor: C.redLight  }
    : { color: C.blue, backgroundColor: C.blueLight };
  const tagLabel = isLink ? 'LINK' : isPDF ? 'PDF' : 'DOC';

  // Split pages
  const allPages    = doc.analysis?.pages || [];
  const includedPgs = allPages.length > 0
    ? allPages.filter((p: any) => p.included !== false)
    : [];
  const excludedPgs = allPages.filter((p: any) => p.included === false);
  const incCount    = includedPgs.length || doc.count || 1;
  const excCount    = excludedPgs.length;
  const excSavings  = excludedPgs.reduce((s: number, p: any) => s + (p.price || 0), 0);

  const subtotal = (doc.analysis?.totalPrice ?? incCount * base) + (doc.notarized ? 25 : 0);

  // Density ranges from included pages only
  const srcPages = includedPgs.length > 0 ? includedPgs : allPages;
  const ranges   = buildRanges(srcPages);

  const priceHint = (pct: string) => {
    if (pct === 'Free') return 'Gratis';
    return `$${(base * parseFloat(pct) / 100).toFixed(2)}/pag`;
  };

  return (
    <View style={S.card}>

      {/* Header */}
      <View style={S.cardHead}>
        <View style={S.cardLeft}>
          <Text style={[S.tagBadge, tagColor]}>{tagLabel}</Text>
          <Text style={S.cardTitle}>{name}</Text>
        </View>
        <View style={S.cardRight}>
          <View style={S.pgBadge}>
            <Text style={S.pgNum}>{incCount}</Text>
            <Text style={S.pgLbl}>{incCount === 1 ? 'pag.' : 'pags.'}</Text>
          </View>
          <Text style={S.subtotal}>${subtotal.toFixed(2)}</Text>
        </View>
      </View>

      {/* Excluded pages — compact amber strip (replaces ugly page-number walls) */}
      {excCount > 0 && (
        <View style={S.exclRow}>
          <View style={S.exclBar} />
          <View style={S.exclBody}>
            <Text style={S.exclHead}>
              {excCount} {excCount === 1 ? 'pagina excluida' : 'paginas excluidas'} pela equipe Promobi
            </Text>
            <Text style={S.exclPgs}>
              {fmtExcluded(excludedPgs)} — desnecessarias para o processo
            </Text>
          </View>
          <Text style={S.exclSave}>-${excSavings.toFixed(2)}</Text>
        </View>
      )}

      {/* Density rows (included pages only) */}
      {ranges.length > 0 && (
        <View style={S.densBody}>
          {ranges.map((r: any, ri: number) => {
            const cfg = getDensity(r.density);
            return (
              <View key={ri} style={[S.densRow, ri === ranges.length - 1 ? S.densRowLast : {}]}>
                <Text style={S.densRange}>{r.label}</Text>
                <Text style={S.densArrow}>{'>'}</Text>
                <Text style={[S.densBadge, { color: cfg.color, backgroundColor: cfg.bg }]}>
                  {cfg.label}
                </Text>
                <Text style={S.densPct}>{cfg.pct} da tarifa</Text>
                <Text style={S.densPrice}>{priceHint(cfg.pct)}</Text>
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
  const meta  = safeMeta(order?.metadata);
  const docs  = meta?.documents ?? [];
  const base  = globalSettings?.basePrice || 9;

  const totalDocs  = docs.length;
  const totalAmt   = typeof order?.totalAmount === 'number' ? order.totalAmount : 0;
  const clientName = order?.user?.fullName || order?.clientName || 'Cliente Promobi';
  const clientEmail= order?.user?.email    || order?.clientEmail || '';

  // Total included pages
  const totalPages = docs.reduce((s: number, d: any) => {
    const ap = d.analysis?.pages || [];
    return s + (ap.length > 0
      ? ap.filter((p: any) => p.included !== false).length
      : (d.count || 0));
  }, 0);

  // Savings
  const totalAnalyzed = docs.reduce((s: number, d: any) =>
    s + ((d.analysis?.pages?.length) || d.count || 0), 0);
  const totalExcluded = docs.reduce((s: number, d: any) =>
    s + (d.analysis?.pages || []).filter((p: any) => p.included === false).length, 0);
  const totalSavings  = docs.reduce((s: number, d: any) =>
    s + (d.analysis?.pages || [])
        .filter((p: any) => p.included === false)
        .reduce((acc: number, p: any) => acc + (p.price || 0), 0), 0);
  const hasSavings = totalSavings > 0.005;

  // Pagination — FIRST=3 (page 1 has tall hero), REST=5
  const FIRST = 3, REST = 5;
  const chunks: any[][] = [];
  if (docs.length > 0) {
    chunks.push(docs.slice(0, FIRST));
    let i = FIRST;
    while (i < docs.length) { chunks.push(docs.slice(i, i + REST)); i += REST; }
  } else {
    chunks.push([]);
  }
  const totalPdfPages = chunks.length;

  return (
    <Document title={`Proposta-Promobi-${order?.id}`} author="Promobi">
      {chunks.map((chunk, pi) => {
        const isFirst   = pi === 0;
        const isLast    = pi === totalPdfPages - 1;
        const pageNum   = pi + 1;
        // Methodology: page 1 only, skip if this is also the last page
        // (avoids overcrowding single-page proposals with few docs)
        const showMeth  = isFirst && !isLast;

        return (
          <Page key={pi} size="A4" style={S.page}>

            {/* ── HEADER ──────────────────────────────────────────── */}
            {isFirst ? (
              <>
                <View style={S.header}>
                  <View>
                    <View style={S.logoWrap}>
                      {logoBase64
                        ? <Image src={logoBase64} style={S.logo} />
                        : <Text style={S.logoText}>PROMOBi</Text>
                      }
                    </View>
                    <Text style={S.headerTagline}>TRADUCAO CERTIFICADA · USCIS ACCEPTED</Text>
                  </View>
                  <View style={S.headerRight}>
                    <Text style={S.headerBadge}>C O T A C A O</Text>
                    <Text style={S.headerId}>#{order?.id}</Text>
                    <Text style={S.headerDate}>{safeDate(order?.createdAt)}</Text>
                  </View>
                </View>
                <View style={S.headerAccent} />

                {/* ── Hero: flex:1 on left prevents name from being clipped ── */}
                <View style={S.hero}>
                  <View style={S.heroLeft}>
                    <Text style={S.heroLabel}>PROPOSTA PREPARADA PARA</Text>
                    <View style={S.heroNameRow}>
                      <View style={S.heroAccent} />
                      <Text style={S.heroName}>{clientName}</Text>
                    </View>
                    {clientEmail ? <Text style={S.heroEmail}>{clientEmail}</Text> : null}
                  </View>

                  {/* 2 × 2 pill grid */}
                  <View style={S.heroGrid}>
                    <View style={S.pillRow}>
                      <View style={S.pill}>
                        <Text style={S.pillVal}>{totalDocs}</Text>
                        <Text style={S.pillLbl}>documentos</Text>
                      </View>
                      <View style={[S.pill, S.pillL]}>
                        <Text style={S.pillVal}>{totalPages}</Text>
                        <Text style={S.pillLbl}>paginas</Text>
                      </View>
                    </View>
                    <View style={[S.pillRow, S.pillRowGap]}>
                      {hasSavings ? (
                        <View style={[S.pill, S.pillGreen]}>
                          <Text style={S.pillValGr}>-${totalSavings.toFixed(2)}</Text>
                          <Text style={S.pillLbl}>economia</Text>
                        </View>
                      ) : (
                        <View style={[S.pill, { borderColor: 'transparent', backgroundColor: 'transparent' }]} />
                      )}
                      <View style={[S.pill, S.pillOrange, S.pillL]}>
                        <Text style={S.pillValOr}>${totalAmt.toFixed(2)}</Text>
                        <Text style={S.pillLbl}>total USD</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </>
            ) : (
              <>
                <View style={S.contHead}>
                  <View style={S.contLeft}>
                    <View style={S.contDot} />
                    <Text style={S.contTitle}>Proposta #{order?.id} — {clientName}</Text>
                  </View>
                  <Text style={S.contMeta}>Pagina {pageNum} de {totalPdfPages}</Text>
                </View>
                <View style={S.contAccent} />
              </>
            )}

            {/* ── SECTION LABEL ──────────────────────────────────── */}
            <View style={S.secRow}>
              <View style={S.secDot} />
              <Text style={S.secTitle}>ANALISE DETALHADA POR DOCUMENTO</Text>
              <View style={S.secLine} />
            </View>

            {/* ── DOC CARDS ──────────────────────────────────────── */}
            {chunk.length === 0
              ? <View style={{ marginHorizontal: 20, padding: 20 }}><Text style={{ color: C.gray }}>Nenhum documento selecionado.</Text></View>
              : chunk.map((doc: any, di: number) => {
                  const gi = isFirst ? di : FIRST + (pi - 1) * REST + di;
                  return <DocCard key={gi} doc={doc} idx={gi} base={base} />;
                })
            }

            {/* ── METHODOLOGY — page 1 only, not on single-page proposals ── */}
            {showMeth && (
              <View style={S.methBox}>
                <Text style={S.methTitle}>METODOLOGIA: PRECO JUSTO GARANTIDO</Text>
                <Text style={S.methText}>
                  Cada pagina e analisada individualmente pela nossa IA. Paginas com menos
                  conteudo custam menos — paginas em branco sao cobradas como Gratis. Paginas
                  escaneadas requerem formatacao manual (DTP) e sao tarifadas como Alta
                  Densidade. O preco reflete a complexidade real — nunca por estimativa generica.
                </Text>
              </View>
            )}

            {/* ── SAVINGS BOX — last page only, after all cards ──── */}
            {isLast && hasSavings && (
              <View style={S.savingsBox}>
                <View style={S.savingsHead}>
                  <View style={S.savingsLeft}>
                    <Text style={S.savingsTitle}>
                      OTIMIZACAO DO ORCAMENTO — PROMOBI CUIDA DO SEU DINHEIRO
                    </Text>
                    <Text style={S.savingsSub}>
                      Nossa equipe removeu paginas desnecessarias para reduzir seu custo
                    </Text>
                  </View>
                  <Text style={S.savingsAmt}>-${totalSavings.toFixed(2)}</Text>
                </View>
                <View style={S.savingsStats}>
                  <View style={S.statItem}>
                    <Text style={S.statNum}>{totalAnalyzed}</Text>
                    <Text style={S.statLbl}>paginas{'\n'}analisadas</Text>
                  </View>
                  <View style={S.statDiv} />
                  <View style={S.statItem}>
                    <Text style={S.statNum}>{totalPages}</Text>
                    <Text style={S.statLbl}>necessarias{'\n'}para o processo</Text>
                  </View>
                  <View style={S.statDiv} />
                  <View style={S.statItem}>
                    <Text style={S.statNumGr}>{totalExcluded}</Text>
                    <Text style={S.statLbl}>removidas{'\n'}pela equipe</Text>
                  </View>
                </View>
                <Text style={S.savingsDesc}>
                  Nossa equipe revisou cada documento e identificou quais paginas sao
                  realmente necessarias para o seu processo. As paginas desnecessarias
                  foram excluidas do orcamento, gerando uma economia real de
                  ${totalSavings.toFixed(2)}. Voce paga apenas pelo que e essencial.
                </Text>
              </View>
            )}

            {/* ── TOTAL — last page only ────────────────────────── */}
            {isLast && (
              <View style={S.totalBox}>
                <View style={S.totalTopRow}>
                  <View>
                    <Text style={S.totalLabel}>INVESTIMENTO TOTAL</Text>
                    <Text style={S.totalName}>{clientName}</Text>
                    <Text style={S.totalMeta}>
                      {totalDocs} docs · {totalPages} pags · Traducao Certificada USCIS
                    </Text>
                  </View>
                  <View style={S.totalRight}>
                    <Text style={S.totalCurr}>USD</Text>
                    <Text style={S.totalVal}>${totalAmt.toFixed(2)}</Text>
                  </View>
                </View>
                <View style={S.totalDiv} />
                <View style={S.payRow}>
                  {[
                    { t: 'ZELLE',        s: 'Transferencia instantanea nos EUA' },
                    { t: 'PIX / BOLETO', s: 'Pagamento via Brasil'              },
                    { t: 'CARTAO',       s: 'Credito ou debito via Stripe'      },
                  ].map((p, i, arr) => (
                    <View key={i} style={[S.payCard, i === arr.length - 1 ? S.payCardLast : {}]}>
                      <Text style={S.payTitle}>{p.t}</Text>
                      <Text style={S.payText}>{p.s}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ── FOOTER — absolute, every page ────────────────── */}
            <View style={S.footer}>
              <View>
                <Text style={S.footerAddr}>4700 Millenia Blvd, Orlando, FL 32839, USA</Text>
                <Text style={S.footerContact}>(321) 324-5851 · info@promobi.us</Text>
              </View>
              <View style={S.footerRight}>
                <Text style={S.footerUrl}>www.promobi.us</Text>
                <Text style={S.footerPage}>{pageNum}/{totalPdfPages}</Text>
              </View>
            </View>

          </Page>
        );
      })}
    </Document>
  );
};
