import { Route, Routes } from 'react-router-dom'
import { PublicRoute } from './features/auth/components/PublicRoute'
import { PrivateRoute } from './features/auth/components/PrivateRoute'
import { LoginPage } from './features/auth/pages/LoginPage'
import { SignupPage } from './features/auth/pages/SignupPage'
import { VerifyEmailPage } from './features/auth/pages/VerifyEmailPage'
import { VerifyEmailSentPage } from './features/auth/pages/VerifyEmailSentPage'

function HomePage() {
  return <h1>Dashboard</h1>
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={<PublicRoute><LoginPage /></PublicRoute>}
      />
      <Route
        path="/signup"
        element={<PublicRoute><SignupPage /></PublicRoute>}
      />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/verify-email-sent" element={<VerifyEmailSentPage />} />
      <Route
        path="/"
        element={<PrivateRoute><HomePage /></PrivateRoute>}
      />
    </Routes>
  )
}
