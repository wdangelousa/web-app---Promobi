'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';

export const Header = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

    return (
        <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100"
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 md:h-24 flex items-center justify-between">
                {/* Logo Area */}
                <div className="flex items-center gap-2">
                    <Link href="/">
                        <Image
                            src="/logo.png"
                            width={180}
                            height={60}
                            alt="Promobi"
                            className="object-contain h-20 md:h-24 w-auto"
                            priority
                        />
                    </Link>
                </div>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[var(--color-secondary)]">
                    <Link href="/" className="hover:text-[var(--color-primary)] transition-colors">
                        Início
                    </Link>
                    <Link href="/meu-pedido" className="hover:text-[var(--color-primary)] transition-colors">
                        Meus Pedidos
                    </Link>
                    <Link
                        href="/nova-traducao"
                        className="bg-[var(--color-primary)] text-white px-6 py-2.5 rounded-full hover:bg-orange-600 transition-all font-bold shadow-md hover:shadow-orange-200 active:scale-95"
                    >
                        Nova Tradução
                    </Link>
                </nav>

                {/* Mobile Menu Button */}
                <button
                    onClick={toggleMenu}
                    className="md:hidden p-2 text-slate-600 hover:text-[var(--color-primary)] transition-colors"
                >
                    {isMenuOpen ? <X size={28} /> : <Menu size={28} />}
                </button>
            </div>

            {/* Mobile Navigation Dropdown */}
            <AnimatePresence>
                {isMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden bg-white border-b border-gray-100 overflow-hidden"
                    >
                        <nav className="flex flex-col p-4 space-y-4 text-center">
                            <Link
                                href="/"
                                onClick={toggleMenu}
                                className="text-slate-600 font-medium hover:text-[var(--color-primary)] py-2"
                            >
                                Início
                            </Link>
                            <Link
                                href="/meu-pedido"
                                onClick={toggleMenu}
                                className="text-slate-600 font-medium hover:text-[var(--color-primary)] py-2"
                            >
                                Meus Pedidos
                            </Link>
                            <Link
                                href="/nova-traducao"
                                onClick={toggleMenu}
                                className="bg-[var(--color-primary)] text-white px-6 py-3 rounded-xl font-bold hover:bg-orange-600 transition-all shadow-md mx-4"
                            >
                                Nova Tradução
                            </Link>
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.header>
    );
};
