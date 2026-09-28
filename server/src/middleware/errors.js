import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

// Wrap async route handlers so thrown errors reach errorHandler
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source])
    if (!result.success) {
      return next(new HttpError(400, 'Validation failed', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))))
    }
    req.valid = result.data
    next()
  }
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.issues })
  }
  if (err.name === 'CastError') return res.status(404).json({ error: 'Not found' })
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation failed', details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })) })
  }
  if (err.code === 11000) return res.status(409).json({ error: 'Duplicate value', details: err.keyValue })
  const status = err.status || 500
  // HttpErrors are deliberate and safe to show; unexpected errors are logged and hidden
  const expose = err instanceof HttpError
  if (!expose) console.error(err)
  res.status(status).json({ error: expose ? err.message : 'Something went wrong', ...(err.details ? { details: err.details } : {}) })
}
