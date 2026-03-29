'use client'

import { motion } from 'framer-motion'
import { Globe, GraduationCap, Landmark, Car } from 'lucide-react'
import { sourceSerif } from './HeroSection'

const fadeInUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
}

const viewport = { once: true, margin: '-80px' }

const services = [
    {
        icon: Globe,
        title: 'Imigração (USCIS)',
        description: 'Certidões, antecedentes e documentos civis com linguagem adequada para processos imigratórios.',
        badge: 'Mais pedido',
    },
    {
        icon: GraduationCap,
        title: 'Educação',
        description: 'Históricos, diplomas e transcripts para universidades, mestrados e conselhos profissionais.',
    },
    {
        icon: Landmark,
        title: 'Bancos & Financeiro',
        description: 'Extratos, imposto de renda e comprovantes para mortgage, abertura de conta e underwriting.',
    },
    {
        icon: Car,
        title: "DMV (Driver's License)",
        description: 'CNH brasileira traduzida com o formato esperado para atendimento no DMV.',
    },
]

export function EspecialidadesSection() {
    return (
        <section id="especialidades" className="px-4 py-20 sm:px-6 lg:px-8 bg-white">
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={viewport}
                className="mx-auto max-w-[1200px]"
            >
                <motion.div variants={fadeInUp} className="text-center max-w-[600px] mx-auto">
                    <p className="text-[11px] font-bold tracking-[0.28em] uppercase text-[var(--landing-bronze)]">
                        Especialidades
                    </p>
                    <h2 className={`${sourceSerif.className} mt-4 text-3xl leading-[1.08] text-[var(--landing-text)] sm:text-4xl`}>
                        Documentos aceitos em qualquer órgão americano
                    </h2>
                </motion.div>

                <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {services.map((service) => (
                        <motion.div
                            key={service.title}
                            variants={fadeInUp}
                            className="rounded-[var(--landing-radius)] border border-[var(--landing-border)]/50 bg-[var(--landing-bg-page)] p-6 transition-all hover:bg-white hover:shadow-[0_12px_32px_rgba(45,42,38,0.08)] hover:border-[var(--landing-border)]"
                        >
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--landing-bronze)]/10">
                                <service.icon className="h-5 w-5 text-[var(--landing-bronze)]" />
                            </div>
                            <div className="mt-4 flex items-center gap-2">
                                <h3 className={`${sourceSerif.className} text-lg text-[var(--landing-text)]`}>
                                    {service.title}
                                </h3>
                                {service.badge && (
                                    <span className="rounded-full bg-[var(--landing-bronze)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                        {service.badge}
                                    </span>
                                )}
                            </div>
                            <p className="mt-3 text-sm leading-7 text-[var(--landing-text-muted)]">
                                {service.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </motion.div>
        </section>
    )
}
