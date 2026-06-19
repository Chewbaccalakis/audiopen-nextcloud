import 'dotenv/config'
import express from 'express'
import axios from 'axios'
import { readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()

app.use(express.urlencoded({ extended: false }))
app.use(express.json())
app.use(express.text({ type: '*/*' }))
app.use(express.static(path.join(__dirname, 'public')))

const PORT = process.env.PORT || 3000
const USERS_FILE = process.env.USERS_FILE || 'users.json'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

if (!ADMIN_PASSWORD) {
  console.warn('Warning: ADMIN_PASSWORD is not set. New user registration is disabled.')
}

let users = {}
try {
  users = JSON.parse(readFileSync(USERS_FILE, 'utf8'))
  console.log(`Loaded ${Object.keys(users).length} user(s) from ${USERS_FILE}`)
} catch (err) {
  if (err.code === 'ENOENT') {
    console.log(`${USERS_FILE} not found, starting with empty user list`)
  } else {
    console.error(`Failed to load ${USERS_FILE}: ${err.message}`)
    process.exit(1)
  }
}

function saveUsers() {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
}

// --- Setup API ---

app.post('/api/users', (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Registration is disabled: ADMIN_PASSWORD is not configured.' })
  }
  if (req.body.adminPassword !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Invalid admin password.' })
  }

  const { nextcloudUrl, username, password, folder } = req.body
  if (!nextcloudUrl || !username || !password) {
    return res.status(400).json({ error: 'nextcloudUrl, username, and password are required.' })
  }

  const token = randomUUID()
  users[token] = {
    nextcloudUrl: nextcloudUrl.replace(/\/$/, ''),
    username,
    password,
    folder: folder || 'AudioPen'
  }
  saveUsers()

  const webhookUrl = `${req.protocol}://${req.get('host')}/webhook/${token}`
  console.log(`New user registered: ${username}`)
  res.json({ token, webhookUrl })
})

app.get('/api/users/:token', (req, res) => {
  const user = users[req.params.token]
  if (!user) return res.status(404).json({ error: 'Not found.' })
  res.json(user)
})

app.put('/api/users/:token', (req, res) => {
  if (!users[req.params.token]) return res.status(404).json({ error: 'Not found.' })

  const { nextcloudUrl, username, password, folder } = req.body
  if (!nextcloudUrl || !username || !password) {
    return res.status(400).json({ error: 'nextcloudUrl, username, and password are required.' })
  }

  users[req.params.token] = {
    nextcloudUrl: nextcloudUrl.replace(/\/$/, ''),
    username,
    password,
    folder: folder || 'AudioPen'
  }
  saveUsers()

  console.log(`User updated: ${username}`)
  res.json({ success: true })
})

// --- Webhook ---

app.post('/webhook/:token', async (req, res) => {
  const user = users[req.params.token]
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  try {
    console.log(`Received webhook for user: ${user.username}`)

    console.log('HEADERS:', req.headers)
    console.log('RAW BODY:', req.body)

    let data = req.body

    // If body comes in as raw string (VERY likely here)
    if (typeof data === 'string') {
      try {
        const params = new URLSearchParams(data)
        data = Object.fromEntries(params.entries())
      } catch (e) {
        console.log('Failed to parse raw body')
      }
    }

    console.log('PARSED DATA:', data)

    const title = data.title || 'Untitled Note'
    const body = data.body || ''
    const transcript = data.orig_transcript || ''

    const safeTitle = title
      .replace(/[^a-z0-9]/gi, '-')
      .replace(/-+/g, '-')
      .toLowerCase()

    const timestamp = new Date().toISOString().replace(/:/g, '-')
    const filename = `${timestamp}-${safeTitle}.md`

    const markdown = `# ${title}

${body}

---

## Original Transcript

${transcript}
`

    const webdavUrl =
      `${user.nextcloudUrl}` +
      `/remote.php/dav/files/` +
      `${user.username}/` +
      `${user.folder}/` +
      `${filename}`

    await axios.put(webdavUrl, markdown, {
      auth: {
        username: user.username,
        password: user.password
      },
      headers: {
        'Content-Type': 'text/markdown'
      }
    })

    res.json({ success: true, filename })
  } catch (err) {
    console.error(err.response?.data || err.message)
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`Webhook server listening on ${PORT}`)
})
