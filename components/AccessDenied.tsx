// components/AccessDenied.tsx
import { ShieldX } from 'lucide-react'
import Link from 'next/link'

export default function AccessDenied({ message }: { message?: string }) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-6">
                <ShieldX className="h-8 w-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Acesso Restrito</h2>
            <p className="text-gray-500 max-w-sm mb-6">
                {message ?? 'Seu perfil não tem permissão para acessar este módulo.'}
            </p>
            <Link
                href="/admin"
                className="px-4 py-2 bg-[#f58220] text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
            >
                Voltar ao Painel
            </Link>
        </div>
    )
}
