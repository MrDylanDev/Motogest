import Alert from '@mui/material/Alert'
import { Link } from 'react-router-dom'

export function VerifyEmailSentPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm text-center">
        <Alert severity="info">
          Check your email for a verification link.
        </Alert>
        <Link to="/login" className="mt-4 inline-block">
          Go to Login
        </Link>
      </div>
    </div>
  )
}
