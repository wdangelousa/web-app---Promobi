
'use server'

import { createClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'

export async function logout() {
    const supabase = await createClient()

    // Sign out from Supabase Auth
    await supabase.auth.signOut()

    // Redirect to login page
    redirect('/login')
}

export async function getCurrentUser() {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.email) return null

    const user = await prisma.user.findUnique({
        where: { email: session.user.email }
    })

    return user
}
