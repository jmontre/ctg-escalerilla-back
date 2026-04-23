# 🎾 BASELINE — Onboarding del Colaborador

Bienvenido al proyecto. Esta guía te explica todo lo que necesitas para empezar a trabajar.

---

## Stack Tecnológico

Venimos de PHP/WordPress, así que hay cosas nuevas. No te preocupes, el flujo es similar pero más moderno.

| Concepto WordPress | Equivalente aquí |
|---|---|
| PHP | TypeScript |
| WordPress theme | Next.js (frontend) |
| WordPress plugin / API | NestJS (backend) |
| MySQL + phpMyAdmin | PostgreSQL + Prisma |
| FTP deploy | Git push → deploy automático |
| ACF / WP Admin | Panel admin propio en la app |

### Frontend — Next.js 16 + TypeScript + Tailwind
- **Next.js** es como un framework de React para hacer páginas web. Piénsalo como el "tema" de WordPress pero en JavaScript moderno.
- **TypeScript** es JavaScript con tipos — te avisa de errores antes de ejecutar el código.
- **Tailwind** es CSS pero con clases utilitarias directamente en el HTML. En vez de escribir CSS separado, escribes `className="text-lg font-bold text-green-500"` directo en el componente.

### Backend — NestJS + Prisma + PostgreSQL
- **NestJS** es el framework del servidor. Como WordPress hace de CMS, NestJS hace de API REST.
- **Prisma** es el ORM — reemplaza las queries SQL directas. En vez de `SELECT * FROM players`, escribes `prisma.player.findMany()`.
- **PostgreSQL** es la base de datos. Similar a MySQL que ya conoces.

---

## Requisitos Previos

Instala esto antes de empezar:

```bash
# Node.js (versión 18 o superior)
# Descarga desde https://nodejs.org

# Verifica instalación
node --version  # debe mostrar v18+
npm --version

# Git
git --version
```

---

## Configuración Inicial

### 1. Clonar los repositorios

```bash
# Frontend
git clone https://github.com/jmontre/CTG-ESCALERILLA-FRONT.git
cd CTG-ESCALERILLA-FRONT
npm install

# Backend
git clone https://github.com/jmontre/CTG-ESCALERILLA-BACK.git
cd CTG-ESCALERILLA-BACK
npm install
```

### 2. Crear archivos de variables de entorno

**Frontend** — crea `.env.development` en la raíz del proyecto frontend:
```env
NEXT_PUBLIC_API_URL=https://ctg-escalerilla-back-staging.up.railway.app
```

**Backend** — crea `.env.development` en la raíz del proyecto backend:
```env
DATABASE_URL=postgresql://...url-staging...
FRONTEND_URL=https://ctg-escalerilla-front-xxx.vercel.app
WHATSAPP_ENABLED=false
JWT_SECRET=...pedir a Javier...
```

> ⚠️ Nunca subas estos archivos al repo. Ya están en `.gitignore`.

### 3. Generar el cliente de Prisma

```bash
cd CTG-ESCALERILLA-BACK
npx prisma generate
```

### 4. Correr en local

```bash
# Frontend (en una terminal)
cd CTG-ESCALERILLA-FRONT
npm run dev
# Abre http://localhost:3000

# Backend (en otra terminal)
cd CTG-ESCALERILLA-BACK
npm run start:dev
# Corre en http://localhost:3001
```

---

## Estructura de los Proyectos

### Frontend
```
CTG-ESCALERILLA-FRONT/
├── app/                    # Páginas (cada carpeta = una ruta)
│   ├── page.tsx           # Homepage "/"
│   ├── reservar/          # "/reservar"
│   ├── escalerilla/       # "/escalerilla"
│   ├── fixture/           # "/fixture" (mis desafíos)
│   ├── fixture-reservas/  # "/fixture-reservas" (disponibilidad)
│   ├── mis-reservas/      # "/mis-reservas"
│   ├── admin/             # "/admin" (panel escalerilla)
│   └── admin-reservas/    # "/admin-reservas" (panel reservas)
├── components/            # Componentes reutilizables
│   ├── Header.tsx
│   ├── LoginModal.tsx
│   ├── ScheduleDateModal.tsx
│   └── admin/
├── hooks/                 # Custom hooks (useAuth, etc.)
├── lib/
│   └── api.ts            # Todas las llamadas al backend
└── types/
    └── index.ts          # Tipos TypeScript compartidos
```

### Backend
```
CTG-ESCALERILLA-BACK/
├── src/
│   ├── auth/             # Login, registro, JWT
│   ├── players/          # Jugadores y admin de jugadores
│   ├── challenges/       # Desafíos y reglas de escalerilla
│   ├── reservations/     # Reservas de canchas
│   ├── master/           # Torneos Master
│   ├── cron/             # Jobs automáticos (expirar desafíos, completar reservas)
│   ├── notifications/    # WhatsApp y Email
│   ├── common/           # Logger centralizado
│   └── prisma/           # Conexión a la DB
└── prisma/
    └── schema.prisma     # Definición de tablas
```

---

## Flujo de Trabajo con Git

### Regla de oro: NUNCA pushear directo a `main` ni a `dev`

```
main  ← solo via PR desde dev (producción)
dev   ← solo via PR desde tu rama (staging)
tu-rama ← aquí trabajas tú
```

### Paso a paso para cada tarea

```bash
# 1. Siempre partir desde dev actualizado
git checkout dev
git pull origin dev

# 2. Crear tu rama con nombre descriptivo
git checkout -b feature/nombre-de-la-feature
# o
git checkout -b fix/nombre-del-bug

# Ejemplos de nombres:
# feature/bloqueo-canchas-admin
# fix/timezone-reservas
# feature/perfil-usuario

# 3. Trabajar, hacer commits frecuentes
git add .
git commit -m "descripción clara de qué hiciste"

# 4. Subir tu rama
git push origin feature/nombre-de-la-feature

# 5. Ir a GitHub y abrir Pull Request hacia dev
# GitHub te muestra un botón "Compare & pull request" automáticamente
```

### Convención de commits

```bash
# Nuevas features
git commit -m "feat: agregar bloqueo de canchas por horario"

# Fixes
git commit -m "fix: corregir timezone en reservas de desafío"

# Cambios visuales
git commit -m "ui: mejorar diseño del selector de horarios"

# Refactoring
git commit -m "refactor: separar lógica de alta demanda en función"
```

---

## Flujo de Trabajo con Trello

Cada ticket en Trello tiene un estado:
- **Por hacer** — tarea asignada, no iniciada
- **En progreso** — estás trabajando en ella
- **En revisión** — abriste el PR, esperando aprobación
- **Listo** — PR mergeado a dev

Cuando tomes una tarea:
1. Muévela a **En progreso**
2. Crea tu rama con el nombre relacionado a la tarea
3. Cuando abras el PR, pon el link del ticket en la descripción del PR
4. Muévela a **En revisión**

---

## Entornos

| Entorno | Frontend | Backend | Base de Datos |
|---|---|---|---|
| **Local** | localhost:3000 | localhost:3001 | DB staging |
| **Staging** | URL preview Vercel (rama dev) | Railway staging | DB staging |
| **Producción** | reservas.clubdetenisgraneros.cl | Railway prod | DB prod |

> ⚠️ Nunca toques datos de producción directamente. Todo se prueba en staging primero.

---

## Conceptos Clave del Negocio

### Sistema de Reservas
- 2 canchas, 10 slots por día (06:00 a 21:45, cada 1h30)
- Socios: máximo 1 reserva activa, límite de turnos de "alta demanda" por semana
- Profes: sin límite
- Slots de alta demanda (verano): 07:45, 09:30, 18:15, 20:00 — marcados con 🔥
- El cron completa reservas automáticamente cuando pasa la hora de término

### Escalerilla (Ranking)
- Jugadores ordenados por posición numérica
- Para subir: desafías a alguien del nivel inmediatamente superior
- Si ganas: te corres a su posición, todos los de en medio bajan 1
- Hay inmunidad (24h después de ganar) y vulnerabilidad (hasta medianoche después de perder)
- Desafíos tienen 24h para ser aceptados y 5 días para jugarse

### Roles de usuario
- **Socio normal** — reserva y desafía
- **Hijo socio** — menos cupos de alta demanda
- **Profe** — sin límites, asociado a escuelas
- **Admin escalerilla** — gestiona ranking
- **Admin reservas** — gestiona canchas
- **Super Admin** — todo

---

## Comandos Útiles

```bash
# Frontend
npm run dev          # desarrollo local
npm run build        # build de producción (para verificar errores)
npm run lint         # revisar errores de código

# Backend
npm run start:dev    # desarrollo local con hot reload
npm run build        # compilar TypeScript
npx prisma studio    # interfaz visual de la DB (como phpMyAdmin)
npx prisma generate  # regenerar cliente después de cambiar schema
```

---

## Preguntas Frecuentes

**¿Cómo veo la base de datos?**
```bash
cd CTG-ESCALERILLA-BACK
npx prisma studio
# Abre una interfaz visual en el navegador
```

**¿Cómo agrego una nueva página?**
En Next.js es automático por carpetas. Crea `app/nueva-pagina/page.tsx` y ya existe la ruta `/nueva-pagina`.

**¿Cómo llamo al backend desde el frontend?**
Todo está en `lib/api.ts`. Agrega tu función ahí siguiendo el mismo patrón de las existentes.

**¿Cómo agrego un nuevo endpoint en el backend?**
1. Agrega el método en el `.service.ts` correspondiente
2. Agrega la ruta en el `.controller.ts` correspondiente
3. No necesitas reiniciar — hot reload lo hace automático

**¿Puedo pushear directo a dev o main?**
No. Están protegidas. Todo entra por PR.

**¿Qué hago si rompí algo?**
No pasa nada — para eso está staging. Avisa a Javier y lo resolvemos juntos.

---

## Contacto

Cualquier duda técnica o de negocio, consulta a Javier antes de asumir cómo funciona algo. Mejor preguntar que arreglar después.
