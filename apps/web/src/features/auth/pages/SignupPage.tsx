import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import { useAppDispatch, useAppSelector } from '../../../store/hooks'
import { signup } from '../slices/authSlice'

const signupSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Full name is required').max(200),
  tenantName: z.string().min(1, 'Workshop name is required').max(200),
  tenantSlug: z
    .string()
    .min(1, 'Workshop slug is required')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Use only lowercase letters, numbers, and hyphens'),
})

type SignupFormValues = z.infer<typeof signupSchema>

export function SignupPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { status, error } = useAppSelector((s) => s.auth)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) })

  const isLoading = status === 'loading'

  const onSubmit = async (data: SignupFormValues) => {
    const result = await dispatch(signup(data))
    if (signup.fulfilled.match(result)) {
      navigate('/verify-email-sent')
    }
  }

  return (
    <Box className="flex min-h-screen items-center justify-center">
      <Box className="w-full max-w-sm space-y-6 p-6">
        <Typography variant="h4" component="h1" align="center">
          Sign Up
        </Typography>

        {error && <Alert severity="error">{error}</Alert>}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <TextField
            label="Email"
            type="email"
            fullWidth
            {...register('email')}
            error={!!errors.email}
            helperText={errors.email?.message}
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            {...register('password')}
            error={!!errors.password}
            helperText={errors.password?.message}
          />
          <TextField
            label="Full Name"
            fullWidth
            {...register('fullName')}
            error={!!errors.fullName}
            helperText={errors.fullName?.message}
          />
          <TextField
            label="Workshop Name"
            fullWidth
            {...register('tenantName')}
            error={!!errors.tenantName}
            helperText={errors.tenantName?.message}
          />
          <TextField
            label="Workshop Slug"
            fullWidth
            {...register('tenantSlug')}
            error={!!errors.tenantSlug}
            helperText={errors.tenantSlug?.message}
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={isLoading}
          >
            {isLoading && <CircularProgress size={24} role="progressbar" className="mr-2" />}
            Sign Up
          </Button>
        </form>
      </Box>
    </Box>
  )
}
