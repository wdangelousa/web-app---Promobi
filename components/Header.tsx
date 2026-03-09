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
            className="fixed top-0 left-0 right-0 z-[100] bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm"
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 md:h-24 flex items-center justify-between relative z-[101]">
                {/* Logo Section */}
                <div className="flex items-center gap-2">
                    <Link href="/" className="relative z-[102] transition-transform active:scale-95">
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

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center gap-6 text-sm font-bold text-slate-700 relative z-[102]">
                    {/* Admin Link - Functional & Distinct */}
                    <Link
                        href="/admin/dashboard"
                        className="group flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-500 hover:text-[#B8763E] hover:bg-[#F5EDE3]/50 transition-all duration-200"
                    >
                        <Lock className="h-4 w-4 transition-transform group-hover:scale-110" />
                        <span>Admin</span>
                    </Link>

                    {/* Language Switch */}
                    <button
                        onClick={toggleLocale}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-[#B8763E] hover:text-[#B8763E] hover:shadow-sm transition-all duration-200"
                        title={locale === 'pt' ? 'Cambiar a Español' : 'Mudar para Português'}
                    >
                        <Globe className="h-4 w-4" />
                        <span className="uppercase tracking-tight">{t('header.languageSwitch')}</span>
                    </button>

                    {/* Primary Action Button */}
                    <Link
                        href="/#calculator"
                        className="bg-[#B8763E] hover:bg-[#A36636] text-white px-7 py-3 rounded-full font-black shadow-lg shadow-[#B8763E]/10 hover:shadow-[#B8763E]/20 hover:scale-[1.03] transition-all active:scale-[0.97] flex items-center gap-2"
                    >
                        {t('header.startOrder')}
                    </Link>
                </nav>

                {/* Mobile Controls */}
                <div className="md:hidden flex items-center gap-3 relative z-[102]">
                    <button
                        onClick={toggleLocale}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:text-[#B8763E] hover:border-[#B8763E] transition-all"
                    >
                        <Globe className="h-3.5 w-3.5" />
                        <span className="uppercase tracking-tighter">{t('header.languageSwitch')}</span>
                    </button>
                    <button
                        onClick={toggleMenu}
                        className="p-2.5 rounded-xl bg-slate-50 text-slate-600 active:bg-slate-100 transition-colors border border-slate-100"
                    >
                        {isMenuOpen ? <X size={24} strokeWidth={2.5} /> : <Menu size={24} strokeWidth={2.5} />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {isMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-slate-200 shadow-2xl z-[99] overflow-hidden"
                    >
                        <nav className="flex flex-col p-6 space-y-4">
                            {/* Mobile Admin Link */}
                            <Link
                                href="/admin/dashboard"
                                onClick={toggleMenu}
                                className="flex items-center justify-center gap-3 w-full bg-slate-50 text-slate-700 hover:text-[#B8763E] font-black py-4 rounded-2xl transition-all border border-slate-100 active:scale-95"
                            >
                                <Lock className="h-5 w-5" />
                                <span>Área Admin</span>
                            </Link>

                            {/* Mobile Start Order Button */}
                            <Link
                                href="/#calculator"
                                onClick={toggleMenu}
                                className="bg-[#B8763E] hover:bg-[#A36636] text-white px-6 py-4 rounded-2xl font-black text-center transition-all shadow-xl shadow-[#B8763E]/20 active:scale-95"
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
