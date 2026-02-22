/**
 * lib/auth.ts
 * Server-side role resolution for the Promobi RBAC system.
 *
 * Usage (in any Server Component or Server Action):
 *   const { user, role } = await getCurrentUser()
 *   requireRole(['OPERATIONS', 'FINANCIAL'], role)
 */
import { createClient } from '@/lib/supabase'
import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'

export type AdminRole = 'OPERATIONS' | 'FINANCIAL' | 'TECHNICAL' | 'PARTNER'

// ── Email → Role seed map ──────────────────────────────────────────────────────
// Update these when actual emails are confirmed for each team member.
const ROLE_SEED: Record<string, AdminRole> = {
    'wdangelo81@gmail.com': 'OPERATIONS',  // Walter
    'leticia@promobi.com': 'FINANCIAL',   // Letícia Cruz — update if different
    'isabele@promobiservices.com': 'TECHNICAL',   // Isabele — update if different
    'evandro@promobi.com': 'PARTNER',     // Evandro — update if different
}

export type CurrentUser = {
    id: number
    email: string
    fullName: string
    role: AdminRole
}

// ── Core: resolve role from session ───────────────────────────────────────────
export async function getCurrentUser(): Promise<CurrentUser> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.user?.email) redirect('/login')

    const email = session.user.email.toLowerCase()

    // Look up the Prisma user (creates on first visit if needed)
    let dbUser = await prisma.user.findUnique({ where: { email } })

    // Resolve role: seeded map first, then DB role
    const seededRole = ROLE_SEED[email]
    const dbRole = dbUser?.role as AdminRole | undefined

    const role: AdminRole | null = seededRole ?? (
        dbRole && dbRole !== 'CLIENT' as any ? dbRole : null
    )

    if (!role) {
        // Authenticated but not a known admin — deny
        redirect('/login?error=unauthorized')
    }

    // Sync role to DB if mismatched (one-time bootstrap)
    if (dbUser && (dbUser.role as string) !== role) {
        dbUser = await prisma.user.update({
            where: { email },
            data: { role: role as any },
        })
    }

    return {
        id: dbUser?.id ?? 0,
        email,
        fullName: dbUser?.fullName ?? session.user.email,
        role,
    }
}

// ── Permission check: throws if role not allowed ───────────────────────────────
export function hasRole(allowedRoles: AdminRole[], role: AdminRole): boolean {
    return allowedRoles.includes(role)
}

// ── Role display helpers ───────────────────────────────────────────────────────
export const ROLE_META: Record<AdminRole, { label: string; color: string; emoji: string }> = {
    OPERATIONS: { label: 'Operações', color: 'text-orange-600 bg-orange-50', emoji: '⚙️' },
    FINANCIAL: { label: 'Financeiro', color: 'text-green-600 bg-green-50', emoji: '💰' },
    TECHNICAL: { label: 'Técnico', color: 'text-blue-600 bg-blue-50', emoji: '🔧' },
    PARTNER: { label: 'Sócio', color: 'text-purple-600 bg-purple-50', emoji: '👔' },
}
