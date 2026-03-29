'use client'

import { motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { sourceSerif } from './HeroSection'

const fadeInUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
}

const viewport = { once: true, margin: '-80px' }

const badges = [
    {
        src: '/logo-notary.png',
        title: 'Florida Notary Public',
        description: 'Notário Público comissionado no Estado da Flórida para certificar traduções oficiais.',
    },
    {
        src: '/logo-ata.png',
        title: 'ATA Member',
        description: 'Membro da American Translators Association, maior associação de tradutores dos EUA.',
    },
    {
        src: '/atif.png',
        title: 'ATIF Member',
        description: 'Membro da Association of Translators and Interpreters of Florida.',
    },
]

const guarantees = [
    'Aceitação garantida pelo USCIS ou refazemos grátis',
    'Certificate of Accuracy incluso em toda tradução',
    'Criptografia de nível bancário para seus documentos',
    'Suporte humano em português por WhatsApp',
    'Preço transparente — sem taxas escondidas',
    'Revisão dupla antes da entrega final',
]

export function CredibilidadeSection() {
    return (
        <section className="px-4 py-20 sm:px-6 lg:px-8 bg-[var(--landing-bg-page)]">
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={viewport}
                className="mx-auto max-w-[1200px]"
            >
                <motion.div variants={fadeInUp} className="text-center max-w-[600px] mx-auto">
                    <p className="text-[11px] font-bold tracking-[0.28em] uppercase text-[var(--landing-bronze)]">
                        Credibilidade
                    </p>
                    <h2 className={`${sourceSerif.className} mt-4 text-3xl leading-[1.08] text-[var(--landing-text)] sm:text-4xl`}>
                        Confiança construída com certificações reais
                    </h2>
                </motion.div>

                <div className="mt-14 grid gap-6 md:grid-cols-3">
                    {badges.map((badge) => (
                        <motion.div
                            key={badge.title}
                            variants={fadeInUp}
                            className="rounded-[var(--landing-radius-lg)] border border-[var(--landing-border)] bg-white p-6 text-center shadow-[0_8px_24px_rgba(45,42,38,0.05)]"
                        >
                            <div className="mx-auto flex h-14 items-center justify-center">
                                <img src={badge.src} alt={badge.title} className="h-12 sm:h-14 w-auto object-contain" />
                            </div>
                            <h3 className={`${sourceSerif.className} mt-4 text-lg text-[var(--landing-text)]`}>
                                {badge.title}
                            </h3>
                            <p className="mt-2 text-sm leading-6 text-[var(--landing-text-muted)]">
                                {badge.description}
                            </p>
                        </motion.div>
                    ))}
                </div>

                <motion.div
                    variants={fadeInUp}
                    className="mt-10 rounded-[var(--landing-radius-lg)] border border-[var(--landing-border)] bg-white p-6 sm:p-8"
                >
                    <h3 className={`${sourceSerif.className} text-xl text-[var(--landing-text)]`}>
                        As nossas garantias
                    </h3>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {guarantees.map((guarantee) => (
                            <div key={guarantee} className="flex items-start gap-3">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--landing-green)]" />
                                <span className="text-sm leading-6 text-[var(--landing-text-muted)]">{guarantee}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        </section>
    )
}
