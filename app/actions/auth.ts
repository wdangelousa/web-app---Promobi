
'use server'

import { createClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'

export async function logout() {
    const supabase = await createClient()

    // Sign out from Supabase Auth
    await supabase.auth.signOut()

    // Redirect to login page
    redirect('/login')
}
