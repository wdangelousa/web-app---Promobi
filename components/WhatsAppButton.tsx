'use client'

import React from 'react'
import { MessageCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { usePathname } from 'next/navigation'

import { useWhatsApp } from './WhatsAppContext'

export function WhatsAppButton() {
    const pathname = usePathname()
    const phoneNumber = '14073985839' // Insira seu número aqui (com código do país, sem +)
    const { message } = useWhatsApp()

    // Ocultar no Workbench (rota de revisão de pedidos do admin)
    if (pathname?.includes('/admin/orders/')) return null

    const encodedMessage = encodeURIComponent(message)
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3"
        >
            {/* Tooltip for larger screens */}
            <div className="hidden md:block bg-white text-slate-700 text-xs font-bold py-2 px-4 rounded-full shadow-md border border-gray-100 animate-pulse">
                Dúvidas específicas? Fale connosco.
            </div>

            <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#25D366] hover:bg-[#128C7E] text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex items-center justify-center group"
                aria-label="Fale conosco no WhatsApp"
            >
                <MessageCircle className="w-8 h-8 fill-white stroke-white" />
            </a>
        </motion.div>
    )
}
