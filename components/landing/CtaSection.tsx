'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { sourceSerif } from './HeroSection'

const fadeInUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
}

const viewport = { once: true, margin: '-80px' }

export function CtaSection() {
    return (
        <section className="px-4 py-20 sm:px-6 lg:px-8 bg-[var(--landing-bg-page)]">
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={viewport}
                className="mx-auto max-w-[1200px] grid gap-10 lg:grid-cols-[1fr_auto] items-center"
            >
                <motion.div variants={fadeInUp}>
                    <p className="text-[11px] font-bold tracking-[0.28em] uppercase text-[var(--landing-bronze)]">
                        Pronto para começar?
                    </p>
                    <h2 className={`${sourceSerif.className} mt-4 max-w-[560px] text-3xl leading-[1.08] text-[var(--landing-text)] sm:text-4xl`}>
                        Resolva seus documentos com transparência e agilidade
                    </h2>
                    <p className="mt-4 max-w-[440px] text-[15px] leading-7 text-[var(--landing-text-muted)]">
                        Faça o orçamento em 30 segundos e veja o valor final antes de qualquer compromisso.
                    </p>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                        <a
                            href="#calculator"
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--landing-bronze)] px-8 py-3.5 font-bold text-white shadow-lg shadow-[var(--landing-bronze)]/20 transition-all hover:scale-[1.03] hover:bg-[var(--landing-copper)]"
                        >
                            Fazer Orçamento <ArrowRight className="h-4 w-4" />
                        </a>
                        <a
                            href="https://wa.me/14076396154"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-full border border-[var(--landing-border)] bg-white px-7 py-3.5 font-semibold text-[var(--landing-text)] transition-colors hover:border-[var(--landing-bronze)] hover:text-[var(--landing-copper)]"
                        >
                            WhatsApp
                        </a>
                    </div>
                </motion.div>

                <motion.div variants={fadeInUp} className="flex flex-col items-start lg:items-end">
                    <div className="text-left lg:text-right">
                        <p className={`${sourceSerif.className} text-[3.2rem] font-bold leading-none tracking-tight text-[var(--landing-text)]`}>
                            100%
                        </p>
                        <p className="mt-2 text-[13px] font-medium uppercase tracking-[0.2em] text-[var(--landing-text-light)]">
                            Aceite no USCIS
                        </p>
                    </div>
                    <div className="my-8 h-px w-[120px] bg-[var(--landing-border)]" />
                    <div className="text-left lg:text-right">
                        <p className={`${sourceSerif.className} text-[3.2rem] font-bold leading-none tracking-tight text-[var(--landing-text)]`}>
                            24h
                        </p>
                        <p className="mt-2 text-[13px] font-medium uppercase tracking-[0.2em] text-[var(--landing-text-light)]">
                            Entrega mais rápida
                        </p>
                    </div>
                </motion.div>
            </motion.div>
        </section>
    )
}
