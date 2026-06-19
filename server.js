import 'dotenv/config'
import express from 'express'
import axios from 'axios'
import { readFileSync } from 'fs'

const app = express()

app.use(express.urlencoded({ extended: false }))
app.use(express.json())
app.use(express.text({ type: '*/*' }))

const PORT = process.env.PORT || 3000

const USERS_FILE = process.env.USERS_FILE || 'users.json'
let users = {}
try {
  users = JSON.parse(readFileSync(USERS_FILE, 'utf8'))
  console.log(`Loaded ${Object.keys(users).length} user(s) from ${USERS_FILE}`)
} catch (err) {
  console.error(`Failed to load ${USERS_FILE}: ${err.message}`)
  process.exit(1)
}

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
        // try parsing as URL encoded manually
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