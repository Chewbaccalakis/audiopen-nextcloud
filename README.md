# AudioPen Nextcloud Webhook

A Node.js service that receives notes from AudioPen and uploads them to Nextcloud via WebDAV. Includes a web UI for self-service setup — each user enters their own Nextcloud credentials and gets a unique webhook URL.

When AudioPen sends a webhook, the service:

1. Validates the token in the URL
2. Parses the note content (title, body, original transcript)
3. Creates a timestamped Markdown file
4. Uploads it to the user's configured Nextcloud folder

Example filename:

```text
2026-05-19T22-15-10.123Z-my-note-title.md
```

## Setup

### 1. Configure environment

Create a `.env` file in the project root:

```env
ADMIN_PASSWORD=choose-a-strong-password
PORT=3000
# USERS_FILE=users.json  # optional, defaults to users.json
```

`ADMIN_PASSWORD` is required to create new accounts via the web UI. Without it, registration is disabled (existing users can still update their settings).

### 2. Run

```bash
npm install
node server.js
```

### 3. Register users

Open `http://localhost:3000` in a browser. Each user fills in their Nextcloud credentials and the admin password, then receives:

- A **webhook URL** to paste into AudioPen (`/webhook/<token>`)
- A **settings page URL** to bookmark for updating credentials later (`/?token=<token>`)

### Returning users

Visiting `/?token=<token>` pre-fills the form with existing settings and allows updating credentials without needing the admin password.

## Manual user management

User credentials are stored in `users.json` (gitignored). You can also edit this file directly — see `users.json.example` for the format.
