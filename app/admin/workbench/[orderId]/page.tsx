// app/admin/workbench/[orderId]/page.tsx

import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/app/actions/auth'
import { redirect, notFound } from 'next/navigation'
import { WorkbenchEditor } from '@/components/admin/WorkbenchEditor'
import { normalizeOrder } from '@/lib/orderAdapter'

export default async function WorkbenchOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'OPERATIONS') redirect('/admin')

  const { orderId: orderIdParam } = await params
  const orderId = parseInt(orderIdParam)
  if (isNaN(orderId)) notFound()

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { fullName: true, email: true, phone: true } },
      documents: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          exactNameOnDoc: true,   // ← campo real no DB
          docType: true,
          originalFileUrl: true,
          translatedText: true,
          translation_status: true,
          delivery_pdf_url: true,
        },
      },
    },
  })

  if (!order) notFound()

  if (!['TRANSLATING', 'READY_FOR_REVIEW', 'COMPLETED'].includes(order.status)) {
    redirect('/admin/workbench')
  }

  // normalizeOrder converte createdAt → ISO string e garante que nenhum
  // objeto Prisma não-serializável cruze a fronteira Server → Client Component.
  const sanitizedOrder = normalizeOrder(order)

  return (
    <WorkbenchEditor
      order={sanitizedOrder as any}
      currentUserName={user.fullName ?? 'Operador'}
    />
  )
}
