# API Reference

All responses are JSON. Errors look like `{ "error": "...", "details": { "field": "..." } }`.
Authenticated routes need the header `Authorization: Bearer <token>`.

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | no | `{email, name, password, phone, countryCode?}` returns 201 `{user, token}` |
| POST | `/api/auth/login` | no | `{email, password, remember?}` returns `{user, token}` (valid 1 day, or 30 with `remember`) |
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
- Item date cannot be in the future.
- `category: "Custom"` requires `customCategory`.
- If `contactInfo` is omitted it defaults to the reporter's email and phone.

## Matching

When an item is created, the API returns likely opposite-type items. The score combines category, name similarity, location similarity, description similarity and how close the dates are.

`GET /api/items` also attaches a `matches` array (up to 3 `{id, name, location, date, reporter, contactInfo, matchScore}`) to every open item; the frontend shows it as a "Possible match" badge. An item is only a possible match if its score is at least 5, so a shared category alone is not enough. Start the server with `npm run start:fresh` to wipe all data first.
