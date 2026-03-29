'use client'

import { motion } from 'framer-motion'
import { Upload, Languages, BadgeCheck } from 'lucide-react'
import { sourceSerif } from './HeroSection'

const fadeInUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
}

const viewport = { once: true, margin: '-80px' }

const steps = [
    {
        number: '01',
        icon: Upload,
        title: 'Envie seu documento',
        description: 'Faça upload do PDF, foto ou scan. A nossa IA analisa a densidade do conteúdo e calcula o preço justo na hora.',
        color: 'text-[var(--landing-bronze)]',
        bg: 'bg-[var(--landing-bronze)]/10',
        borderColor: 'border-[var(--landing-bronze)]/20',
    },
    {
        number: '02',
        icon: Languages,
        title: 'Tradução certificada',
        description: 'Tradutores qualificados realizam a tradução com Certificate of Accuracy, no formato exigido pelos órgãos americanos.',
        color: 'text-[var(--landing-blue)]',
        bg: 'bg-[var(--landing-blue)]/10',
        borderColor: 'border-[var(--landing-blue)]/20',
    },
    {
        number: '03',
        icon: BadgeCheck,
        title: 'Certificação e entrega',
        description: 'Documento certificado e, se necessário, notarizado por Notário Público da Flórida. Entrega digital imediata.',
        color: 'text-[var(--landing-green)]',
        bg: 'bg-[var(--landing-green)]/10',
        borderColor: 'border-[var(--landing-green)]/20',
    },
]

export function ComoFuncionaSection() {
    return (
        <section id="como-funciona" className="px-4 py-20 sm:px-6 lg:px-8 bg-[var(--landing-bg-page)]">
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={viewport}
                className="mx-auto max-w-[1200px]"
            >
                <motion.div variants={fadeInUp} className="text-center max-w-[600px] mx-auto">
                    <p className="text-[11px] font-bold tracking-[0.28em] uppercase text-[var(--landing-bronze)]">
                        Como Funciona
                    </p>
                    <h2 className={`${sourceSerif.className} mt-4 text-3xl leading-[1.08] text-[var(--landing-text)] sm:text-4xl`}>
                        Três passos simples para resolver seus documentos
                    </h2>
                </motion.div>

                <div className="mt-14 grid gap-6 md:grid-cols-3">
                    {steps.map((step) => (
                        <motion.div
                            key={step.number}
                            variants={fadeInUp}
                            className={`rounded-[var(--landing-radius-lg)] border ${step.borderColor} bg-white p-6 sm:p-8 shadow-[0_8px_30px_rgba(45,42,38,0.06)] transition-shadow hover:shadow-[0_12px_40px_rgba(45,42,38,0.1)]`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${step.bg}`}>
                                    <step.icon className={`h-5 w-5 ${step.color}`} />
                                </div>
                                <span className={`text-sm font-bold ${step.color}`}>{step.number}</span>
                            </div>
                            <h3 className={`${sourceSerif.className} mt-5 text-xl text-[var(--landing-text)]`}>
                                {step.title}
                            </h3>
                            <p className="mt-3 text-sm leading-7 text-[var(--landing-text-muted)]">
                                {step.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </motion.div>
        </section>
    )
}
