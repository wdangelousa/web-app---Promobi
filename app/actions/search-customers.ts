'use server'

import prisma from '@/lib/prisma'

export type CustomerSearchResult = {
    id: number;
    fullName: string;
    email: string;
    phone: string | null;
}

export async function searchCustomers(query: string): Promise<CustomerSearchResult[]> {
    if (!query || query.length < 3) {
        return [];
    }

    try {
        const customers = await prisma.user.findMany({
            where: {
                OR: [
                    {
                        fullName: {
                            contains: query,
                            mode: 'insensitive' // Requires PostgreSQL provider
                        }
                    },
                    {
                        email: {
                            contains: query,
                            mode: 'insensitive'
                        }
                    }
                ]
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
            },
            take: 10,
            orderBy: {
                createdAt: 'desc'
            }
        });

        return customers;
    } catch (error) {
        console.error('Error searching customers:', error);
        return [];
    }
}
