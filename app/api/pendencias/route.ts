import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getDeadlineStatus, type DeadlineStatus } from '@/lib/deadlineCalculator'

export const dynamic = 'force-dynamic'

type PendingDeadlineStatus = DeadlineStatus | 'no_deadline'
type PendingDocBucket = 'kit_ready' | 'error' | 'approved' | 'pending'

interface PendingOrderPayload {
  id: number
  status: string
  urgency: string | null
  dueDate: string | null
  paidAt: string | null
  deadlineStatus: PendingDeadlineStatus
  businessDaysLeft: number | null
  hasError: boolean
  user: {
    fullName: string | null
    email: string | null
  } | null
  documents: Array<{
    id: number
    docType: string | null
    exactNameOnDoc: string | null
    translation_status: string | null
    isReviewed: boolean
    approvedKitUrl: string | null
    excludedFromScope: boolean
    scopedFileUrl: string | null
    billablePages: number | null
    totalPages: number | null
    externalTranslationUrl: string | null
    pendingBucket: PendingDocBucket
  }>
}

const DEADLINE_SORT_ORDER: Record<PendingDeadlineStatus, number> = {
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
    if (day !== 0 && day !== 6) total += 1
  }

  return direction > 0 ? total : -total
}

function classifyPendingBucket(document: {
  translation_status: string | null
  isReviewed: boolean
}): PendingDocBucket {
  if (document.translation_status === 'error') return 'error'
  if (document.translation_status === 'approved' || document.isReviewed) return 'approved'
  if (document.translation_status === 'ai_draft' || document.translation_status === 'translated') return 'kit_ready'
  return 'pending'
}

export async function GET() {
  const orders = await prisma.order.findMany({
    where: {
      status: {
        in: ['TRANSLATING', 'READY_FOR_REVIEW', 'PAID', 'MANUAL_TRANSLATION_NEEDED'],
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
          docType: true,
          exactNameOnDoc: true,
          translation_status: true,
          isReviewed: true,
          approvedKitUrl: true,
          excludedFromScope: true,
          scopedFileUrl: true,
          billablePages: true,
          totalPages: true,
          externalTranslationUrl: true,
        },
        orderBy: { id: 'asc' },
      },
    },
  })

  const now = new Date()

  const payload: PendingOrderPayload[] = orders
    .map((order) => {
      const dueDate = order.dueDate ? new Date(order.dueDate) : null
      const deadlineStatus: PendingDeadlineStatus = dueDate ? getDeadlineStatus(dueDate, now) : 'no_deadline'

      const documents = order.documents.map((document) => ({
        ...document,
        pendingBucket: classifyPendingBucket(document),
      }))

      const hasError = documents.some((document) => {
        if (document.excludedFromScope) return false
        return document.pendingBucket === 'error'
      })

      return {
        id: order.id,
        status: order.status,
        urgency: order.urgency ?? null,
        dueDate: dueDate ? dueDate.toISOString() : null,
        paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : null,
        deadlineStatus,
        businessDaysLeft: dueDate ? countBusinessDaysLeft(dueDate, now) : null,
        hasError,
        user: order.user
          ? {
              fullName: order.user.fullName ?? null,
              email: order.user.email ?? null,
            }
          : null,
        documents: documents.map((document) => ({
          id: document.id,
          docType: document.docType,
          exactNameOnDoc: document.exactNameOnDoc,
          translation_status: document.translation_status,
          isReviewed: document.isReviewed,
          approvedKitUrl: document.approvedKitUrl ?? null,
          excludedFromScope: document.excludedFromScope,
          scopedFileUrl: document.scopedFileUrl ?? null,
          billablePages: document.billablePages,
          totalPages: document.totalPages,
          externalTranslationUrl: document.externalTranslationUrl ?? null,
          pendingBucket: document.pendingBucket,
        })),
      }
    })
    .sort((left, right) => {
      if (left.hasError !== right.hasError) return left.hasError ? -1 : 1

      const deadlineDelta =
        DEADLINE_SORT_ORDER[left.deadlineStatus] - DEADLINE_SORT_ORDER[right.deadlineStatus]
      if (deadlineDelta !== 0) return deadlineDelta

      const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER
      const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER
      if (leftDue !== rightDue) return leftDue - rightDue

      return left.id - right.id
    })

  return NextResponse.json({ orders: payload })
}
