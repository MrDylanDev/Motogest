import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { SignupPage } from './SignupPage'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../api/authApi', () => ({
  authApi: {
    login: vi.fn(),
    signup: vi.fn(),
    verifyEmail: vi.fn(),
  },
}))

import { authApi } from '../api/authApi'

const mockedSignup = vi.mocked(authApi.signup)

function renderSignupPage(preloadedState = {}) {
  return renderWithProviders(
    <Routes>
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify-email-sent" element={<div>VERIFY_SENT</div>} />
    </Routes>,
    { initialEntries: ['/signup'], preloadedState },
  )
}

const validForm = {
  email: 'test@example.com',
  password: 'secret1234',
  fullName: 'John Doe',
  tenantName: 'My Workshop',
  tenantSlug: 'my-workshop',
}

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all 5 fields, submit button, and accessible heading', () => {
    renderSignupPage()

    expect(screen.getByRole('heading', { name: /sign up/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/workshop name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/workshop slug/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument()
  })

  it('shows validation error for invalid email and does NOT dispatch signup', async () => {
    const user = userEvent.setup()
    renderSignupPage()

    await user.type(screen.getByLabelText(/email/i), 'not-an-email')
    await user.type(screen.getByLabelText(/password/i), validForm.password)
    await user.type(screen.getByLabelText(/full name/i), validForm.fullName)
    await user.type(screen.getByLabelText(/workshop name/i), validForm.tenantName)
    await user.type(screen.getByLabelText(/workshop slug/i), validForm.tenantSlug)
    await user.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument()
    })
    expect(mockedSignup).not.toHaveBeenCalled()
  })

  it('shows validation error for password under 8 characters', async () => {
    const user = userEvent.setup()
    renderSignupPage()

    await user.type(screen.getByLabelText(/email/i), validForm.email)
    await user.type(screen.getByLabelText(/password/i), 'short')
    await user.type(screen.getByLabelText(/full name/i), validForm.fullName)
    await user.type(screen.getByLabelText(/workshop name/i), validForm.tenantName)
    await user.type(screen.getByLabelText(/workshop slug/i), validForm.tenantSlug)
    await user.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument()
    })
    expect(mockedSignup).not.toHaveBeenCalled()
  })

  it('shows validation error for empty full name', async () => {
    const user = userEvent.setup()
    renderSignupPage()

    await user.type(screen.getByLabelText(/email/i), validForm.email)
    await user.type(screen.getByLabelText(/password/i), validForm.password)
    await user.type(screen.getByLabelText(/workshop name/i), validForm.tenantName)
    await user.type(screen.getByLabelText(/workshop slug/i), validForm.tenantSlug)
    await user.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(screen.getByText(/full name is required/i)).toBeInTheDocument()
    })
    expect(mockedSignup).not.toHaveBeenCalled()
  })

  it('shows validation error for empty workshop name', async () => {
    const user = userEvent.setup()
    renderSignupPage()

    await user.type(screen.getByLabelText(/email/i), validForm.email)
    await user.type(screen.getByLabelText(/password/i), validForm.password)
    await user.type(screen.getByLabelText(/full name/i), validForm.fullName)
    await user.type(screen.getByLabelText(/workshop slug/i), validForm.tenantSlug)
    await user.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(screen.getByText(/workshop name is required/i)).toBeInTheDocument()
    })
    expect(mockedSignup).not.toHaveBeenCalled()
  })

  it('shows validation error for invalid tenant slug', async () => {
    const user = userEvent.setup()
    renderSignupPage()

    await user.type(screen.getByLabelText(/email/i), validForm.email)
    await user.type(screen.getByLabelText(/password/i), validForm.password)
    await user.type(screen.getByLabelText(/full name/i), validForm.fullName)
    await user.type(screen.getByLabelText(/workshop name/i), validForm.tenantName)
    await user.type(screen.getByLabelText(/workshop slug/i), 'Invalid Slug!')
    await user.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(screen.getByText(/use only lowercase letters, numbers, and hyphens/i)).toBeInTheDocument()
    })
    expect(mockedSignup).not.toHaveBeenCalled()
  })

  it('dispatches signup thunk with correct payload on valid submit', async () => {
    const user = userEvent.setup()
    mockedSignup.mockResolvedValue({ message: 'Check your email' })

    renderSignupPage()

    await user.type(screen.getByLabelText(/email/i), validForm.email)
    await user.type(screen.getByLabelText(/password/i), validForm.password)
    await user.type(screen.getByLabelText(/full name/i), validForm.fullName)
    await user.type(screen.getByLabelText(/workshop name/i), validForm.tenantName)
    await user.type(screen.getByLabelText(/workshop slug/i), validForm.tenantSlug)
    await user.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(mockedSignup).toHaveBeenCalledWith(validForm)
    })
  })

  it('disables submit button and shows spinner while loading', async () => {
    const user = userEvent.setup()
    mockedSignup.mockReturnValue(new Promise(() => {}))

    renderSignupPage()

    await user.type(screen.getByLabelText(/email/i), validForm.email)
    await user.type(screen.getByLabelText(/password/i), validForm.password)
    await user.type(screen.getByLabelText(/full name/i), validForm.fullName)
    await user.type(screen.getByLabelText(/workshop name/i), validForm.tenantName)
    await user.type(screen.getByLabelText(/workshop slug/i), validForm.tenantSlug)
    await user.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign up/i })).toBeDisabled()
    })
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows error alert when signup is rejected', () => {
    renderSignupPage({
      auth: { user: null, accessToken: null, status: 'failed', error: 'EMAIL_ALREADY_EXISTS' },
    })

    expect(screen.getByRole('alert')).toHaveTextContent('EMAIL_ALREADY_EXISTS')
  })

  it('navigates to /verify-email-sent on successful signup', async () => {
    const user = userEvent.setup()
    mockedSignup.mockResolvedValue({ message: 'Check your email' })

    renderSignupPage()

    await user.type(screen.getByLabelText(/email/i), validForm.email)
    await user.type(screen.getByLabelText(/password/i), validForm.password)
    await user.type(screen.getByLabelText(/full name/i), validForm.fullName)
    await user.type(screen.getByLabelText(/workshop name/i), validForm.tenantName)
    await user.type(screen.getByLabelText(/workshop slug/i), validForm.tenantSlug)
    await user.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(screen.getByText('VERIFY_SENT')).toBeInTheDocument()
    })
  })
})
