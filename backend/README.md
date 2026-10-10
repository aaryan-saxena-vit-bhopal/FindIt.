# FindIt Backend

Zero-dependency Node.js API for the FindIt Lost & Found portal. It uses Node's built-in SQLite, so there is nothing to `npm install`.

**Requires Node 22.5 or newer.**

```bash
node server.js     # http://localhost:3000
node --test        # run the test suite
```

The server also serves the `../frontend` folder, so the pages and the API share one origin.

## Configuration

All optional, set as environment variables (see `.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | Server port |
| `JWT_SECRET` | auto-generated in `data/.secret` | Token signing key. **Set this in production.** |
| `DB_PATH` | `data/findit.db` | SQLite database file |
| `CORS_ORIGIN` | `*` | Allowed origin if the frontend is hosted elsewhere |
| `AUTH_RATE_LIMIT` | 30 | Login/register attempts per IP per 15 minutes |
| `FRONTEND_DIR` | `../frontend` | Static files to serve |
| `BREVO_API_KEY` | none | API key for sending verification emails (see `docs/email-setup.md`) |
| `EMAIL_FROM` | none | Sender address, must be verified in Brevo |
| `EMAIL_FROM_NAME` | `FindIt` | Sender display name |
| `ALLOWED_EMAIL_DOMAIN` | none | Restrict signups to one domain, e.g. `vitbhopal.ac.in` |

Without `BREVO_API_KEY`, running locally prints the verification code in the terminal instead of sending an email, so you can still sign up while developing. On a hosted server that mode is disabled and signup returns an error until email is configured.

## Layout

```
server.js        HTTP server, static files, CORS
src/db.js        SQLite schema
src/auth.js      password hashing, signed tokens, verification codes
src/mailer.js    sends verification emails
src/validate.js  input validation
src/routes.js    API routes
src/matching.js  lost/found match scoring
test/            API tests
```

API reference: [`../docs/api.md`](../docs/api.md)
