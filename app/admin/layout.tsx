import type { Metadata } from 'next'
import Link from 'next/link'
import {
    LayoutDashboard,
    FileText,
    Users,
    Settings,
    LogOut
} from 'lucide-react'

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
            <aside className="w-64 bg-gray-900 text-white flex flex-col fixed h-full shadow-xl z-10">
                <div className="p-6 border-b border-gray-800">
                    <h1 className="text-xl font-bold text-white tracking-wider">
                        PROMOBI <span className="text-[#f58220]">ADMIN</span>
                    </h1>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    <Link
                        href="/admin"
                        className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors group"
                    >
                        <LayoutDashboard className="h-5 w-5 group-hover:text-[#f58220] transition-colors" />
                        <span className="font-medium">Visão Geral</span>
                    </Link>

                    <Link
                        href="/admin"
                        className="flex items-center gap-3 px-4 py-3 bg-[#f58220]/10 text-[#f58220] rounded-lg transition-colors"
                    >
                        <FileText className="h-5 w-5" />
                        <span className="font-bold">Gestão de Pedidos</span>
                    </Link>

                    <Link
                        href="/admin/clients"
                        className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors group"
                    >
                        <Users className="h-5 w-5 group-hover:text-[#f58220] transition-colors" />
                        <span className="font-medium">Base de Clientes</span>
                    </Link>

                    <Link
                        href="/admin/settings"
                        className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors group"
                    >
                        <Settings className="h-5 w-5 group-hover:text-[#f58220] transition-colors" />
                        <span className="font-medium">Configurações</span>
                    </Link>
                </nav>

                <div className="p-4 border-t border-gray-800">
                    <button className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg w-full transition-colors">
                        <LogOut className="h-5 w-5" />
                        <span className="font-medium">Sair</span>
                    </button>
                    <p className="text-[10px] text-gray-600 text-center mt-4">
                        v1.0.0 • Promobi System
                    </p>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 p-8">
                {children}
            </main>
        </div>
    )
}
