'use client'

import { motion } from 'framer-motion'
import { FileText, ShieldCheck, Clock, DollarSign } from 'lucide-react'
import { sourceSerif } from './HeroSection'

const fadeInUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
}

const viewport = { once: true, margin: '-80px' }

const stats = [
    {
        icon: FileText,
        value: '4,000+',
        label: 'Documentos traduzidos',
        color: 'text-[var(--landing-bronze)]',
        bg: 'bg-[var(--landing-bronze)]/10',
    },
    {
        icon: ShieldCheck,
        value: '100%',
        label: 'Aceite no USCIS',
        color: 'text-[var(--landing-green)]',
        bg: 'bg-[var(--landing-green)]/10',
    },
    {
        icon: Clock,
        value: '<24h',
        label: 'Entrega mais rápida',
        color: 'text-[var(--landing-blue)]',
        bg: 'bg-[var(--landing-blue)]/10',
    },
    {
        icon: DollarSign,
        value: '$5-9',
        label: 'Por página',
        color: 'text-[var(--landing-coral)]',
        bg: 'bg-[var(--landing-coral)]/10',
    },
]

export function StatsSection() {
    return (
        <section className="px-4 py-16 sm:px-6 lg:px-8 bg-white">
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={viewport}
                className="mx-auto max-w-[1200px] grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6"
            >
                {stats.map((stat) => (
                    <motion.div
                        key={stat.label}
                        variants={fadeInUp}
                        className="rounded-[var(--landing-radius)] border border-[var(--landing-border)]/50 bg-[var(--landing-bg-page)] p-5 sm:p-6 text-center"
                    >
                        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${stat.bg}`}>
                            <stat.icon className={`h-5 w-5 ${stat.color}`} />
                        </div>
                        <p className={`${sourceSerif.className} mt-4 text-3xl font-bold text-[var(--landing-text)] sm:text-4xl`}>
                            {stat.value}
                        </p>
                        <p className="mt-1 text-sm text-[var(--landing-text-muted)]">{stat.label}</p>
                    </motion.div>
                ))}
            </motion.div>
        </section>
    )
}
