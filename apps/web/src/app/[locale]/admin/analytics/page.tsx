import { AdminGuard } from '@/components/admin-guard'
import { AnalyticsDashboard } from '@/components/admin/analytics-dashboard'

export default function AdminAnalyticsPage() {
  return (
    <AdminGuard>
      <AnalyticsDashboard />
    </AdminGuard>
  )
}
