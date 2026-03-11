export interface DeliveryProps {
  orderId: string | number;
  customerName: string;
  deliveryUrl: string;
  serviceType: 'translation' | 'notarization';
  pageCount?: number;
}

export function renderDelivery(props: DeliveryProps) {
  const { orderId, customerName, deliveryUrl, serviceType } = props;
  const currentYear = new Date().getFullYear();
  const serviceName = serviceType === 'notarization' ? 'Notarization' : 'Certified Translation';
  // Note: pageCount is currently not in DeliveryProps, it could be added later if needed.
  const pageCount = "1"; 

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your ${serviceName} is Ready!</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6f9; padding: 40px 0;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
          
          <!-- Header (Blue Banner) -->
          <tr>
            <td align="center" style="background-color: #0052cc; padding: 40px 20px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: bold; letter-spacing: -0.5px;">🎉 Your ${serviceName} is Ready!</h1>
              <p style="color: #e0eaff; margin: 10px 0 0 0; font-size: 15px; opacity: 0.9;">Order #${orderId} · ${pageCount} pages</p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; font-size: 18px; color: #333333;">Hi <strong>${customerName}</strong>!</p>
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #555555;">
                We are pleased to inform you that your documents have been processed and are now available for download. You can access them directly through the secure link below.
              </p>

              <!-- CTA Button -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0 30px 0;">
                    <a href="${deliveryUrl}" style="background-color: #0052cc; color: #ffffff; padding: 18px 30px; border-radius: 8px; font-weight: bold; text-decoration: none; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 82, 204, 0.2);">⬇ View All Documents</a>
                  </td>
                </tr>
              </table>

              <!-- Document Info Box -->
              <div style="background-color: #f8f9fc; border: 1px solid #e1e4e8; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                <h3 style="margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #888888;">Order Details</h3>
                <p style="margin: 5px 0; font-size: 15px; color: #333333;"><strong>Service:</strong> ${serviceName}</p>
                <p style="margin: 5px 0; font-size: 15px; color: #333333;"><strong>Order ID:</strong> #${orderId}</p>
                <p style="margin: 5px 0; font-size: 15px; color: #333333;"><strong>Delivery Date:</strong> ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>

              <!-- Important Note -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #eeeeee; padding-top: 25px;">
                <tr>
                  <td style="font-size: 14px; color: #777777; line-height: 1.5;">
                    <strong style="color: #333333;">Next Steps:</strong> Once you open the link, we recommend saving your documents to a secure location on your computer or cloud storage.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 0 30px 40px 30px; text-align: center;">
              <p style="margin: 0; font-size: 13px; color: #999999;">
                Thank you for choosing <strong>Promobi</strong> for your document services.<br>
                Need help? <a href="mailto:support@promobidocs.com" style="color: #0052cc; text-decoration: none;">Contact our support team</a>
              </p>
              <div style="margin-top: 25px; border-top: 1px solid #eeeeee; padding-top: 20px;">
                <p style="margin: 0; font-size: 12px; color: #bbbbbb;">&copy; ${currentYear} Promobi. All rights reserved.</p>
              </div>
            </td>
          </tr>

        </table>
        <!-- End Main Container -->
      </td>
    </tr>
  </table>
</body>
</html>`;
}
