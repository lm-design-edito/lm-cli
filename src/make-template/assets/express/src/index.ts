import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import logger from 'morgan'
import { serve } from './www'

// App setup
const app = express()
app.use(cors()) // [WIP] configure cors and allowed origins
app.use(logger('dev')) // [WIP] configure logger for prod an all
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())

// Static files
const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(ROOT, 'public')
app.use(express.static(PUBLIC))

// Routes
app.get('/', (req, res) => res.send({ data: true }))

// Start server
serve(app)
