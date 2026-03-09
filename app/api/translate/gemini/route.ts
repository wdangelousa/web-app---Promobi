import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

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
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-pro',
            generationConfig: { temperature: 0.1 }
        })

        const prompt = `Você é um tradutor juramentado especialista. Sua tarefa é traduzir o documento PDF anexo fielmente para o Inglês (EUA), seguindo rigorosamente o padrão USCIS.

PASSO 1: DETECÇÃO DE IDIOMA
Analise o documento e identifique se o idioma de origem é Português Brasileiro (PT_BR) ou Espanhol (ES).

PASSO 2: APLICAÇÃO DAS REGRAS (CHECKLIST OBRIGATÓRIO)
1. Fidelidade USCIS (Tradução Integral): Traduza 100% do texto. Nomes próprios em MAIÚSCULAS se assim estiverem no original.
2. Regras Específicas:
   - SE PORTUGUÊS: "Dou fé" -> "I attest to it", "Inteiro Teor" -> "IN FULL FORM". 
   - SE ESPANHOL: "Doy fe" -> "I attest to it", "Copia Fiel" -> "TRUE COPY".
3. Elementos Gráficos: Substitua brasões, selos e QR Codes por descrições em colchetes. Ex: [Coat of Arms], [Notary Seal].

FORMATO DE SAÍDA OBRIGATÓRIO (JSON):
Retorne EXCLUSIVAMENTE um objeto JSON válido (sem markdown):
{
  "detectedLanguage": "PT_BR" ou "ES",
  "translatedHtml": "o código HTML da tradução aqui"
}`

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: base64Data, mimeType: 'application/pdf' } }
        ])

        const text = result.response.text()
        const jsonResult = JSON.parse(text.replace(/```json\n?|```/g, '').trim())

        // Atualiza o banco de dados com a tradução e o idioma detectado
        if (documentId) {
            await prisma.document.update({
                where: { id: documentId },
                data: {
                    translatedText: jsonResult.translatedHtml,
                    sourceLanguage: jsonResult.detectedLanguage,
                    translation_status: 'ai_draft'
                }
            })

            if (orderId) {
                await prisma.order.update({
                    where: { id: orderId },
                    data: { sourceLanguage: jsonResult.detectedLanguage }
                })
            }
        }

        return NextResponse.json({
            translatedText: jsonResult.translatedHtml,
            detectedLanguage: jsonResult.detectedLanguage
        })
    } catch (error: any) {
        console.error('[Gemini API] Error:', error)
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
    }
}