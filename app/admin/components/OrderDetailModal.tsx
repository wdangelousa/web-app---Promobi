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
    FileText
} from 'lucide-react'
import { DetailOrder } from './types'
import { updateOrderStatus, updateTrackingCode } from '../actions'
import { uploadDelivery } from '../../actions/uploadDelivery'
import { sendDelivery } from '../../actions/sendDelivery'
import { OrderStatus } from '@prisma/client'
import { getGlobalSettings, GlobalSettings } from '../../actions/settings'

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
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null)

    useEffect(() => {
        getGlobalSettings().then(setGlobalSettings)
    }, [])

    useEffect(() => {
        if (order) {
            setTrackingInput(order.uspsTracking || '')
            setDeliveryUrl(order.deliveryUrl || null)
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

    // Handle File Selection
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
        }
    }

    // 1. Upload File
    const handleUpload = async () => {
        if (!file || !order) return
        setUploading(true)

        const formData = new FormData()
        formData.append('file', file)
        formData.append('orderId', order.id.toString())

        const result = await uploadDelivery(formData)

        if (result.success && result.deliveryUrl) {
            setDeliveryUrl(result.deliveryUrl)
            onUpdate({ ...order, deliveryUrl: result.deliveryUrl }) // Update parent
            alert("Arquivo carregado com sucesso! Agora você pode enviar ao cliente.")
        } else {
            alert("Erro no upload: " + result.error)
        }
        setUploading(false)
    }

    // 2. Send Delivery Email
    const handleSendDelivery = async () => {
        if (!order) return
        if (!confirm("Tem certeza que deseja enviar a entrega final ao cliente? Isso marcará o pedido como CONCLUÍDO.")) return

        setLoading(true)
        const result = await sendDelivery(order.id)

        if (result.success) {
            alert("E-mail enviado com sucesso!")
            onUpdate({ ...order, status: 'COMPLETED' })
            onClose() // Close modal on success
        } else {
            alert("Erro ao enviar e-mail: " + result.error)
        }
        setLoading(false)
    }

    if (!order) return null

    // Safe Parse Metadata if exists
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
            <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">Detalhes do Pedido <span className="text-gray-400">#{order.id}</span></h3>
                        <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleDateString()} • {order.user.fullName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="h-6 w-6 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {/* Two Column Layout */}
                    <div className="grid md:grid-cols-2 gap-8">

                        {/* LEFT COLUMN: Customer & Order Info */}
                        <div className="space-y-6">
                            {/* Customer Info */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Cliente</h4>
                                <p className="font-bold text-gray-900 text-lg">{order.user.fullName}</p>
                                <p className="text-gray-600">{order.email}</p>
                                {order.phone && <p className="text-gray-600">{order.phone}</p>}
                            </div>

                            {/* --- FINAL DELIVERY SECTION --- */}
                            <div className={`p-6 bg-white rounded-xl border-2 ${deliveryUrl ? 'border-green-200 bg-green-50' : 'border-dashed border-gray-300'} transition-all space-y-4`}>

                                <div className="flex items-center gap-2 mb-2">
                                    {deliveryUrl ? <CheckCircle className="h-6 w-6 text-green-500" /> : <Upload className="h-6 w-6 text-gray-400" />}
                                    <h4 className="font-bold text-gray-800">Entrega Final</h4>
                                </div>

                                {/* State 1: No File Uploaded */}
                                {!deliveryUrl && (
                                    <div className="space-y-4">
                                        <label className="block w-full cursor-pointer">
                                            <div className="w-full py-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-center text-sm text-gray-500 transition-colors">
                                                {file ? file.name : "Clique para selecionar PDF"}
                                            </div>
                                            <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
                                        </label>

                                        {file && (
                                            <button
                                                onClick={handleUpload}
                                                disabled={uploading}
                                                className="w-full bg-gray-900 text-white py-2 rounded-lg font-bold text-sm hover:bg-gray-800 transition-colors"
                                            >
                                                {uploading ? 'Enviando...' : 'Fazer Upload'}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* State 2: File Uploaded (Ready to Send) */}
                                {deliveryUrl && (
                                    <div className="space-y-4">
                                        <div className="text-xs text-green-700 bg-green-100 px-3 py-2 rounded-lg break-all">
                                            Arquivo pronto: {deliveryUrl.split('/').pop()}
                                        </div>

                                        <button
                                            onClick={handleSendDelivery}
                                            disabled={loading}
                                            className="w-full bg-[#f58220] hover:bg-orange-600 text-white py-3 rounded-lg font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 active:scale-95"
                                        >
                                            <Send className="h-4 w-4" /> Enviar Entrega ao Cliente
                                        </button>
                                        <p className="text-[10px] text-gray-400 text-center">Isso enviará o e-mail e fechará o pedido.</p>
                                    </div>
                                )}
                            </div>

                            {
                                order.requiresHardCopy && (
                                    <div>
                                        <h4 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">Código de Rastreio USPS</h4>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                placeholder="Ex: 9400..."
                                                value={trackingInput}
                                                onChange={(e) => setTrackingInput(e.target.value)}
                                                className="flex-1 p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#f58220] outline-none font-mono"
                                            />
                                            <button
                                                onClick={handleTrackingUpdate}
                                                disabled={loading}
                                                className="bg-gray-900 text-white p-3 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                                            >
                                                <Save className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </div>
                                )
                            }
                        </div>

                        {/* RIGHT COLUMN: Order Items & Financials */}
                        <div>
                            {/* --- ITEMIZED DOCUMENTS (New Metadata Flow) --- */}
                            {orderMetadata ? (
                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide border-b border-gray-100 pb-2">
                                        Itens do Pedido ({orderMetadata.documents?.length || 0})
                                    </h4>

                                    <div className="space-y-3">
                                        {orderMetadata.documents?.map((doc: any, idx: number) => (
                                            <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200 flex flex-col gap-2">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                                                        <div>
                                                            <p className="font-bold text-gray-800 text-sm truncate max-w-[200px]" title={doc.fileName}>
                                                                {doc.fileName}
                                                            </p>
                                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                                <span className="bg-white border px-1.5 rounded">{doc.count} pgs</span>
                                                                {doc.notarized && (
                                                                    <span className="flex items-center gap-1 text-green-700 bg-green-50 px-1.5 rounded font-medium border border-green-100">
                                                                        <CheckCircle className="h-3 w-3" /> Notarizado
                                                                    </span>
                                                                )}
                                                                {doc.translatedFileUrl && (
                                                                    <a href={doc.translatedFileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                                                                        <Download className="h-3 w-3" /> Tradução (DeepL)
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-mono font-bold text-gray-900">
                                                            ${((doc.analysis?.totalPrice || 0) + (doc.notarized ? (globalSettings?.notaryFee || 25.00) : 0)).toFixed(2)}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Density Details */}
                                                {doc.analysis?.pages && Array.isArray(doc.analysis.pages) && (
                                                    <div className="pl-7 text-[10px] text-gray-400 space-y-0.5">
                                                        {doc.analysis.pages.map((p: any, pIdx: number) => (
                                                            <div key={pIdx}>
                                                                Pg {p?.pageNumber || '?'}: {p?.density?.toUpperCase() || 'N/A'} (${(p?.price || 0).toFixed(2)})
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Breakdown Summary */}
                                    <div className="bg-slate-800 text-slate-200 rounded-xl p-4 text-sm space-y-2 mt-4">
                                        <div className="flex justify-between">
                                            <span>Base Price (Docs)</span>
                                            <span>${(orderMetadata.breakdown?.basePrice || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Notary Fees</span>
                                            <span>${(orderMetadata.breakdown?.notaryFee || 0).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-orange-300">
                                            <span>Urgency Fee ({orderMetadata.urgency})</span>
                                            <span>${(orderMetadata.breakdown?.urgencyFee || 0).toFixed(2)}</span>
                                        </div>
                                        {orderMetadata.breakdown?.minOrderApplied && (
                                            <div className="flex justify-between text-yellow-400 font-bold">
                                                <span>Minimum Order Adjustment</span>
                                                <span>Applied</span>
                                            </div>
                                        )}
                                        <div className="border-t border-slate-600 pt-2 flex justify-between font-bold text-lg text-white mt-2">
                                            <span>Total (Paid)</span>
                                            <span>${(typeof order.totalAmount === 'number' ? order.totalAmount : 0).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* FALLBACK FOR OLD ORDERS */
                                <div>
                                    <p className="text-gray-500 italic text-sm mb-4">Legacy Order Format</p>
                                    <div className="space-y-4">
                                        {order.documents?.map((doc: any) => (
                                            <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                                <div className="flex items-center gap-3">
                                                    <FileText className="h-5 w-5 text-gray-400" />
                                                    <span className="text-sm font-medium text-gray-700">{doc.docType}</span>
                                                </div>
                                                {doc.originalFileUrl !== 'PENDING_UPLOAD' && (
                                                    <a href={doc.originalFileUrl} target="_blank" className="text-blue-600 text-sm hover:underline">Download</a>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-6">
                                {
                                    order.requiresHardCopy && (
                                        <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 text-yellow-800 flex items-center gap-3">
                                            <Truck className="h-5 w-5" />
                                            <span className="font-bold text-sm">Cliente solicitou Cópia Física (Hard Copy)</span>
                                        </div>
                                    )
                                }

                                {/* --- FINAL DELIVERY SECTION --- */}
                                <div className={`p-6 bg-white rounded-xl border-2 ${deliveryUrl ? 'border-green-200 bg-green-50' : 'border-dashed border-gray-300'} transition-all space-y-4`}>

                                    <div className="flex items-center gap-2 mb-2">
                                        {deliveryUrl ? <CheckCircle className="h-6 w-6 text-green-500" /> : <Upload className="h-6 w-6 text-gray-400" />}
                                        <h4 className="font-bold text-gray-800">Entrega Final</h4>
                                    </div>

                                    {/* State 1: No File Uploaded */}
                                    {!deliveryUrl && (
                                        <div className="space-y-4">
                                            <label className="block w-full cursor-pointer">
                                                <div className="w-full py-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-center text-sm text-gray-500 transition-colors">
                                                    {file ? file.name : "Clique para selecionar PDF"}
                                                </div>
                                                <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
                                            </label>

                                            {file && (
                                                <button
                                                    onClick={handleUpload}
                                                    disabled={uploading}
                                                    className="w-full bg-gray-900 text-white py-2 rounded-lg font-bold text-sm hover:bg-gray-800 transition-colors"
                                                >
                                                    {uploading ? 'Enviando...' : 'Fazer Upload'}
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* State 2: File Uploaded (Ready to Send) */}
                                    {deliveryUrl && (
                                        <div className="space-y-4">
                                            <div className="text-xs text-green-700 bg-green-100 px-3 py-2 rounded-lg break-all">
                                                Arquivo pronto: {deliveryUrl.split('/').pop()}
                                            </div>

                                            <button
                                                onClick={handleSendDelivery}
                                                disabled={loading}
                                                className="w-full bg-[#f58220] hover:bg-orange-600 text-white py-3 rounded-lg font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 active:scale-95"
                                            >
                                                <Send className="h-4 w-4" /> Enviar Entrega ao Cliente
                                            </button>
                                            <p className="text-[10px] text-gray-400 text-center">Isso enviará o e-mail e fechará o pedido.</p>
                                        </div>
                                    )}
                                </div>
                                {/* --------------------------- */}

                                {
                                    order.requiresHardCopy && (
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">Código de Rastreio USPS</h4>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Ex: 9400..."
                                                    value={trackingInput}
                                                    onChange={(e) => setTrackingInput(e.target.value)}
                                                    className="flex-1 p-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#f58220] outline-none font-mono"
                                                />
                                                <button
                                                    onClick={handleTrackingUpdate}
                                                    disabled={loading}
                                                    className="bg-gray-900 text-white p-3 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                                                >
                                                    <Save className="h-5 w-5" />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                }

                                {/* --- STATUS UPDATE --- */}
                                <div className="pt-6 border-t border-gray-100">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Workflow Status</h4>
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {['PENDING', 'TRANSLATING', 'READY_FOR_REVIEW', 'NOTARIZING', 'COMPLETED'].map((s) => (
                                            <button
                                                key={s}
                                                onClick={() => handleStatusUpdate(s as any)}
                                                disabled={loading}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${order.status === s
                                                    ? 'bg-slate-900 text-white border-slate-900'
                                                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>

                                    {order.status === 'READY_FOR_REVIEW' && (
                                        <button
                                            onClick={() => {
                                                const hasNotarization = orderMetadata?.documents?.some((d: any) => d.notarized) || orderMetadata?.serviceType === 'notarization'
                                                handleStatusUpdate(hasNotarization ? 'NOTARIZING' : 'COMPLETED')
                                            }}
                                            disabled={loading}
                                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold shadow-md transition-all active:scale-95"
                                        >
                                            <CheckCircle className="w-5 h-5" />
                                            Aprovar Produção (Auto-Route)
                                        </button>
                                    )}

                                    {order.status === 'TRANSLATING' && (
                                        <button
                                            onClick={async () => {
                                                if (!confirm("Gerar o Kit PDF (Certificado + Tradução + Original)? Isso enviará para QA.")) return;
                                                // Call API
                                                const res = await fetch('/api/generate-pdf-kit', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ orderId: order.id })
                                                });
                                                if (res.ok) {
                                                    const data = await res.json();
                                                    alert("Kit PDF gerado com sucesso!");
                                                    onUpdate({ ...order, status: 'READY_FOR_REVIEW', deliveryUrl: data.deliveryUrl });
                                                } else {
                                                    alert("Erro ao gerar o kit PDF.");
                                                }
                                            }}
                                            disabled={loading}
                                            className="w-full mt-4 flex items-center justify-center gap-2 bg-[#f58220] hover:bg-orange-600 text-white py-3 rounded-lg font-bold shadow-md transition-all active:scale-95"
                                        >
                                            <FileText className="w-5 h-5" />
                                            Concluir Tradução & Gerar PDF
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
