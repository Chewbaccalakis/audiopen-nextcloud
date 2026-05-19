# AudioPen Nextcloud Webhook

A small Node.js webhook service that receives notes from AudioPen and uploads them to a folder in Nextcloud using WebDAV.

When AudioPen sends a webhook request, the service:

1. Receives the note content
2. Creates a timestamped Markdown file
3. Uploads the file to the configured Nextcloud folder

Example filename:

```text
note-2026-05-19T22-15-10.123Z.md
```

## Example `.env`

Create a file named `.env` in the project root directory:

```env
NEXTCLOUD_URL=https://nextcloud.example.com
NEXTCLOUD_USERNAME=myuser
NEXTCLOUD_PASSWORD=my-app-password
NEXTCLOUD_FOLDER=AudioPen
PORT=3000
```