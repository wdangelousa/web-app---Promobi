'use server'

import prisma from '../../lib/prisma'
import { cookies } from 'next/headers'

export async function getDashboardMetrics(period: 'today' | '7days' | 'month' = 'month') {
    try {
        // Security Check
        const cookieStore = await cookies()
        const authCookie = cookieStore.get('admin_auth')
        if (authCookie?.value !== 'true') {
            return { success: false, error: "Unauthorized" }
        }

        // Date Logic
        const now = new Date()
        let startDate = new Date()

        if (period === 'today') {
            startDate.setHours(0, 0, 0, 0)
        } else if (period === '7days') {
            startDate.setDate(now.getDate() - 7)
        } else if (period === 'month') {
            startDate.setDate(1) // First day of current month
            startDate.setHours(0, 0, 0, 0)
        }

        // 1. Total Revenue (Paid Orders) - Consolidated in USD
        // We sum all orders that are not PENDING. 
        // Note: totalAmount is stored in USD in the database.
        const revenue = await prisma.order.aggregate({
            _sum: { totalAmount: true },
            where: {
                status: { notIn: ['PENDING', 'PENDING_PAYMENT', 'CANCELLED'] as any },
                createdAt: { gte: startDate }
            }
        })

        const totalRevenueUSD = revenue._sum.totalAmount || 0;

        // 2. Open Orders (Pending)
        const openOrders = await prisma.order.count({
            where: {
                status: { not: 'COMPLETED' },
                createdAt: { gte: startDate }
            }
        })

        // 3. Ticket Average (All Paid Orders converted to base is hard, so let's do per currency or just USD for simplicity?)
        // Let's do USD Ticket Avg for now
        const ticketAvgUSD = await prisma.order.aggregate({
            _avg: { totalAmount: true },
            where: {
                status: { not: 'PENDING' },
                paymentProvider: 'STRIPE',
                createdAt: { gte: startDate }
            }
        })

        // 4. Payment Method Split
        const paymentSplit = await prisma.order.groupBy({
            by: ['paymentProvider'],
            _count: { id: true },
            where: {
                createdAt: { gte: startDate }
            }
        })

        // 5. Top Services (Complex because Documents are related)
        // We fetch all docs for the period and Aggregate in JS (Prisma doesn't easily group deep relations for counts yet)
        const recentDocs = await prisma.document.findMany({
            where: {
                order: {
                    createdAt: { gte: startDate }
                }
            },
            select: { docType: true }
        })

        const serviceCounts: Record<string, number> = {}
        recentDocs.forEach(doc => {
            const type = doc.docType || 'unknown'
            serviceCounts[type] = (serviceCounts[type] || 0) + 1
        })

        const topServices = Object.entries(serviceCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }))


        return {
            success: true,
            data: {
                revenue: totalRevenueUSD,
                openOrders,
                ticketAvgUSD: ticketAvgUSD._avg.totalAmount || 0,
                paymentSplit,
                topServices
            }
        }

    } catch (error) {
        console.error("Dashboard Metrics Error:", error)
        return { success: false, error: "Falha ao carregar métricas" }
    }
}
