'use client';

import { useState, useEffect } from 'react';
import { Save, DollarSign, Clock, Key, Eye, EyeOff, ShieldCheck, Globe, Loader2 } from 'lucide-react';
import { getGlobalSettings, updateGlobalSettings, GlobalSettings } from '@/app/actions/settings';
import { useUIFeedback } from '@/components/UIFeedbackProvider';

export default function SettingsPage() {
    const { toast } = useUIFeedback();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [settings, setSettings] = useState<GlobalSettings>({
        basePrice: 0,
        urgencyRate: 0,
        deadlineNormal: 0,
        deadlineUrgent: 0,
        notaryFee: 0,
        stripeKey: '',
        openaiKey: '',
        deeplKey: '',
        emailSender: ''
    });

    useEffect(() => {
        loadSettings();
    }, []);

    async function loadSettings() {
        setLoading(true);
        const data = await getGlobalSettings();
        setSettings(data);
        setLoading(false);
    }

    const toggleKeyVisibility = (key: string) => {
        setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setSettings(prev => ({
            ...prev,
            [name]: name.includes('Price') || name.includes('Rate') || name.includes('deadline') || name.includes('Fee')
                ? parseFloat(value) || 0
                : value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        const result = await updateGlobalSettings(settings);

        if (result.success) {
            toast.success('Configurações salvas com sucesso!');
        } else {
            toast.error('Erro ao salvar configurações.');
        }

        setSaving(false);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-[#f58220]" />
                <p className="text-gray-500">Carregando configurações...</p>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Configurações do Sistema</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Gerencie preços, prazos e integrações da plataforma.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">

                {/* Seção: Valores e Prazos */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-4">
                        <DollarSign className="w-5 h-5 text-gray-500" />
                        Valores e Prazos
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Preço Base (Por Página)</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <span className="text-gray-500 sm:text-sm">$</span>
                                </div>
                                <input
                                    type="number"
                                    name="basePrice"
                                    value={settings.basePrice}
                                    onChange={handleChange}
                                    step="0.01"
                                    className="pl-9 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-gray-50 border"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Multiplicador de Urgência (Ex: 0.5 = +50%)</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <span className="text-gray-500 sm:text-sm">x</span>
                                </div>
                                <input
                                    type="number"
                                    name="urgencyRate"
                                    value={settings.urgencyRate}
                                    onChange={handleChange}
                                    step="0.01"
                                    className="pl-9 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-gray-50 border"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Prazo Normal (Dias Úteis)</label>
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-gray-400" />
                                <input
                                    type="number"
                                    name="deadlineNormal"
                                    value={settings.deadlineNormal}
                                    onChange={handleChange}
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-gray-50 border"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Prazo Urgente (Dias Úteis)</label>
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-red-400" />
                                <input
                                    type="number"
                                    name="deadlineUrgent"
                                    value={settings.deadlineUrgent}
                                    onChange={handleChange}
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-gray-50 border"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Taxa de Notarização (Por Documento)</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <span className="text-gray-500 sm:text-sm">$</span>
                                </div>
                                <input
                                    type="number"
                                    name="notaryFee"
                                    value={settings.notaryFee}
                                    onChange={handleChange}
                                    step="0.01"
                                    className="pl-9 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-gray-50 border"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Seção: Integrações (API Keys) */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-4">
                        <Key className="w-5 h-5 text-gray-500" />
                        Chaves de API
                    </h2>
                    <div className="space-y-4">

                        {/* Stripe */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Stripe Secret Key</label>
                            <div className="flex rounded-md shadow-sm">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                    <ShieldCheck className="w-4 h-4" />
                                </span>
                                <input
                                    type={showKeys['stripe'] ? 'text' : 'password'}
                                    name="stripeKey"
                                    value={settings.stripeKey || ''}
                                    onChange={handleChange}
                                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm border-gray-300 border"
                                />
                                <button
                                    type="button"
                                    onClick={() => toggleKeyVisibility('stripe')}
                                    className="ml-2 px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                                >
                                    {showKeys['stripe'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* OpenAI */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">OpenAI API Key</label>
                            <div className="flex rounded-md shadow-sm">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                    <Globe className="w-4 h-4" />
                                </span>
                                <input
                                    type={showKeys['openai'] ? 'text' : 'password'}
                                    name="openaiKey"
                                    value={settings.openaiKey || ''}
                                    onChange={handleChange}
                                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm border-gray-300 border"
                                />
                                <button
                                    type="button"
                                    onClick={() => toggleKeyVisibility('openai')}
                                    className="ml-2 px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                                >
                                    {showKeys['openai'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* DeepL */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">DeepL API Key</label>
                            <div className="flex rounded-md shadow-sm">
                                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                    <Globe className="w-4 h-4" />
                                </span>
                                <input
                                    type={showKeys['deepl'] ? 'text' : 'password'}
                                    name="deeplKey"
                                    value={settings.deeplKey || ''}
                                    onChange={handleChange}
                                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md focus:ring-blue-500 focus:border-blue-500 sm:text-sm border-gray-300 border"
                                />
                                <button
                                    type="button"
                                    onClick={() => toggleKeyVisibility('deepl')}
                                    className="ml-2 px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                                >
                                    {showKeys['deepl'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className={`flex items-center gap-2 px-6 py-3 bg-[#f58220] text-white rounded-lg font-bold shadow-md hover:bg-orange-600 transition-all ${saving ? 'opacity-70 cursor-not-allowed' : ''
                            }`}
                    >
                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {saving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </form>
        </div>
    );
}
