import 'dotenv/config'
import express from 'express'
import axios from 'axios'

const app = express()

app.use(express.urlencoded({ extended: false }))
app.use(express.json())
app.use(express.text({ type: '*/*' }))

const PORT = process.env.PORT || 3000

const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL
const NEXTCLOUD_USERNAME = process.env.NEXTCLOUD_USERNAME
const NEXTCLOUD_PASSWORD = process.env.NEXTCLOUD_PASSWORD
const NEXTCLOUD_FOLDER = process.env.NEXTCLOUD_FOLDER || 'AudioPen'

app.post('/webhook', async (req, res) => {
  try {
    console.log('Received webhook')

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
      `${process.env.NEXTCLOUD_URL}` +
      `/remote.php/dav/files/` +
      `${process.env.NEXTCLOUD_USERNAME}/` +
      `${process.env.NEXTCLOUD_FOLDER}/` +
      `${filename}`

    await axios.put(webdavUrl, markdown, {
      auth: {
        username: process.env.NEXTCLOUD_USERNAME,
        password: process.env.NEXTCLOUD_PASSWORD
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