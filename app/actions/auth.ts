
'use server'

import { createClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'

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

export async function getCurrentUser() {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error || !user?.email) return null

        const dbUser = await prisma.user.findUnique({
            where: { email: user.email }
        })

        return dbUser
    } catch (error) {
        console.error("CRITICAL: Failed to get current user due to DB/Auth failure:", error)
        return null // Return null so the UI can redirect or show access restricted
    }
}
