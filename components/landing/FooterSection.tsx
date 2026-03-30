'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { sourceSerif } from './HeroSection'

const fadeInUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
}

const viewport = { once: true, margin: '-80px' }

export function FooterSection() {
    return (
        <footer className="bg-[var(--landing-text)] px-4 pb-7 pt-12 text-[var(--landing-text-light)] sm:px-6 lg:px-8">
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={viewport}
                className="mx-auto max-w-[1200px]"
            >
                <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
                    <motion.div variants={fadeInUp}>
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--landing-bronze)] to-[var(--landing-gold)] text-lg font-black text-white">
                                P
                            </div>
                            <div>
                                <p className={`${sourceSerif.className} text-3xl leading-none text-white`}>Promobidocs</p>
                                <p className="mt-1 text-sm text-[var(--landing-text-light)]">Tradução certificada e notarização oficial</p>
                            </div>
                        </div>
                        <p className="mt-5 max-w-[420px] text-sm leading-7 text-[var(--landing-text-light)]">
                            Plataforma digital para tradução certificada e notarização online com mais clareza, mais
                            agilidade e mais confiança para a comunidade imigrante.
                        </p>
                    </motion.div>

                    <motion.div variants={fadeInUp}>
                        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Serviços</h3>
                        <div className="mt-5 space-y-3 text-sm">
                            <a href="#calculator" className="block transition-colors hover:text-white">
                                Tradução Certificada
                            </a>
                            <a href="#calculator" className="block transition-colors hover:text-white">
                                Notarização Oficial
                            </a>
                            <a href="#especialidades" className="block transition-colors hover:text-white">
                                USCIS
                            </a>
                            <a href="#especialidades" className="block transition-colors hover:text-white">
                                DMV
                            </a>
                        </div>
                    </motion.div>

                    <motion.div variants={fadeInUp}>
                        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Contato</h3>
                        <div className="mt-5 space-y-3 text-sm">
                            <p>Kissimmee, FL</p>
                            <a
                                href="https://wa.me/14076396154"
                                target="_blank"
                                rel="noreferrer"
                                className="block text-[var(--landing-gold)] transition-colors hover:text-white"
                            >
                                +1 407 639-6154
                            </a>
                            <a href="mailto:desk@promobidocs.com" className="block transition-colors hover:text-white">
                                desk@promobidocs.com
                            </a>
                        </div>
                    </motion.div>
                </div>

                <motion.div
                    variants={fadeInUp}
                    className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-6 text-sm md:flex-row md:items-center md:justify-between"
                >
                    <p>&copy; 2026 Promobidocs Services LLC.</p>
                    <a href="/admin/orders" className="text-[var(--landing-text-light)]/40 transition-colors hover:text-[var(--landing-text-light)]">
                        Acesso Colaborador
                    </a>
                </motion.div>
            </motion.div>
        </footer>
    )
}
