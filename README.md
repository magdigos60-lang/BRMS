# Barangay Resident Management System (BRMS)

A complete, production-ready, highly secure web application built using **Node.js**, **Express.js**, and **PostgreSQL**, designed specifically for deployment on **Render**.

## Features

- **Three Completely Separate Portals**: Admin Portal, Staff Portal, and Resident Portal with independent login flows, role-based authorization, and tailored UI.
- **Resident Portal**: Mobile-first dashboard, profile management, automated age calculations, digital ID card generation, secure QR code verification, document requests, notifications, and concerns.
- **Admin Portal**: Complete oversight with analytics, master resident management, household grouping, staff role assignment, blotter management, announcements, reporting, audit activity logs, and system settings.
- **Staff Portal**: Role-based access to assigned operational modules (Resident records, document processing, QR scanner, blotter).
- **PostgreSQL Persistence**: Robust normalized schema with foreign keys, constraints, indexes, and session storage backed by PostgreSQL ensuring zero data loss across restarts or Render deployments.

---

## Requirements

- Node.js (v18 or higher)
- PostgreSQL database instance

---

## Installation & Local Run

1. Clone or download the repository.
2. Install dependencies:
   ```bash
   npm install
