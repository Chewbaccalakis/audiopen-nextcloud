import dotenv from 'dotenv'
import express from 'express'
import axios from 'axios'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (!existsSync(path.join(__dirname, '.env'))) {
  const encryptionKey = randomBytes(32).toString('hex')
  const adminPassword = randomBytes(16).toString('hex')
  writeFileSync(
    path.join(__dirname, '.env'),
    `ENCRYPTION_KEY=${encryptionKey}\nADMIN_PASSWORD=${adminPassword}\nPORT=3000\n`
  )
  console.log('No .env file found — generated one with a new ENCRYPTION_KEY and ADMIN_PASSWORD.')
  console.log(`ADMIN_PASSWORD: ${adminPassword}`)
  console.log('Save this password — you will need it to register users via the web UI.')
}

dotenv.config()

// --- Encryption setup ---

const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY
if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length !== 64) {
  console.error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).')
  console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
  process.exit(1)
}
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX, 'hex')

function encryptPassword(plaintext) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `enc:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

function decryptPassword(stored) {
  if (!stored.startsWith('enc:')) {
    // Legacy plaintext — transparently supported until next save
    return stored
  }
  const [, ivHex, authTagHex, encryptedHex] = stored.split(':')
  const decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return decipher.update(Buffer.from(encryptedHex, 'hex')) + decipher.final('utf8')
}

// --- App setup ---

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
    password: encryptPassword(password),
    folder: folder || 'AudioPen'
  }
  saveUsers()

  const webhookUrl = `${req.protocol}://${req.get('host')}/webhook/${token}`
  console.log(`New user registered: ${username}`)
  res.json({ token, webhookUrl })
})

// Returns settings without the password
app.get('/api/users/:token', (req, res) => {
  const user = users[req.params.token]
  if (!user) return res.status(404).json({ error: 'Not found.' })
  const { password: _omit, ...safeUser } = user
  res.json(safeUser)
})

// Password is optional — omit to keep the existing one
app.put('/api/users/:token', (req, res) => {
  const existing = users[req.params.token]
  if (!existing) return res.status(404).json({ error: 'Not found.' })

  const { nextcloudUrl, username, password, folder } = req.body
  if (!nextcloudUrl || !username) {
    return res.status(400).json({ error: 'nextcloudUrl and username are required.' })
  }

  users[req.params.token] = {
    nextcloudUrl: nextcloudUrl.replace(/\/$/, ''),
    username,
    password: password ? encryptPassword(password) : existing.password,
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
        password: decryptPassword(user.password)
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
