import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { authApi } from '../api/authApi'

export interface AuthUser {
  id: string
  email: string
  fullName: string
  role: string
  tenantId: string
}

export type AuthStatus = 'idle' | 'loading' | 'succeeded' | 'failed'

export interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  status: AuthStatus
  error: string | null
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}

export interface SignupPayload {
  email: string
  password: string
  fullName: string
  tenantName: string
  tenantSlug: string
}

export interface MessageResponse {
  message: string
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  status: 'idle',
  error: null,
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { message?: string; error?: string } } }).response
    return response?.data?.message ?? response?.data?.error ?? fallback
  }
  if (err instanceof Error) return err.message
  return fallback
}

export const login = createAsyncThunk<
  LoginResponse,
  LoginCredentials,
  { rejectValue: string }
>('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    return await authApi.login(credentials)
  } catch (err) {
    return rejectWithValue(extractErrorMessage(err, 'Login failed'))
  }
})

export const signup = createAsyncThunk<
  MessageResponse,
  SignupPayload,
  { rejectValue: string }
>('auth/signup', async (payload, { rejectWithValue }) => {
  try {
    return await authApi.signup(payload)
  } catch (err) {
    return rejectWithValue(extractErrorMessage(err, 'Signup failed'))
  }
})

export const verifyEmail = createAsyncThunk<
  MessageResponse,
  string,
  { rejectValue: string }
>('auth/verifyEmail', async (token, { rejectWithValue }) => {
  try {
    return await authApi.verifyEmail(token)
  } catch (err) {
    return rejectWithValue(extractErrorMessage(err, 'Verification failed'))
  }
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(login.fulfilled, (state, action: PayloadAction<LoginResponse>) => {
        state.status = 'succeeded'
        state.error = null
        state.user = action.payload.user
        state.accessToken = action.payload.accessToken
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload ?? action.error.message ?? 'Login failed'
        state.user = null
        state.accessToken = null
      })
      .addCase(signup.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(signup.fulfilled, (state) => {
        state.status = 'succeeded'
        state.error = null
      })
      .addCase(signup.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload ?? action.error.message ?? 'Signup failed'
      })
      .addCase(verifyEmail.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(verifyEmail.fulfilled, (state) => {
        state.status = 'succeeded'
        state.error = null
      })
      .addCase(verifyEmail.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload ?? action.error.message ?? 'Verification failed'
      })
  },
})

export const { logout } = authSlice.actions
export default authSlice.reducer
