
'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'

type WhatsAppContextType = {
    message: string;
    setMessage: (msg: string) => void;
    resetMessage: () => void;
}

const defaultMessage = "Olá, Equipa Promobi! Já consultei as perguntas frequentes no site, mas tenho uma dúvida específica sobre os meus documentos para avançar com o orçamento. Podem ajudar-me?"

const WhatsAppContext = createContext<WhatsAppContextType | undefined>(undefined)

export function WhatsAppProvider({ children }: { children: ReactNode }) {
    const [message, setMessageState] = useState(defaultMessage)

    const setMessage = (msg: string) => setMessageState(msg)
    const resetMessage = () => setMessageState(defaultMessage)

    return (
        <WhatsAppContext.Provider value={{ message, setMessage, resetMessage }}>
            {children}
        </WhatsAppContext.Provider>
    )
}

export function useWhatsApp() {
    const context = useContext(WhatsAppContext)
    if (context === undefined) {
        throw new Error('useWhatsApp must be used within a WhatsAppProvider')
    }
    return context
}
