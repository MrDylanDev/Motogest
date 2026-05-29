import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { VerifyEmailPage } from './VerifyEmailPage'
import { authApi } from '../api/authApi'

vi.mock('../api/authApi', () => ({
  authApi: { verifyEmail: vi.fn() },
}))

const mockedVerifyEmail = vi.mocked(authApi.verifyEmail)

describe('VerifyEmailPage', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('shows loading state and calls verifyEmail when token is present', async () => {
    mockedVerifyEmail.mockReturnValue(new Promise(() => {})) // never resolves

    renderWithProviders(<VerifyEmailPage />, {
      initialEntries: ['/verify-email?token=abc123'],
    })

    expect(screen.getByText('Verifying your email...')).toBeInTheDocument()
    expect(mockedVerifyEmail).toHaveBeenCalledWith('abc123')
  })

  it('shows success message and login link on successful verification', async () => {
    mockedVerifyEmail.mockResolvedValue({ message: 'email_verified' })

    renderWithProviders(<VerifyEmailPage />, {
      initialEntries: ['/verify-email?token=valid-token'],
    })

    await waitFor(() => {
      expect(screen.getByText('Email verified successfully!')).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /go to login/i })).toHaveAttribute('href', '/login')
  })

  it('shows error state without calling API when token is missing', () => {
    renderWithProviders(<VerifyEmailPage />, {
      initialEntries: ['/verify-email'],
    })

    expect(screen.getByText('No verification token provided.')).toBeInTheDocument()
    expect(mockedVerifyEmail).not.toHaveBeenCalled()
  })

  it('shows error message from API on rejection', async () => {
    mockedVerifyEmail.mockRejectedValue(new Error('token_expired'))

    renderWithProviders(<VerifyEmailPage />, {
      initialEntries: ['/verify-email?token=bad-token'],
    })

    await waitFor(() => {
      expect(screen.getByText('token_expired')).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /go to login/i })).toHaveAttribute('href', '/login')
  })
})
