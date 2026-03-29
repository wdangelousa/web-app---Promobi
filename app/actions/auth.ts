
'use server'

import { createClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'

type AdminRole = 'OPERATIONS' | 'FINANCIAL' | 'TECHNICAL' | 'PARTNER'

const ROLE_SEED: Record<string, AdminRole> = {
    'wdangelo81@gmail.com': 'OPERATIONS',
    'leticia@promobidocs.com': 'FINANCIAL',
    'isabele@promobidocs.com': 'TECHNICAL',
    'evandro@promobidocs.com': 'PARTNER',
    'belebmd@gmail.com': 'TECHNICAL',
}

function getSeededRole(email?: string | null): AdminRole | null {
    if (!email) return null
    return ROLE_SEED[email.toLowerCase()] ?? null
}

function getDisplayName(user: { email?: string | null; user_metadata?: Record<string, any> } | null) {
    const metadataName =
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.user_metadata?.display_name

    if (typeof metadataName === 'string' && metadataName.trim().length > 0) {
        return metadataName.trim()
    }

    if (user?.email) {
        return user.email.split('@')[0]
    }

    return 'Equipe Promobi'
}

export async function logout() {
    try {
        const supabase = await createClient()
        // Sign out from Supabase Auth
        await supabase.auth.signOut()
    } catch (error) {
        console.error("Logout error (Supabase):", error)
    }
    // Redirect must be called outside the try/catch or re-thrown in Next.js
    redirect('/login')
}

export async function updateUserProfile(data: { fullName: string }) {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user?.email) throw new Error('Nao autenticado')

    const updated = await prisma.user.update({
        where: { email: user.email.toLowerCase() },
        data: { fullName: data.fullName.trim() },
    })

    await supabase.auth.updateUser({
        data: { full_name: data.fullName.trim() },
    })

    return updated
}

export async function updateUserPassword(data: { newPassword: string }) {
    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({
        password: data.newPassword,
    })
    if (error) throw new Error(error.message)
    return { success: true }
}

export async function getCurrentUser() {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error || !user?.email) return null

        const email = user.email.toLowerCase()
        const seededRole = getSeededRole(email)

        const dbUser = await prisma.user.findUnique({
            where: { email }
        })

        const dbRole = dbUser?.role && dbUser.role !== 'CLIENT' ? dbUser.role : null
        const resolvedRole = seededRole ?? dbRole

        if (!resolvedRole) {
            return dbUser
        }

        if (!dbUser) {
            const createdUser = await prisma.user.create({
                data: {
                    fullName: getDisplayName(user),
                    email,
                    role: resolvedRole,
                },
            })

            console.log('[Auth] Bootstrapped internal user:', email, 'as', resolvedRole)
            return createdUser
        }

        if (dbUser.role !== resolvedRole) {
            const updatedUser = await prisma.user.update({
                where: { email },
                data: { role: resolvedRole },
            })

            console.log('[Auth] Synced admin role for:', email, 'to', resolvedRole)
            return updatedUser
        }

        return dbUser
    } catch (error) {
        console.error("CRITICAL: Failed to get current user due to DB/Auth failure:", error)

        // Fail-safe attempt even on total DB failure
        try {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            const seededRole = getSeededRole(user?.email)

            if (user?.email && seededRole) {
                return {
                    id: 0,
                    fullName: `${getDisplayName(user)} (Fail-safe)`,
                    email: user.email.toLowerCase(),
                    role: seededRole,
                    createdAt: new Date(),
                    address: null,
                    phone: null
                }
            }
        } catch (e) {
            console.error("Total auth failure:", e);
        }

        return null
    }
}
