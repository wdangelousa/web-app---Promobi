import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { WhatsAppButton } from '../components/WhatsAppButton'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
    title: 'Promobidocs',
    description: 'Traduções Certificadas para USCIS, DMV e Universidades. Português e Español → English.',
}

import { WhatsAppProvider } from '../components/WhatsAppContext'

import { UIFeedbackProvider } from '../components/UIFeedbackProvider'
import { LocaleProvider } from '../lib/i18n'

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="pt-BR">
            <head>
                <link rel="icon" href="/favicon.png" type="image/png" />
                <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
            </head>
            <body className={`${inter.className} overflow-x-hidden w-full max-w-[100vw]`}>
                <LocaleProvider>
                    <WhatsAppProvider>
                        <UIFeedbackProvider>
                            {children}
                            <WhatsAppButton />
                        </UIFeedbackProvider>
                    </WhatsAppProvider>
                </LocaleProvider>
            </body>
        </html>
    )
}
