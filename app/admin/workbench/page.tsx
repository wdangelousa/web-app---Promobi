import { getCurrentUser } from '@/app/actions/auth'
import { redirect } from 'next/navigation'

export default async function WorkbenchQueuePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  console.warn(
    '[admin/workbench] blocked — legacy workbench route is disabled in Phase 13. Redirecting to structured orders flow.',
  )
  redirect('/admin/orders')
}
