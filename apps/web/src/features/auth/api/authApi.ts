import axios from 'axios'

import type {
  AuthUser,
  LoginCredentials,
  LoginResponse,
  MessageResponse,
  SignupPayload,
} from '../slices/authSlice'

/**
 * Base URL for the API. Resolved from VITE_API_URL at build time, with a
 * sensible local-dev fallback so tests and `pnpm dev` work without extra
 * configuration.
 *
 * The shared axios instance + interceptors (Bearer header, refresh-on-401
 * retry) arrive with task 4.5/4.6. Until then, authApi sets the auth header
 * inline on the /auth/me call after login.
 */
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const authApi = {
  /**
   * Logs the user in by composing /auth/login + /auth/me:
   *  1. POST /auth/login with credentials (sends/receives the httpOnly
   *     refresh-token cookie via withCredentials).
   *  2. GET /auth/me using the freshly-issued accessToken to fetch the
   *     authenticated user identity.
   *
   * Errors from either request bubble up as axios errors so the slice's
   * extractErrorMessage helper can surface server-provided messages.
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const { data: tokenResponse } = await axios.post<{ accessToken: string }>(
      `${API_URL}/auth/login`,
      credentials,
      { withCredentials: true },
    )

    const { data: user } = await axios.get<AuthUser>(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
    })

    return { accessToken: tokenResponse.accessToken, user }
  },

  async signup(payload: SignupPayload): Promise<MessageResponse> {
    const { data } = await axios.post<MessageResponse>(
      `${API_URL}/auth/signup`,
      payload,
    )
    return data
  },

  /**
   * Backend returns 200 with no body on success; we synthesize a stable
   * message so the slice and UI can branch on a known string.
   */
  async verifyEmail(token: string): Promise<MessageResponse> {
    await axios.get(`${API_URL}/auth/verify-email`, { params: { token } })
    return { message: 'email_verified' }
  },
}
