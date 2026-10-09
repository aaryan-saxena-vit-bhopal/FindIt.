# API Reference

All responses are JSON. Errors look like `{ "error": "...", "details": { "field": "..." } }`.
Authenticated routes need the header `Authorization: Bearer <token>`.

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | no | `{email, name, password, phone, countryCode?}` returns 201 `{user, token}` |
| POST | `/api/auth/login` | no | `{email, password, remember?}` returns `{user, token}` (valid 1 day, or 30 with `remember`) |
| GET | `/api/auth/me` | yes | Current user |
| GET | `/api/health` | no | Health check |
| POST | `/api/items` | yes | `{type, name, category, customCategory?, date, location, contactInfo?, description?}` returns 201 `{item}` |
| GET | `/api/items?type=lost` | yes | Open lost items, newest first |
| GET | `/api/categories` | no | Valid category list |
| GET | `/api/items?type=found` | yes | Open found items, newest first (found items can now be created too) |

## Rules

- Email must end in `.edu`, `.ac.in` or `.edu.in`.
- Mobile number: exactly 10 digits (+91).
- Password: 8 to 128 characters.
- Item date cannot be in the future.
- `category: "Custom"` requires `customCategory`.
- If `contactInfo` is omitted it defaults to the reporter's email and phone.
