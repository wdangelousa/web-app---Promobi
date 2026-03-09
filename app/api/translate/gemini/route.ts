import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    try {
        const { fileUrl, documentId, orderId } = await req.json()

        if (!fileUrl) {
            return NextResponse.json({ error: 'fileUrl is required' }, { status: 400 })
        }

        const apiKey = process.env.GOOGLE_GEN_AI_API_KEY
        if (!apiKey) {
            return NextResponse.json({ error: 'GOOGLE_GEN_AI_API_KEY not configured' }, { status: 500 })
        }

        const pdfRes = await fetch(fileUrl)
        if (!pdfRes.ok) return NextResponse.json({ error: 'Failed to fetch PDF' }, { status: 500 })
        const pdfBuffer = await pdfRes.arrayBuffer()
        const base64Data = Buffer.from(pdfBuffer).toString('base64')

        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })

        const prompt = `Você é um tradutor juramentado especialista. Analise o documento PDF anexo e realize as seguintes etapas:

PASSO 1: DETECÇÃO DE IDIOMA
Identifique se o idioma original é Português Brasileiro ou Espanhol.

PASSO 2: TRADUÇÃO JURAMENTADA
Traduza o documento fielmente para o Inglês (EUA), seguindo o padrão USCIS. Traduza 100% do texto.
- Se Português: "Dou fé" -> "I attest to it", "Inteiro Teor" -> "IN FULL FORM".
- Se Espanhol: "Doy fe" -> "I attest to it", "Copia Fiel" -> "TRUE COPY".
- Substitua elementos gráficos por descrições em colchetes: [Seal: ...], [QR Code], [Signature].

FORMATO DE SAÍDA OBRIGATÓRIO (JSON):
Retorne EXCLUSIVAMENTE um objeto JSON válido (sem markdown):
{
  "detectedLanguage": "PT_BR" ou "ES",
  "translatedHtml": "o código HTML da tradução aqui"
}

NÃO inclua explicações ou saudações fora do JSON.`

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: base64Data, mimeType: 'application/pdf' } }
        ])

        const text = result.response.text()
        const jsonResult = JSON.parse(text.replace(/```json\n?|```/g, '').trim())

        // Salva a detecção no banco de dados para uso no Kit de Entrega
        if (documentId) {
            await prisma.document.update({
                where: { id: documentId },
                data: {
                    translatedText: jsonResult.translatedHtml,
                    sourceLanguage: jsonResult.detectedLanguage
                }
            })
            // Sincroniza o idioma no pedido (Order)
            await prisma.order.update({
                where: { id: orderId },
                data: { sourceLanguage: jsonResult.detectedLanguage }
            })
        }

        return NextResponse.json({ translatedText: jsonResult.translatedHtml, detectedLanguage: jsonResult.detectedLanguage })
    } catch (error: any) {
        console.error('[Gemini API] Failed:', error)
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
    }
}