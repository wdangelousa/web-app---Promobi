'use client'

import { useState, useEffect } from 'react'
import { Save, User, Lock, Loader2, Eye, EyeOff } from 'lucide-react'
import { getCurrentUser, updateUserProfile, updateUserPassword } from '@/app/actions/auth'
import { useUIFeedback } from '@/components/UIFeedbackProvider'
import { Avatar } from '@/components/admin/Avatar'

export default function ProfilePage() {
    const { toast } = useUIFeedback()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [savingPassword, setSavingPassword] = useState(false)
    const [showPasswords, setShowPasswords] = useState(false)

    const [fullName, setFullName] = useState('')
    const [email, setEmail] = useState('')
    const [role, setRole] = useState('')

    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')

    useEffect(() => {
        loadUser()
    }, [])

    async function loadUser() {
        setLoading(true)
        const user = await getCurrentUser()
        if (user) {
            setFullName(user.fullName || '')
            setEmail(user.email || '')
            setRole(user.role || '')
        }
        setLoading(false)
    }

    async function handleSaveProfile() {
        if (!fullName.trim()) {
            toast.error('Nome completo e obrigatorio.')
            return
        }
        setSaving(true)
        try {
            await updateUserProfile({ fullName: fullName.trim() })
            toast.success('Perfil atualizado com sucesso.')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar perfil.')
        } finally {
            setSaving(false)
        }
    }

    async function handleChangePassword() {
        if (newPassword.length < 6) {
            toast.error('A nova senha deve ter pelo menos 6 caracteres.')
            return
        }
        if (newPassword !== confirmPassword) {
            toast.error('As senhas nao coincidem.')
            return
        }
        setSavingPassword(true)
        try {
            await updateUserPassword({ newPassword })
            toast.success('Senha alterada com sucesso.')
            setNewPassword('')
            setConfirmPassword('')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao alterar senha.')
        } finally {
            setSavingPassword(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto py-10 px-4">
            <h1 className="text-2xl font-bold text-slate-900 mb-8">Meu Perfil</h1>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-8">
                <div className="flex items-center gap-5">
                    <Avatar name={fullName || 'User'} size="lg" />
                    <div>
                        <p className="text-lg font-bold text-slate-900">{fullName || 'Sem nome'}</p>
                        <p className="text-sm text-slate-500">{role}</p>
                    </div>
                </div>

                <div className="border-t border-gray-100 pt-6 space-y-5">
                    <div className="flex items-center gap-3 mb-4">
                        <User className="h-5 w-5 text-slate-400" />
                        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Dados Pessoais</h2>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">Nome completo</label>
                        <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#B8763E]/30 focus:border-[#B8763E] outline-none transition-all"
                            placeholder="Seu nome completo"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            readOnly
                            className="w-full px-4 py-2.5 border border-gray-100 rounded-xl text-sm bg-gray-50 text-slate-500 cursor-not-allowed"
                        />
                        <p className="text-xs text-slate-400 mt-1">O email nao pode ser alterado.</p>
                    </div>

                    <button
                        onClick={handleSaveProfile}
                        disabled={saving}
                        className="inline-flex items-center gap-2 bg-[#B8763E] hover:bg-[#9A6232] text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar Perfil
                    </button>
                </div>

                <div className="border-t border-gray-100 pt-6 space-y-5">
                    <div className="flex items-center gap-3 mb-4">
                        <Lock className="h-5 w-5 text-slate-400" />
                        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Alterar Senha</h2>
                    </div>

                    <div className="relative">
                        <label className="block text-sm font-medium text-slate-600 mb-1">Nova senha</label>
                        <input
                            type={showPasswords ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#B8763E]/30 focus:border-[#B8763E] outline-none transition-all pr-10"
                            placeholder="Minimo 6 caracteres"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPasswords(!showPasswords)}
                            className="absolute right-3 top-8 text-slate-400 hover:text-slate-600"
                        >
                            {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">Confirmar nova senha</label>
                        <input
                            type={showPasswords ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#B8763E]/30 focus:border-[#B8763E] outline-none transition-all"
                            placeholder="Repita a nova senha"
                        />
                    </div>

                    <button
                        onClick={handleChangePassword}
                        disabled={savingPassword || !newPassword}
                        className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors disabled:opacity-50"
                    >
                        {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                        Alterar Senha
                    </button>
                </div>
            </div>
        </div>
    )
}
