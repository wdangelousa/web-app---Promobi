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

    let customerRecipient = user.email;
    let adminRecipient = process.env.TEAM_EMAIL || 'belebmd@gmail.com';

    if (process.env.NODE_ENV === 'development') {
        customerRecipient = 'wdangelo81@gmail.com';
        adminRecipient = 'wdangelo81@gmail.com';
        console.log(`[sendOrderEmails] Development mode: Redirecting emails to ${customerRecipient}`);
    }

    try {
        // 1. Send Customer Email
        await resend.emails.send({
            from: 'Promobi <no-reply@promobi.us>',
            to: customerRecipient,
            subject: `Recebemos seu pedido #${id}`,
            react: <OrderConfirmationEmail
                orderId={id}
                customerName={user.fullName}
                totalAmount={totalAmount}
                paymentMethod={paymentProvider}
            />,
        });

        // 2. Send Admin Notification
        await resend.emails.send({
            from: 'Promobi System <system@promobi.us>',
            to: [adminRecipient],
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
