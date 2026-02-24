// components/ProposalPDF.tsx
// Premium redesign: Layout "Americanizado" de Alta Autoridade + Otimização de páginas

import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const C = {
    orange: '#E8751A',
    orangeLight: '#FEF0E6',
    // Trocado para um Slate 900 super premium (passa mais segurança e autoridade corporativa)
    dark: '#0F172A',
    slate: '#334155',
    gray: '#64748B',
    lightGray: '#94A3B8',
    border: '#E2E8F0',
    bgLight: '#F8FAFC',
    bgMid: '#F1F5F9',
    white: '#FFFFFF',
    greenLight: '#D1FAE5',
    green: '#059669',
    greenBg: '#ECFDF5',
    greenBorder: '#6EE7B7',
    redLight: '#FEE2E2',
    blueLight: '#DBEAFE',
};

const DENSITY: Record<string, { label: string; color: string; bg: string; pct: string }> = {
    high: { label: 'Alta', color: '#B91C1C', bg: '#FEE2E2', pct: '100%' },
    medium: { label: 'Média', color: '#B45309', bg: '#FEF3C7', pct: '50%' },
    low: { label: 'Baixa', color: '#059669', bg: '#D1FAE5', pct: '25%' },
    blank: { label: 'Em branco', color: '#64748B', bg: '#F1F5F9', pct: 'Free' },
    scanned: { label: 'Escaneada', color: '#1D4ED8', bg: '#DBEAFE', pct: '100%' },
};

const getDensity = (d: string) => DENSITY[d] || DENSITY.high;

const buildRanges = (pages: any[], includedOnly = false) => {
    const src = includedOnly ? pages.filter((p: any) => p.included !== false) : pages;
    if (!src?.length) return [{ label: 'Pág. 1', density: 'high' }];
    const groups: Array<{ start: number; end: number; density: string }> = [];
    let cur = { start: src[0].pageNumber, end: src[0].pageNumber, density: src[0].density };
    for (let i = 1; i < src.length; i++) {
        if (src[i].density === cur.density) { cur.end = src[i].pageNumber; }
        else { groups.push({ ...cur }); cur = { start: src[i].pageNumber, end: src[i].pageNumber, density: src[i].density }; }
    }
    groups.push(cur);
    return groups.map(g => ({
        label: g.start === g.end ? `Pág. ${g.start}` : `Págs. ${g.start}-${g.end}`,
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

    // Header Premium
    header: { backgroundColor: C.dark, paddingHorizontal: 40, paddingTop: 35, paddingBottom: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    headerAccent: { height: 5, backgroundColor: C.orange },
    // O SEGREDO DA LOGO PERFEITA ESTÁ AQUI: objectFit e dimensões claras
    logo: { width: 150, height: 45, objectFit: 'contain' },
    logoText: { fontFamily: 'Helvetica-Bold', fontSize: 22, color: C.white, letterSpacing: 1.5 },
    headerTagline: { fontSize: 8, color: C.lightGray, marginTop: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
    headerRight: { alignItems: 'flex-end' },
    headerBadge: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.orange, letterSpacing: 2.5, marginBottom: 6 },
    headerId: { fontFamily: 'Helvetica-Bold', fontSize: 26, color: C.white },
    headerDate: { fontFamily: 'Courier', fontSize: 9, color: C.lightGray, marginTop: 5 },

    // Client hero (Estilo Fatura Executiva)
    hero: { backgroundColor: C.bgLight, paddingHorizontal: 40, paddingTop: 30, paddingBottom: 25, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    heroLabel: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.gray, letterSpacing: 2, marginBottom: 10 },
    heroNameRow: { flexDirection: 'row', alignItems: 'center' },
    heroAccent: { width: 4, height: 26, backgroundColor: C.orange, borderRadius: 2, marginRight: 12 },
    heroName: { fontFamily: 'Helvetica-Bold', fontSize: 22, color: C.dark },
    heroEmail: { fontFamily: 'Helvetica', fontSize: 9, color: C.gray, marginTop: 6, marginLeft: 16 },
    heroPills: { flexDirection: 'row', gap: 10 },
    pill: { borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', backgroundColor: C.white, minWidth: 70 },
    pillAlt: { borderColor: C.orange, backgroundColor: C.orangeLight },
    pillGreen: { borderColor: C.greenBorder, backgroundColor: C.greenBg },
    pillVal: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.dark },
    pillValAlt: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.orange },
    pillValGreen: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.green },
    pillLbl: { fontFamily: 'Helvetica', fontSize: 7, color: C.gray, letterSpacing: 0.5, marginTop: 3, textTransform: 'uppercase' },

    // Section
    secRow: { paddingHorizontal: 30, paddingTop: 25, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' },
    secDot: { width: 6, height: 6, backgroundColor: C.orange, borderRadius: 3, marginRight: 10 },
    secTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.dark, letterSpacing: 1.5 },
    secLine: { flex: 1, height: 1, backgroundColor: C.border, marginLeft: 12 },

    // Document card
    card: { marginHorizontal: 25, marginBottom: 12, borderWidth: 1, borderColor: C.border, borderRadius: 8, overflow: 'hidden' },
    cardHead: { backgroundColor: C.bgMid, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.border },
    cardHeadLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    typeTag: { fontFamily: 'Helvetica-Bold', fontSize: 8, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, marginRight: 10 },
    cardTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.dark, flex: 1 },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 10 },
    pagesBadge: { flexDirection: 'row', alignItems: 'baseline', backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
    pagesNum: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: C.dark },
    pagesLbl: { fontFamily: 'Helvetica', fontSize: 7, color: C.gray, marginLeft: 3 },
    cardSubtotal: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.dark },

    // Density rows
    densBody: { paddingHorizontal: 16, paddingVertical: 10 },
    densRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    densRowLast: { marginBottom: 0 },
    densRange: { fontFamily: 'Courier', fontSize: 9, color: C.slate, width: 80 },
    densArrow: { fontSize: 9, color: C.lightGray, marginHorizontal: 6 },
    densBadge: { fontFamily: 'Helvetica-Bold', fontSize: 7, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, marginRight: 10, textTransform: 'uppercase' },
    densPct: { fontFamily: 'Courier', fontSize: 9, color: C.gray },
    densPrice: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.dark, marginLeft: 'auto' },

    // Excluded pages note
    excludedNote: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.greenBg, borderRadius: 4, borderWidth: 1, borderColor: C.greenBorder },
    excludedNoteText: { fontFamily: 'Helvetica', fontSize: 8, color: C.green, flex: 1 },
    excludedNoteSave: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.green },

    // Optimization box
    optBox: { marginHorizontal: 25, marginTop: 10, marginBottom: 5, backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.greenBorder, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 16 },
    optHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    optTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.green, letterSpacing: 0.5 },
    optSavingsVal: { fontFamily: 'Helvetica-Bold', fontSize: 18, color: C.green },
    optRow: { flexDirection: 'row', gap: 25, marginBottom: 8 },
    optStat: { alignItems: 'flex-start' },
    optStatVal: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.dark },
    optStatLbl: { fontFamily: 'Helvetica', fontSize: 8, color: C.gray, marginTop: 2 },
    optDivider: { height: 1, backgroundColor: C.greenBorder, marginVertical: 10, opacity: 0.5 },
    optNote: { fontFamily: 'Helvetica', fontSize: 9, color: C.green, lineHeight: 1.5 },

    // Audit Box
    auditBox: { marginHorizontal: 25, marginTop: 10, backgroundColor: C.bgLight, borderLeftWidth: 4, borderLeftColor: C.orange, borderRadius: 4, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: C.border },
    auditTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.slate, letterSpacing: 1, marginBottom: 6 },
    auditText: { fontFamily: 'Helvetica', fontSize: 9, color: C.gray, lineHeight: 1.5 },

    // Total Area
    totalBox: { marginHorizontal: 25, marginTop: 20, backgroundColor: C.dark, borderRadius: 8, paddingHorizontal: 30, paddingVertical: 25 },
    totalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
    totalLabel: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.lightGray, letterSpacing: 2, marginBottom: 6 },
    totalName: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.white },
    totalMeta: { fontFamily: 'Helvetica', fontSize: 9, color: C.lightGray, marginTop: 4 },
    totalRight: { alignItems: 'flex-end' },
    totalCurr: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.orange, marginBottom: 2 },
    totalVal: { fontFamily: 'Helvetica-Bold', fontSize: 38, color: C.orange, lineHeight: 1 },
    totalDiv: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 16 },
    payRow: { flexDirection: 'row', gap: 10 },
    payCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    payTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.white, marginBottom: 4 },
    payText: { fontFamily: 'Helvetica', fontSize: 8, color: C.lightGray },

    // Footer
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bgLight, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 40, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    footerAddr: { fontFamily: 'Helvetica', fontSize: 8, color: C.slate },
    footerContact: { fontFamily: 'Helvetica', fontSize: 8, color: C.gray, marginTop: 3 },
    footerRight: { alignItems: 'flex-end' },
    footerUrl: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.orange },
    footerPage: { fontFamily: 'Helvetica', fontSize: 8, color: C.lightGray, marginTop: 3 },

    // Continuation header
    contHead: { backgroundColor: C.dark, paddingHorizontal: 40, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    contLeft: { flexDirection: 'row', alignItems: 'center' },
    contDot: { width: 6, height: 6, backgroundColor: C.orange, borderRadius: 3, marginRight: 10 },
    contTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.white },
    contMeta: { fontFamily: 'Helvetica', fontSize: 9, color: C.lightGray },
    contLine: { height: 3, backgroundColor: C.orange },
});

// ─── Document card ────────────────────────────────────────────────────────────

const DocCard = ({ doc, idx, base }: { doc: any; idx: number; base: number }) => {
    const raw = doc.fileName || doc.exactNameOnDoc || `Documento ${idx + 1}`;
    const name = cleanName(raw);
    const isLink = !!doc.externalLink;
    const isPDF = /\.pdf$/i.test(raw);
    const tagStyle = isLink
        ? { color: '#059669', backgroundColor: C.greenLight }
        : isPDF ? { color: '#B91C1C', backgroundColor: C.redLight }
            : { color: '#1D4ED8', backgroundColor: C.blueLight };
    const tag = isLink ? 'LINK' : isPDF ? 'PDF' : 'DOC';

    const allPages = doc.analysis?.pages ?? []
    const includedPages = allPages.filter((p: any) => p.included !== false)
    const excludedPages = allPages.filter((p: any) => p.included === false)

    const pageCount = includedPages.length || doc.count || 1
    const subtotal = (doc.analysis?.totalPrice ?? pageCount * base)
        + (doc.notarized ? 25 : 0)

    const originalTotal = doc.analysis?.originalTotalPrice
        ?? allPages.reduce((s: number, p: any) => s + (p.price ?? base), 0)
    const savings = originalTotal - (doc.analysis?.totalPrice ?? subtotal)

    const ranges = buildRanges(includedPages.length > 0 ? includedPages : allPages)

    const priceHint = (pct: string) =>
        pct === 'Free' ? 'Grátis' : `$${(base * parseFloat(pct) / 100).toFixed(2)}/pág`

    return (
        <View style={S.card}>
            <View style={S.cardHead}>
                <View style={S.cardHeadLeft}>
                    <Text style={[S.typeTag, tagStyle]}>{tag}</Text>
                    <Text style={S.cardTitle}>{name}</Text>
                </View>
                <View style={S.cardMeta}>
                    <View style={S.pagesBadge}>
                        <Text style={S.pagesNum}>{pageCount}</Text>
                        <Text style={S.pagesLbl}>{pageCount === 1 ? 'pág.' : 'págs.'}</Text>
                    </View>
                    <Text style={S.cardSubtotal}>${subtotal.toFixed(2)}</Text>
                </View>
            </View>

            {excludedPages.length > 0 && (
                <View style={S.excludedNote}>
                    <Text style={S.excludedNoteText}>
                        {excludedPages.length === 1
                            ? `Pág. ${excludedPages[0].pageNumber} não é necessária para o processo — excluída pela equipe Promobi.`
                            : `Págs. ${excludedPages.map((p: any) => p.pageNumber).join(', ')} não são necessárias para o processo — excluídas pela equipe Promobi.`
                        }
                    </Text>
                    {savings > 0 && (
                        <Text style={S.excludedNoteSave}>-${savings.toFixed(2)}</Text>
                    )}
                </View>
            )}

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
    const meta = safeMeta(order?.metadata);
    const docs = meta?.documents ?? [];
    const base = globalSettings?.basePrice || 9;

    const totalIncludedPages = docs.reduce((s: number, d: any) => {
        const pages = d.analysis?.pages ?? [];
        const inc = pages.filter((p: any) => p.included !== false);
        return s + (inc.length || d.count || 0);
    }, 0);

    const totalAllPages = docs.reduce((s: number, d: any) => {
        return s + (d.analysis?.pages?.length || d.count || 0);
    }, 0);

    const totalExcludedPages = totalAllPages - totalIncludedPages;

    const totalSavings = docs.reduce((s: number, d: any) => {
        const orig = d.analysis?.originalTotalPrice ?? (d.analysis?.pages ?? []).reduce((a: number, p: any) => a + (p.price ?? base), 0);
        const actual = d.analysis?.totalPrice ?? 0;
        return s + (orig - actual);
    }, 0);

    const totalDocs = docs.length;
    const totalAmt = typeof order?.totalAmount === 'number' ? order.totalAmount : 0;
    const clientName = order?.user?.fullName || order?.clientName || 'Cliente Promobi';
    const clientEmail = order?.user?.email || order?.clientEmail || '';

    const hasOptimization = totalExcludedPages > 0 && totalSavings > 0;

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
                const isLast = pi === totalPdfPages - 1;
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
                                        <Text style={S.headerTagline}>Tradução Certificada · USCIS Accepted</Text>
                                    </View>
                                    <View style={S.headerRight}>
                                        <Text style={S.headerBadge}>COTAÇÃO</Text>
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
                                            <Text style={S.pillLbl}>páginas</Text>
                                        </View>
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
                                    <Text style={S.contMeta}>Página {pageNum} de {totalPdfPages}</Text>
                                </View>
                                <View style={S.contLine} />
                            </>
                        )}

                        {/* SECTION LABEL */}
                        <View style={S.secRow}>
                            <View style={S.secDot} />
                            <Text style={S.secTitle}>ANÁLISE DETALHADA POR DOCUMENTO</Text>
                            <View style={S.secLine} />
                        </View>

                        {/* DOC CARDS */}
                        {chunk.length === 0
                            ? <View style={{ marginHorizontal: 25, padding: 20 }}><Text style={{ color: C.gray }}>Nenhum documento listado.</Text></View>
                            : chunk.map((doc, di) => {
                                const gi = isFirst ? di : FIRST + (pi - 1) * REST + di;
                                return <DocCard key={gi} doc={doc} idx={gi} base={base} />;
                            })
                        }

                        {/* OPTIMIZATION BOX */}
                        {isFirst && hasOptimization && (
                            <View style={S.optBox}>
                                <View style={S.optHeader}>
                                    <Text style={S.optTitle}>OTIMIZAÇÃO DO ORÇAMENTO — PROMOBI CUIDA DO SEU DINHEIRO</Text>
                                    <Text style={S.optSavingsVal}>-${totalSavings.toFixed(2)}</Text>
                                </View>
                                <View style={S.optRow}>
                                    <View style={S.optStat}>
                                        <Text style={S.optStatVal}>{totalAllPages}</Text>
                                        <Text style={S.optStatLbl}>páginas analisadas</Text>
                                    </View>
                                    <View style={S.optStat}>
                                        <Text style={S.optStatVal}>{totalIncludedPages}</Text>
                                        <Text style={S.optStatLbl}>necessárias para o processo</Text>
                                    </View>
                                    <View style={S.optStat}>
                                        <Text style={[S.optStatVal, { color: C.green }]}>{totalExcludedPages}</Text>
                                        <Text style={S.optStatLbl}>removidas pela equipe</Text>
                                    </View>
                                </View>
                                <View style={S.optDivider} />
                                <Text style={S.optNote}>
                                    Nossa equipe revisou cada documento e identificou quais páginas são realmente necessárias para o seu processo. As páginas desnecessárias foram excluídas do orçamento, gerando uma economia real de ${totalSavings.toFixed(2)}. Você paga apenas pelo que é essencial.
                                </Text>
                            </View>
                        )}

                        {/* AUDIT NOTE */}
                        {isFirst && (
                            <View style={S.auditBox}>
                                <Text style={S.auditTitle}>METODOLOGIA: PREÇO JUSTO GARANTIDO</Text>
                                <Text style={S.auditText}>
                                    Cada página é analisada individualmente pela nossa IA. Páginas com menos conteúdo custam menos.
                                    Páginas escaneadas são tarifadas como Alta Densidade por exigirem formatação manual (DTP).
                                    O preço reflete a complexidade real — nunca por estimativa.
                                </Text>
                            </View>
                        )}

                        {/* TOTAL */}
                        {isLast && (
                            <View style={S.totalBox}>
                                <View style={S.totalTopRow}>
                                    <View>
                                        <Text style={S.totalLabel}>INVESTIMENTO TOTAL</Text>
                                        <Text style={S.totalName}>{clientName}</Text>
                                        <Text style={S.totalMeta}>{totalDocs} docs · {totalIncludedPages} págs · Tradução Certificada USCIS</Text>
                                    </View>
                                    <View style={S.totalRight}>
                                        <Text style={S.totalCurr}>USD</Text>
                                        <Text style={S.totalVal}>${totalAmt.toFixed(2)}</Text>
                                    </View>
                                </View>
                                <View style={S.totalDiv} />
                                <View style={S.payRow}>
                                    {[
                                        { t: 'ZELLE', s: 'Transferência instantânea nos EUA' },
                                        { t: 'PIX / BOLETO', s: 'Pagamento via Brasil' },
                                        { t: 'CARTÃO', s: 'Crédito ou débito via Stripe' },
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