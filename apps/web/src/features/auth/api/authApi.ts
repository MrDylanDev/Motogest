import { httpClient } from '../../../lib/http/axios'

import type {
  AuthUser,
  LoginCredentials,
  LoginResponse,
  MessageResponse,
  SignupPayload,
} from '../slices/authSlice'

/**
 * Auth feature API. All calls go through the shared {@link httpClient}, which
 * is responsible for:
 *   - injecting `Authorization: Bearer <token>` from the Redux store
 *   - rotating the access token on 401 via /auth/refresh and retrying
 *   - dispatching logout when refresh fails
 *
 * authApi only knows about *what* to call and *how to compose* the auth flow.
 * It never reads the store directly and never sets headers manually except
 * for the post-login /auth/me composition (the store hasn't caught up yet
 * with the freshly issued token; the request interceptor respects the
 * explicit override).
 */
export const authApi = {
  /**
   * Logs the user in by composing /auth/login + /auth/me:
   *  1. POST /auth/login with credentials. Backend issues an access token in
   *     the JSON body and the refresh cookie via Set-Cookie (httpOnly).
   *  2. GET /auth/me using the freshly-issued accessToken. The interceptor
   *     respects the explicit Authorization header, so no race with the store.
   *
   * Errors from either request bubble up as axios errors so the slice's
   * extractErrorMessage helper can surface server-provided messages.
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const { data: tokenResponse } = await httpClient.post<{ accessToken: string }>(
      '/auth/login',
      credentials,
    )

    const { data: user } = await httpClient.get<AuthUser>('/auth/me', {
      headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
    })

    return { accessToken: tokenResponse.accessToken, user }
  },

  async signup(payload: SignupPayload): Promise<MessageResponse> {
    const { data } = await httpClient.post<MessageResponse>('/auth/signup', payload)
    return data
  },

  /**
   * Backend returns 200 with no body on success; we synthesize a stable
   * message so the slice and UI can branch on a known string.
   */
  async verifyEmail(token: string): Promise<MessageResponse> {
    await httpClient.get('/auth/verify-email', { params: { token } })
    return { message: 'email_verified' }
  },
}
