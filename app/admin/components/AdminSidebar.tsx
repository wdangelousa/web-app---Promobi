'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useMemo } from 'react'
import {
    LayoutDashboard,
    ListTodo,
    Ban,
    CheckCircle,
    Settings,
    LogOut,
    DollarSign,
    FilePlus
} from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { Avatar } from '@/components/admin/Avatar'
import { SearchBar } from '@/app/admin/components/SearchBar'
import Image from 'next/image'

type UserProps = {
    fullName: string;
    email: string;
    role: string;
}

export default function AdminSidebar({ user }: { user: UserProps }) {
    const pathname = usePathname()
    const [searchQuery, setSearchQuery] = useState('')

    const isActive = (path: string) => {
        return pathname === path || pathname.startsWith(path + '/')
    }

    const menuItems = useMemo(() => [
        {
            id: 'dashboard',
            title: 'Dashboard',
            href: '/admin/dashboard',
            icon: LayoutDashboard,
            category: 'Geral'
        },
        {
            id: 'orders-board',
            title: 'Bancada',
            href: '/admin/orders',
            icon: ListTodo,
            category: 'Pedidos',
            active: isActive('/admin/orders') && !isActive('/admin/orders/cancelados')
        },
        {
            id: 'orders-completed',
            title: 'Concluídos',
            href: '/admin/orders/concluidos',
            icon: CheckCircle,
            category: 'Pedidos',
            active: isActive('/admin/orders/concluidos'),
        },
        {
            id: 'orders-cancelled',
            title: 'Cancelados',
            href: '/admin/orders/cancelados',
            icon: Ban,
            category: 'Pedidos',
            active: isActive('/admin/orders/cancelados'),
            color: 'active:bg-red-500/10 text-red-300 active-icon:text-red-300 group-hover:text-red-300'
        },
        {
            id: 'finance',
            title: 'Financeiro',
            href: '/admin/finance',
            icon: DollarSign,
            category: 'Geral',
            show: user.role !== 'TECHNICAL'
        },
        {
            id: 'concierge',
            title: 'Novo Orçamento Manual',
            href: '/admin/concierge',
            icon: FilePlus,
            category: 'Geral'
        },
        {
            id: 'settings',
            title: 'Configurações',
            href: '/admin/settings',
            icon: Settings,
            category: 'Geral'
        }
    ], [pathname, user.role])

    const filteredItems = menuItems.filter(item => {
        if (item.show === false) return false
        const searchLower = searchQuery.toLowerCase()
        return (
            item.title.toLowerCase().includes(searchLower) ||
            item.category.toLowerCase().includes(searchLower)
        )
    })

    const geralsItems = filteredItems.filter(item => item.category === 'Geral')
    const pedidosItems = filteredItems.filter(item => item.category === 'Pedidos')

    return (
        <aside className="w-64 bg-gray-900 text-white flex flex-col fixed h-full shadow-xl z-20 overflow-y-auto">
            {/* Brand Logo & User Profile */}
            <div className="p-6 border-b border-gray-800 space-y-6">
                <Link href="/admin/dashboard" className="flex items-center">
                    <Image
                        src="/logo-promobidocs.png"
                        width={160}
                        height={55}
                        alt="Promobidocs"
                        className="h-10 w-auto object-contain brightness-0 invert"
                    />
                </Link>

                <div className="flex items-center gap-3 bg-gray-800/50 p-3 rounded-xl border border-gray-800">
                    <Avatar name={user.fullName || 'Administrador'} size="md" />
                    <div className="overflow-hidden">
                        <h3 className="text-sm font-bold text-gray-100 truncate">{user.fullName || 'Administrador'}</h3>
                        <p className="text-[10px] text-gray-400 truncate uppercase tracking-wider font-medium">{user.role}</p>
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div className="px-4 py-4 border-b border-gray-800">
                <SearchBar 
                    placeholder="Buscar no menu..." 
                    onSearch={setSearchQuery} 
                />
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 p-4 space-y-2">
                {geralsItems.map(item => {
                    const active = item.active !== undefined ? item.active : isActive(item.href)
                    if (item.id === 'finance' || item.id === 'concierge' || item.id === 'settings') return null // Handle these later to keep order if needed, but let's just map
                    
                    // Simple mapping for now
                    return (
                        <Link
                            key={item.id}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${active ? 'bg-[#f58220]/10 text-[#f58220] font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white font-medium'}`}
                        >
                            <item.icon className={`h-5 w-5 ${active ? 'text-[#f58220]' : 'group-hover:text-[#f58220]'} transition-colors`} />
                            <span>{item.title}</span>
                        </Link>
                    )
                })}

                {pedidosItems.length > 0 && (
                    <div className="pt-1">
                        <p className="px-4 pb-1 text-[10px] uppercase tracking-[0.12em] text-gray-500 font-bold">Pedidos</p>
                        <div className="space-y-1">
                            {pedidosItems.map(item => {
                                const active = item.active !== undefined ? item.active : isActive(item.href)
                                const isCancelled = item.id === 'orders-cancelled'
                                
                                return (
                                    <Link
                                        key={item.id}
                                        href={item.href}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${active ? (isCancelled ? 'bg-red-500/10 text-red-300 font-bold' : 'bg-[#f58220]/10 text-[#f58220] font-bold') : 'text-gray-400 hover:bg-gray-800 hover:text-white font-medium'}`}
                                    >
                                        <item.icon className={`h-5 w-5 ${active ? (isCancelled ? 'text-red-300' : 'text-[#f58220]') : (isCancelled ? 'group-hover:text-red-300' : 'group-hover:text-[#f58220]')} transition-colors`} />
                                        <span>{item.title}</span>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Remaining Geral items (Financeiro, Concierge, Settings) if they were skipped or just map them correctly */}
                {geralsItems.filter(item => item.id !== 'dashboard').map(item => {
                    const active = item.active !== undefined ? item.active : isActive(item.href)
                    return (
                        <Link
                            key={item.id}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors group ${active ? 'bg-[#f58220]/10 text-[#f58220] font-bold' : 'text-gray-400 hover:bg-gray-800 hover:text-white font-medium'}`}
                        >
                            <item.icon className={`h-5 w-5 ${active ? 'text-[#f58220]' : 'group-hover:text-[#f58220]'} transition-colors`} />
                            <span>{item.title}</span>
                        </Link>
                    )
                })}

                {filteredItems.length === 0 && (
                    <div className="px-4 py-8 text-center">
                        <p className="text-gray-500 text-sm">Nenhum item encontrado</p>
                    </div>
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
