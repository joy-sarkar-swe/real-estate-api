# Real Estate Marketplace API

Production-grade NestJS backend. NestJS 11, Prisma 7, PostgreSQL, Redis, Socket.IO, Docker.

## Quick Start (Docker)

```bash
cp .env.example .env
docker-compose up -d
# Swagger: http://localhost:3000/docs
```

## Quick Start (Local)

```bash
npm install
docker-compose -f docker-compose.dev.yml up -d   # DB + Redis only
cp .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
npm run start:dev
```

## Test Credentials (after seed)

| Role   | Email                        | Password     |
|--------|------------------------------|--------------|
| Admin  | admin@realestate.com         | Admin@12345  |
| Owner  | owner@realestate.com         | Owner@12345  |
| Tenant | tenant@realestate.com        | Tenant@12345 |

## Modules

| Module        | Key Features |
|---------------|---|
| Auth          | JWT access+refresh, argon2, token rotation, forgot/reset password, RBAC |
| Users         | Profile CRUD, role-based access |
| Properties    | CRUD, soft-delete, geo search (haversine + bounding box), cursor pagination, price history |
| Visits        | Slot-conflict detection, idempotency, confirm/cancel/reschedule, available slots |
| Chat          | REST + Socket.IO real-time, conversation management, read receipts, typing indicators |
| Shortlist     | Add/remove, saved searches with alert toggles |
| Notifications | Event-driven (visit, price change), mark read |
| Analytics     | Fire-and-forget event tracking |
| Health        | DB + memory + disk via Terminus |

## API Prefix: `/api/v1`

All endpoints accept/return JSON. Auth endpoints are public; all others require `Authorization: Bearer <token>`.

## WebSocket: `ws://localhost:3000/ws`

```js
const socket = io('http://localhost:3000/ws', { auth: { token: '<access-token>' } });

// Emit
socket.emit('join_conversation', { conversationId });
socket.emit('send_message', { conversationId, content: 'Hello' });
socket.emit('typing', { conversationId, isTyping: true });
socket.emit('watch_property', { propertyId });

// Listen
socket.on('new_message', msg => console.log(msg));
socket.on('property_created', data => ...);
socket.on('price_changed', data => ...);
socket.on('visit_booked', data => ...);
```

## Tests

```bash
npm test              # 52 unit tests (no DB needed)
npm run test:cov      # with coverage
npm run test:e2e      # e2e (needs running DB)
```

## Docker Services

| Service  | Port | Notes |
|----------|------|-------|
| api      | 3000 | NestJS app |
| postgres | 5432 | PostgreSQL 16 |
| redis    | 6379 | Redis 7 |
| migrate  | —    | One-shot migration + seed |

## Scripts

```bash
npm run start:dev           # hot-reload dev
npm run build               # compile
npm run prisma:generate     # regenerate client
npm run prisma:migrate      # create + apply migration
npm run prisma:seed         # seed DB
npm run prisma:studio       # Prisma Studio UI
npm run docker:up           # all services
npm run docker:dev          # DB + Redis only
npm run docker:logs         # tail API logs
```
