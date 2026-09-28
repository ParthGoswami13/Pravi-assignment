import jwt from 'jsonwebtoken'
import { User } from '../models/index.js'
import { HttpError } from './errors.js'

export const COOKIE_NAME = 'pravi_token'

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' })
}

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 8 * 60 * 60 * 1000,
})

export async function auth(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME]
    if (!token) throw new HttpError(401, 'Please log in')
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(payload.sub)
    if (!user) throw new HttpError(401, 'Please log in')
    req.user = user
    next()
  } catch (e) {
    next(e instanceof HttpError ? e : new HttpError(401, 'Session expired, please log in again'))
  }
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user?.role)) return next(new HttpError(403, 'You do not have permission to do this'))
  next()
}
