import { Navigate } from 'react-router-dom'
import { useAppSelector } from '../../../store/hooks'

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const accessToken = useAppSelector((s) => s.auth.accessToken)

  if (!accessToken) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
