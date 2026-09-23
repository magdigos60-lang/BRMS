# Barangay Resident Management System

A production-ready Barangay Resident Management System built using **Node.js**, **Express.js**, and **PostgreSQL**, designed specifically for deployment on Render.

## Features

- **Three Completely Separate Portals**:
  - **Admin Portal**: Resident approval, blotter oversight, document approvals, staff/accounts management, audit logs, system settings.
  - **Staff Portal**: Processing module for documents, resident lookup, household handling, QR code validation, and blotter intake based on role permissions.
  - **Resident Portal**: Mobile-responsive dashboard, digital ID display, request document certificates, household details, track concerns, view announcements, and retrieve secure QR token.
- **Persistent Storage**: Uses PostgreSQL as the single source of truth (`DATABASE_URL`).
- **QR Verification System**: Cryptographically generated individual QR codes without leaking raw sensitive data inside QR code image payloads.
- **Printable Documents**: Dynamic PDF/Print view generation for official clearances and certifications.
- **Audit Trails & Security**: Parameterized SQL queries, password hashing using `bcryptjs`, and session management tied to PostgreSQL database tables.

---

## Environment Variables

Configure the following environment variables in Render or your local environment:

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string URL (Render PostgreSQL default). |
| `SESSION_SECRET` | Secret string used to sign session cookies. |
| `PORT` | (Optional) Port number for server. Defaults to `3000`. |

---

## Local Installation and Testing

1. Clone or extract the application repository.
2. Install dependencies:
   ```bash
   npm install
