import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET() {
    try {
        const { data: docs, error } = await supabase
            .from('Document')
            .select('id, docType, exactNameOnDoc, originalFileUrl')
            .eq('orderId', 52)

        if (error) throw error;

        return NextResponse.json(docs)
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
