import type { Metadata } from 'next'
import Link from 'next/link'
import {
    LayoutDashboard,
    FileText,
    Users,
    Settings,
    LogOut
} from 'lucide-react'
import AdminSidebar from './components/AdminSidebar'

export const metadata: Metadata = {
    title: 'Promobi Admin',
    description: 'Gestão de Pedidos',
}

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen flex bg-gray-50">
            {/* Sidebar */}
            <AdminSidebar />

            {/* Main Content */}
            <main className="flex-1 ml-64 p-8">
                {children}
            </main>
        </div>
    )
}
