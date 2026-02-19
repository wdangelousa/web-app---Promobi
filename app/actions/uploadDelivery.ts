'use server'

import { writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import prisma from '../../lib/prisma'

export async function uploadDelivery(formData: FormData) {
    try {
        const file = formData.get('file') as File
        const orderId = formData.get('orderId') as string

        if (!file || !orderId) {
            return { success: false, error: "Arquivo ou ID do pedido inválido" }
        }

        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        // Create secure filename
        const fileName = `${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '')}`
        const path = join(process.cwd(), 'public/deliveries', fileName)

        // Save file
        await writeFile(path, buffer)

        // Update Order
        const deliveryUrl = `/deliveries/${fileName}` // Public URL

        await prisma.order.update({
            where: { id: parseInt(orderId) },
            data: { deliveryUrl }
        })

        return { success: true, deliveryUrl }

    } catch (error) {
        console.error("Upload error:", error)
        return { success: false, error: "Falha ao fazer upload do arquivo" }
    }
}
