import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const orderId = 52;
    console.log(`Checking Order ID: ${orderId}`);
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { documents: true }
    });

    if (order) {
        console.log(JSON.stringify(order, null, 2));
    } else {
        console.log('Order not found.');
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
