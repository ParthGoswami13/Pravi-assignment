import 'dotenv/config'
import mongoose from 'mongoose'
import { createApp } from './app.js'

if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
  console.error('Missing MONGO_URI or JWT_SECRET in environment')
  process.exit(1)
}

mongoose.set('strictQuery', true)
await mongoose.connect(process.env.MONGO_URI)
console.log('MongoDB connected')

const port = process.env.PORT || 5000
createApp().listen(port, () => console.log(`PRAVI API listening on http://localhost:${port}`))
