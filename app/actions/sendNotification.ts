'use server';

interface SendReviewLinkParams {
  email: string;
  name: string;
  orderId: number;
}

export async function sendReviewLink({ email, name, orderId }: SendReviewLinkParams) {
  console.error(
    `[sendReviewLink] blocked — legacy client review link flow is disabled for order #${orderId}. ` +
    `Structured preview + structured release is the only valid client-facing path.`,
  );
  return {
    success: false,
    error:
      'Legacy client review links are disabled. Use structured preview and structured release flow.',
    meta: {
      code: 'LEGACY_CLIENT_REVIEW_DISABLED',
      orderId,
      email,
      name,
    },
  };
}
