# Barangay Resident Management System (BRMS)

A complete, production-ready, monolithic web application built with **Node.js**, **Express.js**, and **PostgreSQL**. Designed specifically for seamless zero-downtime deployment on **Render**.

---

## Key System Features

1. **Three Separate Portals**:
   - **Admin Portal (`/admin-login`)**: Full administrative control over resident approvals, household units, blotters, system logs, reports, document issuance, and configurations.
   - **Staff Portal (`/staff-login`)**: Module-restricted workflow for processing document applications and verifying QR codes.
   - **Resident Portal (`/resident-login`)**: Mobile-first portal allowing residents to register, request clearances, access their Digital ID, view household structure, and submit feedback.

2. **Digital Resident ID & Verification System**:
   - Generates digital ID cards featuring encrypted QR tokens.
   - Built-in live browser camera QR Code Scanner for verification by barangay staff/admin.

3. **Persistent PostgreSQL Integration**:
   - Automated schema migrations without dropping or resetting tables on server restarts.
   - Structured PostgreSQL sessions using `connect-pg-simple`.

4. **Security & Ownership**:
   - Encrypted passwords using `bcryptjs`.
   - Strict server-side route guards enforcing data isolation per resident.

---

## Environment Variables

Configure these environment variables on Render or in your local environment:

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string (Provided by Render PostgreSQL). |
| `SESSION_SECRET` | Cryptographic key used to sign session cookies. |
| `INITIAL_ADMIN_PASSWORD` | Optional. Initial password for default `admin` user on first boot (Defaults to `admin123`). |
| `NODE_ENV` | Set to `production` when deployed. |

---

## Local Setup & Development

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL Database Server

### Quick Start Instructions
1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd barangay-resident-management-system
