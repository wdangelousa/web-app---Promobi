'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  Save,
  FileText,
  CheckCircle,
  Eye,
  Loader2,
  Zap,
  Square,
  CheckSquare,
  AlignLeft,
} from 'lucide-react'
import ManualApprovalButton from './ManualApprovalButton'
import 'react-quill-new/dist/quill.snow.css'

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

type Document = {
  id: number
  docType: string
  originalFileUrl: string
  translatedFileUrl?: string | null
  translatedText: string | null
  exactNameOnDoc?: string | null
  translation_status?: string | null
  delivery_pdf_url?: string | null
}

type Order = {
  id: number
  status: string
  documents: Document[]
  user: {
    fullName: string
    email: string
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStatusInfo(doc: Document): { label: string; dotClass: string } {
  if (doc.delivery_pdf_url) return { label: 'Kit Gerado', dotClass: 'bg-blue-400' }
  switch (doc.translation_status) {
    case 'approved':
      return { label: 'Aprovado', dotClass: 'bg-green-400' }
    case 'reviewed':
      return { label: 'Revisado', dotClass: 'bg-yellow-400' }
    default:
      return { label: 'Pendente', dotClass: 'bg-gray-500' }
  }
}

function applyPromobiFormatting(html: string): string {
  const plain = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const paragraphs = plain.split(/\n\n/).filter((p) => p.trim())

  return paragraphs
    .map(
      (p) =>
        `<p style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; margin: 0 0 0.8em 0;">${p
          .replace(/\n/g, '<br>')
          .trim()}</p>`
    )
    .join('')
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Workbench({ order }: { order: Order }) {
  const router = useRouter()
  const [selectedDocId, setSelectedDocId] = useState<number | null>(
    order.documents[0]?.id ?? null
  )
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [selectedDocsForDelivery, setSelectedDocsForDelivery] = useState<number[]>([])
  const [generatingKits, setGeneratingKits] = useState(false)

  const selectedDoc = order.documents.find((d) => d.id === selectedDocId)
  const justTranslatedRef = useRef<string | null>(null)
  const prevDocIdRef = useRef<number | null>(null)

  // Sync editor with selected document
  useEffect(() => {
    if (!selectedDoc) return

    const isNewDoc = prevDocIdRef.current !== selectedDoc.id
    prevDocIdRef.current = selectedDoc.id

    if (isNewDoc) {
      justTranslatedRef.current = null
      setEditorContent(selectedDoc.translatedText || '<p>Aguardando tradução...</p>')
    } else {
      if (justTranslatedRef.current) {
        setEditorContent(justTranslatedRef.current)
      } else {
        setEditorContent(selectedDoc.translatedText || '<p>Aguardando tradução...</p>')
      }
    }
  }, [selectedDocId, selectedDoc?.translatedText, selectedDoc?.id])

  // ── Checkbox helpers ───────────────────────────────────────────────────────

  const toggleDocForDelivery = (docId: number) => {
    setSelectedDocsForDelivery((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    )
  }

  const toggleSelectAll = () => {
    if (selectedDocsForDelivery.length === order.documents.length) {
      setSelectedDocsForDelivery([])
    } else {
      setSelectedDocsForDelivery(order.documents.map((d) => d.id))
    }
  }

  const allSelected = selectedDocsForDelivery.length === order.documents.length
  const someSelected = selectedDocsForDelivery.length > 0

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedDoc) return
    setIsSavingDraft(true)

    try {
      const { saveTranslationDraft } = await import('../../../../actions/workbench')
      const result = await saveTranslationDraft(selectedDoc.id, editorContent)

      if (result.success) {
        router.refresh()
      } else {
        alert('Erro ao salvar: ' + result.error)
      }
    } catch (err: any) {
      console.error(err)
      alert('Erro ao salvar rascunho: ' + err.message)
    } finally {
      setIsSavingDraft(false)
    }
  }

  const handleApplyPromobiStandard = () => {
    const formatted = applyPromobiFormatting(editorContent)
    if (formatted) {
      setEditorContent(formatted)
    }
  }

  const handleTranslateAI = async () => {
    if (!selectedDoc) return
    setIsTranslating(true)

    try {
      const { generateTranslationDraft } = await import('../../../../actions/generateTranslation')
      const result = await generateTranslationDraft(order.id)

      const newText = (result as any).text || (result as any).translatedText

      if (result.success && newText) {
        justTranslatedRef.current = newText
        setEditorContent(newText)
        alert('Tradução concluída com sucesso!')
        router.refresh()
      } else if (result.success) {
        alert('Tradução concluída, mas o texto não foi retornado para a tela.')
        router.refresh()
      } else {
        alert('Erro na tradução: ' + ((result as any).error || 'Sem texto retornado.'))
      }
    } catch (error: any) {
      console.error(error)
      alert('Erro ao acionar IA: ' + error.message)
    } finally {
      setIsTranslating(false)
    }
  }

  const handleFinalize = async () => {
    if (selectedDocsForDelivery.length === 0) {
      alert('Selecione ao menos um documento para certificar.')
      return
    }

    const docNames = order.documents
      .filter((d) => selectedDocsForDelivery.includes(d.id))
      .map((d) => d.exactNameOnDoc || d.docType)
      .join('\n• ')

    if (
      !confirm(
        `Isso irá gerar ${selectedDocsForDelivery.length} Kit(s) de Entrega certificado(s) nos servidores:\n\n• ${docNames}\n\nConfirmar?`
      )
    )
      return

    setGeneratingKits(true)
    setSaving(true)

    try {
      // 1. Save the currently open document first (if it's selected for delivery)
      if (selectedDoc && selectedDocsForDelivery.includes(selectedDoc.id)) {
        const { saveTranslationDraft } = await import('../../../../actions/workbench')
        await saveTranslationDraft(selectedDoc.id, editorContent)
      }

      // 2. Generate delivery kit PDF for each selected document
      const { generateDeliveryKit } = await import('../../../../actions/generateDeliveryKit')
      let generatedCount = 0
      const errors: string[] = []

      for (const docId of selectedDocsForDelivery) {
        const result = await generateDeliveryKit(order.id, docId)
        if (result.success) {
          generatedCount++
        } else {
          const docLabel =
            order.documents.find((d) => d.id === docId)?.exactNameOnDoc || `#${docId}`
          errors.push(`"${docLabel}": ${result.error}`)
        }
      }

      if (generatedCount === 0) {
        throw new Error('Nenhum kit foi gerado. Erros:\n' + errors.join('\n'))
      }

      // 3. Attempt to release to client (sends the delivery email with per-document links)
      const { releaseToClient } = await import('../../../../actions/workbench')
      const releaseResult = await releaseToClient(order.id, 'Isabele')

      if (releaseResult.success) {
        alert(
          `✅ ${generatedCount} Kit(s) gerado(s) e email enviado ao cliente!\n` +
            (errors.length > 0
              ? `\n⚠️ Falhas parciais:\n${errors.join('\n')}`
              : '')
        )
      } else {
        // Kits were generated but email couldn't be sent (e.g. not all docs approved)
        alert(
          `✅ ${generatedCount}/${selectedDocsForDelivery.length} Kit(s) gerado(s) com sucesso!\n\n` +
            `📧 Email não enviado: ${releaseResult.error}\n\n` +
            `Para enviar ao cliente, todos os documentos do pedido devem estar aprovados.`
        )
      }

      window.location.reload()
    } catch (error: any) {
      console.error(error)
      alert('Erro ao finalizar: ' + error.message)
    } finally {
      setSaving(false)
      setGeneratingKits(false)
    }
  }

  if (!selectedDoc) return <div>Nenhum documento encontrado.</div>

  const viewUrl = selectedDoc.translatedFileUrl || selectedDoc.originalFileUrl

  return (
    <div className="h-[calc(100vh-80px)] flex overflow-hidden">

      {/* ── LEFT SIDEBAR: Document List ─────────────────────────────────── */}
      <div className="w-56 shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col">

        {/* Sidebar header */}
        <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
            Documentos
          </span>
          <span className="text-xs bg-gray-700 text-gray-300 rounded-full px-1.5 py-0.5 font-mono">
            {order.documents.length}
          </span>
        </div>

        {/* Select All toggle */}
        <button
          onClick={toggleSelectAll}
          className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-gray-200 border-b border-gray-800 hover:bg-gray-800 transition-colors"
        >
          {allSelected ? (
            <CheckSquare className="h-3.5 w-3.5 text-[#f58220]" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
          <span>{allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}</span>
        </button>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto py-1">
          {order.documents.map((doc) => {
            const isActive = doc.id === selectedDocId
            const isChecked = selectedDocsForDelivery.includes(doc.id)
            const { label: statusLabel, dotClass } = getStatusInfo(doc)

            return (
              <div
                key={doc.id}
                className={`flex items-start gap-2 px-2 py-2 mx-1 my-0.5 rounded-md cursor-pointer transition-colors group ${
                  isActive ? 'bg-gray-700' : 'hover:bg-gray-800'
                }`}
              >
                {/* Checkbox — stops propagation so click on name still works */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleDocForDelivery(doc.id)
                  }}
                  className="mt-0.5 shrink-0 text-gray-400 hover:text-[#f58220] transition-colors"
                  title="Selecionar para entrega"
                >
                  {isChecked ? (
                    <CheckSquare className="h-4 w-4 text-[#f58220]" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>

                {/* Name + status — clicking activates viewer */}
                <div
                  className="flex-1 min-w-0"
                  onClick={() => setSelectedDocId(doc.id)}
                >
                  <div
                    className={`text-xs font-medium truncate leading-tight ${
                      isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'
                    }`}
                    title={doc.exactNameOnDoc || doc.docType}
                  >
                    {doc.exactNameOnDoc || doc.docType}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`} />
                    <span className="text-[10px] text-gray-500">{statusLabel}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Delivery selection count */}
        {someSelected && (
          <div className="px-3 py-2 border-t border-gray-700 bg-gray-800">
            <p className="text-[10px] text-[#f58220] font-semibold">
              {selectedDocsForDelivery.length} selecionado(s) para entrega
            </p>
          </div>
        )}
      </div>

      {/* ── CENTER: PDF Viewer ────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="bg-gray-900 text-white px-3 py-2 flex justify-between items-center text-xs shrink-0">
          <span className="font-bold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {selectedDoc.translatedFileUrl ? 'PDF Traduzido (DeepL)' : 'Documento Original'}
          </span>
          <div className="flex items-center gap-3">
            {selectedDoc.translatedFileUrl && (
              <a
                href={selectedDoc.translatedFileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1"
              >
                <Eye className="w-3 h-3" /> Abrir ↗
              </a>
            )}
            {selectedDoc.delivery_pdf_url && (
              <a
                href={selectedDoc.delivery_pdf_url}
                target="_blank"
                rel="noreferrer"
                className="text-[#f58220] hover:text-orange-300 font-bold flex items-center gap-1"
              >
                <CheckCircle className="w-3 h-3" /> Kit ↗
              </a>
            )}
          </div>
        </div>
        <div className="flex-1 bg-gray-500 relative">
          {viewUrl && viewUrl !== 'PENDING_UPLOAD' ? (
            <iframe
              key={viewUrl}
              src={viewUrl}
              className="w-full h-full"
              title="PDF Viewer"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-white text-sm">
              Arquivo pendente de upload
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Translation Editor ─────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col bg-white">

        {/* Editor toolbar */}
        <div className="border-b border-gray-200 px-3 py-2 flex flex-wrap justify-between items-center gap-2 bg-gray-50 shrink-0">
          <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            <span className="truncate max-w-[140px]" title={selectedDoc.exactNameOnDoc || selectedDoc.docType}>
              {selectedDoc.exactNameOnDoc || selectedDoc.docType}
            </span>
          </h3>

          <div className="flex flex-wrap gap-1.5">
            {(order.status === 'PENDING' || order.status === 'PENDING_PAYMENT') && (
              <ManualApprovalButton orderId={order.id} />
            )}

            <button
              onClick={handleApplyPromobiStandard}
              title="Formata para Arial 11pt, espaçamento 1.5 (padrão USCIS/ATA)"
              className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 flex items-center gap-1 transition-colors"
            >
              <AlignLeft className="h-3 w-3" />
              Padrão Promobi
            </button>

            <button
              onClick={handleTranslateAI}
              disabled={isTranslating}
              className="bg-purple-50 border border-purple-200 text-purple-700 px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-100 flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              {isTranslating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              {isTranslating ? 'Traduzindo...' : 'Traduzir com IA'}
            </button>

            <button
              onClick={handleSave}
              disabled={isSavingDraft}
              className="bg-white border border-gray-300 text-gray-700 px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-100 flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <Save className="h-3 w-3" />
              {isSavingDraft ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>

        {/* Quill editor */}
        <div className="flex-1 overflow-auto">
          <ReactQuill
            theme="snow"
            value={editorContent}
            onChange={setEditorContent}
            className="h-full"
            modules={{
              toolbar: [
                [{ header: [1, 2, false] }],
                ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['clean'],
              ],
            }}
          />
        </div>

        {/* Footer with dynamic send button */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-500">
            {selectedDocsForDelivery.length > 0
              ? `${selectedDocsForDelivery.length} doc(s) selecionado(s)`
              : 'Nenhum documento selecionado'}
          </p>

          <button
            onClick={handleFinalize}
            disabled={saving || selectedDocsForDelivery.length === 0}
            className="bg-[#f58220] hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2 text-sm transition-colors"
          >
            {generatingKits ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            {generatingKits
              ? 'Gerando Kits...'
              : `Certificar e Enviar${selectedDocsForDelivery.length > 0 ? ` (${selectedDocsForDelivery.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
