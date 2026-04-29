# Config App — AI App Generator

A production-style full-stack AI app generator demo that converts a structured JSON configuration into a working web application with dynamic UI, CRUD APIs, authentication, database persistence, CSV import, plugins, audit logs, and notifications.

This project was built for the Track A AI App Generator internship task.

---

## Features

- Dynamic UI generated from JSON config
- Dynamic backend CRUD APIs
- User-scoped data using Clerk authentication
- PostgreSQL database using Prisma ORM
- Generic `AppRecord` model for dynamic entities
- CSV upload, column mapping, validation, and bulk import
- Config-driven actions: create, update, delete, CSV import
- Plugin registry system
- Notifications plugin
- Audit log plugin
- Backend validation from config
- Defensive config handling for incomplete or partially incorrect configs
- Responsive UI improvements

---

## Tech Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- Clerk Authentication
- PapaParse for CSV parsing

### Backend

- Node.js
- Express.js
- Prisma ORM
- PostgreSQL
- CORS

### Database

- PostgreSQL hosted using Neon/Supabase/Railway
- Prisma Client for database access

---

## Why a Generic AppRecord Model?

Since the app is generated from JSON config, entities and fields can change dynamically.

Instead of creating a new database table for every entity, the backend uses a generic model:

```prisma
model AppRecord {
  id        String   @id @default(cuid())
  entity    String
  userId    String
  data      Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}


Frontend URL: https://ai-app-generator-git-main-vardhan-ds-projects.vercel.app/ 
Backend URL: https://ai-app-generator-backend.onrender.com
GitHub Repo: https://github.com/vardhan-D/ai-app-generator