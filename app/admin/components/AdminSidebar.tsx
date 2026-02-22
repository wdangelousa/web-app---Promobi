'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    LayoutDashboard,
    FileText,
    Users,
    Settings,
    LogOut,
    DollarSign,
    PieChart
} from 'lucide-react'
import { logout } from '@/app/actions/auth'

export default function AdminSidebar({ role }: { role?: string }) {
    const pathname = usePathname()

    const isActive = (path: string) => {
        return pathname === path || pathname.startsWith(path + '/')
    }

    return (
        <aside className="w-64 bg-gray-900 text-white flex flex-col fixed h-full shadow-xl z-20 overflow-y-auto">
            <div className="p-6 border-b border-gray-800">
                <Link href="/admin/orders">
                    <h1 className="text-xl font-bold text-white tracking-wider cursor-pointer">
                        PROMOBI <span className="text-[#f58220]">ADMIN</span>
                    </h1>
                </Link>
            </div>

            <nav className="flex-1 p-4 space-y-2">
                {(role === 'OPERATIONS' || role === 'PARTNER') && (
                    <Link
                        href="/admin/dashboard"
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${isActive('/admin/dashboard') ? 'bg-[#f58220]/10 text-[#f58220]' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
                    >
                        <LayoutDashboard className={`h-5 w-5 ${isActive('/admin/dashboard') ? '' : 'group-hover:text-[#f58220]'} transition-colors`} />
                        <span className={`font-medium ${isActive('/admin/dashboard') ? 'font-bold' : ''}`}>Visão Geral</span>
                    </Link>
                )}

                {role !== 'FINANCIAL' && (
                    <Link
                        href="/admin/orders"
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${isActive('/admin/orders') ? 'bg-[#f58220]/10 text-[#f58220]' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
                    >
                        <FileText className={`h-5 w-5 ${isActive('/admin/orders') ? '' : 'group-hover:text-[#f58220]'} transition-colors`} />
                        <span className={`font-medium ${isActive('/admin/orders') ? 'font-bold' : ''}`}>Gestão de Pedidos</span>
                    </Link>
                )}

                {(role === 'OPERATIONS' || role === 'FINANCIAL') && (
                    <Link
                        href="/admin/finance"
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${isActive('/admin/finance') ? 'bg-[#f58220]/10 text-[#f58220]' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
                    >
                        <DollarSign className={`h-5 w-5 ${isActive('/admin/finance') ? '' : 'group-hover:text-[#f58220]'} transition-colors`} />
                        <span className={`font-medium ${isActive('/admin/finance') ? 'font-bold' : ''}`}>Financeiro</span>
                    </Link>
                )}

                {(role === 'OPERATIONS' || role === 'PARTNER') && (
                    <Link
                        href="/admin/executive"
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${isActive('/admin/executive') ? 'bg-[#f58220]/10 text-[#f58220]' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
                    >
                        <PieChart className={`h-5 w-5 ${isActive('/admin/executive') ? '' : 'group-hover:text-[#f58220]'} transition-colors`} />
                        <span className={`font-medium ${isActive('/admin/executive') ? 'font-bold' : ''}`}>Executivo</span>
                    </Link>
                )}

                {role === 'OPERATIONS' && (
                    <>
                        <Link
                            href="/admin/customers"
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${isActive('/admin/customers') ? 'bg-[#f58220]/10 text-[#f58220]' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
                        >
                            <Users className={`h-5 w-5 ${isActive('/admin/customers') ? '' : 'group-hover:text-[#f58220]'} transition-colors`} />
                            <span className={`font-medium ${isActive('/admin/customers') ? 'font-bold' : ''}`}>Base de Clientes</span>
                        </Link>

                        <Link
                            href="/admin/settings"
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${isActive('/admin/settings') ? 'bg-[#f58220]/10 text-[#f58220]' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
                        >
                            <Settings className={`h-5 w-5 ${isActive('/admin/settings') ? '' : 'group-hover:text-[#f58220]'} transition-colors`} />
                            <span className={`font-medium ${isActive('/admin/settings') ? 'font-bold' : ''}`}>Configurações</span>
                        </Link>
                    </>
                )}
            </nav>

            <div className="p-4 border-t border-gray-800">
                <button
                    onClick={() => logout()}
                    className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg w-full transition-colors text-left"
                >
                    <LogOut className="h-5 w-5" />
                    <span className="font-medium">Sair</span>
                </button>
                <div className="text-[10px] text-gray-500 text-center mt-4">
                    Perfil: {role}
                </div>
                <p className="text-[10px] text-gray-600 text-center mt-1">
                    v1.1.0 • Promobi System
                </p>
            </div>
        </aside>
    )
}
