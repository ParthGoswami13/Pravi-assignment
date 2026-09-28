import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { User } from '../models/index.js'
import { auth, requireRole, signToken, cookieOptions, COOKIE_NAME } from '../middleware/auth.js'
import { ah, validate, HttpError } from '../middleware/errors.js'
import { loginSchema } from '../validators/schemas.js'

const router = Router()
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts, try again later' } })

router.post('/auth/login', loginLimiter, validate(loginSchema), ah(async (req, res) => {
  const { email, password } = req.valid
  const user = await User.findOne({ email: email.toLowerCase() })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Email or password is incorrect')
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions())
  res.json({ user })
}))

router.post('/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined })
  res.status(204).end()
})

router.get('/auth/me', auth, (req, res) => res.json({ user: req.user }))

router.get('/users', auth, requireRole('ADMIN', 'ENGINEER'), ah(async (_req, res) => {
  const users = await User.find({ role: { $in: ['ADMIN', 'ENGINEER'] } }).select('name role designation').sort('name')
  res.json({ items: users })
}))

export default router
