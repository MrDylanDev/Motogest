import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import { authApi } from '../api/authApi'

type Status = 'loading' | 'success' | 'error'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>(token ? 'loading' : 'error')
  const [errorMessage, setErrorMessage] = useState(
    token ? '' : 'No verification token provided.',
  )

  useEffect(() => {
    if (!token) return
    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err: Error) => {
        setErrorMessage(err.message)
        setStatus('error')
      })
  }, [token])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm text-center">
        {status === 'loading' && (
          <>
            <CircularProgress />
            <p>Verifying your email...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <Alert severity="success">Email verified successfully!</Alert>
            <Link to="/login" className="mt-4 inline-block">
              Go to Login
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <Alert severity="error">{errorMessage}</Alert>
            <Link to="/login" className="mt-4 inline-block">
              Go to Login
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
