
import { sendOrderConfirmationEmail, sendDeliveryEmail, sendAdminReviewEmail } from './mail';

interface NotificationOrder {
    id: number;
    user: {
        fullName: string;
        email: string;
        phone: string;
    };
    // deliveryUrl? is handled by specific methods or passed in order object if consistent
    deliveryUrl?: string; // Optional for completion
    // Service flags
    metadata?: any;
    // We can parse metadata or check flags if they exist on order object passed in
    // For simplicity, we assume the caller passes relevant flags or we parse them here if order object is full Prisma object
}

// Helper to determine service types from order (if needed)
// But for now, we trust the Mail templates to handle specific logic if we pass the right props.

export const NotificationService = {

    /**
     * Notify Client that Order is Created/Paid
     */
    async notifyOrderCreated(order: any) {
        console.log(`[Notification] Order #${order.id} Created. Sending Email...`);

        // Parse metadata to check for services if not top-level
        let hasTranslation = true;
        let hasNotary = false;

        if (order.metadata && typeof order.metadata === 'string') {
            try {
                const meta = JSON.parse(order.metadata);
                // Logic to determine headers? Or just assume default for now.
                // In previous code, createOrder adds services. 
                // We need to know if it has Notary.
                if (meta.documents && meta.documents.some((d: any) => d.notarized)) {
                    hasNotary = true;
                }
            } catch (e) { }
        }

        // 1. Send Email
        await sendOrderConfirmationEmail({
            orderId: order.id,
            customerName: order.user.fullName,
            customerEmail: order.user.email,
            hasTranslation,
            hasNotary
        });

        // 2. Send WhatsApp (Future)
        // await this.sendWhatsApp(order.user.phone, `Olá ${order.user.fullName}, recebemos seu pedido #${order.id}!`);
    },

    /**
     * Notify Admin that a Translation is Ready for Review
     */
    async notifyTranslationReady(order: any) {
        console.log(`[Notification] Order #${order.id} Translation Ready. Notifying Admin...`);

        // Admin Email (Fixed for now, or use environment variable)
        const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@promobi.com';

        await sendAdminReviewEmail({
            orderId: order.id,
            customerName: order.user.fullName,
            adminEmail: ADMIN_EMAIL
        });
    },

    /**
     * Notify Client that Order is Completed and ready for download
     */
    async notifyOrderCompleted(order: any, deliveryUrl: string) {
        console.log(`[Notification] Order #${order.id} Completed. Sending Delivery Email...`);

        let hasTranslation = true;
        let hasNotary = false;

        if (order.metadata && typeof order.metadata === 'string') {
            try {
                const meta = JSON.parse(order.metadata);
                if (meta.documents && meta.documents.some((d: any) => d.notarized)) {
                    hasNotary = true;
                }
            } catch (e) { }
        }

        // 1. Send Email
        await sendDeliveryEmail({
            orderId: order.id,
            customerName: order.user.fullName,
            customerEmail: order.user.email,
            deliveryUrl,
            hasTranslation,
            hasNotary
        });

        // 2. Send WhatsApp (Future)
        // await this.sendWhatsApp(order.user.phone, `Seu pedido #${order.id} está pronto! Baixe aqui: ${deliveryUrl}`);
    },

    /**
     * Placeholder for WhatsApp Integration
     */
    async sendWhatsApp(to: string, message: string) {
        // TODO: Integrate interact with Twilio, Z-API or similar.
        // const API_KEY = process.env.WHATSAPP_API_KEY;
        console.log(`[WhatsApp Mock] To: ${to} | Message: ${message}`);
        return Promise.resolve(true);
    }
};
