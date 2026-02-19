'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log the error to an error reporting service if needed
        console.error(error)
    }, [error])

    return (
        <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-6">
            <div className="p-4 bg-red-50 rounded-full border border-red-100">
                <AlertCircle className="h-12 w-12 text-red-500" />
            </div>

            <div className="space-y-2 max-w-md">
                <h2 className="text-xl font-bold text-gray-900">Algo deu errado!</h2>
                <p className="text-gray-500">
                    Não foi possível carregar os pedidos no momento. Por favor, verifique sua conexão e tente novamente.
                </p>
                {/* Optional: Show technical error in dev only */}
                {process.env.NODE_ENV === 'development' && (
                    <p className="text-xs text-red-400 font-mono bg-red-50 p-2 rounded mt-2">{error.message}</p>
                )}
            </div>

            <button
                onClick={reset}
                className="flex items-center gap-2 px-6 py-3 bg-[#f58220] hover:bg-orange-600 text-white font-bold rounded-lg transition-colors shadow-sm hover:shadow-md"
            >
                <RefreshCw className="h-5 w-5" />
                <span>Tentar Novamente</span>
            </button>
        </div>
    )
}
