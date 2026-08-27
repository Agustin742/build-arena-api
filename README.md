# Build Arena API

API de duelos por turnos entre builds, con el combate resuelto íntegramente en el servidor y transmitido en tiempo real por WebSocket.

Cuarto Proyecto Integrador — Integratec, agosto 2026.
Autor: **Agustín Tabarcache**

---

## La idea

Los jugadores arman *builds* repartiendo un presupuesto fijo de puntos entre cuatro atributos y eligiendo un kit de habilidades. Después se desafían y pelean por turnos.

Todo lo que decide el resultado —las tiradas de dados, el cálculo de daño, los críticos, de quién es el turno y si una build es legal— **se resuelve en el servidor**. El cliente solo declara intención: nunca calcula, nunca valida, nunca decide.

Esa es la premisa del proyecto: *si el cliente puede calcularlo, el cliente puede mentirlo.*

---

## Estado

En desarrollo. Fase 0 completa: proyecto inicializado y desplegable.

| Fase | Estado |
| --- | --- |
| 0 — Fundación | Completa |
| 1 — Persistencia | Pendiente |
| 2 — Autenticación y seguridad | Pendiente |
| 3 — Motor de combate | Pendiente |
| 4 — Builds y catálogo | Pendiente |
| 5 — Social y desafíos | Pendiente |
| 6 — Tiempo real | Pendiente |
| 7 — Rating y cierre | Pendiente |

---

## Tecnologías

| Rol | Herramienta |
| --- | --- |
| Framework | NestJS 11 + TypeScript |
| ORM y base de datos | Prisma + PostgreSQL |
| Autenticación | `@nestjs/jwt` y `passport-jwt` (access + refresh) |
| Hasheo | `bcrypt` |
| Validación | `class-validator` y `class-transformer` |
| Seguridad | `helmet`, CORS, `@nestjs/throttler` |
| Tiempo real | WebSocket |
| Documentación | Scalar sobre OpenAPI |

---

## Instalación

Requiere Node 22 o superior y `pnpm`.

```bash
pnpm install
cp .env.example .env
pnpm start:dev
```

La API queda en `http://localhost:3000`.

---

## Variables de entorno

Están declaradas sin valores en `.env.example`. `.env` nunca se commitea.

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto de escucha |
| `APP_VERSION` | Versión reportada por `/health` |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL |
| `JWT_SECRET` | Secreto de firma del access token |
| `JWT_ACCESS_EXPIRES_IN` | Vigencia del access token |
| `JWT_REFRESH_SECRET` | Secreto de firma del refresh token |
| `JWT_REFRESH_EXPIRES_IN` | Vigencia del refresh token |
| `CORS_ORIGIN` | Origen permitido por CORS |
| `THROTTLE_TTL` | Ventana del limitador de peticiones, en milisegundos |
| `THROTTLE_LIMIT` | Peticiones permitidas por ventana |

---

## Scripts

```bash
pnpm start:dev      # desarrollo con recarga
pnpm build          # compilación a dist
pnpm start:prod     # ejecución de la compilación
pnpm lint           # eslint con corrección automática
pnpm test           # tests unitarios
pnpm test:e2e       # tests de extremo a extremo
```

---

## Endpoints

La referencia interactiva se sirve en `/reference`, generada con Scalar a partir de OpenAPI.

| Método | Ruta | Descripción | Estado |
| --- | --- | --- | --- |
| `GET` | `/health` | Estado, versión y tiempo de actividad | Disponible |
| `POST` | `/auth/register` | Crea un usuario | Pendiente |
| `POST` | `/auth/login` | Devuelve access y refresh token | Pendiente |
| `POST` | `/auth/refresh` | Renueva el access token | Pendiente |
| `POST` | `/auth/logout` | Invalida el refresh token | Pendiente |
| `GET` | `/auth/me` | Perfil del usuario autenticado | Pendiente |
| `GET` | `/skills` | Catálogo de habilidades | Pendiente |
| `GET/POST/PATCH/DELETE` | `/builds` | Gestión de builds propias | Pendiente |
| `GET/POST/PATCH/DELETE` | `/friends` | Solicitudes y lista de amigos | Pendiente |
| `GET/POST/PATCH/DELETE` | `/battles` | Desafíos, combates y replays | Pendiente |
| `GET` | `/leaderboard` | Ranking global | Pendiente |

---

## Documentación del proyecto

| Documento | Contenido |
| --- | --- |
| [`docs/brief`](./docs/brief/proyecto-4-integrartec-2026.md) | Consigna original de la cátedra |
| [`docs/design/overview.md`](./docs/design/overview.md) | Diseño general, decisiones y modelo de datos |
| [`docs/design/implementation-plan.md`](./docs/design/implementation-plan.md) | Plan de fases y calendario |
| [`docs/design/git-workflow.md`](./docs/design/git-workflow.md) | Ramas, commits e integración |

---

## Deploy

Pendiente de definir el proveedor.
