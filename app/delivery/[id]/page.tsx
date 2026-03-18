import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function DeliveryVaultDisabled() {
  console.error(
    '[delivery/[id]] blocked — legacy client delivery vault is disabled. ' +
      'Structured release flow is the only supported client-facing path.',
  )
  notFound()
}
