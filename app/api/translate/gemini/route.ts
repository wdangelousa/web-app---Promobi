import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    try {
        const { fileUrl } = await req.json()

        if (!fileUrl) {
            return NextResponse.json({ error: 'fileUrl is required' }, { status: 400 })
        }

        const apiKey = process.env.GOOGLE_GEN_AI_API_KEY
        if (!apiKey) {
            return NextResponse.json({ error: 'GOOGLE_GEN_AI_API_KEY not configured' }, { status: 500 })
        }

        // 1. Fetch the PDF from Supabase
        const pdfRes = await fetch(fileUrl)
        if (!pdfRes.ok) {
            return NextResponse.json({ error: 'Failed to fetch PDF' }, { status: 500 })
        }
        const pdfBuffer = await pdfRes.arrayBuffer()
        const base64Data = Buffer.from(pdfBuffer).toString('base64')

        // 2. Instantiate Gemini
        const genAI = new GoogleGenerativeAI(apiKey)
        const versionId = 'REV_MAR_05_26_PROMPT_STUDIO_V2'
        console.log(`[Gemini API] [${versionId}] Requesting translation via gemini-2.5-flash...`)
        const model = genAI.getGenerativeModel(
            { model: 'gemini-2.5-flash' }
        )

        // 3. System prompt & query com o Checklist Avançado (Engenharia Reversa do AI Studio)
        const prompt = `Você é um tradutor juramentado especialista. Traduza o documento PDF anexo fielmente para o Inglês (EUA), seguindo rigorosamente o padrão USCIS.

SEU CHECKLIST OBRIGATÓRIO DE QUALIDADE E MAPEAMENTO VISUAL:
1. Fidelidade USCIS (Tradução Integral): Traduza 100% do texto, sem resumos. Nomes próprios e cabeçalhos devem ser mantidos em MAIÚSCULAS se assim estiverem no original. Expressões juramentadas devem ser exatas (ex: "Dou fé" -> "I attest", "Inteiro Teor" -> "IN FULL FORM").
2. Elementos Gráficos e de Segurança: Substitua brasões, selos, códigos de barras, carimbos e QR Codes por descrições exatas entre colchetes. Ex: [Coat of Arms of the Republic of Brazil], [QR Code], [STAMPS & FEES], [Logos for: serp, ARCPN].
3. Posicionamento Visual (DTP Contextual): Indique explicitamente a posição de textos marginais ou caixas de destaque usando colchetes para guiar a diagramação da equipe de DTP. Ex: [Vertical text on the left margin:], [Text in the very bottom blue box:], [Logos on the right margin:].
4. Notas Técnicas e Siglas: Explique siglas governamentais ou termos técnicos brasileiros entre colchetes logo após a sigla. Ex: DNV [Live Birth Declaration].
5. Tratamento de Assinaturas e Falhas: Indique assinaturas (ex: [Signature of fulano], [Illegible signature]), e aponte claramente partes rasuradas ou cortadas.
6. Quebra de Páginas e Numeração: Mantenha a exata numeração de folhas e indique a quebra de páginas do original.

Instruções Técnicas de Saída:
- Formate o texto usando HTML semântico limpo (use <h1> para títulos, <p> para parágrafos, <strong> para negritos e <br> para quebras de linha reais).
- Retorne APENAS o código HTML final validado.
- NÃO use tags de Markdown (como \`\`\`html) englobando o texto.
- NÃO inclua explicações prévias, saudações ou comentários. Seu retorno deve ser exclusivamente a tradução pronta para uso na tela do sistema.`

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: 'application/pdf'
                }
            }
        ])

        const response = result.response
        const text = response.text()

        // Cleanup possible markdown tags if Gemini returned them anyway
        const htmlCleaned = text.replace(/^```html\n?|```$/gm, '').trim()

        return NextResponse.json({ translatedText: htmlCleaned })
    } catch (error: any) {
        console.error('[Gemini API] Translation failed:', error)
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
    }
}