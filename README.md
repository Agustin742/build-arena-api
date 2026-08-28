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

En desarrollo. La API está desplegada y respondiendo, con el modelo de datos migrado y el catálogo de habilidades cargado.

| Fase | Estado |
| --- | --- |
| 0 — Fundación | Completa |
| 1 — Persistencia | Completa |
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
| ORM y base de datos | Prisma 7 + PostgreSQL |
| Autenticación | `@nestjs/jwt` y `passport-jwt` (access + refresh) |
| Hasheo | `bcrypt` |
| Validación | `class-validator` y `class-transformer` |
| Seguridad | `helmet`, CORS, `@nestjs/throttler` |
| Tiempo real | WebSocket |
| Documentación | Scalar sobre OpenAPI |

---

## Instalación

Requiere Node 22 o superior, `pnpm` y una base PostgreSQL accesible.

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm start:dev
```

La API queda en `http://localhost:3000`.

`db:migrate` aplica las migraciones y genera el cliente de Prisma; `db:seed` carga el catálogo de habilidades. El seed es idempotente: correrlo de nuevo actualiza las filas existentes en lugar de duplicarlas.

> **Nunca uses la base de producción para desarrollar.** El proyecto usa dos bases distintas: un branch de desarrollo y uno de producción en Neon.

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
pnpm build          # genera el cliente de Prisma y compila a dist
pnpm start:prod     # ejecución de la compilación
pnpm lint           # eslint con corrección automática
pnpm test           # tests unitarios
pnpm test:e2e       # tests de extremo a extremo

pnpm db:migrate     # crea y aplica una migración en desarrollo
pnpm db:deploy      # aplica migraciones pendientes en producción
pnpm db:generate    # regenera el cliente de Prisma
pnpm db:seed        # carga el catálogo de habilidades
pnpm db:studio      # explorador visual de la base
```

`db:migrate` solo va en desarrollo: puede resetear la base. En producción corre `db:deploy`, que aplica lo que ya existe y nunca genera migraciones nuevas.

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
| [`docs/design/architecture.md`](./docs/design/architecture.md) | Capas, responsabilidades y qué se comparte |
| [`docs/design/implementation-plan.md`](./docs/design/implementation-plan.md) | Plan de fases y calendario |
| [`docs/design/git-workflow.md`](./docs/design/git-workflow.md) | Ramas, commits e integración |

---

## Deploy

La API corre en **Render** y la base en **Neon**, en dos servicios separados unidos por `DATABASE_URL`.

| Pieza | Proveedor | Por qué |
| --- | --- | --- |
| API | Render, plan gratuito | Despliegue automático desde `main` |
| PostgreSQL | Neon, plan gratuito | El PostgreSQL gratuito de Render expira a los 30 días y luego se borra |

```
URL          https://build-arena-api.onrender.com
Health       https://build-arena-api.onrender.com/health
```

Comandos configurados en el proveedor:

```bash
# Build Command
npm i -g pnpm@11.17.0 && pnpm install --frozen-lockfile && pnpm run build

# Start Command
pnpm db:deploy && pnpm db:seed && node dist/main
```

Las variables de entorno se cargan en el panel de Render, nunca en el repositorio.

> El plan gratuito apaga el servicio tras 15 minutos sin tráfico, y la primera petición después de eso tarda cerca de un minuto en despertar.
