'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    LayoutDashboard,
    ListTodo,
    Settings,
    LogOut,
    DollarSign,
    FilePlus,
    Monitor
} from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { Avatar } from '@/components/admin/Avatar'

type UserProps = {
    fullName: string;
    email: string;
    role: string;
}

export default function AdminSidebar({ user }: { user: UserProps }) {
    const pathname = usePathname()

    const isActive = (path: string) => {
        return pathname === path || pathname.startsWith(path + '/')
    }

    return (
        <aside className="w-64 bg-gray-900 text-white flex flex-col fixed h-full shadow-xl z-20 overflow-y-auto">
            {/* Brand Logo & User Profile */}
            <div className="p-6 border-b border-gray-800 space-y-6">
                <Link href="/admin/dashboard" className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-[#f58220] rounded-lg shadow-lg flex items-center justify-center font-bold text-white tracking-tighter shrink-0">
                        PR
                    </div>
                    <h1 className="text-xl font-bold text-white tracking-wider cursor-pointer">
                        PROMOBI
                    </h1>
                </Link>

                <div className="flex items-center gap-3 bg-gray-800/50 p-3 rounded-xl border border-gray-800">
                    <Avatar name={user.fullName || 'Administrador'} size="md" />
                    <div className="overflow-hidden">
                        <h3 className="text-sm font-bold text-gray-100 truncate">{user.fullName || 'Administrador'}</h3>
                        <p className="text-[10px] text-gray-400 truncate uppercase tracking-wider font-medium">{user.role}</p>
                    </div>
                </div>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 p-4 space-y-2">
                <Link
                    href="/admin/dashboard"
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${isActive('/admin/dashboard') ? 'bg-[#f58220]/10 text-[#f58220] font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white font-medium'}`}
                >
                    <LayoutDashboard className={`h-5 w-5 ${isActive('/admin/dashboard') ? 'text-[#f58220]' : 'group-hover:text-[#f58220]'} transition-colors`} />
                    <span>Dashboard</span>
                </Link>

                <Link
                    href="/admin/orders"
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${isActive('/admin/orders') ? 'bg-[#f58220]/10 text-[#f58220] font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white font-medium'}`}
                >
                    <ListTodo className={`h-5 w-5 ${isActive('/admin/orders') ? 'text-[#f58220]' : 'group-hover:text-[#f58220]'} transition-colors`} />
                    <span>Operações (Kanban)</span>
                </Link>

                <Link
                    href="/admin/workbench"
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${isActive('/admin/workbench') ? 'bg-[#f58220]/10 text-[#f58220] font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white font-medium'}`}
                >
                    <Monitor className={`h-5 w-5 ${isActive('/admin/workbench') ? 'text-[#f58220]' : 'group-hover:text-[#f58220]'} transition-colors`} />
                    <span>Mesa de Operações</span>
                </Link>

                {user.role !== 'TECHNICAL' && (
                    <Link
                        href="/admin/finance"
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${isActive('/admin/finance') ? 'bg-[#f58220]/10 text-[#f58220] font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white font-medium'}`}
                    >
                        <DollarSign className={`h-5 w-5 ${isActive('/admin/finance') ? 'text-[#f58220]' : 'group-hover:text-[#f58220]'} transition-colors`} />
                        <span>Financeiro</span>
                    </Link>
                )}

                <Link
                    href="/admin/concierge"
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${isActive('/admin/concierge') ? 'bg-[#f58220]/10 text-[#f58220] font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white font-medium'}`}
                >
                    <FilePlus className={`h-5 w-5 ${isActive('/admin/concierge') ? 'text-[#f58220]' : 'group-hover:text-[#f58220]'} transition-colors`} />
                    <span>Novo Orçamento Manual</span>
                </Link>

                <Link
                    href="/admin/settings"
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${isActive('/admin/settings') ? 'bg-[#f58220]/10 text-[#f58220] font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white font-medium'}`}
                >
                    <Settings className={`h-5 w-5 ${isActive('/admin/settings') ? 'text-[#f58220]' : 'group-hover:text-[#f58220]'} transition-colors`} />
                    <span>Configurações</span>
                </Link>
            </nav>

            <div className="p-4 border-t border-gray-800">
                <button
                    onClick={() => logout()}
                    className="flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg w-full transition-colors text-left"
                >
                    <LogOut className="h-5 w-5" />
                    <span className="font-medium">Sair</span>
                </button>
                <div className="text-[10px] text-gray-500 text-center mt-4 truncate px-2">
                    {user.email}
                </div>
                <p className="text-[10px] text-gray-600 text-center mt-1">
                    v1.1.0 • Promobi System
                </p>
            </div>
        </aside>
    )
}
