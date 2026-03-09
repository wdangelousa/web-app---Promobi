
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

        // MASTER KEY BYPASS - Safe access for critical roles
        const BYPASS_EMAILS = ['wdangelo81@gmail.com', 'belebmd@gmail.com'];

        const dbUser = await prisma.user.findUnique({
            where: { email: user.email }
        })

        if (!dbUser && BYPASS_EMAILS.includes(user.email)) {
            console.log("[Auth] Master Key used for:", user.email);
            const fullName = user.email === 'wdangelo81@gmail.com' ? 'Walter Dangelo (Founder)' : 'Isabele (Translator)';
            return {
                id: 0, // Synthetic ID
                fullName,
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
            const BYPASS_EMAILS = ['wdangelo81@gmail.com', 'belebmd@gmail.com'];

            if (user?.email && BYPASS_EMAILS.includes(user.email)) {
                const fullName = user.email === 'wdangelo81@gmail.com' ? 'Walter Dangelo (Fail-safe)' : 'Isabele (Fail-safe)';
                return {
                    id: 0,
                    fullName,
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
