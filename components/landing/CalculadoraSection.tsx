'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { sourceSerif } from './HeroSection'

const fadeInUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
}

const viewport = { once: true, margin: '-80px' }

type DensityLevel = 'baixa' | 'media' | 'alta'

const densityPrices: Record<DensityLevel, number> = {
    baixa: 5,
    media: 7,
    alta: 9,
}

const densityLabels: Record<DensityLevel, string> = {
    baixa: 'Baixa',
    media: 'Media',
    alta: 'Alta',
}

const NOTARY_REVIEW = 15
const NOTARY_SEAL = 25

export function CalculadoraSection() {
    const [tab, setTab] = useState<'traducao' | 'notarizacao'>('traducao')
    const [pages, setPages] = useState(3)
    const [density, setDensity] = useState<DensityLevel>('media')
    const [notaryDocs, setNotaryDocs] = useState(1)

    const translationTotal = pages * densityPrices[density]
    const notaryTotal = notaryDocs * (NOTARY_REVIEW + NOTARY_SEAL)

    return (
        <section id="calculadora" className="px-4 py-20 sm:px-6 lg:px-8 bg-[var(--landing-bg-page)]">
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={viewport}
                className="mx-auto max-w-[640px]"
            >
                <motion.div variants={fadeInUp} className="text-center">
                    <p className="text-[11px] font-bold tracking-[0.28em] uppercase text-[var(--landing-bronze)]">
                        Calculadora
                    </p>
                    <h2 className={`${sourceSerif.className} mt-4 text-3xl leading-[1.08] text-[var(--landing-text)] sm:text-4xl`}>
                        Simule o valor do seu pedido
                    </h2>
                </motion.div>

                <motion.div
                    variants={fadeInUp}
                    className="mt-10 rounded-[var(--landing-radius-lg)] border border-[var(--landing-border)] bg-white p-6 sm:p-8 shadow-[0_16px_40px_rgba(45,42,38,0.08)]"
                >
                    <div className="flex rounded-full border border-[var(--landing-border)] bg-[var(--landing-bg-page)] p-1">
                        <button
                            onClick={() => setTab('traducao')}
                            className={`flex-1 rounded-full py-2.5 text-sm font-bold transition-all ${
                                tab === 'traducao'
                                    ? 'bg-[var(--landing-bronze)] text-white shadow-sm'
                                    : 'text-[var(--landing-text-muted)] hover:text-[var(--landing-text)]'
                            }`}
                        >
                            Tradução
                        </button>
                        <button
                            onClick={() => setTab('notarizacao')}
                            className={`flex-1 rounded-full py-2.5 text-sm font-bold transition-all ${
                                tab === 'notarizacao'
                                    ? 'bg-[var(--landing-bronze)] text-white shadow-sm'
                                    : 'text-[var(--landing-text-muted)] hover:text-[var(--landing-text)]'
                            }`}
                        >
                            Notarização
                        </button>
                    </div>

                    {tab === 'traducao' ? (
                        <div className="mt-8 space-y-8">
                            <div>
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-bold text-[var(--landing-text)]">
                                        Número de páginas
                                    </label>
                                    <span className={`${sourceSerif.className} text-2xl font-bold text-[var(--landing-bronze)]`}>
                                        {pages}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={1}
                                    max={20}
                                    value={pages}
                                    onChange={(e) => setPages(Number(e.target.value))}
                                    className="mt-3 w-full accent-[var(--landing-bronze)] h-2 rounded-full appearance-none bg-[var(--landing-bg-warm)] cursor-pointer"
                                />
                                <div className="flex justify-between text-xs text-[var(--landing-text-light)] mt-1">
                                    <span>1</span>
                                    <span>20</span>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm font-bold text-[var(--landing-text)]">
                                    Densidade média do conteúdo
                                </label>
                                <div className="mt-3 grid grid-cols-3 gap-3">
                                    {(['baixa', 'media', 'alta'] as DensityLevel[]).map((level) => (
                                        <button
                                            key={level}
                                            onClick={() => setDensity(level)}
                                            className={`rounded-[16px] border p-4 text-center transition-all ${
                                                density === level
                                                    ? 'border-[var(--landing-bronze)] bg-[var(--landing-bronze)]/5 shadow-sm'
                                                    : 'border-[var(--landing-border)] bg-[var(--landing-bg-page)] hover:border-[var(--landing-bronze)]/40'
                                            }`}
                                        >
                                            <p className={`text-sm font-bold ${density === level ? 'text-[var(--landing-bronze)]' : 'text-[var(--landing-text)]'}`}>
                                                {densityLabels[level]}
                                            </p>
                                            <p className={`${sourceSerif.className} mt-1 text-lg font-bold ${density === level ? 'text-[var(--landing-bronze)]' : 'text-[var(--landing-text-muted)]'}`}>
                                                ${densityPrices[level]}<span className="text-xs font-normal">/pag</span>
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-[var(--landing-radius)] bg-[var(--landing-bg-warm)] p-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wide text-[var(--landing-text-muted)]">
                                            Estimativa
                                        </p>
                                        <p className="mt-1 text-sm text-[var(--landing-text-muted)]">
                                            {pages} pag x ${densityPrices[density]}
                                        </p>
                                    </div>
                                    <p className={`${sourceSerif.className} text-3xl font-bold text-[var(--landing-text)]`}>
                                        ${translationTotal.toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-8 space-y-8">
                            <div>
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-bold text-[var(--landing-text)]">
                                        Documentos para notarizar
                                    </label>
                                    <span className={`${sourceSerif.className} text-2xl font-bold text-[var(--landing-bronze)]`}>
                                        {notaryDocs}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    value={notaryDocs}
                                    onChange={(e) => setNotaryDocs(Number(e.target.value))}
                                    className="mt-3 w-full accent-[var(--landing-bronze)] h-2 rounded-full appearance-none bg-[var(--landing-bg-warm)] cursor-pointer"
                                />
                                <div className="flex justify-between text-xs text-[var(--landing-text-light)] mt-1">
                                    <span>1</span>
                                    <span>10</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--landing-text-muted)]">Revisão de notarização</span>
                                    <span className="font-bold text-[var(--landing-text)]">${NOTARY_REVIEW}/doc</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--landing-text-muted)]">Selo notarial (Flórida)</span>
                                    <span className="font-bold text-[var(--landing-text)]">${NOTARY_SEAL}/doc</span>
                                </div>
                            </div>

                            <div className="rounded-[var(--landing-radius)] bg-[var(--landing-bg-warm)] p-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wide text-[var(--landing-text-muted)]">
                                            Estimativa
                                        </p>
                                        <p className="mt-1 text-sm text-[var(--landing-text-muted)]">
                                            {notaryDocs} doc x ${NOTARY_REVIEW + NOTARY_SEAL}
                                        </p>
                                    </div>
                                    <p className={`${sourceSerif.className} text-3xl font-bold text-[var(--landing-text)]`}>
                                        ${notaryTotal.toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <a
                        href="#calculator"
                        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--landing-bronze)] px-8 py-3.5 font-bold text-white shadow-lg shadow-[var(--landing-bronze)]/20 transition-all hover:scale-[1.02] hover:bg-[var(--landing-copper)]"
                    >
                        Começar Pedido <ArrowRight className="h-4 w-4" />
                    </a>

                    <p className="mt-4 text-center text-xs text-[var(--landing-text-light)]">
                        Valores estimados. O preço final é calculado após análise do documento pela IA.
                    </p>
                </motion.div>
            </motion.div>
        </section>
    )
}
