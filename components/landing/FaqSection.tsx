'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { sourceSerif } from './HeroSection'

const fadeInUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
}

const smoothEase = [0.22, 1, 0.36, 1] as const

const viewport = { once: true, margin: '-80px' }

const faqItems = [
    {
        question: 'O que é Tradução Certificada nos EUA?',
        answer:
            'É a tradução acompanhada de um Certificate of Accuracy, declarando que o conteúdo em inglês representa fielmente o documento original. É o formato exigido por USCIS, universidades, bancos e diversos órgãos americanos.',
    },
    {
        question: 'Posso traduzir os meus próprios documentos?',
        answer:
            'Não. O USCIS e outros órgãos exigem que a tradução certificada seja feita por um terceiro qualificado, e não pelo próprio requerente nem por familiares diretos.',
    },
    {
        question: 'A Promobidocs é credenciada?',
        answer:
            'Sim. A nossa equipa atua em conformidade com os padrões exigidos nos EUA, com tradutores associados a entidades profissionais e validação por Notário Público comissionado no Estado da Flórida.',
    },
    {
        question: 'Preciso enviar o documento físico?',
        answer: 'Não. Todo o processo é 100% digital. Pode enviar PDF, foto ou scan legível, e nós tratamos do restante.',
    },
    {
        question: 'Como funciona o prazo?',
        answer: 'Standard (3-8 dias úteis), Express (48h) e Ultra Express (24h). O prazo começa a contar após a confirmação do pagamento.',
    },
    {
        question: 'Os meus dados estão seguros?',
        answer:
            'Sim. Utilizamos infraestrutura segura com criptografia de nível bancário. Os seus documentos ficam acessíveis apenas para a equipa responsável pelo caso.',
    },
]

export function FaqSection() {
    const [activeFaq, setActiveFaq] = useState<number | null>(null)

    return (
        <section id="faq" className="px-4 py-20 sm:px-6 lg:px-8 bg-white">
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={viewport}
                className="mx-auto max-w-[760px]"
            >
                <motion.div variants={fadeInUp} className="text-center">
                    <p className="text-[11px] font-bold tracking-[0.28em] uppercase text-[var(--landing-bronze)]">
                        FAQ
                    </p>
                    <h2 className={`${sourceSerif.className} mt-4 text-3xl leading-[1.08] text-[var(--landing-text)] sm:text-4xl`}>
                        Dúvidas frequentes
                    </h2>
                </motion.div>

                <div className="mt-10">
                    {faqItems.map((item, index) => {
                        const isOpen = activeFaq === index

                        return (
                            <motion.div
                                key={item.question}
                                variants={fadeInUp}
                                className="overflow-hidden border-b border-[var(--landing-border)]"
                            >
                                <button
                                    onClick={() => setActiveFaq(isOpen ? null : index)}
                                    className="flex w-full items-center justify-between gap-4 py-5 text-left transition-colors hover:text-[var(--landing-copper)]"
                                >
                                    <span className="font-semibold text-[var(--landing-text)]">{item.question}</span>
                                    <ChevronDown
                                        className={`h-4 w-4 shrink-0 text-[var(--landing-text-light)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                    />
                                </button>
                                <AnimatePresence initial={false}>
                                    {isOpen && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.32, ease: smoothEase }}
                                            className="overflow-hidden"
                                        >
                                            <div className="pb-5 pr-8 text-sm leading-7 text-[var(--landing-text-muted)]">
                                                {item.answer}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )
                    })}
                </div>
            </motion.div>
        </section>
    )
}
