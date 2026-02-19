import { PrismaClient } from '@prisma/client';

async function main() {
    console.log('Testing PrismaClient instantiation with valid options...');

    try {
        // Mimic the real implementation in lib/prisma.ts
        const options = {
            log: ['query', 'error', 'warn'] as ('query' | 'error' | 'warn')[],
        };

        // Explicitly pass url if needed, though env var should cover it
        const prisma = new PrismaClient(options);

        console.log('Successfully instantiated prisma client.');
        await prisma.$connect();
        console.log('Successfully connected to the database.');

        const userCount = await prisma.user.count();
        console.log(`User count: ${userCount}`);

        await prisma.$disconnect();
    } catch (e: any) {
        console.error('Error:', e.message);
        if (e.constructor) console.error('Error Constructor:', e.constructor.name);
        process.exit(1);
    }
}

main();
