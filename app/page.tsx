'use client'

import { dmSans } from '../components/landing/HeroSection'
import {
    LandingNav,
    HeroSection,
    StatsSection,
    ComoFuncionaSection,
    DensidadeExplainerSection,
    EspecialidadesSection,
    CredibilidadeSection,
    FaqSection,
    CtaSection,
    FooterSection,
} from '../components/landing'
import Calculator from '../components/Calculator'

export default function Home() {
    return (
        <div className={`${dmSans.className} min-h-screen bg-[var(--landing-bg-page)] text-[var(--landing-text)] selection:bg-[var(--landing-bronze)]/20`}>
            <LandingNav />

            <main>
                <HeroSection>
                    <Calculator />
                </HeroSection>

                <DensidadeExplainerSection />
                <StatsSection />
                <ComoFuncionaSection />
                <EspecialidadesSection />
                <CredibilidadeSection />
                <FaqSection />
                <CtaSection />
            </main>

            <FooterSection />

            <style jsx global>{`
                html {
                    scroll-behavior: smooth;
                }
            `}</style>
        </div>
    )
}
