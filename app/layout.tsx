import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { WhatsAppButton } from '../components/WhatsAppButton'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
    title: 'Promobi Consulting',
    description: 'Tradução Certificada Rápida. Sem Burocracia.',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="pt-BR">
            <body className={inter.className}>
                {children}
                <WhatsAppButton />
            </body>
        </html>
    )
}
