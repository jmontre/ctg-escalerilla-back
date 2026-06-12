# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Resumen del Proyecto

Backend del **Club de Tenis Graneros (CTG)**. Gestiona la Escalerilla (ranking tipo ladder), desafíos entre jugadores, torneo Master, reservas de canchas (con cupos de alta demanda, cobro de luz y bloqueos), notificaciones WhatsApp/email y administración.

**Stack:** NestJS 11 + TypeScript + PostgreSQL + Prisma ORM 5
**Despliegue:** Railway (Supabase como DB) — ver sección Despliegue
**Puerto:** 3000 (configurable vía `PORT`)

Existe también `ONBOARDING.md` (guía para colaboradores que vienen de PHP/WordPress). Ojo: menciona `.env.development`, pero el nombre real del archivo es `.env.dev`. El `README.md` es el boilerplate de NestJS, sin información del proyecto.

---

## Comandos

```bash
npm run start:dev          # Desarrollo con watch mode
npm run build              # Compilar (usa --noEmitOnError false a propósito)
npm run start:prod         # Producción: node dist/main.js
npm run lint               # ESLint + auto-fix
npm run test               # Jest (tests en src/**/*.spec.ts — solo hay 2: app.controller y common/dates)
npm run test:e2e           # Tests end-to-end

# Un test específico
npx jest src/common/dates.spec.ts

# Prisma
npx prisma generate        # Regenerar Prisma Client tras cambios en schema
npx prisma studio          # UI visual de la DB
npx prisma db seed         # Ejecutar seed (crea admin/admin123)
# ⚠️ Antes de usar migrate dev/deploy, leer la sección "Schema y Migraciones (DRIFT)"

# Scripts de utilidad (cargas masivas, fixes de posiciones/teléfonos)
npx ts-node scripts/<nombre>.ts
```

Archivos de entorno: `.env.dev` (dev, **no** `.env.development`) y `.env.production` (cuando `NODE_ENV=production`). Ver `src/app.module.ts`.

---

## Arquitectura

### Módulos NestJS

```
AppModule
├── ConfigModule (global, .env.production | .env.dev según NODE_ENV)
├── ScheduleModule (cron jobs)
├── PrismaModule (global, expone PrismaService)
├── CommonModule (global, expone AppLogger)
├── AuthModule (JWT 7 días)
├── PlayersModule (PlayersController + AdminPlayersController)
├── ChallengesModule (ChallengesController + AdminChallengesController)
├── CronModule (ChallengesCronService con 3 cron jobs)
├── MasterModule
└── ReservationsModule
```

`TestController` está registrado directamente en `AppModule` (sin módulo propio). Expone endpoints de prueba de WhatsApp (`POST /test/whatsapp`, `GET /test/grupos`, `POST /test/grupo`).

### Mapa de Endpoints (prefijos)

| Prefijo | Controller | Notas |
|---------|-----------|-------|
| `/auth` | register, login, me, forgot-password, reset-password | reset por WhatsApp |
| `/players` | lista pública (excluye admins), perfil propio (`PUT /me`), avatar | |
| `/admin/players` | CRUD jugadores, move, reset-immunity/vulnerability, weekly-usage | |
| `/challenges` | create, accept, reject, result, schedule | |
| `/admin/challenges` | resolve, cancel, force delete, extend deadline | |
| `/master` | generate, schedule, player-result, result (admin), check-final | |
| `/reservations` | availability, courts, season, blocks, stats, light-config/summary, my, CRUD | |
| `/cron` | `POST /cron/run` (trigger manual) | |
| `/test` | pruebas WhatsApp | sin auth |

### Patrón Singleton para Servicios Externos

`whatsappService` y `emailService` son instancias exportadas a nivel de módulo, **no providers NestJS**:

```ts
// notifications/whatsapp.service.ts
export const whatsappService = new WhatsAppService();
// notifications/email.service.ts
export const emailService = new EmailService();
```

Se importan directamente. Es intencional: WhatsApp mantiene una sesión Puppeteer/Chromium persistente durante toda la vida del proceso (se inicializa en `main.ts` antes de `app.listen`).

### Autenticación sin Guards NestJS

Las rutas **no usan `@UseGuards()`**. La verificación JWT se hace manualmente en cada controller, extrayendo `Authorization: Bearer <token>`:

```ts
private getUserId(auth: string): string {
  const payload = this.jwtService.verify(auth.split(' ')[1]);
  return payload.sub;
}
```

El payload JWT contiene `{ sub: userId, is_admin: boolean, admin_role: string | null }`. `admin_role` ∈ `null | "escalerilla" | "reservas" | "all"`. Las rutas admin **no tienen protección por guard** — confían en que el frontend solo muestra esas opciones a admins.

**Código muerto:** `src/auth/wordpress-auth.{service,guard}.ts` y `wp-user.decorator.ts` (auth por cookies de WordPress contra `clubdetenisgraneros.cl/wp-json/ctg/v1/me`) no están registrados en ningún módulo ni usados por ningún controller. No basarse en ellos.

### Logging

- `AppLogger` (`common/app.logger.ts`, global vía `CommonModule`): registra eventos de negocio (logins, desafíos, reservas, cambios de ranking) con formato emoji + pipe.
- `ChileLogger` (`common/chile-logger.ts`): extiende `ConsoleLogger` de Nest para timestamps en hora Chile; se pasa en `NestFactory.create` en `main.ts`.

---

## Fechas y Timezone (America/Santiago)

**Toda la lógica de fechas está centralizada en `src/common/dates.ts`** (con tests en `dates.spec.ts`). No reimplementar parsing de fechas inline; importar de ahí:

| Función | Uso |
|---------|-----|
| `nowInChile()` | Hora Chile como Date "naive" (reloj chileno almacenado como si fuera UTC). Solo para comparar con otros valores naive (ej: `date` + `time_slot` de reservas). **No** pasarla a `toChileDateStr()`. |
| `toChileDateStr(date)` | Timestamp UTC real → `YYYY-MM-DD` en Chile (usa locale `en-CA`). **No** usar con fechas naive. |
| `currentChileDate()` | Hoy en Chile como `YYYY-MM-DD`. |
| `chileWeekBoundsFromStr(str)` | Rango lunes-domingo a partir de un `YYYY-MM-DD`. Base del cupo semanal de alta demanda. |
| `monthBoundsUTC(year, month0)` | Inicio/fin de mes en UTC puro para queries sobre campos `@db.Date`. |

Conceptos clave:
- Los campos `@db.Date` de Prisma (ej: `Reservation.date`) se almacenan como **UTC midnight**. Para comparar contra "ahora", se reconstruye un Date naive (`date.toISOString().split('T')[0]` + `T${time_slot}:00`) y se compara con `nowInChile()`.
- Mezclar fechas naive con UTC reales es el bug clásico de este repo — leer los docstrings de `dates.ts` antes de tocar fechas.
- El servidor (Railway/Docker) corre en UTC; Chile es UTC-3/UTC-4 según horario de verano.

---

## Invariantes Críticos

### Posiciones en la Escalerilla

- `position = null` → jugador fuera de la escalerilla (sin ranking activo)
- `position = 0` → admins (excluidos de la lista pública vía filtro `is_admin` en `players.service.ts`)
- Posiciones son enteros únicos ≥ 1 para jugadores activos (unicidad por convención, **no** hay unique constraint en el schema)
- **Posición temporal 9999**: pivot al mover jugadores. El orden de updates importa (siempre descendente primero).

### Algoritmo de Corrimiento (`challenge-rules.service.ts` → `processWin`)

1. Si el ganador ya está adelante del perdedor → no hay cambios
2. Guardar `RankingHistory` de todos los afectados ANTES de mover
3. Mover ganador a posición 9999 (temporal)
4. Bajar afectados 1 posición (en orden descendente para evitar colisiones)
5. Colocar ganador en la posición del perdedor

No usa transacción Prisma — opera en secuencia para evitar deadlocks.

### Transiciones de Estado Atómicas

Para transiciones de estado con riesgo de doble procesamiento (doble click, colisión con cron), usar el patrón claim con `updateMany` condicionado:

```ts
const claimed = await this.prisma.challenge.updateMany({
  where: { id, status: 'pending' },
  data:  { status: 'rejected', resolved_at: new Date() },
});
if (claimed.count === 0) throw new BadRequestException('Ya no está pendiente');
```

Implementado en `ChallengesService.reject`; aplicar el mismo patrón si se tocan otras transiciones.

---

## Reglas de Negocio: Escalerilla

### Sistema de Niveles (13 niveles, `getLevel` en challenge-rules.service.ts)

```
Nivel 1: pos 1          Nivel 6: pos 16-19      Nivel 11: pos 37-39
Nivel 2: pos 2-4        Nivel 7: pos 20-24      Nivel 12: pos 40-43
Nivel 3: pos 5-8        Nivel 8: pos 25-27      Nivel 13: pos 44-48
Nivel 4: pos 9-12       Nivel 9: pos 28-31
Nivel 5: pos 13-15      Nivel 10: pos 32-36
```

Un jugador puede desafiar: **su mismo nivel** (solo a quien esté adelante) O **1 nivel arriba**. Además: ninguno de los dos puede estar "ocupado" (desafío pending/accepted), el desafiado no puede estar inmune, el desafiante no puede estar vulnerable.

### Estados de un Desafío

```
pending → accepted → completed
                  → disputed (resultados no coinciden, admin resuelve)
pending → rejected (challenger gana W.O.)
pending → expired_not_accepted (cron, 24h sin respuesta, challenger gana W.O.)
accepted → expired_not_played (cron, 5 días sin jugar, se penaliza al challenger)
(admin) → cancelled
```

Plazos: `accept_deadline` = creación + 24h; `play_deadline` = creación + 5 días.

### Doble Confirmación de Resultados

- Si un jugador envía resultado y el otro no en **4 horas** (`HOURS_TO_CONFIRM_RESULT` en el cron), se auto-valida el existente (referencia: `first_result_at ?? accepted_at`, marca `results_match: false`).
- Ambos coinciden → procesa automáticamente (`results_match: true`).
- Difieren → `disputed`, requiere admin (`POST /admin/challenges/:id/resolve`).

### Penalización por No Jugar (`expired_not_played`)

Solo se penaliza al **challenger** (baja 1 posición; el de abajo sube 1). No es W.O.

### Post-Partido

- Ganador: inmune 24h (excepto si queda en posición #1)
- Perdedor: vulnerable 24h — puede **recibir** desafíos pero no **crear**

### Fijar Fecha de Desafío (`scheduleMatch`)

Crea una **reserva automática** (`is_challenge: true`, `challenge_id`) que: valida cancha/slot libre, valida que el jugador no tenga otra reserva activa (el filtro usa `OR` explícito porque `NOT` sobre campo nullable excluye `NULL` en SQL — ver comentario en código), descuenta cupo de alta demanda, y cancela la reserva anterior del mismo desafío al reprogramar. Al completarse el partido o cancelar la reserva, se libera/desvincula (`scheduled_date: null`).

---

## Reglas de Negocio: Reservas

### Horarios

Slots del día (90 min c/u): `06:00, 07:45, 09:30, 11:15, 13:00, 14:45, 16:30, 18:15, 20:00, 21:45`. El cron completa reservas 90 minutos después del inicio.

### Slots de Alta Demanda — definidos en DOS lugares (mantener sincronizados)

- `src/challenges/challenges.service.ts` → constante `HIGH_DEMAND`
- `src/reservations/reservations.service.ts` → constante `HIGH_DEMAND_SLOTS`

```ts
{ verano: ['07:45', '09:30', '18:15', '20:00'],
  invierno: ['09:30', '11:15', '16:30', '18:15'] }
```

La temporada activa se lee de `SystemConfig` key `"season"` (`"verano"` | `"invierno"`, default `"verano"`).

### Límites por tipo de socio (`member_type`)

| Tipo | Alta demanda/semana | Reservas activas | Otras reglas |
|------|--------------------|------------------|--------------|
| `socio` | 2 + nº hijos + `extra_high_demand_slots` (cupo familiar) | 1 | puede traer visita ($3.000 default `guest_fee`) |
| `hijo_socio` | 1 (contador individual, además del familiar) | 1 | |
| `profe` | sin límite | sin límite | usa `school_name` (de `Player.school_names`), sin visita, sin notificación WhatsApp |

- `has_debt: true` → no puede crear reservas.
- **Cancelación tardía** (< 4.5 horas = 3 turnos antes): se permite, pero el turno cuenta como usado. Se detecta por el string exacto `cancel_reason = 'Cancelación tardía - turno descontado'` (las queries de cupo filtran por ese literal — no cambiarlo).
- **Semana = lunes-domingo Chile** (`chileWeekBoundsFromStr`). El reset del lunes no actualiza nada en DB: el límite se recalcula dinámicamente contra el rango de la semana.
- **Modificar reserva** (`PATCH /reservations/:id/modify`): cancela la antigua (`cancel_reason: 'Modificada por jugador'`, no cuenta como tardía), crea la nueva, y si falla **restaura la antigua** (rollback manual).

### Bloqueos y Cobro de Luz

- `CourtBlock`: bloqueos admin por cancha/fecha; `time_slot = null` bloquea el día completo.
- `LightChargeConfig`: por fecha, define slots con cobro de luz y monto (`amount_per_slot`, default $3.000). `GET /reservations/light-summary?month=YYYY-MM` calcula recaudación (excluye desafíos).

---

## Reglas de Negocio: Torneo Master

Categorías A/B/C/D = rangos de posición [1-12, 13-24, 25-36, 37-48]. Toma los 8 primeros del rango (falla si hay menos). Distribución serpentina:
- Grupo A: jugadores 1°, 4°, 5°, 8° del rango
- Grupo B: jugadores 2°, 3°, 6°, 7° del rango

Flujo automático: round robin → semifinales (al completar todos los partidos de grupo; cruces 1A-2B / 1B-2A) → final (al completar ambas semis). Estados de season: `pending → active → semifinals → final → completed`.

> ⚠️ **Bug latente:** `MasterService.submitPlayerResult` escribe `player1_result`/`player2_result` con `as any`, pero esos campos **no existen** ni en `schema.prisma`, ni en migraciones, ni en el Prisma Client generado. La doble confirmación de resultados del Master lanzaría `PrismaClientValidationError` en runtime. El flujo admin (`POST /master/matches/:id/result`) sí funciona. Si se toca el Master, resolver esto primero (agregar los campos al schema o eliminar el flujo).

---

## Schema y Migraciones (DRIFT — leer antes de tocar Prisma)

**Las migraciones en `prisma/migrations/` NO reflejan el schema actual.** Columnas y tablas presentes en `schema.prisma` (y en la DB de Supabase) que no aparecen en ninguna migración: `court_blocks` (tabla completa), `Player.extra_high_demand_slots`, `Player.school_names`, `Reservation.partner_name`, `Reservation.is_challenge`, `Reservation.challenge_id`, `Reservation.school_name`, entre otras. Fueron aplicadas con `prisma db push` o SQL manual.

Consecuencias prácticas:
- `npx prisma migrate dev` detectará drift y puede proponer **resetear la DB** — no aceptar a ciegas.
- Una DB creada desde cero con `migrate deploy` **no** coincidirá con el schema; usar `prisma db push` o el snapshot del schema.
- El Docker CMD ejecuta `migrate deploy` al iniciar: contra la DB existente es no-op de migraciones viejas, no "arregla" el drift.
- `schema.prisma.backup` en `prisma/` es un respaldo manual, ignorarlo.

### Modelos con `prisma as any`

- `(this.prisma as any).courtBlock` en `reservations.service.ts` — el tipo se regenera con `npx prisma generate` y el cast se podría eliminar.
- `(this.prisma as any).reservation` en `challenges.service.ts` — por campos añadidos post-tipos (`is_challenge`, `challenge_id`, `partner_name`).
- `lightChargeConfig` ya se usa tipado (sin cast).
- **El `build` ignora errores TS** (`--noEmitOnError false`) precisamente por estos casts. No agregar más `as any` sin justificación.

---

## Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Connection string del pooler de Supabase (pgBouncer) |
| `DIRECT_URL` | Connection string directo de Supabase (requerido para migraciones) |
| `JWT_SECRET` | Secreto JWT (7 días de expiración; tiene fallback inseguro hardcodeado en `auth.module.ts`) |
| `RESEND_API_KEY` | API key de Resend.com (emails desde `escalerilla@clubdetenisgraneros.cl`) |
| `FRONTEND_URL` | URL del frontend (CORS + links en notificaciones) |
| `WHATSAPP_ENABLED` | `"true"` para activar WhatsApp (requiere Chromium) |
| `WHATSAPP_GROUP_ID` | ID del grupo de WhatsApp (obtener via `GET /test/grupos`) |
| `WHATSAPP_SESSION_PATH` | Path para la sesión (default: `.wwebjs_auth`) |
| `PUPPETEER_EXECUTABLE_PATH` | Path a Chromium (en Docker: `/usr/bin/chromium`) |
| `WORDPRESS_URL` | Solo usado por el código muerto de auth WordPress |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary |
| `PORT` | Puerto (default: 3000) |

---

## Despliegue

Hay **dos configuraciones de build conviviendo** (verificar en Railway cuál está activa antes de tocar):
- `Dockerfile`: `node:20-slim` + Chromium via apt. CMD: `npx prisma migrate deploy && node dist/main.js`. Es la referencia más reciente (commits "fix: dockerfile limpio").
- `railway.json` + `nixpacks.toml` + `Procfile`: builder NIXPACKS con `npm run start:prod` (nixpacks aún declara `nodejs_18`, sin Chromium → sin WhatsApp).

**Supabase**: `DATABASE_URL` (pooler) + `DIRECT_URL` (directa, para migraciones).

**CORS** (`main.ts`): permite `localhost:3000/3001`, `reservas.` y `escalerilla.clubdetenisgraneros.cl`, `FRONTEND_URL`, requests sin origin, y cualquier `*.vercel.app` (previews).

---

## Cron Jobs (`cron/challenges-cron.service.ts`)

| Job | Schedule | Qué hace |
|-----|----------|----------|
| `handleExpiredChallenges` | `0 0,6,12,18 * * *` | Expira no aceptados (W.O.), penaliza no jugados, auto-valida resultado único (4h) |
| `handleExpiredReservations` | `0 * * * *` | Marca como `completed` reservas cuyo fin (inicio + 90 min) ya pasó en hora Chile |
| `handleWeeklyHighDemandReset` | `0 0 * * 1` | Solo loguea el reset (el reset es implícito por el rango de fechas de la query) |

Trigger manual: `POST /cron/run` (ejecuta los dos primeros).

---

## Notificaciones

**WhatsApp** (whatsapp-web.js + Puppeteer):
- Formato de números chilenos: `569XXXXXXXX@c.us` (el servicio agrega `56` automáticamente)
- Nunca bloquean el flujo principal — siempre en `try/catch`; si falla, se loguea el mensaje por consola
- `sendGroupMessage(groupId, msg)` → grupo del club; `sleep(500-600ms)` entre mensajes para evitar ban
- Al iniciar limpia locks de Chromium (`SingletonLock`, etc.) de la sesión

**Email** (Resend): solo para notificaciones de desafío creado/aceptado; el reset de contraseña va por WhatsApp.

---

## Avatares (Cloudinary)

- Carpeta `ctg-avatars/`, public ID `player-{playerId}` (overwrite al subir)
- Transformación: 400x400, crop face, quality auto. Input: base64 (límite 10MB en bodyParser, configurado en `main.ts`)

---

## Seed

`npx prisma db seed` crea usuario `admin` / `admin123` / `admin@ctg.cl` con `is_admin: true` y player con `position = 0` (excluido de la lista pública). Falla si ya existe (no es idempotente).

---

## Gotchas Importantes

- **`ChallengeRulesService`** se provee en `ChallengesModule` Y en `PlayersModule` (instanciado en ambos para evitar circular deps).
- **`admin-challenges.service.ts`** y **`admin-players.service.ts` (`movePlayer`)** usan su propia lógica de movimiento de posiciones con `updateMany` increment/decrement (no delegan a `ChallengeRulesService`) — verificar consistencia al modificar.
- **`cancelChallenge` admin** revierte wins/losses pero **NO revierte** cambios de ranking (documentado en su respuesta).
- **`getWeeklyHighDemandUsage`** en admin-players usa cálculo de semana propio en hora del servidor y **no cuenta cancelaciones tardías** — inconsistente con `checkHighDemandLimit` de reservations (que sí las cuenta y usa semana Chile).
- **Posición al registrar**: `AuthService.register` asigna `lastPlayer.position + 1` automáticamente. `AdminPlayersService.createPlayer` deja `position = null` si no se especifica.
- **Master**: doble confirmación rota por campos inexistentes (ver sección Master).
- Existe un directorio basura `node_modules 2/` en la raíz (no versionado).
