import { configureStore } from '@reduxjs/toolkit'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the authApi module so the slice can be imported without a real
// implementation. Tests of the slice itself dispatch plain async-thunk
// actions (.pending/.fulfilled/.rejected) and never invoke authApi.
vi.mock('../api/authApi', () => ({
  authApi: {
    login: vi.fn(),
    signup: vi.fn(),
    verifyEmail: vi.fn(),
  },
}))

import authReducer, {
  login,
  signup,
  verifyEmail,
  logout,
  type AuthState,
  type AuthUser,
} from './authSlice'

const initialState: AuthState = {
  user: null,
  accessToken: null,
  status: 'idle',
  error: null,
}

const sampleUser: AuthUser = {
  id: 'user-1',
  email: 'admin@taller.test',
  fullName: 'Admin User',
  role: 'cliente',
  tenantId: 'tenant-1',
}

const buildStore = () =>
  configureStore({ reducer: { auth: authReducer } })

describe('authSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('exposes the default auth shape', () => {
      const store = buildStore()
      expect(store.getState().auth).toEqual(initialState)
    })
  })

  describe('login thunk', () => {
    it('marks status as loading on pending and clears previous error', () => {
      const previous: AuthState = { ...initialState, error: 'old error' }
      const next = authReducer(previous, login.pending('req-1', { email: '', password: '' }))
      expect(next.status).toBe('loading')
      expect(next.error).toBeNull()
    })

    it('stores user and accessToken on fulfilled', () => {
      const action = login.fulfilled(
        { accessToken: 'jwt-token', user: sampleUser },
        'req-2',
        { email: sampleUser.email, password: 'secret' },
      )
      const next = authReducer(initialState, action)
      expect(next.status).toBe('succeeded')
      expect(next.error).toBeNull()
      expect(next.accessToken).toBe('jwt-token')
      expect(next.user).toEqual(sampleUser)
    })

    it('records error message on rejected and clears credentials', () => {
      const seeded: AuthState = {
        ...initialState,
        accessToken: 'old-token',
        user: sampleUser,
      }
      const action = login.rejected(
        new Error('Invalid credentials'),
        'req-3',
        { email: sampleUser.email, password: 'wrong' },
        'Invalid credentials',
      )
      const next = authReducer(seeded, action)
      expect(next.status).toBe('failed')
      expect(next.error).toBe('Invalid credentials')
      expect(next.user).toBeNull()
      expect(next.accessToken).toBeNull()
    })
  })

  describe('signup thunk', () => {
    const payload = {
      email: 'new@taller.test',
      password: 'secret123',
      fullName: 'New User',
      tenantName: 'New Workshop',
      tenantSlug: 'new-workshop',
    }

    it('marks status as loading on pending', () => {
      const next = authReducer(initialState, signup.pending('req-4', payload))
      expect(next.status).toBe('loading')
      expect(next.error).toBeNull()
    })

    it('marks status as succeeded on fulfilled without storing tokens', () => {
      const action = signup.fulfilled(
        { message: 'verify_email_sent' },
        'req-5',
        payload,
      )
      const next = authReducer(initialState, action)
      expect(next.status).toBe('succeeded')
      expect(next.user).toBeNull()
      expect(next.accessToken).toBeNull()
      expect(next.error).toBeNull()
    })

    it('records error message on rejected', () => {
      const action = signup.rejected(
        new Error('EMAIL_ALREADY_EXISTS'),
        'req-6',
        payload,
        'EMAIL_ALREADY_EXISTS',
      )
      const next = authReducer(initialState, action)
      expect(next.status).toBe('failed')
      expect(next.error).toBe('EMAIL_ALREADY_EXISTS')
    })
  })

  describe('verifyEmail thunk', () => {
    const token = 'verification-token-uuid'

    it('marks status as loading on pending', () => {
      const next = authReducer(initialState, verifyEmail.pending('req-7', token))
      expect(next.status).toBe('loading')
      expect(next.error).toBeNull()
    })

    it('marks status as succeeded on fulfilled', () => {
      const action = verifyEmail.fulfilled(
        { message: 'email_verified' },
        'req-8',
        token,
      )
      const next = authReducer(initialState, action)
      expect(next.status).toBe('succeeded')
      expect(next.error).toBeNull()
    })

    it('records error message on rejected', () => {
      const action = verifyEmail.rejected(
        new Error('TOKEN_EXPIRED'),
        'req-9',
        token,
        'TOKEN_EXPIRED',
      )
      const next = authReducer(initialState, action)
      expect(next.status).toBe('failed')
      expect(next.error).toBe('TOKEN_EXPIRED')
    })
  })

  describe('logout', () => {
    it('resets state back to the initial shape', () => {
      const seeded: AuthState = {
        user: sampleUser,
        accessToken: 'jwt-token',
        status: 'succeeded',
        error: null,
      }
      const next = authReducer(seeded, logout())
      expect(next).toEqual(initialState)
    })
  })
})
