# Barangay Resident Management System

Express + Supabase. Entry point: `app.js`.

## Run it on your computer
1. Install Node.js (LTS) from https://nodejs.org
2. In this folder: `npm install`
3. Copy `.env.example` to `.env` and fill in your Supabase values
4. `npm run dev` (auto-restarts when you save) or `npm start`
5. Open http://localhost:3000

## Where things are
| Folder / file | What it holds |
|---|---|
| `app.js` | Starts the server and connects all the route files |
| `config/` | Environment variables, Supabase connection, upload limits |
| `middleware/` | Login check, role check, activity log, first-time setup guard |
| `utils/` | Shared helpers and role lists |
| `views/` | Page layout/sidebar, styles, scanner screen |
| `services/` | Aid claiming logic |
| `routes/` | One file per feature (login, register, terms, account, scanner, resident portal) |
| `routes/admin/` | One file per admin page (residents, households, users, aid, settings, ...) |

## Common edits
- Sidebar menu items: `views/layout.js` (`adminMenu` / `residentMenu`)
- Terms and Conditions text: `routes/terms.js`
- Resident edit form: `routes/admin/residents.js`
- Change password / email: `routes/account.js` and `routes/admin/users.js`
- Who can do what: `utils/constants.js`

## Deploying on Render
Build command: `npm install` - Start command: `node app.js`
Set the same variables from `.env` in Render's Environment tab.
"# BarangayRMS" 
