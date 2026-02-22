'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

// --- Types ---

type ToastType = 'success' | 'error' | 'info'

interface Toast {
    id: string
    type: ToastType
    message: string
}

interface ConfirmOptions {
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    onConfirm: () => Promise<void> | void
    danger?: boolean
}

interface ConfirmModalState extends ConfirmOptions {
    isOpen: boolean
    isLoading: boolean
}

interface UIFeedbackContextProps {
    toast: {
        success: (message: string) => void
        error: (message: string) => void
        info: (message: string) => void
    }
    confirm: (options: ConfirmOptions) => void
}

const UIFeedbackContext = createContext<UIFeedbackContextProps | undefined>(undefined)

export const useUIFeedback = () => {
    const context = useContext(UIFeedbackContext)
    if (!context) {
        throw new Error('useUIFeedback must be used within a UIFeedbackProvider')
    }
    return context
}

// --- Provider Component ---

export const UIFeedbackProvider = ({ children }: { children: ReactNode }) => {
    // Toast State
    const [toasts, setToasts] = useState<Toast[]>([])

    // Confirm Modal State
    const [confirmState, setConfirmState] = useState<ConfirmModalState>({
        isOpen: false,
        isLoading: false,
        title: '',
        message: '',
        confirmText: 'Confirmar',
        cancelText: 'Cancelar',
        onConfirm: () => { },
        danger: false
    })

    // --- Toast Logic ---
    const addToast = useCallback((type: ToastType, message: string) => {
        const id = crypto.randomUUID()
        setToasts(prev => [...prev, { id, type, message }])

        // Auto remove
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 4000)
    }, [])

    const toastFunctions = {
        success: (msg: string) => addToast('success', msg),
        error: (msg: string) => addToast('error', msg),
        info: (msg: string) => addToast('info', msg)
    }

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }

    // --- Confirm Modal Logic ---
    const confirm = useCallback((options: ConfirmOptions) => {
        setConfirmState({
            isOpen: true,
            isLoading: false,
            title: options.title,
            message: options.message,
            confirmText: options.confirmText || 'Confirmar',
            cancelText: options.cancelText || 'Cancelar',
            onConfirm: options.onConfirm,
            danger: options.danger || false
        })
    }, [])

    const closeConfirm = () => {
        if (confirmState.isLoading) return // Prevent closing while loading
        setConfirmState(prev => ({ ...prev, isOpen: false }))
    }

    const handleConfirmAction = async () => {
        setConfirmState(prev => ({ ...prev, isLoading: true }))
        try {
            await confirmState.onConfirm()
        } finally {
            setConfirmState(prev => ({ ...prev, isOpen: false, isLoading: false }))
        }
    }

    // Handle ESC key for modal
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && confirmState.isOpen && !confirmState.isLoading) {
                closeConfirm()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [confirmState.isOpen, confirmState.isLoading])

    return (
        <UIFeedbackContext.Provider value={{ toast: toastFunctions, confirm }}>
            {children}

            {/* --- Global Confirm Modal --- */}
            <AnimatePresence>
                {confirmState.isOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={closeConfirm}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: 'spring', duration: 0.4 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden z-10 relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-2">{confirmState.title}</h3>
                                <p className="text-sm text-slate-500 mb-6">{confirmState.message}</p>

                                <div className="flex gap-3 justify-end items-center">
                                    <button
                                        onClick={closeConfirm}
                                        disabled={confirmState.isLoading}
                                        className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {confirmState.cancelText}
                                    </button>
                                    <button
                                        onClick={handleConfirmAction}
                                        disabled={confirmState.isLoading}
                                        className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-70 ${confirmState.danger
                                                ? 'bg-red-500 hover:bg-red-600'
                                                : 'bg-[#f58220] hover:bg-orange-600'
                                            }`}
                                    >
                                        {confirmState.isLoading ? (
                                            <>
                                                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Processando...
                                            </>
                                        ) : (
                                            confirmState.confirmText
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* --- Global Toast Container --- */}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                    {toasts.map(t => (
                        <motion.div
                            key={t.id}
                            initial={{ opacity: 0, x: 50, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            className="bg-white border border-slate-100 rounded-xl shadow-xl p-4 flex items-start gap-3 w-80 pointer-events-auto"
                        >
                            <div className="shrink-0 mt-0.5">
                                {t.type === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                                {t.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                                {t.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-slate-800 leading-snug">{t.message}</p>
                            </div>
                            <button
                                onClick={() => removeToast(t.id)}
                                className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors p-1 -mr-2 -mt-2"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </UIFeedbackContext.Provider>
    )
}
