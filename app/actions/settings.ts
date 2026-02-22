'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export type GlobalSettings = {
    basePrice: number
    urgencyRate: number
    deadlineNormal: number
    deadlineUrgent: number
    stripeKey?: string
    openaiKey?: string
    deeplKey?: string
    emailSender?: string
    notaryFee: number
}

const DEFAULT_SETTINGS: GlobalSettings = {
    basePrice: 9.00,
    urgencyRate: 0.50, // 50% for urgent
    deadlineNormal: 10,
    deadlineUrgent: 2,
    notaryFee: 25.00
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
    try {
        const settings = await prisma.setting.findMany()
        const config: any = { ...DEFAULT_SETTINGS }

        settings.forEach(s => {
            if (s.key === 'basePrice' || s.key === 'urgencyRate' || s.key === 'deadlineNormal' || s.key === 'deadlineUrgent' || s.key === 'notaryFee') {
                config[s.key] = parseFloat(s.value)
            } else {
                config[s.key] = s.value
            }
        })

        return config as GlobalSettings
    } catch (error) {
        console.error('Error fetching settings:', error)
        return DEFAULT_SETTINGS
    }
}

export async function updateGlobalSettings(data: Partial<GlobalSettings>) {
    try {
        const entries = Object.entries(data)

        for (const [key, value] of entries) {
            if (value === undefined) continue

            await prisma.setting.upsert({
                where: { key },
                update: { value: value.toString() },
                create: { key, value: value.toString() }
            })
        }

        revalidatePath('/admin/settings')
        revalidatePath('/')
        return { success: true }
    } catch (error) {
        console.error('Error updating settings:', error)
        return { success: false, error: 'Failed to update settings' }
    }
}
