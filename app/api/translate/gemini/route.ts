import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(req: Request) {
    try {
        const { fileUrl, targetLang } = await req.json()

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
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

        // 3. System prompt & query
        const prompt = `Você é um tradutor juramentado especialista. Traduza o documento PDF anexo fielmente para o Inglês (EUA). Mantenha a formatação original (títulos, parágrafos, tabelas) usando HTML semântico limpo.
Retorne APENAS o código HTML dentro de tags (ex: <h1>, <p>, <table>).
NÃO use Markdown (\`\`\`html). NÃO inclua explicações prévias.`

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
