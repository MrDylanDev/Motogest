import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { LoginPage } from './LoginPage'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock the authApi module so we can control login behavior
vi.mock('../api/authApi', () => ({
  authApi: {
    login: vi.fn(),
    signup: vi.fn(),
    verifyEmail: vi.fn(),
  },
}))

import { authApi } from '../api/authApi'

const mockedLogin = vi.mocked(authApi.login)

function renderLoginPage(preloadedState = {}) {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<div>HOME</div>} />
    </Routes>,
    { initialEntries: ['/login'], preloadedState },
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders email field, password field, submit button, and accessible heading', () => {
    renderLoginPage()

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows validation error for invalid email and does NOT dispatch login', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText(/email/i), 'not-an-email')
    await user.type(screen.getByLabelText(/password/i), 'validpass123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument()
    })
    expect(mockedLogin).not.toHaveBeenCalled()
  })

  it('shows validation error for empty password and does NOT dispatch login', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/password is required/i)).toBeInTheDocument()
    })
    expect(mockedLogin).not.toHaveBeenCalled()
  })

  it('dispatches login thunk with correct credentials on valid submit', async () => {
    const user = userEvent.setup()
    mockedLogin.mockResolvedValue({
      accessToken: 'tok-123',
      user: { id: '1', email: 'test@example.com', fullName: 'Test', role: 'admin', tenantId: 't1' },
    })

    renderLoginPage()

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockedLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'secret123',
      })
    })
  })

  it('disables submit button and shows loading indicator while pending', async () => {
    const user = userEvent.setup()
    // Never resolve — keeps the thunk in pending state
    mockedLogin.mockReturnValue(new Promise(() => {}))

    renderLoginPage()

    await user.type(screen.getByLabelText(/email/i), 'test@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled()
    })
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows error alert when login is rejected', () => {
    renderLoginPage({
      auth: { user: null, accessToken: null, status: 'failed', error: 'INVALID_CREDENTIALS' },
    })

    expect(screen.getByRole('alert')).toHaveTextContent('INVALID_CREDENTIALS')
  })

  it('navigates to / on successful login', async () => {
    const user = userEvent.setup()
    mockedLogin.mockResolvedValue({
      accessToken: 'tok-abc',
      user: { id: '2', email: 'a@b.com', fullName: 'A B', role: 'user', tenantId: 't2' },
    })

    renderLoginPage()

    await user.type(screen.getByLabelText(/email/i), 'a@b.com')
    await user.type(screen.getByLabelText(/password/i), 'pass123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('HOME')).toBeInTheDocument()
    })
  })
})
