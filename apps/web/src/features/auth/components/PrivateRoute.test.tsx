import { screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { PrivateRoute } from './PrivateRoute'
import { describe, it, expect } from 'vitest'

function renderWithPrivateRoute(preloadedState = {}) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <div>DASHBOARD</div>
          </PrivateRoute>
        }
      />
      <Route path="/login" element={<div>LOGIN</div>} />
    </Routes>,
    { initialEntries: ['/dashboard'], preloadedState },
  )
}

describe('PrivateRoute', () => {
  it('renders children when user is authenticated', () => {
    renderWithPrivateRoute({
      auth: {
        user: { id: '1', email: 'a@b.com', fullName: 'A', role: 'admin', tenantId: 't1' },
        accessToken: 'tok-123',
        status: 'succeeded',
        error: null,
      },
    })

    expect(screen.getByText('DASHBOARD')).toBeInTheDocument()
    expect(screen.queryByText('LOGIN')).not.toBeInTheDocument()
  })

  it('redirects to /login when user is unauthenticated', () => {
    renderWithPrivateRoute({ auth: { user: null, accessToken: null, status: 'idle', error: null } })

    expect(screen.getByText('LOGIN')).toBeInTheDocument()
    expect(screen.queryByText('DASHBOARD')).not.toBeInTheDocument()
  })
})
