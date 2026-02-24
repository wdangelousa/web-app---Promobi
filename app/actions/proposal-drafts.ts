'use server'

// app/actions/proposal-drafts.ts

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Types ────────────────────────────────────────────────────────────────────

export type DraftDocument = {
    id: string
    fileName: string
    count: number
    notarized: boolean
    handwritten?: boolean
    isSelected: boolean
    analysis?: any   // DocumentAnalysis sem o campo File (não serializável)
}

export type ProposalDraft = {
    id: string
    title: string
    client_name: string
    client_email: string
    client_phone: string
    service_type: string | null
    urgency: string
    documents: DraftDocument[]
    order_id: number | null
    status: 'draft' | 'sent'
    total_amount: number
    notes: string | null
    created_at: string
    updated_at: string
}

export type SaveDraftInput = {
    id?: string          // se existir, faz update; se não, cria novo
    title?: string
    client_name: string
    client_email: string
    client_phone: string
    service_type: string | null
    urgency: string
    documents: DraftDocument[]
    order_id?: number | null
    status?: 'draft' | 'sent'
    total_amount: number
    notes?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTitle(input: SaveDraftInput): string {
    const name = input.client_name?.trim()
    const docs = input.documents?.length ?? 0
    if (name && docs > 0) return `${name} — ${docs} doc${docs > 1 ? 's' : ''}`
    if (name) return name
    return 'Rascunho sem título'
}

// ─── Save (upsert) ────────────────────────────────────────────────────────────

export async function saveDraft(input: SaveDraftInput): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        const title = input.title || buildTitle(input)

        // Strip File objects from documents (não serializáveis)
        const cleanDocs = (input.documents || []).map(({ ...d }) => {
            // Remove campo file se existir
            const { ...rest } = d as any
            delete rest.file
            return rest
        })

        const payload = {
            title,
            client_name: input.client_name,
            client_email: input.client_email,
            client_phone: input.client_phone,
            service_type: input.service_type,
            urgency: input.urgency,
            documents: cleanDocs,
            order_id: input.order_id ?? null,
            status: input.status ?? 'draft',
            total_amount: input.total_amount,
            notes: input.notes ?? null,
        }

        if (input.id) {
            // Update
            const { error } = await supabase
                .from('proposal_drafts')
                .update(payload)
                .eq('id', input.id)

            if (error) throw error
            return { success: true, id: input.id }
        } else {
            // Insert
            const { data, error } = await supabase
                .from('proposal_drafts')
                .insert(payload)
                .select('id')
                .single()

            if (error) throw error
            return { success: true, id: data.id }
        }
    } catch (err: any) {
        console.error('[saveDraft]', err)
        return { success: false, error: err?.message }
    }
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listDrafts(): Promise<{ success: boolean; data?: ProposalDraft[]; error?: string }> {
    try {
        const { data, error } = await supabase
            .from('proposal_drafts')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(100)

        if (error) throw error
        return { success: true, data: data as ProposalDraft[] }
    } catch (err: any) {
        console.error('[listDrafts]', err)
        return { success: false, error: err?.message }
    }
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export async function getDraft(id: string): Promise<{ success: boolean; data?: ProposalDraft; error?: string }> {
    try {
        const { data, error } = await supabase
            .from('proposal_drafts')
            .select('*')
            .eq('id', id)
            .single()

        if (error) throw error
        return { success: true, data: data as ProposalDraft }
    } catch (err: any) {
        console.error('[getDraft]', err)
        return { success: false, error: err?.message }
    }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteDraft(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('proposal_drafts')
            .delete()
            .eq('id', id)

        if (error) throw error
        return { success: true }
    } catch (err: any) {
        console.error('[deleteDraft]', err)
        return { success: false, error: err?.message }
    }
}

// ─── Duplicate ────────────────────────────────────────────────────────────────
// Cria novo rascunho baseado em um existente (status volta a 'draft')

export async function duplicateDraft(id: string): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        const { data: src, error: fetchErr } = await supabase
            .from('proposal_drafts')
            .select('*')
            .eq('id', id)
            .single()

        if (fetchErr) throw fetchErr

        const { data, error } = await supabase
            .from('proposal_drafts')
            .insert({
                title: `Cópia — ${src.title}`,
                client_name: src.client_name,
                client_email: src.client_email,
                client_phone: src.client_phone,
                service_type: src.service_type,
                urgency: src.urgency,
                documents: src.documents,
                order_id: null,         // nova proposta, sem order
                status: 'draft',
                total_amount: src.total_amount,
                notes: src.notes,
            })
            .select('id')
            .single()

        if (error) throw error
        return { success: true, id: data.id }
    } catch (err: any) {
        console.error('[duplicateDraft]', err)
        return { success: false, error: err?.message }
    }
}

// ─── Update order amount (editar preço de proposta já enviada) ────────────────

export async function updateOrderAmount(orderId: number, newAmount: number): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await supabase
            .from('Order')
            .update({ totalAmount: newAmount })
            .eq('id', orderId)

        if (error) throw error

        // Também atualiza o draft vinculado
        await supabase
            .from('proposal_drafts')
            .update({ total_amount: newAmount })
            .eq('order_id', orderId)

        return { success: true }
    } catch (err: any) {
        console.error('[updateOrderAmount]', err)
        return { success: false, error: err?.message }
    }
}
