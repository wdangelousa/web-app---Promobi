import prisma from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { Download, ShieldCheck, FileText, CheckCircle, ArrowRight, Lock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DeliveryVault({ params }: { params: { id: string } }) {
    const orderId = parseInt(params.id)
    if (isNaN(orderId)) return notFound()

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { user: true, documents: true }
    })

    if (!order || !order.deliveryUrl) return notFound()

    const orderMetadata = order.metadata ? JSON.parse(order.metadata as string) : null
    let totalPages = order.documents.length
    if (orderMetadata?.documents) {
        totalPages = orderMetadata.documents.reduce((acc: number, doc: any) => acc + (doc.count || 1), 0)
    }

    const isReady = order.status === 'COMPLETED'

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-500/20">
            {/* Header */}
            <header className="bg-white border-b border-gray-100 py-6 px-4">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <Image src="/logo.png" width={180} height={60} alt="Promobi" className="h-10 w-auto object-contain" />
                    <div className="flex items-center gap-2 text-sm text-green-700 font-medium bg-green-50 px-3 py-1.5 rounded-full border border-green-200 shadow-sm">
                        <Lock className="w-4 h-4" /> Cofre Seguro (256-bit)
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-12 md:py-20 space-y-8">
                {/* Intro */}
                <div className="text-center space-y-4 max-w-2xl mx-auto">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 text-green-600 mb-2 shadow-inner border 
border-green-200">
                        <CheckCircle className="w-10 h-10" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Arquivos Prontos.</h1>
                    <p className="text-lg text-slate-500">
                        Olá <span className="font-bold text-slate-800">{order.user.fullName}</span>, sua tradução certificada foi concluída com sucesso e já está disponível para download.
                    </p>
                </div>

                {/* Delivery Card */}
                <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden mt-8 max-w-2xl mx-auto relative group">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-white opacity-50 pointer-events-none" />
                    <div className="p-8 relative">
                        <div className="flex items-start justify-between mb-8">
                            <div>
                                <h2 className="text-2xl font-bold tracking-tight text-slate-900">Kit de Tradução Oficial</h2>
                                <p className="text-sm text-slate-500 mt-1">Pedido ID: #{order.id.toString().padStart(6, '0')}</p>
                            </div>
                            <div className="bg-blue-100 text-blue-700 p-3 rounded-2xl shadow-inner">
                                <FileText className="w-8 h-8" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total de Páginas</p>
                                <p className="text-2xl font-bold text-slate-900">{totalPages}</p>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Status Legal</p>
                                <p className="text-sm font-bold text-green-600 flex items-center gap-1 mt-1">
                                    <ShieldCheck className="w-4 h-4" /> Certificado
                                </p>
                            </div>
                        </div>

                        {isReady ? (
                            <a
                                href={order.deliveryUrl}
                                target="_blank"
                                className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-200 hover:shadow-blue-300 transition-all active:scale-[0.98] text-lg"
                            >
                                <Download className="w-6 h-6" />
                                Baixar Arquivos (PDF)
                            </a>
                        ) : (
                            <div className="w-full py-4 text-center text-amber-600 bg-amber-50 rounded-xl font-medium border border-amber-200 text-sm">
                                O pedido ainda não foi finalizado no administrativo.
                            </div>
                        )}
                        <p className="text-center text-[11px] text-slate-400 mt-4 leading-tight">
                            Este é um link privado e seguro. Seus arquivos serão retidos em nosso servidor protegido nos EUA e não serão compartilhados com terceiros.
                        </p>
                    </div>
                </div>

                {/* Upsell Banner */}
                <div className="bg-slate-900 rounded-3xl p-8 max-w-2xl mx-auto shadow-2xl relative overflow-hidden group">
                    {/* Background effect */}
                    <div className="absolute -right-20 -top-20 w-64 h-64 bg-orange-500/20 blur-3xl rounded-full pointer-events-none group-hover:bg-orange-500/30 transition-all duration-700" />

                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4">
                            <ArrowRight className="h-3 w-3" />
                            Próximo Passo
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Pronto para O Visto ou Cidadania?</h3>
                        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                            A tradução é apenas o primeiro passo. Nossos parceiros do <strong>Evandro D'Angelo Law Group</strong> oferecem consultoria migratória completa e submissão direta ao USCIS.
                        </p>
                        <a
                            href="https://evandrodangelo.com"
                            target="_blank"
                            className="inline-flex items-center justify-center gap-2 bg-[#f58220] hover:bg-orange-500 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-lg hover:shadow-orange-500/25 active:scale-95"
                        >
                            Falar com um Advogado de Imigração
                        </a>
                    </div>
                </div>
            </main>
        </div>
    )
}
