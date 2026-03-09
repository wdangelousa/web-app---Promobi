'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Globe, Lock } from 'lucide-react';
import { useLocale } from '../lib/i18n';

export const Header = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { locale, setLocale, t } = useLocale();

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const toggleLocale = () => setLocale(locale === 'pt' ? 'es' : 'pt');

    return (
        <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100"
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 md:h-24 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Link href="/">
                        <Image
                            src="/logo-promobidocs.png"
                            width={180}
                            height={60}
                            alt="Promobidocs"
                            className="object-contain h-16 md:h-20 w-auto"
                            priority
                        />
                    </Link>
                </div>

                <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
                    {/* Link para Área Administrativa Reinserido */}
                    <Link
                        href="/admin"
                        className="flex items-center gap-1.5 text-slate-500 hover:text-[#B8763E] transition-colors font-bold text-xs"
                    >
                        <Lock className="h-3.5 w-3.5" />
                        Admin
                    </Link>

                    <button
                        onClick={toggleLocale}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 hover:border-[#B8763E] hover:text-[#B8763E] transition-all text-xs font-bold"
                        title={locale === 'pt' ? 'Cambiar a Español' : 'Mudar para Português'}
                    >
                        <Globe className="h-3.5 w-3.5" />
                        {t('header.languageSwitch')}
                    </button>

                    <Link
                        href="#calculator"
                        className="bg-[#B8763E] hover:bg-[#9A6232] text-white px-6 py-2.5 rounded-full font-bold shadow-md hover:shadow-[#B8763E]/20 hover:scale-[1.02] transition-all active:scale-95 flex items-center gap-2"
                    >
                        {t('header.startOrder')}
                    </Link>
                </nav>

                <div className="md:hidden flex items-center gap-2">
                    <button
                        onClick={toggleLocale}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-500 hover:text-[#B8763E] hover:border-[#B8763E] transition-all"
                    >
                        <Globe className="h-3 w-3" />
                        {t('header.languageSwitch')}
                    </button>
                    <button
                        onClick={toggleMenu}
                        className="p-2 text-slate-600 hover:text-[#B8763E] transition-colors"
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
                        className="md:hidden bg-white border-b border-gray-100 overflow-hidden"
                    >
                        <nav className="flex flex-col p-4 space-y-3 text-center">
                            {/* Link Admin para Mobile */}
                            <Link
                                href="/admin"
                                onClick={toggleMenu}
                                className="flex items-center justify-center gap-2 text-slate-600 hover:text-[#B8763E] font-bold py-2 transition-colors border-b border-gray-50"
                            >
                                <Lock className="h-4 w-4" />
                                Área Admin
                            </Link>

                            <Link
                                href="#calculator"
                                onClick={toggleMenu}
                                className="bg-[#B8763E] hover:bg-[#9A6232] text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md mx-4 active:scale-95"
                            >
                                {t('header.startOrder')}
                            </Link>
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.header>
    );
};