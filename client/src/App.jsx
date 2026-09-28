import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from './context/AuthContext'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Assets from './pages/Assets'
import AssetDetail from './pages/AssetDetail'
import AssetForm from './pages/AssetForm'
import WorkOrders from './pages/WorkOrders'
import ReportIssue from './pages/ReportIssue'

const MapView = lazy(() => import('./pages/MapView'))

const Spinner = () => (
  <div className="flex h-[60vh] items-center justify-center text-ink-3"><Loader2 className="size-5 animate-spin" /></div>
)

function Protected({ children, editOnly }) {
  const { user, loading, canEdit } = useAuth()
  const location = useLocation()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (editOnly && !canEdit) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/report" element={<ReportIssue />} />
      <Route element={<Protected><AppLayout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="assets" element={<Assets />} />
        <Route path="assets/new" element={<Protected editOnly><AssetForm /></Protected>} />
        <Route path="assets/:id" element={<AssetDetail />} />
        <Route path="assets/:id/edit" element={<Protected editOnly><AssetForm /></Protected>} />
        <Route path="map" element={<Suspense fallback={<Spinner />}><MapView /></Suspense>} />
        <Route path="work-orders" element={<WorkOrders />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
