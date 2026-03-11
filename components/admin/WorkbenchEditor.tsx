'use client'

// components/admin/WorkbenchEditor.tsx

import { useState, useTransition, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, Upload, AlertTriangle,
  FileText, Loader2, ChevronRight, Bot,
  Send, RotateCcw, ExternalLink, Check, X, Copy,
} from 'lucide-react'
import { approveDocument, saveTranslationDraft } from '@/app/actions/workbench'
import { retryTranslation } from '@/app/actions/retry-translation'
import { sendDelivery } from '@/app/actions/sendDelivery'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Doc {
  id: number
  exactNameOnDoc: string | null
  docType: string | null
  originalFileUrl: string | null
  translatedText: string | null
  translation_status: string
  delivery_pdf_url: string | null
}

interface WorkbenchEditorProps {
  order: {
    id: number
    status: string
    totalAmount: number | null
    urgency: string | null
    user: { fullName: string | null; email: string | null; phone?: string | null } | null
    documents: Doc[]
  }
  currentUserName: string
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: 'Aguardando', color: 'text-slate-500', bg: 'bg-slate-100', icon: '⏳' },
  ai_draft: { label: 'Rascunho DeepL', color: 'text-orange-600', bg: 'bg-orange-100', icon: '🤖' },
  needs_manual: { label: 'Manual', color: 'text-amber-700', bg: 'bg-amber-100', icon: '✍️' },
  error: { label: 'Erro DeepL', color: 'text-red-600', bg: 'bg-red-100', icon: '❌' },
  reviewed: { label: 'Revisado', color: 'text-blue-600', bg: 'bg-blue-100', icon: '👁️' },
  approved: { label: 'Aprovado', color: 'text-green-700', bg: 'bg-green-100', icon: '✅' },
}
const cfg = (s: string) => STATUS_CFG[s] ?? STATUS_CFG.pending

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkbenchEditor({ order, currentUserName }: WorkbenchEditorProps) {
  const [docs, setDocs] = useState<Doc[]>(order.documents)
  const [selectedId, setSelectedId] = useState<number>(order.documents[0]?.id ?? 0)
  const [edited, setEdited] = useState<Record<number, string>>({})
  const [uploading, setUploading] = useState<number | null>(null)
  const [releasing, startRelease] = useTransition()
  const [saving, startSave] = useTransition()
  const [released, setReleased] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const selected = docs.find(d => d.id === selectedId) ?? docs[0]
  const approved = docs.filter(d => d.translation_status === 'approved').length
  const total = docs.length
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0
  const isCompleted = order.status === 'COMPLETED' || released

  const getText = (doc: Doc) =>
    edited[doc.id] !== undefined ? edited[doc.id] : (doc.translatedText ?? '')

  const docName = (doc: Doc) =>
    (doc.exactNameOnDoc ?? doc.docType ?? 'Documento').split(/[/\\]/).pop() ?? 'Documento'

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const updateDoc = (id: number, patch: Partial<Doc>) =>
    setDocs(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d))

  // ── Save draft ────────────────────────────────────────────────────────────

  const handleSaveDraft = () => {
    if (!selected) return
    const text = getText(selected)
    startSave(async () => {
      const r = await saveTranslationDraft(selected.id, text)
      if (r.success) {
        updateDoc(selected.id, { translatedText: text, translation_status: 'reviewed' })
        setEdited(prev => { const n = { ...prev }; delete n[selected.id]; return n })
        showToast('Rascunho salvo ✓')
      } else {
        showToast(r.error ?? 'Erro ao salvar', 'err')
      }
    })
  }

  // ── PDF upload ────────────────────────────────────────────────────────────

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selected) return

    setUploading(selected.id)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('docId', String(selected.id))
      form.append('orderId', String(order.id))

      const res = await fetch('/api/workbench/upload-delivery', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Upload falhou')

      updateDoc(selected.id, { delivery_pdf_url: data.url })
      showToast('PDF carregado ✓')
    } catch (err: any) {
      showToast(err.message, 'err')
    } finally {
      setUploading(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [selected, order.id])

  // ── Approve document ──────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!selected) return
    if (!selected.delivery_pdf_url) {
      showToast('Faça o upload do PDF traduzido antes de aprovar.', 'err')
      return
    }
    const r = await approveDocument(selected.id, getText(selected))
    if (r.success) {
      updateDoc(selected.id, { translation_status: 'approved' })
      showToast('Documento aprovado ✅')
      const next = docs.find(d => d.id !== selected.id && d.translation_status !== 'approved')
      if (next) setSelectedId(next.id)
    } else {
      showToast(r.error ?? 'Erro ao aprovar', 'err')
    }
  }

  // ── Release to client ─────────────────────────────────────────────────────

  const handleRelease = () => {
    startRelease(async () => {
      try {
        // Envia apenas o ID do pedido. Evita erros de múltiplos argumentos.
        const response = await sendDelivery(order.id)

        if (response.success) {
          setReleased(true)
          showToast('E-mail enviado ao cliente ✅')
        } else {
          // Garante que o TS reconheça o fallback de erro de forma segura
          showToast(response.error ?? 'Erro desconhecido ao enviar', 'err')
        }
      } catch (err: any) {
        showToast('Erro interno no servidor', 'err')
      }
    })
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 overflow-hidden relative">

      {/* ── Top bar ───────────────────────────────────────────── */}
      <div className="bg-slate-900 border-b border-slate-800 shrink-0 z-20">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/workbench"
              className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Fila
            </Link>
            <div className="w-px h-5 bg-slate-700" />
            <div>
              <span className="text-[10px] font-bold text-orange-400 tracking-wider">PEDIDO</span>
              <span className="text-white font-bold text-lg ml-2">#{order.id}</span>
              <span className="text-slate-400 text-sm ml-3">{order.user?.fullName}</span>
            </div>
            {order.urgency === 'rush' && (
              <span className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full tracking-wider">
                RUSH
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {docs.some(d => d.translation_status === 'error') && (
              <button
                onClick={async () => {
                  startSave(async () => {
                    const r = await retryTranslation(order.id)
                    if (r.success) showToast('Gatilho disparado! ✓')
                    else showToast(r.error || 'Erro ao re-tentar', 'err')
                  })
                }}
                disabled={saving}
                className="bg-orange-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-700 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Tentar Novamente (DeepL)
              </button>
            )}
            <div className="w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-400' : 'bg-orange-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className={`text-sm font-bold ${pct === 100 ? 'text-green-400' : 'text-white'}`}>
              {approved}/{total} aprovados
            </span>
          </div>
        </div>
      </div>
      <div className="h-0.5 bg-orange-500 shrink-0 z-20" />

      {/* ── Layout principal ──────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative z-10">

        {/* ── Sidebar: lista de documentos ──────────────────────── */}
        <aside className="w-68 bg-white border-r border-slate-200 flex flex-col overflow-hidden shrink-0" style={{ width: 272 }}>
          <div className="px-4 py-3 border-b border-slate-100 shrink-0">
            <p className="text-[10px] font-bold text-slate-500 tracking-wider">{total} DOCUMENTOS</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {docs.map((doc, i) => {
              const c = cfg(doc.translation_status)
              const sel = doc.id === selectedId
              return (
                <button
                  key={doc.id}
                  onClick={() => setSelectedId(doc.id)}
                  className={`
                    w-full text-left px-4 py-3 border-b border-slate-100 flex items-start gap-3 transition-colors
                    ${sel ? 'bg-orange-50 border-r-2 border-r-orange-500' : 'hover:bg-slate-50'}
                  `}
                >
                  <span className="text-base mt-0.5 shrink-0">{c.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${sel ? 'text-orange-700' : 'text-slate-800'}`}>
                      {docName(doc)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.bg} ${c.color}`}>
                        {c.label}
                      </span>
                      {doc.delivery_pdf_url && (
                        <span className="text-[10px] text-green-600">📎 PDF</span>
                      )}
                    </div>
                  </div>
                  {sel && <ChevronRight className="w-4 h-4 text-orange-400 shrink-0 mt-1" />}
                </button>
              )
            })}
          </div>

          {/* Info do cliente */}
          <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0">
            <p className="text-[10px] font-bold text-slate-500 tracking-wider mb-2">CLIENTE</p>
            <p className="text-sm font-semibold text-slate-800">{order.user?.fullName}</p>
            <p className="text-xs text-slate-500 mt-0.5">{order.user?.email}</p>
            <p className="text-xs text-slate-400 mt-0.5">${(order.totalAmount ?? 0).toFixed(2)}</p>
          </div>
        </aside>

        {/* ── Área do editor ────────────────────────────────────── */}
        {selected ? (
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Cabeçalho do documento */}
            <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{docName(selected)}</p>
                  <p className="text-xs text-slate-500">{selected.docType ?? ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selected.originalFileUrl && (
                  <a
                    href={selected.originalFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-orange-600 transition-colors border border-slate-200 rounded-lg px-3 py-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Abrir original
                  </a>
                )}
                {(() => {
                  const c = cfg(selected.translation_status)
                  return (
                    <span className={`text-xs font-bold px-3 py-1.5 rounded-lg ${c.bg} ${c.color}`}>
                      {c.icon} {c.label}
                    </span>
                  )
                })()}
              </div>
            </div>

            {/* Painel lado a lado */}
            <div className="flex-1 flex min-h-0 overflow-hidden">

              {/* ESQUERDA: original */}
              <div className="flex-1 flex flex-col border-r border-slate-200 overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 shrink-0">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-bold text-slate-500 tracking-wider">ORIGINAL (PT-BR)</span>
                </div>
                <div className="flex-1 overflow-auto p-3">
                  {selected.originalFileUrl ? (
                    <iframe
                      src={selected.originalFileUrl}
                      className="w-full h-full rounded-lg border border-slate-200"
                      title="Documento original"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center text-slate-400">
                        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                        <p className="text-sm">Arquivo original não disponível</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* DIREITA: tradução editável */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 py-2 bg-orange-50 border-b border-orange-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-xs font-bold text-orange-600 tracking-wider">TRADUÇÃO (EN-US)</span>
                    {selected.translation_status === 'ai_draft' && (
                      <span className="text-[10px] bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded">
                        rascunho DeepL
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(getText(selected))
                      showToast('Texto copiado')
                    }}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <Copy className="w-3 h-3" /> copiar
                  </button>
                </div>

                {selected.translation_status === 'pending' ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-slate-400">
                      <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-orange-400" />
                      <p className="font-medium text-sm">DeepL processando...</p>
                      <p className="text-xs mt-1">O rascunho aparecerá aqui em breve</p>
                    </div>
                  </div>
                ) : selected.translation_status === 'error' ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center p-8">
                      <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-slate-800">Falha na Tradução Automática</h3>
                      <p className="text-sm text-slate-500 max-w-sm mx-auto mt-2">
                        Houve um erro técnico ao processar este documento via DeepL.
                        Clique em "Tentar Novamente" no cabeçalho ou digite a tradução manualmente.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {selected.translation_status === 'needs_manual' && (
                      <div className="m-3 mb-0 bg-amber-50 border border-amber-200 rounded-xl p-3 shrink-0">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-amber-800">Tradução manual necessária</p>
                            <p className="text-xs text-amber-700 mt-0.5">
                              Documento escaneado — DeepL não extraiu texto. Digite a tradução abaixo.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    <textarea
                      className="flex-1 m-3 resize-none border border-slate-200 rounded-xl p-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 font-mono"
                      value={getText(selected)}
                      onChange={e => setEdited(prev => ({ ...prev, [selected.id]: e.target.value }))}
                      placeholder="Tradução aparecerá aqui..."
                    />
                  </>
                )}
              </div>
            </div>

            {/* Barra de ações por documento */}
            <div className="bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="flex items-center gap-2 text-sm border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-xl px-4 py-2 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Salvar rascunho
              </button>

              <div className="flex items-center gap-3">
                {/* Upload PDF */}
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleUpload}
                    className="hidden"
                    id={`upload-${selected.id}`}
                    disabled={uploading !== null}
                  />
                  <label
                    htmlFor={`upload-${selected.id}`}
                    className={`
                      flex items-center gap-2 text-sm px-4 py-2 rounded-xl cursor-pointer transition-all
                      ${selected.delivery_pdf_url
                        ? 'bg-green-50 text-green-700 border border-green-300 hover:bg-green-100'
                        : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'}
                      ${uploading === selected.id ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    {uploading === selected.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : selected.delivery_pdf_url
                        ? <><Check className="w-4 h-4" /> PDF carregado</>
                        : <><Upload className="w-4 h-4" /> Upload PDF traduzido</>
                    }
                  </label>
                  {selected.delivery_pdf_url && (
                    <a
                      href={selected.delivery_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-[10px] text-green-600 text-center mt-1 hover:underline"
                    >
                      Ver PDF ↗
                    </a>
                  )}
                </div>

                {/* Aprovar */}
                {selected.translation_status === 'approved' ? (
                  <div className="flex items-center gap-2 text-sm font-bold text-green-700 bg-green-100 px-4 py-2 rounded-xl border border-green-300">
                    <CheckCircle2 className="w-4 h-4" /> Aprovado
                  </div>
                ) : (
                  <button
                    onClick={handleApprove}
                    disabled={!selected.delivery_pdf_url}
                    className="flex items-center gap-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed px-5 py-2 rounded-xl transition-all shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Aprovar documento
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <p>Selecione um documento na lista.</p>
          </div>
        )}
      </div>

      {/* ── Barra inferior SEMPRE VISÍVEL para forçar a entrega ────────────── */}
      <div className={`
        shrink-0 border-t px-6 py-4 flex items-center justify-between shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-50 relative bottom-0 w-full
        ${isCompleted ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}
      `}>
        <div>
          <p className={`text-sm font-bold ${isCompleted ? 'text-green-800' : 'text-slate-700'}`}>
            {isCompleted ? '✅ Pedido já entregue!' : 'Pronto para liberar o pedido?'}
          </p>
          <p className={`text-xs mt-0.5 ${isCompleted ? 'text-green-600' : 'text-slate-500'}`}>
            {isCompleted
              ? 'Você pode reenviar o e-mail de entrega se o cliente não o tiver recebido.'
              : 'Você pode enviar os documentos ao cliente agora mesmo.'}
          </p>
        </div>
        <button
          onClick={handleRelease}
          disabled={releasing}
          className={`
            flex items-center gap-2.5 font-bold px-7 py-3 rounded-xl text-sm transition-all shadow-lg active:scale-95 disabled:opacity-50
            ${isCompleted ? 'bg-green-700 text-white hover:bg-green-800' : 'bg-green-600 text-white hover:bg-green-700'}
          `}
        >
          {releasing
            ? <><Loader2 className="w-5 h-5 animate-spin" /> {isCompleted ? 'Reenviando...' : 'Liberando...'}</>
            : <><Send className="w-5 h-5" /> {isCompleted ? 'Reenviar Entrega' : 'Liberar para o Cliente'}</>
          }
        </button>
      </div>

      {/* ── Toast ────────────────────────────────────────────── */}
      {toast && (
        <div className={`
          fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium
          ${toast.type === 'ok' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'}
          animate-in slide-in-from-bottom-4 duration-300
        `}>
          {toast.type === 'ok' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}