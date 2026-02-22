
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return null

    const dbUser = await prisma.user.findUnique({
        where: { email: user.email }
    })

    return dbUser
}
