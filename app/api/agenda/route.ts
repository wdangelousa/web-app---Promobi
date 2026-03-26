import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getDeadlineStatus, type DeadlineStatus } from '@/lib/deadlineCalculator'

export const dynamic = 'force-dynamic'

type AgendaDeadlineStatus = DeadlineStatus | 'no_deadline'

interface AgendaOrderPayload {
  id: number
  status: string
  urgency: string | null
  dueDate: string | null
  paidAt: string | null
  businessDaysLeft: number | null
  deadlineStatus: AgendaDeadlineStatus
  user: {
    fullName: string | null
    email: string | null
  } | null
  documents: Array<{
    id: number
    excludedFromScope: boolean
    scopedFileUrl: string | null
  }>
}

const DEADLINE_SORT_ORDER: Record<AgendaDeadlineStatus, number> = {
  overdue: 0,
  due_today: 1,
  due_tomorrow: 2,
  upcoming: 3,
  no_deadline: 4,
}

function toDateOnly(input: Date): Date {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate())
}

function countBusinessDaysLeft(dueDate: Date, now: Date = new Date()): number {
  const target = toDateOnly(dueDate)
  const today = toDateOnly(now)

  if (target.getTime() === today.getTime()) return 0

  const direction = target.getTime() > today.getTime() ? 1 : -1
  const cursor = new Date(today)
  let total = 0

  while (cursor.getTime() !== target.getTime()) {
    cursor.setDate(cursor.getDate() + direction)
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) {
      total += 1
    }
  }

  return direction > 0 ? total : -total
}

export async function GET() {
  const orders = await prisma.order.findMany({
    where: {
      status: {
        in: ['PAID', 'TRANSLATING', 'READY_FOR_REVIEW', 'MANUAL_TRANSLATION_NEEDED', 'NOTARIZING'],
      },
    },
    select: {
      id: true,
      status: true,
      urgency: true,
      dueDate: true,
      paidAt: true,
      user: {
        select: {
          fullName: true,
          email: true,
        },
      },
      documents: {
        select: {
          id: true,
          excludedFromScope: true,
          scopedFileUrl: true,
        },
        orderBy: { id: 'asc' },
      },
    },
  })

  const now = new Date()
  const payload: AgendaOrderPayload[] = orders
    .map((order) => {
      const dueDate = order.dueDate ? new Date(order.dueDate) : null
      const deadlineStatus: AgendaDeadlineStatus = dueDate
        ? getDeadlineStatus(dueDate, now)
        : 'no_deadline'

      return {
        id: order.id,
        status: order.status,
        urgency: order.urgency ?? null,
        dueDate: dueDate ? dueDate.toISOString() : null,
        paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : null,
        businessDaysLeft: dueDate ? countBusinessDaysLeft(dueDate, now) : null,
        deadlineStatus,
        user: order.user
          ? {
              fullName: order.user.fullName ?? null,
              email: order.user.email ?? null,
            }
          : null,
        documents: order.documents.map((document) => ({
          id: document.id,
          excludedFromScope: document.excludedFromScope,
          scopedFileUrl: document.scopedFileUrl ?? null,
        })),
      }
    })
    .sort((left, right) => {
      const statusDelta =
        DEADLINE_SORT_ORDER[left.deadlineStatus] - DEADLINE_SORT_ORDER[right.deadlineStatus]
      if (statusDelta !== 0) return statusDelta

      const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER
      const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER
      if (leftDue !== rightDue) return leftDue - rightDue

      return left.id - right.id
    })

  return NextResponse.json({ orders: payload })
}
