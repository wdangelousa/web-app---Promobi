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
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100 text-center space-y-4">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Acesso Restrito</h2>
                    <p className="text-gray-500 text-sm">Seu usuário foi autenticado, mas não possui permissão no banco de dados. Entre em contato com o suporte.</p>
                    <a href="/login" className="inline-block bg-gray-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-gray-800 transition-colors">Voltar</a>
                </div>
            </div>
        )
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
