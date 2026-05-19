import express from 'express'
import axios from 'axios'
import 'dotenv/config'

const app = express()

app.use(express.json({ limit: '10mb' }))

const PORT = process.env.PORT || 3000

const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL
const NEXTCLOUD_USERNAME = process.env.NEXTCLOUD_USERNAME
const NEXTCLOUD_PASSWORD = process.env.NEXTCLOUD_PASSWORD
const NEXTCLOUD_FOLDER = process.env.NEXTCLOUD_FOLDER || 'AudioPen'

app.post('/webhook', async (req, res) => {
  try {
    console.log('Received webhook')

    console.log(JSON.stringify(req.body, null, 2))

    // Try a few possible fields from AudioPen
    const note =
      req.body.note ||
      req.body.text ||
      req.body.content ||
      JSON.stringify(req.body, null, 2)

    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, '-')

    const filename = `note-${timestamp}.md`

    const webdavUrl =
      `${NEXTCLOUD_URL}` +
      `/remote.php/dav/files/` +
      `${NEXTCLOUD_USERNAME}/` +
      `${NEXTCLOUD_FOLDER}/` +
      `${filename}`

    await axios.put(webdavUrl, note, {
      auth: {
        username: NEXTCLOUD_USERNAME,
        password: NEXTCLOUD_PASSWORD
      },
      headers: {
        'Content-Type': 'text/markdown'
      }
    })

    console.log(`Uploaded ${filename}`)

    res.status(200).json({
      success: true,
      filename
    })
  } catch (err) {
    console.error(err.response?.data || err.message)

    res.status(500).json({
      success: false,
      error: err.message
    })
  }
})

app.listen(PORT, () => {
  console.log(`Webhook server listening on ${PORT}`)
})