# FindIt

A campus Lost & Found portal for VIT Bhopal students, built for an IEEE hackathon. Students sign in with their college email, report lost or found items, browse everything in a searchable grid, and get suggested matches automatically.

## Features

- Sign up and log in with a college email (`.edu`, `.ac.in`, `.edu.in`)
- Report lost and found items with category, date and location
- Grid view of all lost and all found items, with search and category filter
- Automatic matching between lost and found reports
- Mark your own items as resolved, or delete them
- Contact details taken from the reporter's account

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | HTML, Tailwind CSS, vanilla JavaScript |
| Backend | Node.js (no external dependencies) |
| Database | SQLite (built into Node) |
| Auth | scrypt password hashing, signed tokens |

## Project structure

```
FindIt/
├── backend/     API server, database and tests
├── frontend/    pages and scripts served by the backend
└── docs/        API reference
```

## Getting started

You need **Node.js 22.5 or newer**.

```bash
git clone <repo-url>
cd FindIt/backend
node server.js
```

Open http://localhost:3000, create an account and start reporting items. Open the site through that address, not by double-clicking the HTML files.

To run the tests: `node --test` inside `backend`.

## Documentation

- [API reference](docs/api.md)
- [Backend notes](backend/README.md)

## Known limitations

- No email verification yet. Anyone can register with an address that looks like a college email.
- No password reset flow.
- Item photos are not supported yet.

## Team

Add your team members here.
