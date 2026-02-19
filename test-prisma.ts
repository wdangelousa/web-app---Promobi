import { PrismaClient } from '@prisma/client';

console.log('Testing PrismaClient instantiation...');
try {
    const prisma = new PrismaClient();
    console.log('PrismaClient instantiated successfully');
    prisma.$connect().then(() => {
        console.log('Connected to database');
        prisma.$disconnect();
    }).catch((e) => {
        console.error('Failed to connect:', e);
    });
} catch (e) {
    console.error('Failed to instantiate PrismaClient:', e);
}
