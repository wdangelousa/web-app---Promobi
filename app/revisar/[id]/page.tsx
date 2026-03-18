import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  console.warn(
    '[revisar] blocked — legacy client review route is disabled in Phase 13. Structured Preview Kit is the only valid preview path.',
  )
  notFound()
}
