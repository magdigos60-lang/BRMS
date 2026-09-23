# Barangay Resident Management System

A production-ready, multi-portal Barangay Resident Management System designed for persistent deployment on **Render** using **Node.js**, **Express.js**, and **PostgreSQL**.

---

## Key Features

1. **Three Distinct Portals**:
   - **Admin Portal**: Full control over resident verification, household registry, blotters, official directory, system settings, staff management, and audit logs.
   - **Staff Portal**: Role-permission-based access for processing document requests, scanning QR codes, managing blotters, and viewing reports.
   - **Resident Portal**: Mobile-responsive interface allowing residents to view digital IDs, personal QR codes, track household members, apply for barangay clearances, and raise concerns.

2. **Data Privacy & Route Security**:
   - Explicit ownership checking prevents residents from viewing other residents' documents or profiles.
   - Server-side role validation middleware re-verifies session scopes on every request.

3. **Persistent PostgreSQL Storage**:
   - Fully normalized tables with transaction safety.
   - Preserves all accounts, transactions, and settings across redeployments, browser restarts, and server reboots.

4. **Digital Resident ID & Verification**:
   - Auto-generated unique Resident ID (`BRGY-2026-XXXXXX`).
   - Secure QR token generation for quick scanning without exposing sensitive identity data directly inside the barcode.

---

## Environment Variables

Configure these environment variables in your local `.env` file or within the Render Web Service Dashboard:

| Variable Name | Required | Description |
| :--- | :---: | :--- |
| `DATABASE_URL` | **Yes** | Internal or External PostgreSQL connection URL. |
| `SESSION_SECRET` | **Yes** | Cryptographic secret for signing session cookies. |
| `ADMIN_SETUP_SECRET` | No | Initial setup password for the default `admin` account (Default: `admin123`). |
| `PORT` | No | Port number on which the app listens (Render supplies this automatically). |

---

## Local Installation & Setup

1. **Clone the Repository**:
   ```bash
   git clone <your-repository-url>
   cd barangay-resident-management-system
