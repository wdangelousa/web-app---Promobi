'use client'

import { motion } from 'framer-motion'
import { sourceSerif } from './HeroSection'

const fadeInUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
}

const viewport = { once: true, margin: '-80px' }

const densities = [
    {
        level: 'Baixa',
        price: '$5',
        description: 'Certidões simples, formulários com poucos campos preenchidos.',
        fillPercent: 30,
        bars: [
            { width: 'w-[90%]' },
            { width: 'w-[40%]' },
            { width: 'w-[20%]' },
            { width: 'w-[60%]' },
        ],
        color: 'bg-[var(--landing-green)]',
        textColor: 'text-[var(--landing-green)]',
        borderColor: 'border-[var(--landing-green)]/20',
        bgColor: 'bg-[var(--landing-green)]/5',
    },
    {
        level: 'Media',
        price: '$7',
        description: 'Históricos escolares, extratos bancários, CNH completa.',
        fillPercent: 60,
        bars: [
            { width: 'w-[95%]' },
            { width: 'w-[80%]' },
            { width: 'w-[70%]' },
            { width: 'w-[85%]' },
        ],
        color: 'bg-[var(--landing-blue)]',
        textColor: 'text-[var(--landing-blue)]',
        borderColor: 'border-[var(--landing-blue)]/20',
        bgColor: 'bg-[var(--landing-blue)]/5',
    },
    {
        level: 'Alta',
        price: '$9',
        description: 'Contratos densos, antecedentes criminais, documentos jurídicos.',
        fillPercent: 90,
        bars: [
            { width: 'w-[98%]' },
            { width: 'w-[95%]' },
            { width: 'w-[92%]' },
            { width: 'w-[97%]' },
        ],
        color: 'bg-[var(--landing-bronze)]',
        textColor: 'text-[var(--landing-bronze)]',
        borderColor: 'border-[var(--landing-bronze)]/20',
        bgColor: 'bg-[var(--landing-bronze)]/5',
    },
]

export function DensidadeExplainerSection() {
    return (
        <section className="px-4 py-20 sm:px-6 lg:px-8 bg-white">
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={viewport}
                className="mx-auto max-w-[1200px]"
            >
                <motion.div variants={fadeInUp} className="max-w-[680px]">
                    <p className="text-[11px] font-bold tracking-[0.28em] uppercase text-[var(--landing-bronze)]">
                        O Nosso Diferencial
                    </p>
                    <h2 className={`${sourceSerif.className} mt-4 text-3xl leading-[1.08] text-[var(--landing-text)] sm:text-4xl`}>
                        Preço justo baseado na{' '}
                        <span className="italic text-[var(--landing-bronze)]">densidade real</span> do documento
                    </h2>
                    <p className="mt-5 max-w-[580px] text-base leading-8 text-[var(--landing-text-muted)]">
                        Em vez de cobrar página cheia, a nossa IA mede o conteúdo real do arquivo.
                        Você só paga pelo que realmente precisa ser traduzido.
                    </p>
                </motion.div>

                <div className="mt-14 grid gap-6 md:grid-cols-3">
                    {densities.map((density) => (
                        <motion.div
                            key={density.level}
                            variants={fadeInUp}
                            className={`rounded-[var(--landing-radius-lg)] border ${density.borderColor} ${density.bgColor} p-6`}
                        >
                            <div className="flex items-center justify-between">
                                <span className={`text-sm font-bold ${density.textColor}`}>{density.level} densidade</span>
                                <span className={`${sourceSerif.className} text-2xl font-bold ${density.textColor}`}>
                                    {density.price}<span className="text-sm font-normal">/pag</span>
                                </span>
                            </div>

                            <div className="mt-5 rounded-[16px] border border-[var(--landing-border)]/50 bg-white p-4">
                                <div className="flex items-center justify-between text-[11px] font-bold text-[var(--landing-text-muted)] mb-3">
                                    <span>Página exemplo</span>
                                    <span className={density.textColor}>{density.fillPercent}% preenchido</span>
                                </div>
                                <div className="space-y-2">
                                    {density.bars.map((bar, idx) => (
                                        <div key={idx} className="h-2 rounded-full bg-[var(--landing-bg-warm)]">
                                            <div className={`h-full rounded-full ${density.color} ${bar.width}`} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <p className="mt-4 text-sm leading-6 text-[var(--landing-text-muted)]">
                                {density.description}
                            </p>
                        </motion.div>
                    ))}
                </div>

                <motion.div
                    variants={fadeInUp}
                    className="mt-10 rounded-[var(--landing-radius)] border border-[var(--landing-green)]/20 bg-[var(--landing-green)]/5 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
                >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--landing-green)]/10">
                        <svg className="h-5 w-5 text-[var(--landing-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <p className="text-sm leading-6 text-[var(--landing-text-muted)]">
                        <strong className="text-[var(--landing-text)]">Economia média de 23%</strong> comparado a serviços
                        que cobram preço fixo por página independente do conteúdo.
                    </p>
                </motion.div>
            </motion.div>
        </section>
    )
}
