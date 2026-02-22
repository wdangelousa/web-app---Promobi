import { getCurrentUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const user = await getCurrentUser()
    const role = user?.role as unknown as string

    if (role !== 'OPERATIONS' && role !== 'PARTNER') {
        redirect('/admin')
    }
    return <>{children}</>
}
