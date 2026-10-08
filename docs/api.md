# API Reference

All responses are JSON. Errors look like `{ "error": "...", "details": { "field": "..." } }`.
Authenticated routes need the header `Authorization: Bearer <token>`.

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | no | `{email, name, password, phone, countryCode?}` returns 201 `{user, token}` |
| POST | `/api/auth/login` | no | `{email, password, remember?}` returns `{user, token}` (valid 1 day, or 30 with `remember`) |
| GET | `/api/auth/me` | yes | Current user |
| GET | `/api/health` | no | Health check |

## Rules

- Email must end in `.edu`, `.ac.in` or `.edu.in`.
- Mobile number: exactly 10 digits (+91).
- Password: 8 to 128 characters.
