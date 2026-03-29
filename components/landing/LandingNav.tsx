'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Globe, Lock } from 'lucide-react'
import { useLocale } from '../../lib/i18n'

export function LandingNav() {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const { locale, setLocale, t } = useLocale()

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen)
    const toggleLocale = () => setLocale(locale === 'pt' ? 'es' : 'pt')

    const navLinks = [
        { href: '#como-funciona', label: 'Como Funciona' },
        { href: '#calculator', label: 'Preços' },
        { href: '#especialidades', label: 'Serviços' },
        { href: '#faq', label: 'FAQ' },
    ]

    return (
        <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--landing-bg-page)]/95 backdrop-blur-md border-b border-[var(--landing-border)]/40">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-[88px] md:h-[100px] flex items-center justify-between">
                <Link href="/">
                    <Image
                        src="/logo-promobi-transparent.png"
                        width={400}
                        height={120}
                        alt="Promobidocs"
                        className="object-contain h-[68px] md:h-[80px] w-auto"
                        priority
                    />
                </Link>

                <nav className="hidden lg:flex items-center gap-6">
                    {navLinks.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className="text-sm font-medium text-[var(--landing-text-muted)] hover:text-[var(--landing-bronze)] transition-colors"
                        >
                            {link.label}
                        </a>
                    ))}

                    <button
                        onClick={toggleLocale}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--landing-border)] hover:border-[var(--landing-bronze)] hover:text-[var(--landing-bronze)] transition-all text-xs font-bold text-[var(--landing-text-muted)]"
                        title={locale === 'pt' ? 'Cambiar a Español' : 'Mudar para Português'}
                    >
                        <Globe className="h-3.5 w-3.5" />
                        {t('header.languageSwitch')}
                    </button>

                    <a
                        href="#calculator"
                        className="bg-[var(--landing-bronze)] hover:bg-[var(--landing-copper)] text-white px-6 py-2.5 rounded-full font-bold shadow-md transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-2"
                    >
                        {t('header.startOrder')}
                    </a>
                </nav>

                <div className="lg:hidden flex items-center gap-2">
                    <button
                        onClick={toggleLocale}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-[var(--landing-border)] text-xs font-bold text-[var(--landing-text-muted)] hover:text-[var(--landing-bronze)] hover:border-[var(--landing-bronze)] transition-all"
                    >
                        <Globe className="h-3 w-3" />
                        {t('header.languageSwitch')}
                    </button>
                    <button
                        onClick={toggleMenu}
                        className="p-2 text-[var(--landing-text-muted)] hover:text-[var(--landing-bronze)] transition-colors"
                    >
                        {isMenuOpen ? <X size={28} /> : <Menu size={28} />}
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {isMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="lg:hidden bg-white border-b border-[var(--landing-border)]/40 overflow-hidden"
                    >
                        <nav className="flex flex-col p-4 space-y-3">
                            {navLinks.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    onClick={toggleMenu}
                                    className="text-[var(--landing-text)] font-medium py-2 hover:text-[var(--landing-bronze)] transition-colors"
                                >
                                    {link.label}
                                </a>
                            ))}
                            <a
                                href="#calculator"
                                onClick={toggleMenu}
                                className="bg-[var(--landing-bronze)] hover:bg-[var(--landing-copper)] text-white px-6 py-3 rounded-[var(--landing-radius)] font-bold transition-all text-center"
                            >
                                {t('header.startOrder')}
                            </a>
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    )
}
