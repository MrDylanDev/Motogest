import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Auto-mock axios so we can drive every HTTP boundary from the test.
vi.mock('axios')

import { authApi } from './authApi'
import type {
  AuthUser,
  LoginCredentials,
  SignupPayload,
} from '../slices/authSlice'

// Vitest's auto-mock turns axios.post / axios.get into vi.fn() instances.
const mockedPost = axios.post as unknown as ReturnType<typeof vi.fn>
const mockedGet = axios.get as unknown as ReturnType<typeof vi.fn>

const sampleUser: AuthUser = {
  id: 'user-1',
  email: 'admin@taller.test',
  fullName: 'Admin User',
  role: 'cliente',
  tenantId: 'tenant-1',
}

const credentials: LoginCredentials = {
  email: sampleUser.email,
  password: 's3cret',
}

/**
 * Build an axios-shaped error so authApi consumers (the slice's
 * extractErrorMessage helper) can read err.response.data.message.
 */
function buildAxiosError(status: number, message: string): Error {
  return Object.assign(
    new Error(`Request failed with status code ${status}`),
    { response: { status, data: { message } } },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('authApi.login', () => {
  it('posts credentials to /auth/login then GETs /auth/me with the bearer token, returning combined payload', async () => {
    mockedPost.mockResolvedValueOnce({ data: { accessToken: 'jwt-token' } })
    mockedGet.mockResolvedValueOnce({ data: sampleUser })

    const result = await authApi.login(credentials)

    expect(result).toEqual({ accessToken: 'jwt-token', user: sampleUser })

    expect(mockedPost).toHaveBeenCalledTimes(1)
    expect(mockedPost).toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      credentials,
      expect.objectContaining({ withCredentials: true }),
    )

    expect(mockedGet).toHaveBeenCalledTimes(1)
    expect(mockedGet).toHaveBeenCalledWith(
      expect.stringContaining('/auth/me'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer jwt-token' },
      }),
    )
  })

  it('propagates the error and skips /auth/me when /auth/login rejects with 401', async () => {
    mockedPost.mockRejectedValueOnce(buildAxiosError(401, 'INVALID_CREDENTIALS'))

    await expect(authApi.login(credentials)).rejects.toMatchObject({
      response: { status: 401, data: { message: 'INVALID_CREDENTIALS' } },
    })

    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('propagates the error from /auth/me when login succeeded but identity fetch fails', async () => {
    mockedPost.mockResolvedValueOnce({ data: { accessToken: 'jwt-token' } })
    mockedGet.mockRejectedValueOnce(buildAxiosError(404, 'USER_NOT_FOUND'))

    await expect(authApi.login(credentials)).rejects.toMatchObject({
      response: { status: 404, data: { message: 'USER_NOT_FOUND' } },
    })

    expect(mockedPost).toHaveBeenCalledTimes(1)
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })
})

describe('authApi.signup', () => {
  const payload: SignupPayload = {
    email: 'new@taller.test',
    password: 's3cret123',
    fullName: 'New User',
    tenantName: 'New Workshop',
    tenantSlug: 'new-workshop',
  }

  it('posts payload to /auth/signup and returns the server message', async () => {
    mockedPost.mockResolvedValueOnce({ data: { message: 'verify_email_sent' } })

    const result = await authApi.signup(payload)

    expect(result).toEqual({ message: 'verify_email_sent' })
    expect(mockedPost).toHaveBeenCalledTimes(1)
    expect(mockedPost).toHaveBeenCalledWith(
      expect.stringContaining('/auth/signup'),
      payload,
    )
  })

  it('propagates 409 conflict so the slice can surface EMAIL_ALREADY_EXISTS', async () => {
    mockedPost.mockRejectedValueOnce(buildAxiosError(409, 'EMAIL_ALREADY_EXISTS'))

    await expect(authApi.signup(payload)).rejects.toMatchObject({
      response: { status: 409, data: { message: 'EMAIL_ALREADY_EXISTS' } },
    })
  })
})

describe('authApi.verifyEmail', () => {
  const token = 'verification-token-uuid'

  it('GETs /auth/verify-email with the token as a query param and returns email_verified message', async () => {
    // Backend returns 200 with no body — authApi synthesizes the message
    // so the slice can show a consistent "email_verified" UX.
    mockedGet.mockResolvedValueOnce({ data: undefined })

    const result = await authApi.verifyEmail(token)

    expect(result).toEqual({ message: 'email_verified' })
    expect(mockedGet).toHaveBeenCalledTimes(1)
    expect(mockedGet).toHaveBeenCalledWith(
      expect.stringContaining('/auth/verify-email'),
      expect.objectContaining({ params: { token } }),
    )
  })

  it('propagates 410 expired-token error so the slice can map it to TOKEN_EXPIRED', async () => {
    mockedGet.mockRejectedValueOnce(buildAxiosError(410, 'TOKEN_EXPIRED'))

    await expect(authApi.verifyEmail(token)).rejects.toMatchObject({
      response: { status: 410, data: { message: 'TOKEN_EXPIRED' } },
    })
  })
})
