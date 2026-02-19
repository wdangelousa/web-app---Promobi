import { Resend } from 'resend';
import { OrderConfirmationEmail } from '../components/emails/OrderConfirmation';
import { AdminNotificationEmail } from '../components/emails/AdminNotification';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOrderEmails(order: any) {
    if (!process.env.RESEND_API_KEY) {
        console.warn("⚠️ RESEND_API_KEY is missing. Emails will not be sent.");
        return;
    }

    const { id, user, totalAmount, paymentProvider } = order;

    try {
        // 1. Send Customer Email
        await resend.emails.send({
            from: 'Promobi Notifications <onboarding@resend.dev>', // Update with verified domain later
            to: user.email,
            subject: `Recebemos seu pedido #${id}`,
            react: <OrderConfirmationEmail
                orderId={id}
                customerName={user.fullName}
                totalAmount={totalAmount}
                paymentMethod={paymentProvider}
            />,
        });

        // 2. Send Admin Notification (Parallel execution not strictly needed here for simplicity, but good for speed)
        await resend.emails.send({
            from: 'Promobi System <onboarding@resend.dev>',
            to: ['walter@promobi.com', 'isabele@promobi.com'], // Replace with actual admin emails or env var
            subject: `[Novo Pedido] #${id} - ${user.fullName}`,
            react: <AdminNotificationEmail
                orderId={id}
                customerName={user.fullName}
                customerEmail={user.email}
                totalAmount={totalAmount}
            />,
        });

        console.log(`✅ Emails sent for Order #${id}`);
    } catch (error) {
        console.error("❌ Failed to send emails:", error);
        // Don't throw, we don't want to break the checkout flow
    }
}
