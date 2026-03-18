import { getCurrentUser } from '@/app/actions/auth'
import { redirect, notFound } from 'next/navigation'

export default async function WorkbenchOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { orderId: orderIdParam } = await params
  const orderId = parseInt(orderIdParam)
  if (isNaN(orderId)) notFound()

  console.warn(
    `[admin/workbench/${orderId}] blocked — legacy workbench order route is disabled in Phase 13. Redirecting to structured orders flow.`,
  )
  redirect(`/admin/orders/${orderId}`)
}
