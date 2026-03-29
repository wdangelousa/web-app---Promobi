'use client'

import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Source_Serif_4, DM_Sans } from 'next/font/google'

const sourceSerif = Source_Serif_4({
    subsets: ['latin'],
    display: 'swap',
    weight: ['400', '600', '700'],
})

const dmSans = DM_Sans({
    subsets: ['latin'],
    display: 'swap',
})

export { sourceSerif, dmSans }

const fadeInUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
}

const viewport = { once: true, margin: '-80px' }

export function HeroSection({ children }: { children?: ReactNode }) {
    return (
        <section className="relative overflow-hidden px-4 pb-20 pt-28 sm:px-6 lg:px-8 lg:pt-32">
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
                style={{
                    background:
                        'radial-gradient(circle at 22% 12%, var(--landing-bg-warm) 0%, rgba(245,241,235,0.82) 24%, rgba(250,250,247,0) 68%)',
                }}
            />

            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={viewport}
                className="relative mx-auto grid max-w-[1200px] items-start gap-12 lg:grid-cols-[0.92fr_1.08fr]"
            >
                <motion.div variants={fadeInUp} className="flex flex-col justify-start lg:pr-6 lg:pt-2">
                    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--landing-border)] bg-white/90 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--landing-copper)] shadow-sm">
                        IA de Densidade + Florida Notary
                    </span>

                    <h1
                        className={`${sourceSerif.className} mt-6 text-[2.75rem] leading-[1.05] text-[var(--landing-text)] sm:text-[3.25rem] lg:text-[3.75rem]`}
                    >
                        Traduções Certificadas.
                        <span className="mt-2 block italic text-[var(--landing-bronze)]">
                            Orçamento exato na hora.
                        </span>
                    </h1>

                    <p className="mt-6 max-w-[470px] text-base leading-8 text-[var(--landing-text-muted)] sm:text-[1.05rem]">
                        A nossa IA analisa o conteúdo real do seu documento para garantir o preço mais justo do
                        mercado. 100% online, sem troca de e-mails, com aceitação garantida no USCIS.
                    </p>

                    <div className="mt-7 flex flex-wrap gap-2">
                        {['USCIS', 'DMV', 'Universidades', 'Bancos americanos'].map((tag) => (
                            <span
                                key={tag}
                                className="rounded-full border border-[var(--landing-border)] bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--landing-text-muted)]"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>

                    <div className="mt-7 flex flex-wrap items-center gap-2.5">
                        {[
                            { src: '/logo-notary.png', alt: 'Florida Notary Public', label: 'FL Notary Public' },
                            { src: '/logo-ata.png', alt: 'ATA Member', label: 'ATA Member' },
                            { src: '/atif.png', alt: 'ATIF Member', label: 'ATIF Member' },
                        ].map((badge) => (
                            <div
                                key={badge.label}
                                className="inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white px-3.5 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                            >
                                <img src={badge.src} alt={badge.alt} className="h-6 w-auto object-contain" />
                                <span className="text-xs font-semibold text-[var(--landing-text-muted)]">{badge.label}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-9 flex flex-col gap-3 sm:flex-row">
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
                            Falar no WhatsApp
                        </a>
                    </div>
                </motion.div>

                <motion.div variants={fadeInUp} className="relative self-start lg:sticky lg:top-28">
                    <div className="pointer-events-none absolute inset-x-10 top-8 h-24 rounded-full bg-[var(--landing-bronze)]/10 blur-3xl" />
                    <div id="calculator" className="relative rounded-[var(--landing-radius-lg)] border border-[var(--landing-border)] bg-white/95 p-3 shadow-[0_20px_40px_rgba(45,42,38,0.08)] backdrop-blur-md">
                        {children}
                    </div>
                </motion.div>
            </motion.div>
        </section>
    )
}
