import { getCurrentUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'

export default async function AdminPage() {
    const user = await getCurrentUser()
    const role = user?.role as unknown as string

    if (role === 'FINANCIAL') redirect('/admin/finance')
    if (role === 'PARTNER') redirect('/admin/executive')
    if (role === 'TECHNICAL') redirect('/admin/orders')

    // Default for OPERATIONS and others
    redirect('/admin/dashboard')
}
