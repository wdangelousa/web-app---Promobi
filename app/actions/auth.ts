
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

        // MASTER KEY BYPASS for Founder
        const FOUNDER_EMAIL = 'wdangelo81@gmail.com';

        const dbUser = await prisma.user.findUnique({
            where: { email: user.email }
        })

        if (!dbUser && user.email === FOUNDER_EMAIL) {
            console.log("[Auth] Master Key used for:", user.email);
            return {
                id: 0, // Synthetic ID
                fullName: 'Walter Dangelo (Founder)',
                email: user.email,
                role: 'OPERATIONS',
                createdAt: new Date(),
                address: null,
                phone: null
            };
        }

        return dbUser
    } catch (error) {
        console.error("CRITICAL: Failed to get current user due to DB/Auth failure:", error)

        // Fail-safe attempt even on total DB failure
        try {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (user?.email === 'wdangelo81@gmail.com') {
                return {
                    id: 0,
                    fullName: 'Walter Dangelo (Founder - Fail-safe)',
                    email: user.email,
                    role: 'OPERATIONS',
                    createdAt: new Date(),
                    address: null,
                    phone: null
                };
            }
        } catch (e) {
            console.error("Total auth failure:", e);
        }

        return null
    }
}
