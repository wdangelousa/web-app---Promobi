// components/ProposalPDF.tsx
// Premium redesign + Otimização de páginas

import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

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
  greenLight:  '#D1FAE5',
  green:       '#065F46',
  greenBg:     '#ECFDF5',
  greenBorder: '#6EE7B7',
  redLight:    '#FEE2E2',
  blueLight:   '#DBEAFE',
};

const DENSITY: Record<string, { label: string; color: string; bg: string; pct: string }> = {
  high:    { label: 'Alta',      color: '#B91C1C', bg: '#FEE2E2', pct: '100%' },
  medium:  { label: 'Media',     color: '#92400E', bg: '#FEF3C7', pct: '50%'  },
  low:     { label: 'Baixa',     color: '#065F46', bg: '#D1FAE5', pct: '25%'  },
  blank:   { label: 'Em branco', color: '#6B7280', bg: '#F3F4F6', pct: 'Free' },
  scanned: { label: 'Escaneada', color: '#1D4ED8', bg: '#DBEAFE', pct: '100%' },
};

const getDensity = (d: string) => DENSITY[d] || DENSITY.high;

const buildRanges = (pages: any[], includedOnly = false) => {
  const src = includedOnly ? pages.filter((p: any) => p.included !== false) : pages;
  if (!src?.length) return [{ label: 'Pag. 1', density: 'high' }];
  const groups: Array<{ start: number; end: number; density: string }> = [];
  let cur = { start: src[0].pageNumber, end: src[0].pageNumber, density: src[0].density };
  for (let i = 1; i < src.length; i++) {
    if (src[i].density === cur.density) { cur.end = src[i].pageNumber; }
    else { groups.push({ ...cur }); cur = { start: src[i].pageNumber, end: src[i].pageNumber, density: src[i].density }; }
  }
  groups.push(cur);
  return groups.map(g => ({
    label: g.start === g.end ? `Pag. ${g.start}` : `Pags. ${g.start}-${g.end}`,
    density: g.density,
  }));
};

const cleanName = (raw: string) =>
  (raw || '').split(/[/\\]/).pop()?.replace(/\.(pdf|doc|docx|jpg|jpeg|png)$/i, '') || raw;

const safeMeta = (raw: any) => {
  try { return typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {}); }
  catch { return {}; }
};

const safeDate = (val: any) => {
  try { return new Date(val).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }); }
};

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: C.white, color: C.dark, fontSize: 10, paddingBottom: 68 },

  // Header
  header:        { backgroundColor: C.dark, paddingHorizontal: 36, paddingTop: 26, paddingBottom: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  headerAccent:  { height: 4, backgroundColor: C.orange },
  logo:          { height: 38, width: 'auto' },
  logoText:      { fontFamily: 'Helvetica-Bold', fontSize: 18, color: C.orange, letterSpacing: 1 },
  headerTagline: { fontSize: 7, color: C.lightGray, marginTop: 4, letterSpacing: 0.5 },
  headerRight:   { alignItems: 'flex-end' },
  headerBadge:   { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.orange, letterSpacing: 2, marginBottom: 3 },
  headerId:      { fontFamily: 'Helvetica-Bold', fontSize: 28, color: C.white },
  headerDate:    { fontFamily: 'Courier', fontSize: 8, color: C.lightGray, marginTop: 3 },

  // Client hero
  hero:        { backgroundColor: C.bgLight, paddingHorizontal: 36, paddingTop: 26, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  heroLabel:   { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.gray, letterSpacing: 2.5, marginBottom: 8 },
  heroNameRow: { flexDirection: 'row', alignItems: 'center' },
  heroAccent:  { width: 5, height: 28, backgroundColor: C.orange, borderRadius: 2, marginRight: 11 },
  heroName:    { fontFamily: 'Helvetica-Bold', fontSize: 24, color: C.dark },
  heroEmail:   { fontFamily: 'Helvetica', fontSize: 8, color: C.gray, marginTop: 4, marginLeft: 16 },
  heroPills:   { flexDirection: 'row', gap: 8 },
  pill:        { borderWidth: 1.5, borderColor: C.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', backgroundColor: C.white },
  pillAlt:     { borderColor: C.orange, backgroundColor: C.orangeLight },
  pillGreen:   { borderColor: C.greenBorder, backgroundColor: C.greenBg },
  pillVal:     { fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.dark },
  pillValAlt:  { fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.orange },
  pillValGreen:{ fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.green },
  pillLbl:     { fontFamily: 'Helvetica', fontSize: 7, color: C.gray, letterSpacing: 0.3, marginTop: 2 },

  // Section
  secRow:   { paddingHorizontal: 28, paddingTop: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' },
  secDot:   { width: 6, height: 6, backgroundColor: C.orange, borderRadius: 3, marginRight: 8 },
  secTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.dark, letterSpacing: 1.5 },
  secLine:  { flex: 1, height: 1, backgroundColor: C.border, marginLeft: 10 },

  // Document card
  card:         { marginHorizontal: 20, marginBottom: 8, borderWidth: 1, borderColor: C.border, borderRadius: 8, overflow: 'hidden' },
  cardHead:     { backgroundColor: C.bgMid, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.border },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  typeTag:      { fontFamily: 'Helvetica-Bold', fontSize: 7, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, marginRight: 8 },
  cardTitle:    { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.dark, flex: 1 },
  cardMeta:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 8 },
  pagesBadge:   { flexDirection: 'row', alignItems: 'baseline', backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  pagesNum:     { fontFamily: 'Helvetica-Bold', fontSize: 12, color: C.dark },
  pagesLbl:     { fontFamily: 'Helvetica', fontSize: 7, color: C.gray, marginLeft: 3 },
  cardSubtotal: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.dark },

  // Density rows
  densBody:    { paddingHorizontal: 14, paddingVertical: 8 },
  densRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  densRowLast: { marginBottom: 0 },
  densRange:   { fontFamily: 'Courier', fontSize: 8, color: C.gray, width: 76 },
  densArrow:   { fontSize: 8, color: C.lightGray, marginHorizontal: 5 },
  densBadge:   { fontFamily: 'Helvetica-Bold', fontSize: 7, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginRight: 8 },
  densPct:     { fontFamily: 'Courier', fontSize: 8, color: C.gray },
  densPrice:   { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.slate, marginLeft: 'auto' },

  // Excluded pages note inside card
  excludedNote:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.greenBg, borderRadius: 6, borderWidth: 1, borderColor: C.greenBorder },
  excludedNoteText: { fontFamily: 'Helvetica', fontSize: 8, color: C.green, flex: 1 },
  excludedNoteSave: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.green },

  // Optimization box (global)
  optBox:        { marginHorizontal: 20, marginTop: 4, marginBottom: 4, backgroundColor: C.greenBg, borderWidth: 1.5, borderColor: C.greenBorder, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12 },
  optHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  optTitle:      { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.green, letterSpacing: 0.5 },
  optSavingsVal: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.green },
  optRow:        { flexDirection: 'row', gap: 20, marginBottom: 6 },
  optStat:       { alignItems: 'flex-start' },
  optStatVal:    { fontFamily: 'Helvetica-Bold', fontSize: 13, color: C.dark },
  optStatLbl:    { fontFamily: 'Helvetica', fontSize: 7, color: C.gray, marginTop: 1 },
  optDivider:    { height: 1, backgroundColor: C.greenBorder, marginVertical: 8, opacity: 0.5 },
  optNote:       { fontFamily: 'Helvetica', fontSize: 8, color: C.green, lineHeight: 1.6 },

  // Audit
  auditBox:   { marginHorizontal: 20, marginTop: 6, backgroundColor: C.orangeLight, borderLeftWidth: 3, borderLeftColor: C.orange, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 9 },
  auditTitle: { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.orange, letterSpacing: 0.5, marginBottom: 4 },
  auditText:  { fontFamily: 'Helvetica', fontSize: 8, color: C.slate, lineHeight: 1.6 },

  // Total
  totalBox:    { marginHorizontal: 20, marginTop: 14, backgroundColor: C.dark, borderRadius: 10, paddingHorizontal: 26, paddingVertical: 20 },
  totalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  totalLabel:  { fontFamily: 'Helvetica-Bold', fontSize: 7, color: C.lightGray, letterSpacing: 2, marginBottom: 4 },
  totalName:   { fontFamily: 'Helvetica-Bold', fontSize: 15, color: C.white },
  totalMeta:   { fontFamily: 'Helvetica', fontSize: 8, color: C.lightGray, marginTop: 3 },
  totalRight:  { alignItems: 'flex-end' },
  totalCurr:   { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.orange, marginBottom: 2 },
  totalVal:    { fontFamily: 'Helvetica-Bold', fontSize: 34, color: C.orange, lineHeight: 1 },
  totalDiv:    { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  payRow:      { flexDirection: 'row', gap: 8 },
  payCard:     { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  payTitle:    { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.white, marginBottom: 3 },
  payText:     { fontFamily: 'Helvetica', fontSize: 7, color: C.lightGray },

  // Footer
  footer:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bgMid, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 36, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerAddr:    { fontFamily: 'Helvetica', fontSize: 7, color: C.slate },
  footerContact: { fontFamily: 'Helvetica', fontSize: 7, color: C.gray, marginTop: 2 },
  footerRight:   { alignItems: 'flex-end' },
  footerUrl:     { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.orange },
  footerPage:    { fontFamily: 'Helvetica', fontSize: 7, color: C.lightGray, marginTop: 2 },

  // Continuation header
  contHead:  { backgroundColor: C.dark, paddingHorizontal: 36, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contLeft:  { flexDirection: 'row', alignItems: 'center' },
  contDot:   { width: 5, height: 5, backgroundColor: C.orange, borderRadius: 3, marginRight: 7 },
  contTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.white },
  contMeta:  { fontFamily: 'Helvetica', fontSize: 8, color: C.lightGray },
  contLine:  { height: 2, backgroundColor: C.orange },
});

// ─── Document card ────────────────────────────────────────────────────────────
const DocCard = ({ doc, idx, base }: { doc: any; idx: number; base: number }) => {
  const raw    = doc.fileName || doc.exactNameOnDoc || `Documento ${idx + 1}`;
  const name   = cleanName(raw);
  const isLink = !!doc.externalLink;
  const isPDF  = /\.pdf$/i.test(raw);
  const tagStyle = isLink
    ? { color: '#065F46', backgroundColor: C.greenLight }
    : isPDF ? { color: '#B91C1C', backgroundColor: C.redLight }
    : { color: '#1D4ED8', backgroundColor: C.blueLight };
  const tag = isLink ? 'LINK' : isPDF ? 'PDF' : 'DOC';

  const allPages      = doc.analysis?.pages ?? []
  const includedPages = allPages.filter((p: any) => p.included !== false)
  const excludedPages = allPages.filter((p: any) => p.included === false)

  const pageCount = includedPages.length || doc.count || 1
  const subtotal  = (doc.analysis?.totalPrice ?? pageCount * base)
                  + (doc.notarized ? 25 : 0)

  // originalTotalPrice = price if ALL pages were included
  const originalTotal = doc.analysis?.originalTotalPrice
    ?? allPages.reduce((s: number, p: any) => s + (p.price ?? base), 0)
  const savings = originalTotal - (doc.analysis?.totalPrice ?? subtotal)

  const ranges = buildRanges(includedPages.length > 0 ? includedPages : allPages)

  const priceHint = (pct: string) =>
    pct === 'Free' ? 'Gratis' : `$${(base * parseFloat(pct) / 100).toFixed(2)}/pag`

  return (
    <View style={S.card}>
      {/* Card header */}
      <View style={S.cardHead}>
        <View style={S.cardHeadLeft}>
          <Text style={[S.typeTag, tagStyle]}>{tag}</Text>
          <Text style={S.cardTitle} numberOfLines={2}>{name}</Text>
        </View>
        <View style={S.cardMeta}>
          <View style={S.pagesBadge}>
            <Text style={S.pagesNum}>{pageCount}</Text>
            <Text style={S.pagesLbl}>{pageCount === 1 ? 'pag.' : 'pags.'}</Text>
          </View>
          <Text style={S.cardSubtotal}>${subtotal.toFixed(2)}</Text>
        </View>
      </View>

      {/* Excluded pages note — shown only when some pages were removed */}
      {excludedPages.length > 0 && (
        <View style={S.excludedNote}>
          <Text style={S.excludedNoteText}>
            {excludedPages.length === 1
              ? `Pag. ${excludedPages[0].pageNumber} nao e necessaria para o processo — excluida pela equipe Promobi.`
              : `Pags. ${excludedPages.map((p: any) => p.pageNumber).join(', ')} nao sao necessarias para o processo — excluidas pela equipe Promobi.`
            }
          </Text>
          {savings > 0 && (
            <Text style={S.excludedNoteSave}>-${savings.toFixed(2)}</Text>
          )}
        </View>
      )}

      {/* Density breakdown — only included pages */}
      <View style={S.densBody}>
        {ranges.map((r, ri) => {
          const cfg = getDensity(r.density);
          return (
            <View key={ri} style={[S.densRow, ri === ranges.length - 1 ? S.densRowLast : {}]}>
              <Text style={S.densRange}>{r.label}</Text>
              <Text style={S.densArrow}>{'>'}</Text>
              <Text style={[S.densBadge, { color: cfg.color, backgroundColor: cfg.bg }]}>{cfg.label}</Text>
              <Text style={S.densPct}>{cfg.pct} da tarifa</Text>
              <Text style={S.densPrice}>{priceHint(cfg.pct)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
interface ProposalPDFProps {
  order: any;
  globalSettings: any;
  logoBase64?: string | null;
}

export const ProposalPDF = ({ order, globalSettings, logoBase64 }: ProposalPDFProps) => {
  const meta      = safeMeta(order?.metadata);
  const docs      = meta?.documents ?? [];
  const base      = globalSettings?.basePrice || 9;

  // Totals considering only included pages
  const totalIncludedPages = docs.reduce((s: number, d: any) => {
    const pages = d.analysis?.pages ?? [];
    const inc   = pages.filter((p: any) => p.included !== false);
    return s + (inc.length || d.count || 0);
  }, 0);

  const totalAllPages = docs.reduce((s: number, d: any) => {
    return s + (d.analysis?.pages?.length || d.count || 0);
  }, 0);

  const totalExcludedPages = totalAllPages - totalIncludedPages;

  // Savings = originalTotalPrice sum - actual sum
  const totalSavings = docs.reduce((s: number, d: any) => {
    const orig   = d.analysis?.originalTotalPrice ?? (d.analysis?.pages ?? []).reduce((a: number, p: any) => a + (p.price ?? base), 0);
    const actual = d.analysis?.totalPrice ?? 0;
    return s + (orig - actual);
  }, 0);

  const totalDocs  = docs.length;
  const totalAmt   = typeof order?.totalAmount === 'number' ? order.totalAmount : 0;
  const clientName = order?.user?.fullName || order?.clientName || 'Cliente Promobi';
  const clientEmail= order?.user?.email || order?.clientEmail || '';

  const hasOptimization = totalExcludedPages > 0 && totalSavings > 0;

  // Paginate: first page smaller due to hero block
  const FIRST = 3, REST = 5;
  const pages: any[][] = [];
  if (docs.length > 0) {
    pages.push(docs.slice(0, FIRST));
    let i = FIRST;
    while (i < docs.length) { pages.push(docs.slice(i, i + REST)); i += REST; }
  } else { pages.push([]); }

  const totalPdfPages = pages.length;

  return (
    <Document title={`Proposta-Promobi-${order?.id}`} author="Promobi">
      {pages.map((chunk, pi) => {
        const isFirst = pi === 0;
        const isLast  = pi === totalPdfPages - 1;
        const pageNum = pi + 1;

        return (
          <Page key={pi} size="A4" style={S.page}>

            {/* HEADER */}
            {isFirst ? (
              <>
                <View style={S.header}>
                  <View>
                    {logoBase64
                      ? <Image src={logoBase64} style={S.logo} />
                      : <Text style={S.logoText}>PROMOBi</Text>}
                    <Text style={S.headerTagline}>Traducao Certificada · USCIS Accepted</Text>
                  </View>
                  <View style={S.headerRight}>
                    <Text style={S.headerBadge}>COTACAO</Text>
                    <Text style={S.headerId}>#{order?.id}</Text>
                    <Text style={S.headerDate}>{safeDate(order?.createdAt)}</Text>
                  </View>
                </View>
                <View style={S.headerAccent} />

                {/* CLIENT HERO */}
                <View style={S.hero}>
                  <View>
                    <Text style={S.heroLabel}>PROPOSTA PREPARADA PARA</Text>
                    <View style={S.heroNameRow}>
                      <View style={S.heroAccent} />
                      <Text style={S.heroName}>{clientName}</Text>
                    </View>
                    {clientEmail ? <Text style={S.heroEmail}>{clientEmail}</Text> : null}
                  </View>
                  <View style={S.heroPills}>
                    <View style={S.pill}>
                      <Text style={S.pillVal}>{totalDocs}</Text>
                      <Text style={S.pillLbl}>documentos</Text>
                    </View>
                    <View style={S.pill}>
                      <Text style={S.pillVal}>{totalIncludedPages}</Text>
                      <Text style={S.pillLbl}>paginas</Text>
                    </View>
                    {/* Savings pill — only shown when there was optimization */}
                    {hasOptimization && (
                      <View style={[S.pill, S.pillGreen]}>
                        <Text style={S.pillValGreen}>-${totalSavings.toFixed(2)}</Text>
                        <Text style={S.pillLbl}>economia</Text>
                      </View>
                    )}
                    <View style={[S.pill, S.pillAlt]}>
                      <Text style={S.pillValAlt}>${totalAmt.toFixed(2)}</Text>
                      <Text style={S.pillLbl}>total USD</Text>
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
                <View style={S.contLine} />
              </>
            )}

            {/* SECTION LABEL */}
            <View style={S.secRow}>
              <View style={S.secDot} />
              <Text style={S.secTitle}>ANALISE DETALHADA POR DOCUMENTO</Text>
              <View style={S.secLine} />
            </View>

            {/* DOC CARDS */}
            {chunk.length === 0
              ? <View style={{ marginHorizontal: 20, padding: 20 }}><Text style={{ color: C.gray }}>Nenhum documento.</Text></View>
              : chunk.map((doc, di) => {
                  const gi = isFirst ? di : FIRST + (pi - 1) * REST + di;
                  return <DocCard key={gi} doc={doc} idx={gi} base={base} />;
                })
            }

            {/* OPTIMIZATION BOX — shown on first page after docs, only if applicable */}
            {isFirst && hasOptimization && (
              <View style={S.optBox}>
                <View style={S.optHeader}>
                  <Text style={S.optTitle}>OTIMIZACAO DO ORCAMENTO — PROMOBI CUIDA DO SEU DINHEIRO</Text>
                  <Text style={S.optSavingsVal}>-${totalSavings.toFixed(2)}</Text>
                </View>
                <View style={S.optRow}>
                  <View style={S.optStat}>
                    <Text style={S.optStatVal}>{totalAllPages}</Text>
                    <Text style={S.optStatLbl}>paginas analisadas</Text>
                  </View>
                  <View style={S.optStat}>
                    <Text style={S.optStatVal}>{totalIncludedPages}</Text>
                    <Text style={S.optStatLbl}>necessarias para o processo</Text>
                  </View>
                  <View style={S.optStat}>
                    <Text style={[S.optStatVal, { color: C.green }]}>{totalExcludedPages}</Text>
                    <Text style={S.optStatLbl}>removidas pela equipe</Text>
                  </View>
                </View>
                <View style={S.optDivider} />
                <Text style={S.optNote}>
                  Nossa equipe revisou cada documento e identificou quais paginas sao realmente necessarias para o seu processo. As paginas desnecessarias foram excluidas do orcamento, gerando uma economia real de ${totalSavings.toFixed(2)}. Voce paga apenas pelo que e essencial.
                </Text>
              </View>
            )}

            {/* AUDIT NOTE */}
            {isFirst && (
              <View style={S.auditBox}>
                <Text style={S.auditTitle}>METODOLOGIA: PRECO JUSTO GARANTIDO</Text>
                <Text style={S.auditText}>
                  Cada pagina e analisada individualmente pela nossa IA. Paginas com menos conteudo custam menos.
                  Paginas escaneadas sao tarifadas como Alta Densidade por exigirem formatacao manual (DTP).
                  O preco reflete a complexidade real — nunca por estimativa.
                </Text>
              </View>
            )}

            {/* TOTAL — last page */}
            {isLast && (
              <View style={S.totalBox}>
                <View style={S.totalTopRow}>
                  <View>
                    <Text style={S.totalLabel}>INVESTIMENTO TOTAL</Text>
                    <Text style={S.totalName}>{clientName}</Text>
                    <Text style={S.totalMeta}>{totalDocs} docs · {totalIncludedPages} pags · Traducao Certificada USCIS</Text>
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
                  ].map((p, i) => (
                    <View key={i} style={S.payCard}>
                      <Text style={S.payTitle}>{p.t}</Text>
                      <Text style={S.payText}>{p.s}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* FOOTER */}
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
