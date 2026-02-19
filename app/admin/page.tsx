import { getKanbanOrders } from './actions'
import AdminDashboard from './components/AdminDashboard'

export default async function AdminPage() {
    const { success, data } = await getKanbanOrders()

    // Fallback for empty state or error
    const orders = success ? data : []

    // Pass as any because of Date serialization issues if not handled, 
    // but Typescript should match if we did it right. 
    // In a real app we might need to serialize dates to strings.
    return <AdminDashboard initialOrders={orders as any} />
}
