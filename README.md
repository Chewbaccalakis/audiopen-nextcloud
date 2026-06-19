# AudioPen Nextcloud Webhook

A small Node.js webhook service that receives notes from AudioPen and uploads them to a folder in Nextcloud using WebDAV. Supports multiple users, each with their own Nextcloud credentials and a unique webhook token.

When AudioPen sends a webhook request, the service:

1. Validates the token in the URL
2. Receives the note content
3. Creates a timestamped Markdown file
4. Uploads the file to the configured Nextcloud folder

Example filename:

```text
2026-05-19T22-15-10.123Z-my-note-title.md
```

## Setup

### 1. Configure users

Copy `users.json.example` to `users.json` and fill in credentials for each user:

```json
{
  "abc123secrettoken": {
    "nextcloudUrl": "https://nextcloud.example.com",
    "username": "alice",
    "password": "alice-app-password",
    "folder": "AudioPen"
  }
}
```

Each key is a secret token that identifies a user. Generate one with:

```bash
node -e "console.log(crypto.randomUUID())"
```

### 2. Configure the server

Optionally create a `.env` file to set the port or a custom path to `users.json`:

```env
PORT=3000
USERS_FILE=users.json
```

### 3. Run

```bash
npm install
node server.js
```

### 4. Configure AudioPen

In AudioPen's webhook settings, set the URL to:

```
https://your-server/webhook/<token>
```

Each user gets their own URL containing their unique token.
