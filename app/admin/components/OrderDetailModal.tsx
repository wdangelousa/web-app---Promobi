'use client'

import { useState, useEffect } from 'react'
import {
    X,
    Upload,
    Save,
    Truck,
    Download,
    CheckCircle,
    Send,
    FileText,
    Trash2,
    Edit2,
    Check
} from 'lucide-react'
import { getGlobalSettings, GlobalSettings } from '../../actions/settings'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { ProposalPDF } from '../../../components/ProposalPDF'
import { DetailOrder } from './types'
import { updateOrderStatus, updateTrackingCode, deleteOrder, updateOrderCustomerInfo } from '../actions'
import { OrderStatus } from '@prisma/client'
import { getLogoBase64 } from '../../actions/get-logo-base64'
import { ConfirmPaymentButton } from '@/components/admin/ConfirmPaymentButton'
import { getCurrentUser } from '@/app/actions/auth'

type Props = {
    order: DetailOrder | null
    onClose: () => void
    onUpdate: (updatedOrder: DetailOrder) => void
}

export default function OrderDetailModal({ order, onClose, onUpdate }: Props) {
    const [loading, setLoading] = useState(false)
    const [trackingInput, setTrackingInput] = useState('')

    // Delivery State
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const [deliveryUrl, setDeliveryUrl] = useState<string | null>(null)
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null)
    const [logoBase64, setLogoBase64] = useState<string | null>(null)
    const [currentUser, setCurrentUser] = useState<any>(null)

    // Inline Edit Customer State
    const [isEditingCustomer, setIsEditingCustomer] = useState(false)
    const [editName, setEditName] = useState('')
    const [editPhone, setEditPhone] = useState('')

    useEffect(() => {
        const fetchSettings = async () => {
            const settings = await getGlobalSettings()
            setGlobalSettings(settings)

            const logo = await getLogoBase64()
            setLogoBase64(logo)

            const user = await getCurrentUser()
            setCurrentUser(user)
        }
        fetchSettings()
    }, [])

    useEffect(() => {
        if (order) {
            setTrackingInput(order.uspsTracking || '')
            setDeliveryUrl(order.deliveryUrl || null)
            setEditName(order.user.fullName)
            setEditPhone(order.phone || '')
        }
    }, [order])

    const handleStatusUpdate = async (newStatus: OrderStatus) => {
        if (!order) return
        setLoading(true)
        const result = await updateOrderStatus(order.id, newStatus)
        if (result.success) {
            onUpdate({ ...order, status: newStatus })
        } else {
            alert('Falha ao atualizar status')
        }
        setLoading(false)
    }

    const handleTrackingUpdate = async () => {
        if (!order) return
        setLoading(true)
        const result = await updateTrackingCode(order.id, trackingInput)
        if (result.success) {
            onUpdate({ ...order, uspsTracking: trackingInput })
            alert('Código de rastreio salvo!')
        } else {
            alert('Falha ao salvar código')
        }
        setLoading(false)
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
        }
    }

    const handleUpload = async () => {
        if (!file || !order) return
        alert('Upload manual de entrega foi desativado. Use o fluxo estruturado em /admin/orders/{id}.')
    }

    const handleSendDelivery = async () => {
        if (!order) return
        alert('Envio manual de entrega foi desativado. Use o fluxo estruturado em /admin/orders/{id}.')
    }

    const handleDeleteOrder = async () => {
        if (!order) return
        if (!confirm("AVISO: Este pedido será excluído PERMANENTEMENTE para manter a precisão das métricas financeiras. Esta ação não pode ser desfeita. Deseja prosseguir?")) return

        setLoading(true)
        const result = await deleteOrder(order.id)
        if (result.success) {
            alert("Pedido excluído com sucesso.")
            window.location.reload() // Force board refresh
        } else {
            alert("Erro ao excluir pedido: " + result.error)
            setLoading(false)
        }
    }

    const handleSaveCustomerInfo = async () => {
        if (!order) return
        setLoading(true)
        const result = await updateOrderCustomerInfo(order.id, editName, editPhone)
        if (result.success) {
            // Update local state for immediate feedback
            onUpdate({
                ...order,
                user: { ...order.user, fullName: editName },
                phone: editPhone
            })
            setIsEditingCustomer(false)
            alert("Dados do cliente atualizados com sucesso!")
        } else {
            alert("Erro ao atualizar dados: " + result.error)
        }
        setLoading(false)
    }

    if (!order) return null

    let orderMetadata: any = null
    if (order.metadata) {
        if (typeof order.metadata === 'object') {
            orderMetadata = order.metadata;
        } else {
            try {
                orderMetadata = JSON.parse(order.metadata)
            } catch (e) {
                console.error("Failed to parse order metadata", e)
            }
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">Pedido <span className="text-[#B8763E]">#{order.id}</span></h3>
                        <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleString()} • {order.user.fullName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {globalSettings && (
                            <PDFDownloadLink
                                document={<ProposalPDF order={order} globalSettings={globalSettings} logoBase64={logoBase64} />}
                                fileName={`Proposta-Promobidocs-${order.id}.pdf`}
                                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95"
                            >
                                {({ loading }) => (
                                    <>
                                        <Download className="h-4 w-4" />
                                        {loading ? 'Gerando...' : 'Exportar Proposta PDF'}
                                    </>
                                )}
                            </PDFDownloadLink>
                        )}

                        <button
                            onClick={handleDeleteOrder}
                            disabled={loading}
                            className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-xl text-sm font-bold transition-all border border-red-100 disabled:opacity-50"
                            title="Excluir Pedido Permanentemente"
                        >
                            <Trash2 className="h-4 w-4" />
                            <span>Excluir</span>
                        </button>

                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                            <X className="h-6 w-6 text-gray-500" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    <div className="grid md:grid-cols-2 gap-10">

                        {/* LEFT COLUMN: Customer & Order Info */}
                        <div className="space-y-8">
                            {/* Customer Card */}
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-sm">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Informações do Cliente</h4>
                                    {!isEditingCustomer ? (
                                        <button
                                            onClick={() => setIsEditingCustomer(true)}
                                            className="text-[#B8763E] hover:text-[#9A6232] flex items-center gap-1.5 text-xs font-bold transition-colors"
                                        >
                                            <Edit2 className="h-3.5 w-3.5" /> Editar
                                        </button>
                                    ) : (
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setIsEditingCustomer(false)}
                                                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={handleSaveCustomerInfo}
                                                disabled={loading}
                                                className="text-green-600 hover:text-green-700 flex items-center gap-1.5 text-xs font-bold"
                                            >
                                                <Check className="h-3.5 w-3.5" /> Salvar
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Nome Completo</label>
                                        {!isEditingCustomer ? (
                                            <p className="font-bold text-slate-900 text-lg">{order.user.fullName}</p>
                                        ) : (
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#B8763E] focus:border-transparent outline-none transition-all"
                                                placeholder="Nome do cliente"
                                            />
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">E-mail (Permanente)</label>
                                        <p className="text-slate-600 font-medium">{order.email}</p>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Telefone</label>
                                        {!isEditingCustomer ? (
                                            <p className="text-slate-900 font-bold">{order.phone || 'Não informado'}</p>
                                        ) : (
                                            <input
                                                type="text"
                                                value={editPhone}
                                                onChange={(e) => setEditPhone(e.target.value)}
                                                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#B8763E] focus:border-transparent outline-none transition-all"
                                                placeholder="WhatsApp / Telefone"
                                            />
                                        )}
                                    </div>

                                    {order.address && (
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Endereço</label>
                                            <p className="text-slate-600 text-sm">{order.address}</p>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-8">
                                    <ConfirmPaymentButton
                                        order={order as any}
                                        confirmedByName={currentUser?.fullName || 'Analista'}
                                        onConfirmed={() => onUpdate({ ...order, status: 'TRANSLATING' })}
                                    />
                                </div>
                            </div>

                            {/* Delivery Section */}
                            <div className={`p-6 rounded-2xl border-2 transition-all ${deliveryUrl ? 'border-green-100 bg-green-50/50' : 'border-dashed border-slate-200 bg-slate-50/30'}`}>
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-2 rounded-lg ${deliveryUrl ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>
                                            {deliveryUrl ? <CheckCircle className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
                                        </div>
                                        <h4 className="font-bold text-slate-800">Entrega Final do Kit</h4>
                                    </div>
                                    {deliveryUrl && (
                                        <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold uppercase">Carregado</span>
                                    )}
                                </div>

                                {!deliveryUrl ? (
                                    <div className="space-y-4">
                                        <label className="block w-full cursor-pointer group">
                                            <div className="w-full py-8 bg-white border-2 border-dashed border-slate-200 group-hover:border-[#B8763E] rounded-2xl text-center transition-all">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Upload className="h-6 w-6 text-slate-300 group-hover:text-[#B8763E]" />
                                                    <span className="text-sm font-bold text-slate-500 group-hover:text-[#B8763E]">
                                                        {file ? file.name : "Clique para selecionar PDF"}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400">Tamanho máximo: 10MB</span>
                                                </div>
                                            </div>
                                            <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
                                        </label>

                                        {file && (
                                            <button
                                                onClick={handleUpload}
                                                disabled={uploading}
                                                className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                {uploading ? 'Enviando...' : 'Fazer Upload do Arquivo'}
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <button
                                            onClick={handleSendDelivery}
                                            disabled={loading}
                                            className="w-full bg-[#f58220] hover:bg-orange-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-orange-200 hover:shadow-orange-300 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                                        >
                                            <Send className="h-5 w-5" /> Enviar Kit ao Cliente
                                        </button>
                                        <p className="text-[10px] text-center text-slate-400 font-medium">Ao enviar, o cliente receberá um e-mail com o PDF e o pedido será concluído.</p>

                                        <div className="pt-2 flex justify-center">
                                            <button onClick={() => setDeliveryUrl(null)} className="text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase tracking-wider transition-colors">Substituir Arquivo</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Order Items & Workflow */}
                        <div className="space-y-8">
                            {/* Items List */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    Itens do Pedido
                                    <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px]">{orderMetadata?.documents?.length || order.documents?.length || 0}</span>
                                </h4>

                                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                    {orderMetadata ? (
                                        orderMetadata.documents?.map((doc: any, idx: number) => (
                                            <div key={idx} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex flex-col gap-3">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-slate-50 rounded-lg">
                                                            <FileText className="h-4 w-4 text-slate-400" />
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-slate-800 text-sm truncate max-w-[200px]" title={doc.exactNameOnDoc}>
                                                                {doc.exactNameOnDoc}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{doc.count} pgs</span>
                                                                {doc.notarized && (
                                                                    <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100">Notarizado</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="font-mono font-bold text-slate-900 text-sm">
                                                            ${((doc.analysis?.totalPrice || 0) + (doc.notarized ? (globalSettings?.notaryFee || 25.00) : 0)).toFixed(2)}
                                                        </span>
                                                    </div>
                                                </div>
                                                {doc.translatedFileUrl && (
                                                    <a href={doc.translatedFileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 self-start transition-all">
                                                        <Download className="h-3 w-3" /> Baixar Tradução Automática
                                                    </a>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        order.documents?.map((doc: any) => (
                                            <div key={doc.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-100">
                                                <div className="flex items-center gap-3">
                                                    <FileText className="h-5 w-5 text-slate-300" />
                                                    <span className="text-sm font-bold text-slate-700">{doc.docType}</span>
                                                </div>
                                                {doc.originalFileUrl !== 'PENDING_UPLOAD' && (
                                                    <a href={doc.originalFileUrl} target="_blank" className="text-indigo-600 text-xs font-bold hover:underline">Download</a>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Financial Summary */}
                                {orderMetadata && (
                                    <div className="bg-slate-900 text-slate-300 rounded-2xl p-6 space-y-3 shadow-xl">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500 font-bold uppercase tracking-wider">Subtotal Itens</span>
                                            <span className="font-mono font-bold text-slate-200">${(orderMetadata.breakdown?.basePrice || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500 font-bold uppercase tracking-wider">Taxas Notariais</span>
                                            <span className="font-mono font-bold text-slate-200">${(orderMetadata.breakdown?.notaryFee || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-orange-400 font-bold uppercase tracking-wider">Taxa de Urgência ({orderMetadata.urgency})</span>
                                            <span className="font-mono font-bold text-orange-300">${(orderMetadata.breakdown?.urgencyFee || 0).toFixed(2)}</span>
                                        </div>
                                        {orderMetadata.breakdown?.minOrderAdjustment > 0 && (
                                            <div className="flex justify-between text-xs">
                                                <span className="text-yellow-500 font-bold uppercase tracking-wider">Ajuste Mínimo</span>
                                                <span className="font-mono font-bold text-yellow-400">${(orderMetadata.breakdown?.minOrderAdjustment || 0).toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="border-t border-slate-800 pt-4 flex justify-between items-center mt-2">
                                            <span className="text-sm font-bold text-white uppercase tracking-widest">Total Pago</span>
                                            <span className="font-mono text-2xl font-bold text-white">${order.totalAmount.toFixed(2)}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Workflow Control */}
                            <div className="pt-6 border-t border-slate-100">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Controle de Fluxo</h4>
                                <div className="grid grid-cols-2 gap-2 mb-6">
                                    {['PENDING', 'TRANSLATING', 'READY_FOR_REVIEW', 'NOTARIZING'].map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => handleStatusUpdate(s as any)}
                                            disabled={loading}
                                            className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all ${order.status === s
                                                ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/10'
                                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                                } disabled:opacity-50`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>

                                {order.status === 'READY_FOR_REVIEW' && (
                                    <button
                                        onClick={() => {
                                            const hasNotarization = orderMetadata?.documents?.some((d: any) => d.notarized) || orderMetadata?.serviceType === 'notarization'
                                            if (hasNotarization) {
                                                handleStatusUpdate('NOTARIZING')
                                                return
                                            }
                                            alert('Conclusão manual foi bloqueada. Use o fluxo estruturado em /admin/orders/{id}.')
                                        }}
                                        disabled={loading}
                                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        <CheckCircle className="h-5 w-5" />
                                        Aprovar Produção (Auto-Route)
                                    </button>
                                )}

                                {order.status === 'TRANSLATING' && (
                                    <button
                                        onClick={async () => {
                                            alert('Este atalho legado foi bloqueado. Use o workbench estruturado em /admin/orders/{id}.')
                                        }}
                                        disabled={loading}
                                        className="w-full flex items-center justify-center gap-2 bg-[#f58220] hover:bg-orange-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-orange-100 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        <FileText className="h-5 w-5" />
                                        {loading ? 'Processando...' : 'Fluxo Legado Bloqueado'}
                                    </button>
                                )}
                            </div>

                            {order.requiresHardCopy && (
                                <div className="pt-6 border-t border-slate-100">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <Truck className="h-3 w-3" /> Envio Físico (USPS)
                                    </h4>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Código de Rastreio"
                                            value={trackingInput}
                                            onChange={(e) => setTrackingInput(e.target.value)}
                                            className="flex-1 p-3 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-[#f58220] focus:border-transparent outline-none shadow-sm"
                                        />
                                        <button
                                            onClick={handleTrackingUpdate}
                                            disabled={loading}
                                            className="bg-slate-900 text-white p-3 rounded-xl hover:bg-slate-800 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                        >
                                            <Save className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
