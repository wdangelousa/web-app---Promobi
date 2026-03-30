// ── Document Name Cleaning ──────────────────────────────────────────────────

const REMOVE_PREFIXES = [
    /^CamScanner\s*/i,
    /^WhatsApp\s*Image\s*/i,
    /^IMG[-_]\d{8}[-_]\d{4,6}\s*/i,
    /^IMG[-_]\s*/i,
    /^DOC[-_]\d{8}[-_]\d{4,6}\s*/i,
    /^DOC[-_]\s*/i,
    /^Screenshot\s*/i,
    /^Scan\s*/i,
    /^\d{8}[-_]\d{4,6}\s*/i,
]

const ACCENT_FIXES: [RegExp, string][] = [
    [/\bDeclarac['\u2019]?ao\b/gi, 'Declaracao'],
    [/\bCertidao\b/gi, 'Certidao'],
    [/\bHistorico\b/gi, 'Historico'],
    [/\bTraducao\b/gi, 'Traducao'],
    [/\bOrcamento\b/gi, 'Orcamento'],
    [/\bCotacao\b/gi, 'Cotacao'],
    [/\bCertificacao\b/gi, 'Certificacao'],
    [/\bProcuracao\b/gi, 'Procuracao'],
    [/\bDivorcio\b/gi, 'Divorcio'],
    [/\bObito\b/gi, 'Obito'],
    // Now apply proper accents
    [/\bCertidao\b/g, 'Certidao'],
    [/\bDeclaracao\b/g, 'Declaracao'],
]

const PROPER_ACCENTS: [string, string][] = [
    ['Certidao', 'Certidao de'],
    ['Declaracao', 'Declaracao'],
    ['Historico', 'Historico'],
    ['Traducao', 'Traducao'],
    ['Orcamento', 'Orcamento'],
    ['Cotacao', 'Cotacao'],
    ['Certificacao', 'Certificacao'],
    ['Procuracao', 'Procuracao'],
    ['Divorcio', 'Divorcio'],
    ['Obito', 'Obito'],
]

export function cleanDocumentName(raw: string | null | undefined): string {
    if (!raw || raw.trim().length === 0) return 'Documento Digitalizado'

    let name = raw.trim()

    // Remove file extension
    name = name.replace(/\.(pdf|jpeg|jpg|png|gif|tiff?|bmp|webp|docx?)$/i, '')

    // Remove common prefixes
    for (const prefix of REMOVE_PREFIXES) {
        name = name.replace(prefix, '')
    }

    // Replace underscores and multiple hyphens with spaces
    name = name.replace(/[_]+/g, ' ')
    name = name.replace(/-{2,}/g, ' ')
    name = name.replace(/\s{2,}/g, ' ')
    name = name.trim()

    // Fix common accent patterns
    for (const [pattern, replacement] of ACCENT_FIXES) {
        name = name.replace(pattern, replacement)
    }

    // Title case
    name = name
        .split(' ')
        .map((word) => {
            if (word.length <= 2 && /^(de|da|do|em|e|ou|no|na|os|as|ao)$/i.test(word)) {
                return word.toLowerCase()
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        })
        .join(' ')

    // Capitalize first letter always
    if (name.length > 0) {
        name = name.charAt(0).toUpperCase() + name.slice(1)
    }

    // Fix common Portuguese accents after title-casing
    const accentMap: Record<string, string> = {
        'Graduacao': 'Graduação',
        'Pos': 'Pós',
        'Historico': 'Histórico',
        'Certidao': 'Certidão',
        'Declaracao': 'Declaração',
        'Traducao': 'Tradução',
        'Educacao': 'Educação',
        'Apresentacao': 'Apresentação',
        'Participacao': 'Participação',
        'Prestacao': 'Prestação',
        'Associacao': 'Associação',
        'Solucoes': 'Soluções',
        'Metalicas': 'Metálicas',
        'Curriculo': 'Currículo',
        'Seguranca': 'Segurança',
        'Ciencias': 'Ciências',
        'Financas': 'Finanças',
        'Comercio': 'Comércio',
        'Procuracao': 'Procuração',
        'Divorcio': 'Divórcio',
        'Obito': 'Óbito',
        'Cotacao': 'Cotação',
        'Certificacao': 'Certificação',
        'Orcamento': 'Orçamento',
    }
    for (const [wrong, right] of Object.entries(accentMap)) {
        name = name.replace(new RegExp(`\\b${wrong}\\b`, 'g'), right)
    }

    // If name is empty or just numbers/special chars
    if (name.length === 0 || /^[\d\s\-_.]+$/.test(name)) {
        return 'Documento Digitalizado'
    }

    return name
}

// ── Proposal Validity ───────────────────────────────────────────────────────

export type ValidityStatus = 'valid' | 'expiring' | 'expired'

export interface ProposalValidity {
    status: ValidityStatus
    label: string
    daysRemaining: number
    expiresAt: Date | null
}

export function getProposalValidity(
    expiresAt: Date | string | null | undefined,
    createdAt?: Date | string | null,
): ProposalValidity {
    if (!expiresAt) {
        // Fallback: 7 days from creation
        if (createdAt) {
            const created = new Date(createdAt)
            const fallbackExpiry = new Date(created)
            fallbackExpiry.setDate(fallbackExpiry.getDate() + 7)
            return getProposalValidity(fallbackExpiry)
        }
        return { status: 'valid', label: 'Sem prazo definido', daysRemaining: 999, expiresAt: null }
    }

    const expiry = new Date(expiresAt)
    const now = new Date()
    const diffMs = expiry.getTime() - now.getTime()
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    const formattedDate = expiry.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    })

    if (daysRemaining < 0) {
        return {
            status: 'expired',
            label: 'Proposta expirada',
            daysRemaining: 0,
            expiresAt: expiry,
        }
    }

    if (daysRemaining <= 2) {
        return {
            status: 'expiring',
            label: `Expira em ${daysRemaining} dia${daysRemaining !== 1 ? 's' : ''}`,
            daysRemaining,
            expiresAt: expiry,
        }
    }

    return {
        status: 'valid',
        label: `Válida até ${formattedDate} (${daysRemaining} dias)`,
        daysRemaining,
        expiresAt: expiry,
    }
}

// ── Density Helpers ─────────────────────────────────────────────────────────

export type DensityType = 'high' | 'medium' | 'low' | 'blank' | 'scanned'

export function getDensityLabel(density: string): string {
    const labels: Record<string, string> = {
        high: 'Alta',
        medium: 'Média',
        low: 'Baixa',
        blank: 'Grátis',
        scanned: 'Escaneada',
    }
    return labels[density] || density
}

export function getDensityColor(density: string): string {
    const colors: Record<string, string> = {
        high: '#D97706',    // orange/amber
        medium: '#EAB308',  // yellow
        low: '#3B82F6',     // blue
        blank: '#22C55E',   // green
        scanned: '#EF4444', // red
    }
    return colors[density] || '#9CA3AF'
}

export function getDensityBgClass(density: string): string {
    const classes: Record<string, string> = {
        high: 'bg-amber-100 text-amber-800',
        medium: 'bg-yellow-100 text-yellow-800',
        low: 'bg-blue-100 text-blue-800',
        blank: 'bg-green-100 text-green-800',
        scanned: 'bg-red-100 text-red-800',
    }
    return classes[density] || 'bg-gray-100 text-gray-800'
}

// ── Benefits Calculation ────────────────────────────────────────────────────

export interface ProposalBenefit {
    type: 'audit' | 'free_pages' | 'discount'
    label: string
    savings: number
}

export function calculateBenefits(
    metadataDocuments: any[],
    financialSummary: { totalSavings: number; manualDiscountAmount: number; manualDiscountValue: number; manualDiscountType: string },
    dbDocuments?: { billablePages?: number | null; totalPages?: number | null; excludedFromScope?: boolean }[],
): ProposalBenefit[] {
    const benefits: ProposalBenefit[] = []

    // 1. Audit: pages removed by team (excludedFromScope docs or totalPages > billablePages)
    if (dbDocuments) {
        let auditedPages = 0
        for (const doc of dbDocuments) {
            if (doc.excludedFromScope) {
                auditedPages += doc.totalPages || 0
            } else if (doc.totalPages && doc.billablePages && doc.totalPages > doc.billablePages) {
                auditedPages += doc.totalPages - doc.billablePages
            }
        }
        if (auditedPages > 0 && financialSummary.totalSavings > 0) {
            benefits.push({
                type: 'audit',
                label: `Auditoria Promobidocs: ${auditedPages} página${auditedPages > 1 ? 's' : ''} removida${auditedPages > 1 ? 's' : ''} por não necessitarem tradução`,
                savings: financialSummary.totalSavings,
            })
        }
    }

    // 2. Free pages (blank density, price = 0)
    let freePages = 0
    let freeSavings = 0
    for (const doc of metadataDocuments) {
        const pages = doc?.analysis?.pages ?? []
        for (const page of pages) {
            if (page.density === 'blank' && page.included !== false) {
                freePages++
                // Free page saves what it would have cost at base price
            }
        }
    }
    if (freePages > 0) {
        benefits.push({
            type: 'free_pages',
            label: `${freePages} página${freePages > 1 ? 's' : ''} classificada${freePages > 1 ? 's' : ''} como grátis`,
            savings: 0, // Already reflected in base pricing
        })
    }

    // 3. Manual discount
    if (financialSummary.manualDiscountAmount > 0) {
        const pctLabel = financialSummary.manualDiscountType === 'percent'
            ? `${financialSummary.manualDiscountValue}%`
            : ''
        benefits.push({
            type: 'discount',
            label: `Desconto especial concedido${pctLabel ? ': ' + pctLabel : ''}`,
            savings: financialSummary.manualDiscountAmount,
        })
    }

    return benefits
}

// ── Density Distribution ────────────────────────────────────────────────────

export interface DensityDistribution {
    density: string
    label: string
    count: number
    percentage: number
    color: string
}

export function getDensityDistribution(documents: any[]): DensityDistribution[] {
    const counts: Record<string, number> = {}
    let total = 0

    for (const doc of documents) {
        const pages = doc?.analysis?.pages ?? []
        for (const page of pages) {
            if (page.included !== false) {
                const d = page.density || 'high'
                counts[d] = (counts[d] || 0) + 1
                total++
            }
        }
    }

    if (total === 0) return []

    const order: DensityType[] = ['blank', 'low', 'medium', 'high', 'scanned']
    return order
        .filter((d) => counts[d] > 0)
        .map((d) => ({
            density: d,
            label: getDensityLabel(d),
            count: counts[d],
            percentage: Math.round((counts[d] / total) * 100),
            color: getDensityColor(d),
        }))
}
