import { Resend } from 'resend';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const resend = new Resend(process.env.RESEND_API_KEY);

async function test() {
  console.log("Using API Key starting with:", process.env.RESEND_API_KEY?.substring(0, 8));
  try {
    const data = await resend.emails.send({
      from: 'Entregas Promobi <entregas@promobi.com.br>',
      to: 'dangelo.walter@gmail.com',
      subject: 'Test Email',
      html: '<p>Test</p>'
    });
    console.log("Success:", data);
  } catch (error) {
    console.error("Error:", error);
  }
}
test();
