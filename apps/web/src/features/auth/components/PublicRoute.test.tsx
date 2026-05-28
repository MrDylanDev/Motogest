import { screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { PublicRoute } from './PublicRoute'
import { describe, it, expect } from 'vitest'

function renderWithPublicRoute(preloadedState = {}) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <div>LOGIN CONTENT</div>
          </PublicRoute>
        }
      />
      <Route path="/" element={<div>HOME</div>} />
    </Routes>,
    { initialEntries: ['/login'], preloadedState },
  )
}

describe('PublicRoute', () => {
  it('renders children when user is unauthenticated', () => {
    renderWithPublicRoute({ auth: { user: null, accessToken: null, status: 'idle', error: null } })

    expect(screen.getByText('LOGIN CONTENT')).toBeInTheDocument()
    expect(screen.queryByText('HOME')).not.toBeInTheDocument()
  })

  it('redirects to / when user is authenticated', () => {
    renderWithPublicRoute({
      auth: {
        user: { id: '1', email: 'a@b.com', fullName: 'A', role: 'admin', tenantId: 't1' },
        accessToken: 'tok-123',
        status: 'succeeded',
        error: null,
      },
    })

    expect(screen.getByText('HOME')).toBeInTheDocument()
    expect(screen.queryByText('LOGIN CONTENT')).not.toBeInTheDocument()
  })
})
