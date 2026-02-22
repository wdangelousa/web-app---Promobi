import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AdminSidebar from './components/AdminSidebar'
import { getCurrentUser } from '@/app/actions/auth'

export const metadata: Metadata = {
    title: 'Promobi Admin',
    description: 'Gestão de Pedidos',
}

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const user = await getCurrentUser()

    if (!user) {
        redirect('/login')
    }

    return (
        <div className="min-h-screen flex bg-gray-50">
            {/* Sidebar */}
            <AdminSidebar user={{ fullName: user.fullName, email: user.email, role: user.role }} />

            {/* Main Content */}
            <main className="flex-1 ml-64 p-8">
                {children}
            </main>
        </div>
    )
}
