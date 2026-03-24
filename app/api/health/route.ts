import { NextResponse } from 'next/server';
import { FEATURE_FLAGS } from '@/lib/featureFlags';

export async function GET() {
  return NextResponse.json({
    flags: FEATURE_FLAGS,
    env_raw: process.env.USE_TRANSLATION_V2 ?? 'undefined',
    timestamp: new Date().toISOString(),
  });
}
