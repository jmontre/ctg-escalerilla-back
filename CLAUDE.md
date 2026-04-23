# CLAUDE.md - CTG API Escalerilla Backend

## Resumen del Proyecto

Backend del sistema del **Club de Tenis Graneros (CTG)**. Gestiona la Escalerilla (ranking tipo ladder), desafíos entre jugadores, torneo Master, reservas de canchas, notificaciones y administración.

**Stack:** NestJS 11 + TypeScript + PostgreSQL + Prisma ORM
**Despliegue:** Docker en Railway (Supabase como DB)
**Puerto:** 3000 (configurable vía `PORT`)

---

## Comandos Principales

```bash
npm install                  # Instalar dependencias
npm run build                # Compilar TypeScript (genera dist/)
npm run start:dev            # Desarrollo con watch mode
npm run start:prod           # Producción: node dist/main.js
npm run lint                 # ESLint
npm run test                 # Tests unitarios (Jest)
npx prisma migrate dev       # Crear/aplicar migraciones en desarrollo
npx prisma migrate deploy    # Aplicar migraciones en producción
npx prisma generate          # Regenerar Prisma Client
npx prisma studio            # UI visual para la base de datos
```

---

## Estructura del Proyecto

```
src/
├── main.ts                          # Entry point (CORS, WhatsApp init, puerto)
├── app.module.ts                    # Módulo raíz (importa todos los módulos)
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts           # /auth/register, /login, /me, /forgot-password, /reset-password
│   ├── auth.service.ts              # JWT, bcryptjs, registro/login, reset de password
│   ├── wordpress-auth.guard.ts      # Guard WordPress (implementado, no activo en rutas)
│   ├── wordpress-auth.service.ts    # Verifica sesiones WordPress via API
│   ├── wp-user.decorator.ts
│   └── dto/
│       ├── login.dto.ts
│       └── register.dto.ts
├── players/
│   ├── players.module.ts
│   ├── players.controller.ts        # /players, /players/:id, /players/me, avatares
│   ├── players.service.ts           # CRUD jugadores, desafíos disponibles, avatares
│   ├── admin-players.controller.ts  # /admin/players CRUD + utilidades admin
│   ├── admin-players.service.ts     # Mover posiciones, inmunidad/vulnerabilidad, uso semanal
│   └── cloudinary.service.ts        # Upload/delete de avatares en Cloudinary
├── challenges/
│   ├── challenges.module.ts
│   ├── challenges.controller.ts     # CRUD desafíos, aceptar/rechazar/resultado/programar
│   ├── challenges.service.ts        # Lógica de desafíos y doble confirmación
│   ├── challenge-rules.service.ts   # REGLAS DE NEGOCIO: niveles, validaciones, shifts de ranking
│   ├── admin-challenges.controller.ts  # /admin/challenges: resolver, cancelar, forzar, extender
│   └── admin-challenges.service.ts
├── cron/
│   ├── cron.module.ts
│   ├── cron.controller.ts           # POST /cron/run (trigger manual)
│   └── challenges-cron.service.ts   # Jobs automáticos (ver sección Cron Jobs)
├── master/
│   ├── master.module.ts
│   ├── master.controller.ts         # /master: temporadas, grupos, partidos, resultados
│   └── master.service.ts            # Generación de grupos, resultados, final automática
├── reservations/
│   ├── reservations.module.ts
│   ├── reservations.controller.ts   # /reservations: disponibilidad, bloques, estadísticas
│   └── reservations.service.ts      # Lógica de reservas, alta demanda, límites semanales
├── notifications/
│   ├── email.service.ts             # Resend.com (escalerilla@clubdetenisgraneros.cl)
│   └── whatsapp.service.ts          # whatsapp-web.js con Chromium
├── common/
│   ├── common.module.ts             # Módulo global
│   └── app.logger.ts                # Logger estructurado para eventos clave
├── prisma/
│   ├── prisma.module.ts             # Módulo global
│   └── prisma.service.ts            # Conexión PostgreSQL
└── test/
    └── test.controller.ts           # /test/whatsapp, /test/grupos (solo desarrollo)

scripts/                             # Scripts TypeScript de utilidad/migración (ejecutar con ts-node)
prisma/
├── schema.prisma                    # Schema ORM
├── seed.ts                          # Seed: usuario admin por defecto
└── migrations/                      # Migraciones (ignoradas en git, se aplican en deploy)
```

---

## Base de Datos (PostgreSQL + Prisma)

Schema en `prisma/schema.prisma`. Tablas mapeadas con `@@map()`.

### User (`users`)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | Auto-generado |
| username | String | Único |
| email | String | Único |
| password_hash | String | bcryptjs, 10 rounds |
| is_admin | Boolean | Default false |
| admin_role | String? | `null` \| `"escalerilla"` \| `"reservas"` \| `"all"` |
| created_at | DateTime | Auto |
| updated_at | DateTime | Auto |

Relaciones: `User 1:1 Player` (cascade delete), `User 1:N PasswordResetToken`

### Player (`players`)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | Auto-generado |
| user_id | String (FK) | Único, ref → User |
| name | String | Nombre completo |
| email | String | Único |
| phone | String? | Formato chileno (+569...) |
| avatar_url | String? | URL de Cloudinary |
| position | Int? | Nullable — null = fuera de escalerilla |
| wins | Int | Default 0 |
| losses | Int | Default 0 |
| total_matches | Int | Default 0 |
| immune_until | DateTime? | 24hrs post-victoria |
| vulnerable_until | DateTime? | Hasta medianoche post-derrota |
| member_type | String | `"socio"` \| `"alumno"` \| `"invitado"` |
| parent_id | String? | FK → Player (relación familiar) |
| has_debt | Boolean | Default false — bloquea reservas |
| extra_high_demand_slots | Int | Default 0 — slots extra de alta demanda |
| school_names | String[] | Escuelas del jugador |

Relaciones: `challenges_made`, `challenges_received`, `ranking_history`, `master_group_players`, `master_matches`, `reservations`

### Challenge (`challenges`)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| challenger_id | String (FK) | Ref → Player |
| challenged_id | String (FK) | Ref → Player |
| status | String | `pending`, `accepted`, `completed`, `rejected`, `disputed`, `expired_not_accepted`, `expired_not_played`, `cancelled` |
| accept_deadline | DateTime | 24hrs desde creación |
| play_deadline | DateTime | 5 días desde creación |
| scheduled_date | DateTime? | Fecha acordada para jugar |
| accepted_at / first_result_at / played_at / resolved_at | DateTime? | Timestamps de ciclo de vida |
| challenger_result / challenged_result | JSON? | `{winnerId, score}` |
| results_match | Boolean? | true si ambos coinciden |
| winner_id | String? | |
| final_score | String? | |

### RankingHistory (`ranking_history`)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | UUID (PK) | |
| player_id | String (FK) | |
| position | Int | Nueva posición |
| old_position | Int? | Posición anterior |
| reason | String? | `challenge_won`, `challenge_lost`, `penalty`, `opponent_penalty`, etc. |

### PasswordResetToken (`password_reset_tokens`)
Tokens UUID de un solo uso con expiración para recuperación de contraseña.

### MasterSeason / MasterGroup / MasterGroupPlayer / MasterMatch (`master_*`)
Tablas del torneo Master. `MasterSeason` → grupos → jugadores y partidos. Round robin + final.

### Court / Reservation / CourtBlock / SystemConfig
Tablas del sistema de reservas de canchas. `Court` → `Reservation` (con franjas horarias). `CourtBlock` para bloquear horarios. `SystemConfig` para configuración clave-valor.

---

## API Endpoints

### Auth (`/auth`)
- `POST /auth/register` — `{username, email, password, name, phone?}` → `{token, user, player}`
- `POST /auth/login` — `{username, password}` → `{token, user, player}`
- `GET /auth/me` — Bearer token → `{user, player}`
- `POST /auth/forgot-password` — `{email}` → envía email con token de reset
- `POST /auth/reset-password` — `{token, newPassword}` → actualiza password

### Players (`/players`)
- `GET /players` — Todos los jugadores ordenados por posición (incluye desafíos activos)
- `GET /players/:id` — Detalle con últimos 10 desafíos e historial de ranking
- `GET /players/user/:userId` — Buscar por user ID
- `GET /players/:id/available-challenges` — Jugadores que puede desafiar
- `PUT /players/me` — Actualizar nombre/teléfono del propio perfil
- `POST /players/me/avatar` — `{image: base64}` subir/reemplazar avatar (Cloudinary)
- `DELETE /players/me/avatar` — Eliminar avatar propio

### Admin Players (`/admin/players`)
- `POST /admin/players` — Crear jugador manualmente
- `PUT /admin/players/:id` — Actualizar datos
- `DELETE /admin/players/:id` — Eliminar jugador y usuario
- `POST /admin/players/:id/move` — `{newPosition}` mover posición (cascada)
- `POST /admin/players/:id/reset-immunity` — Quitar inmunidad
- `POST /admin/players/:id/reset-vulnerability` — Quitar vulnerabilidad
- `GET /admin/players/:id/weekly-usage` — Uso semanal de slots de alta demanda

### Challenges (`/challenges`)
- `POST /challenges` — `{challenger_id, challenged_id}` crear desafío
- `GET /challenges` — Listar todos
- `GET /challenges/:id` — Detalle
- `POST /challenges/:id/accept` — `{player_id}` aceptar
- `POST /challenges/:id/reject` — `{player_id}` rechazar (W.O. automático)
- `POST /challenges/:id/result` — `{player_id, winner_id, score}` enviar resultado
- `POST /challenges/:id/schedule` — `{date}` programar fecha de partido

### Admin Challenges (`/admin/challenges`)
- `POST /admin/challenges/:id/resolve` — `{winnerId, score}` resolver disputa
- `DELETE /admin/challenges/:id` — Cancelar desafío
- `DELETE /admin/challenges/:id/force` — Forzar eliminación sin efectos secundarios
- `POST /admin/challenges/:id/extend` — `{hours, type: 'accept'|'play'}` extender plazo

### Master (`/master`)
- `GET /master` — Todas las temporadas
- `GET /master/:category` — Temporada por categoría
- `POST /master/generate` — Generar grupos y partidos de temporada
- `PATCH /master/matches/:id/schedule` — Programar fecha de partido
- `POST /master/matches/:id/player-result` — `{playerId, winnerId, score}` resultado del jugador
- `POST /master/matches/:id/result` — `{winnerId, score}` resultado oficial (admin)
- `POST /master/:seasonId/check-final` — Verificar y generar final si corresponde

### Reservations (`/reservations`)
- `GET /reservations` — Listar reservas (admin)
- `GET /reservations/my` — Mis reservas
- `GET /reservations/player/:playerId` — Reservas de un jugador
- `GET /reservations/courts` — Lista de canchas activas
- `GET /reservations/blocks` — Bloques de canchas
- `GET /reservations/availability` — `?date&courtId` disponibilidad de canchas
- `GET /reservations/season` — Configuración de temporada de reservas
- `GET /reservations/stats` — Estadísticas de reservas
- `POST /reservations` — Crear reserva
- `PATCH /reservations/:id` — Actualizar reserva
- `DELETE /reservations/:id` — Cancelar reserva

### Cron (`/cron`)
- `POST /cron/run` — Ejecutar manualmente el cron de expiración

### Test (`/test`)
- `POST /test/whatsapp` — `{phone, message}` probar WhatsApp (solo desarrollo)
- `GET /test/grupos` — Listar grupos de WhatsApp
- `POST /test/grupo` — Enviar mensaje a grupo de WhatsApp

---

## Reglas de Negocio (Escalerilla)

### Sistema de Niveles
13 niveles. Nivel 1 = posición 1, Nivel 13 = posiciones 44-48. Definido en `challenge-rules.service.ts`.

### Quién puede desafiar a quién
- **Mismo nivel:** Solo a jugadores con posición más alta (número menor)
- **Distinto nivel:** Solo puede desafiar 1 nivel hacia arriba
- **No puede desafiar si:** tiene desafío activo (pending/accepted), está inmune, está vulnerable, o tiene deuda (`has_debt`)

### Flujo de un desafío
1. Crear desafío → 24hrs para aceptar, 5 días para jugar
2. Si **acepta** → status `accepted`, pueden programar fecha (`/schedule`)
3. Si **rechaza** → challenger gana por W.O., intercambio de posiciones
4. Si **no responde en 24hrs** → cron expira, challenger gana por W.O.
5. Ambos envían resultado → si coinciden, se procesa automáticamente
6. Si no coinciden → status `disputed`, requiere resolución admin
7. Si solo uno envía resultado → después de 24hrs se auto-valida

### Movimiento de posiciones
- Ganador toma la posición del perdedor
- Todos los jugadores entre ambos bajan 1 posición (cascada)
- Se usa posición temporal 9999 para evitar conflictos de unicidad
- Cambios registrados en `ranking_history`

### Inmunidad y Vulnerabilidad
- **Ganador** (excepto posición #1): inmune 24 horas
- **Perdedor**: vulnerable hasta medianoche (no puede crear desafíos, sí recibirlos)

---

## Cron Jobs

`ChallengesCronService` con tres jobs:

| Job | Frecuencia | Acción |
|-----|-----------|--------|
| `handleExpiredChallenges` | Cada 6 horas | Expira no aceptados (W.O.), penaliza no jugados, auto-valida resultado único |
| `handleExpiredReservations` | Cada hora | Cancela reservas expiradas |
| `handleWeeklyHighDemandReset` | Lunes a medianoche | Resetea contadores de slots de alta demanda |

---

## Notificaciones

### Email (Resend.com)
- Desde: `escalerilla@clubdetenisgraneros.cl`
- Eventos: desafío creado, aceptado, rechazado, resultado confirmado

### WhatsApp (whatsapp-web.js)
- Requiere Chromium (instalado en Docker)
- Sesión persistida en `.wwebjs_auth/` (ignorada en git)
- Formato números: `56XXXXXXXXX@c.us`
- Controlado por `WHATSAPP_ENABLED` env var
- QR Code en primera autenticación

---

## Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Connection string PostgreSQL (Supabase pooler) |
| `JWT_SECRET` | Secreto para firmar tokens JWT (7 días expiración) |
| `RESEND_API_KEY` | API key de Resend.com para emails |
| `FRONTEND_URL` | URL del frontend (CORS) |
| `WORDPRESS_URL` | URL de WordPress del club |
| `WHATSAPP_ENABLED` | `true` para activar bot WhatsApp |
| `CLOUDINARY_CLOUD_NAME` | Cloud name de Cloudinary |
| `CLOUDINARY_API_KEY` | API key de Cloudinary |
| `CLOUDINARY_API_SECRET` | API secret de Cloudinary |
| `PORT` | Puerto del servidor (default: 3000) |

---

## Autenticación

- **JWT** con HS256, expiración 7 días
- **Payload:** `{sub: userId, is_admin: boolean}`
- **Header:** `Authorization: Bearer <token>`
- **Passwords:** bcryptjs con 10 salt rounds
- **WordPress Auth Guard:** implementado en `wordpress-auth.guard.ts` pero no activo en ninguna ruta

---

## Docker y Despliegue

- **Dockerfile:** Multi-stage build con `node:20-slim` + Chromium
- **CMD:** `npx prisma migrate deploy && node dist/main.js`
- **CORS:** `localhost:3001`, `escalerilla.clubdetenisgraneros.cl`, `FRONTEND_URL`
- **Plataforma:** Railway
- **nixpacks.toml:** Configuración alternativa para Nixpacks (Railway)
- **Procfile:** Definición de proceso web

---

## Seed

`prisma/seed.ts` crea un usuario admin por defecto:
- Username: `admin` / Password: `admin123`
- Player en posición `null` (fuera de la escalerilla)

---

## Scripts de Utilidad (`scripts/`)

Scripts TypeScript de un solo uso. Ejecutar con:
```bash
npx ts-node scripts/<nombre>.ts
```

| Script | Propósito |
|--------|-----------|
| `add-phones.ts` | Agregar teléfonos a jugadores existentes |
| `change-admin-password.ts` | Cambiar password del admin |
| `load-players.ts` | Carga masiva de jugadores |
| `fix-phone-numbers.ts` | Normalizar formato de teléfonos |
| `update-positions-*.ts` | Scripts de migración de posiciones |
| `export-current-positions.ts` | Exportar posiciones actuales |
| `current-positions.ts` | Snapshot de posiciones |
