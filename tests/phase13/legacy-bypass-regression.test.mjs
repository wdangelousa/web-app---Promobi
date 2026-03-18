import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (filePath) =>
  fs.readFileSync(path.join(process.cwd(), filePath), 'utf8')

test('legacy manual delivery actions and routes remain hard blocked', () => {
  const uploadAction = read('app/actions/uploadDelivery.ts')
  const sendAction = read('app/actions/sendDelivery.tsx')
  const uploadRoute = read('app/api/workbench/upload-delivery/route.ts')
  const deliveryVaultPage = read('app/delivery/[id]/page.tsx')

  assert.match(uploadAction, /LEGACY_MANUAL_DELIVERY_DISABLED/)
  assert.match(uploadAction, /success:\s*false/)
  assert.match(sendAction, /legacy delivery sender is disabled/i)
  assert.match(sendAction, /success:\s*false/)
  assert.match(uploadRoute, /status:\s*410/)
  assert.match(uploadRoute, /LEGACY_MANUAL_DELIVERY_DISABLED/)
  assert.match(deliveryVaultPage, /notFound\(\)/)
})

test('legacy client review surface is blocked', () => {
  const reviewPage = read('app/revisar/[id]/page.tsx')
  const reviewAction = read('app/actions/reviewOrder.ts')
  const reviewLinkAction = read('app/actions/sendNotification.ts')
  const notificationsRoute = read('app/api/notifications/route.ts')

  assert.match(reviewPage, /notFound\(\)/)
  assert.match(reviewAction, /legacy client review completion is disabled/i)
  assert.match(reviewLinkAction, /LEGACY_CLIENT_REVIEW_DISABLED/)
  assert.match(notificationsRoute, /LEGACY_DELIVERY_TRIGGER_DISABLED/)
  assert.match(notificationsRoute, /blocked trigger=delivery/)
})

test('legacy blocked endpoints are not referenced from active UI paths', () => {
  const editor = read('components/Workbench/Editor.tsx')
  const dashboard = read('app/admin/dashboard/page.tsx')
  const sidebar = read('app/admin/components/AdminSidebar.tsx')
  const legacyWorkbenchRoute = read('app/admin/workbench/page.tsx')
  const legacyWorkbenchOrderRoute = read('app/admin/workbench/[orderId]/page.tsx')

  assert.doesNotMatch(editor, /\/api\/pdf\/generate/)
  assert.doesNotMatch(dashboard, /\/admin\/workbench/)
  assert.doesNotMatch(sidebar, /\/admin\/workbench/)
  assert.match(legacyWorkbenchRoute, /redirect\('\/admin\/orders'\)/)
  assert.match(legacyWorkbenchOrderRoute, /redirect\(`\/admin\/orders\/\$\{orderId\}`\)/)
})
