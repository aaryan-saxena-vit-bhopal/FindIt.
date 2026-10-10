# API Reference

All responses are JSON. Errors look like `{ "error": "...", "details": { "field": "..." } }`.
Authenticated routes need the header `Authorization: Bearer <token>`.

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | no | `{email, name, password, phone, countryCode?}` creates an unverified account, emails a 6-digit code, returns 201 `{pendingVerification: true, email}` |
| POST | `/api/auth/verify` | no | `{email, code}` marks the email verified and returns `{user, token}` |
| POST | `/api/auth/resend` | no | `{email}` sends a fresh code (one per 60 seconds) |
| POST | `/api/auth/forgot` | no | `{email}` emails a 6-digit reset code (one per 60 seconds). Always answers `{sent: true}` for unknown addresses too, so it cannot be used to find out who is registered |
| POST | `/api/auth/reset` | no | `{email, code, password}` sets a new password if the code is right. Code is valid for 10 minutes, 5 attempts per code, single use. Does not log you in |
| POST | `/api/auth/login` | no | `{email, password, remember?}` returns `{user, token}` (valid 1 day, or 30 with `remember`). Unverified accounts get 403 with `code: "EMAIL_NOT_VERIFIED"` |
| GET | `/api/auth/me` | yes | Current user |
| GET | `/api/items` | yes | List items. Query: `type=lost\|found`, `q`, `category`, `status=open\|resolved\|all` (default `open`), `mine=1`, `limit`, `offset` |
| POST | `/api/items` | yes | `{type, name, category, customCategory?, date, location, contactInfo?, description?}` returns 201 `{item, matches}` |
| GET | `/api/items/:id` | yes | Single item |
| GET | `/api/items/:id/matches` | yes | Likely opposite-type matches |
| PATCH | `/api/items/:id/resolve` | owner | Mark an item resolved |
| DELETE | `/api/items/:id` | owner | Delete an item |
| GET | `/api/categories` | no | Valid category list |
| GET | `/api/health` | no | Health check |

## Rules

- Email must end in `.edu`, `.ac.in` or `.edu.in`.
- Mobile number: exactly 10 digits (+91).
- Password: 8 to 128 characters.
- Password reset uses the same rules as verification: 6-digit code, 10 minutes, 5 attempts, one per 60 seconds.
- Email verification: the code is 6 digits, valid for 10 minutes, with 5 attempts per code and one resend per 60 seconds. Accounts that are not verified cannot log in or use the API.
- If `ALLOWED_EMAIL_DOMAIN` is set (for example `vitbhopal.ac.in`), only that domain can register.
- Item date cannot be in the future.
- `category: "Custom"` requires `customCategory`.
- If `contactInfo` is omitted it defaults to the reporter's email and phone.

## Matching

When an item is created, the API returns likely opposite-type items. The score combines category, name similarity, location similarity, description similarity and how close the dates are.
