import { NextRequest, NextResponse } from 'next/server'

export async function POST(_req: NextRequest) {
  console.error(
    '[upload-delivery] blocked — manual delivery upload endpoint is disabled. ' +
    'Use structured delivery generation only.',
  )

  return NextResponse.json(
    {
      success: false,
      code: 'LEGACY_MANUAL_DELIVERY_DISABLED',
      error:
        'Manual delivery upload endpoint is disabled. Use structured delivery generation only.',
    },
    { status: 410 },
  )
}
