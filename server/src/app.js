import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import authRoutes from './routes/auth.routes.js'
import assetRoutes from './routes/asset.routes.js'
import opsRoutes from './routes/ops.routes.js'
import topologyRoutes from './routes/topology.routes.js'
import aiRoutes from './routes/ai.routes.js'
import { errorHandler } from './middleware/errors.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'img-src': ["'self'", 'data:', 'https://server.arcgisonline.com'],
        },
      },
    }),
  )
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }))
  app.use('/api', authRoutes)
  app.use('/api', assetRoutes)
  app.use('/api', opsRoutes)
  app.use('/api', topologyRoutes)
  app.use('/api', aiRoutes)
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

  // In production Express also serves the built React app (one URL, same-origin cookies)
  const dist = path.resolve(__dirname, '../../client/dist')
  if (fs.existsSync(dist)) {
    app.use(express.static(dist))
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
  }

  app.use(errorHandler)
  return app
}
