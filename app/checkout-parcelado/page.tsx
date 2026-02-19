'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShieldCheck, Lock, CheckCircle, Smartphone, CreditCard, Copy, AlertTriangle } from 'lucide-react'

// Mock fetching order total - in a real app this would be fetched via server action or passed in props
// For simulation, we will calculate based on assumptions or just use a fixed mock if we can't fetch easily client-side without a new action.
// Better: We will start with a placeholder total and dynamic installments. 
// Since we don't have the order total here easily without fetch, we'll simulate a total or parse it if passed.
// To make it robust, let's assume a total or fetch it. For now, we simulate $100 -> R$ 600.
const MOCK_EXCHANGE_RATE = 6.00;

export default function ParceladoSimulationPage() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const orderId = searchParams.get('orderId')
    const [activeTab, setActiveTab] = useState<'pix' | 'credit'>('pix')
    const [copied, setCopied] = useState(false)
    const [selectedInstallment, setSelectedInstallment] = useState(1)

    // Simulating Order Amount in BRL (Since we don't have the exact amount here easily, we'll use a placeholder or generic logic)
    // Ideally we would fetch the order details. For this task, strict visual simulation is the priority.
    const mockTotalBrl = 1200.00;

    const installments = Array.from({ length: 12 }, (_, i) => {
        const months = i + 1;
        const amount = mockTotalBrl / months;
        return {
            months,
            amount: amount.toFixed(2),
            total: mockTotalBrl.toFixed(2)
        }
    })

    const handleCopyPix = () => {
        navigator.clipboard.writeText("00020126360014BR.GOV.BCB.PIX0114+551199999999520400005303986540510.005802BR5913Promobi LLC6008Orlando62070503***6304E2CA");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    const handleSimulateSuccess = () => {
        router.push(`/sucesso-pix?orderId=${orderId}&simulated=true`)
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start pt-12 p-4 font-sans text-gray-800">

            {/* Header */}
            <div className="mb-8 text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-green-600 font-bold text-sm tracking-wide uppercase bg-green-50 px-3 py-1 rounded-full w-fit mx-auto">
                    <Lock className="h-3 w-3" /> Ambiente Seguro
                </div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">
                    Finalizar Pagamento
                </h1>
                <p className="text-sm text-gray-500">
                    Escolha como deseja pagar seus <strong>R$ {mockTotalBrl.toFixed(2)}</strong> (Estimado)
                </p>
            </div>

            {/* Warning Banner */}
            <div className="w-full max-w-md bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-yellow-800 leading-relaxed">
                    <strong>Ambiente de Simulação:</strong> Em produção, você será redirecionado para o checkout oficial seguro do Parcelado USA. Nenhum valor real será cobrado aqui.
                </div>
            </div>

            {/* Main Card */}
            <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                {/* Tabs */}
                <div className="flex border-b border-gray-100">
                    <button
                        onClick={() => setActiveTab('pix')}
                        className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all relative ${activeTab === 'pix' ? 'text-[#32BCAD]' : 'text-gray-400 hover:text-gray-600 bg-gray-50'}`}
                    >
                        <Smartphone className="h-4 w-4" /> PIX
                        {activeTab === 'pix' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#32BCAD]" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('credit')}
                        className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all relative ${activeTab === 'credit' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600 bg-gray-50'}`}
                    >
                        <CreditCard className="h-4 w-4" /> Cartão (até 12x)
                        {activeTab === 'credit' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600" />}
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 md:p-8">
                    {activeTab === 'pix' ? (
                        <div className="space-y-6 animate-in fade-in zoom-in duration-300">
                            <div className="text-center">
                                <p className="text-sm text-gray-600 mb-4">Escaneie o QR Code abaixo com seu app de banco:</p>
                                <div className="w-56 h-56 bg-white mx-auto border-2 border-gray-100 rounded-xl flex items-center justify-center shadow-inner p-2">
                                    {/* Simulated QR Code Visual */}
                                    <div className="w-full h-full bg-gray-900 rounded-lg opacity-90 relative overflow-hidden flex items-center justify-center">
                                        <Smartphone className="h-16 w-16 text-white opacity-20" />
                                        <div className="absolute inset-0 bg-[url('https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=SimulatedPixPayment')] bg-contain bg-center bg-no-repeat mix-blend-lighten"></div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs font-bold text-gray-500 uppercase text-center">Ou copie e cole a chave:</p>
                                <div className="flex gap-2">
                                    <input
                                        readOnly
                                        value="00020126360014BR.GOV.BCB.PIX..."
                                        className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 outline-none"
                                    />
                                    <button
                                        onClick={handleCopyPix}
                                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${copied ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                    >
                                        {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        {copied ? 'Copiado!' : 'Copiar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Parcelamento</label>
                                <select
                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-700 font-medium cursor-pointer shadow-sm appearance-none"
                                    value={selectedInstallment}
                                    onChange={(e) => setSelectedInstallment(Number(e.target.value))}
                                >
                                    {installments.map((inst) => (
                                        <option key={inst.months} value={inst.months}>
                                            {inst.months}x de R$ {inst.amount} {inst.months === 1 ? '(À vista)' : '(Sem juros)'}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-3">
                                <label className="block text-xs font-bold text-gray-500 uppercase">Dados do Cartão</label>
                                <input disabled type="text" placeholder="0000 0000 0000 0000" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg font-mono text-gray-400 cursor-not-allowed" />
                                <div className="flex gap-3">
                                    <input disabled type="text" placeholder="MM/AA" className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg font-mono text-gray-400 cursor-not-allowed" />
                                    <input disabled type="text" placeholder="CVV" className="w-24 p-3 bg-gray-50 border border-gray-200 rounded-lg font-mono text-gray-400 cursor-not-allowed" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-gray-50 border-t border-gray-100">
                    <button
                        onClick={handleSimulateSuccess}
                        className="w-full py-4 bg-[#f58220] hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg hover:shadow-orange-200 transition-all active:scale-95 flex items-center justify-center gap-2 text-lg"
                    >
                        <CheckCircle className="h-5 w-5" />
                        Simular Pagamento Aprovado
                    </button>
                    <p className="text-center text-[10px] text-gray-400 mt-4">
                        Powered by Parcelado USA • ID: {orderId}
                    </p>
                </div>
            </div>
        </div>
    )
}
