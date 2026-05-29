import { screen } from '@testing-library/react'
import { renderWithProviders } from './test/renderWithProviders'
import App from './App'

describe('App routing', () => {
  it('redirects unauthenticated user from / to /login', () => {
    renderWithProviders(<App />, { initialEntries: ['/'] })
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('renders verify-email-sent page at /verify-email-sent', () => {
    renderWithProviders(<App />, { initialEntries: ['/verify-email-sent'] })
    expect(screen.getByText(/check your email/i)).toBeInTheDocument()
  })
})
