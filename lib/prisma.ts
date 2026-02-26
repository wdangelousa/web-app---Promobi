import 'server-only';
import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
    // Validate DATABASE_URL parameters in development to prevent connection pooling issues
    if (process.env.NODE_ENV === 'development') {
        const dbUrl = process.env.DATABASE_URL || '';
        const hasPgBouncer = dbUrl.includes('pgbouncer=true') || dbUrl.includes('pgbouncer=true');
        const hasConnLimit = dbUrl.includes('connection_limit=10');

        if (!hasPgBouncer || !hasConnLimit) {
            console.warn('⚠️ [Prisma] DATABASE_URL might be missing recommended parameters: pgbouncer=true & connection_limit=10');
        } else {
            console.log('✅ [Prisma] DATABASE_URL configured with pgbouncer and connection_limit.');
        }
    }

    return new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClientSingleton | undefined;
};

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;