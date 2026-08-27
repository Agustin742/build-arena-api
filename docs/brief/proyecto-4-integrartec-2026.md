# Cuarto Proyecto Integrador — Backend con NestJS

> **Consigna para alumnos** · Documento de entrega académica
> NestJS · TypeScript · Prisma · PostgreSQL · Auth · Git/GitHub · Deploy
> Agosto 2026

---

## Consigna de desarrollo para estudiantes

El objetivo de este proyecto es dejar de simular persistencia con `localStorage` y construir una API real para la idea que trabajaste durante el **Segundo Proyecto Integrador**. El modelo de datos, las reglas de negocio y la lógica derivada que hoy viven en el cliente (Zustand) pasan a vivir en un backend propio, con base de datos, autenticación de usuarios y seguridad reales.

No se trata de reescribir el frontend: se trata de darle a esa idea una capa de servidor seria, con usuarios que se registran e inician sesión, y con los datos protegidos y persistidos en una base de datos de verdad en lugar del navegador.

> Este trabajo prioriza **autenticación, seguridad y modelado de datos con un ORM**. El frontend (React/Vite o la migración a Next.js de los proyectos anteriores) queda **fuera de alcance**: el entregable es la API. Se desarrolla durante agosto de 2026.

> **Requisito de cursada:** la API debe estar terminada y funcionando **ANTES** de rendir el examen oral, a fin de mes. No se puede rendir el oral con el proyecto incompleto o sin deploy funcional.

---

## Resumen ejecutivo

| Aspecto | Requisito |
| --- | --- |
| Modalidad | Individual |
| Duración | Aproximadamente 1 mes (agosto 2026) |
| Punto de partida | Modelo de datos y reglas de la idea propia (ya no en localStorage) |
| Tecnologías | NestJS 11 + TypeScript + Prisma + PostgreSQL |
| Autenticación | Registro, login, refresh y logout con JWT (access + refresh) |
| Contraseñas | Hasheadas con bcrypt, nunca en texto plano ni en las respuestas |
| Seguridad | Helmet, CORS, rate limiting (throttler), validación global de DTOs |
| Examen oral | La API debe estar terminada para poder rendir el oral, a fin de mes |
| GitHub | Repositorio nuevo, historial de commits propio y claro |
| Entrega | Link al repositorio, link al deploy de la API y documentación de endpoints |

---

## Índice

1. [Modalidad de trabajo](#1-modalidad-de-trabajo)
2. [Entrega final](#2-entrega-final)
3. [Stack común y tecnologías](#3-stack-común-y-tecnologías)
4. [Del localStorage a la base de datos](#4-del-localstorage-a-la-base-de-datos)
5. [Autenticación y seguridad](#5-autenticación-y-seguridad)
6. [Git, GitHub y deploy](#6-git-github-y-deploy)
7. [README y documentación de la API](#7-readme-y-documentación-de-la-api)
8. [Calidad](#8-calidad)
9. [Criterios de aprobación](#9-criterios-de-aprobación)
10. [Observación final](#10-observación-final)

---

## 1. Modalidad de trabajo

El proyecto es **individual**, sobre la **MISMA idea** que trabajaste en el Segundo Proyecto Integrador (no la que te tocó migrar a Next.js en el tercero, que era de otro grupo). La duración estimada es de aproximadamente un mes, durante agosto de 2026.

> La API terminada es condición para rendir el examen oral de fin de mes. Llegar al oral sin la API funcionando y desplegada implica **no poder rendir**.

Al ser individual, vos decidís el orden de trabajo: se recomienda arrancar por el **esquema de datos** y la **autenticación** antes de avanzar con el resto de los endpoints, ya que todo lo demás depende de esa base.

---

## 2. Entrega final

Deberás entregar:

- Link al repositorio de GitHub con la API.
- Link al deploy funcional de la API (Railway, Render u otro servicio equivalente).
- Documentación de los endpoints disponibles (en el README o vía Swagger).

Dentro del repositorio deberán estar incluidos:

- Código completo de la API (NestJS + TypeScript + Prisma).
- Archivo `README.md`.
- Archivo `schema.prisma` con el modelo de datos de tu idea.
- Archivo `.env.example` con las variables necesarias (sin secretos reales).
- Historial de commits claro y progresivo.

---

## 3. Stack común y tecnologías

Punto de partida para todos los proyectos: **NestJS 11 + TypeScript + Prisma + PostgreSQL**. El objetivo es una API prolija y segura para un proyecto de 1 mes, no una arquitectura para escalar a producción real.

| Rol | Librería | Notas |
| --- | --- | --- |
| Framework | NestJS 11 + TypeScript | módulos, controllers, providers, decoradores |
| ORM / DB | Prisma + PostgreSQL | `schema.prisma` como fuente de verdad; migraciones con `prisma migrate` |
| Autenticación | `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` | access token corto (~15 min) + refresh token (~7 días) |
| Hasheo | `bcrypt` | costo 10-12; nunca loguear ni devolver el hash en respuestas |
| Validación | `class-validator` + `class-transformer` | DTOs + `ValidationPipe` global (`whitelist`, `transform`) |
| Seguridad HTTP | `helmet`, `cors`, `@nestjs/throttler` | rate limiting global y reforzado en `/auth/login` |
| Configuración | `@nestjs/config` + `.env` | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`; nunca commitear `.env` |

> **Regla de oro:** ninguna ruta que exponga o modifique datos del usuario queda sin `AuthGuard`. Si un endpoint no necesita autenticación, esa decisión debe ser **explícita y justificada**, no un olvido.

---

## 4. Del localStorage a la base de datos

En el Segundo Proyecto Integrador, cada entidad vivía como estado de Zustand persistido en el navegador. Ahora esa misma entidad se modela como tabla en PostgreSQL vía Prisma, y el frontend (fuera de alcance de este proyecto) pasaría a consumirla por HTTP en lugar de leerla del store local.

- Tomá el `types.ts` de tu feature original como punto de partida para el `schema.prisma`: cada interfaz de datos se convierte en un `model`.
- La lógica derivada que antes vivía en `utils.ts` (cálculos, filtros, clasificaciones) puede resolverse en el service de Nest, con datos ya persistidos en la base en lugar de en memoria.
- Los `id` generados con `crypto.randomUUID()` en el cliente pasan a ser generados por la base de datos o por Prisma (`@id @default(uuid())` o autoincremental, a tu criterio).
- Todo dato que antes se guardaba "porque sí" en localStorage debe ahora asociarse al **usuario dueño** (relación con el modelo `User`).

---

## 5. Autenticación y seguridad

La autenticación es el núcleo transversal del proyecto: todo el resto de la API se apoya sobre un sistema de usuarios sólido.

- `POST /auth/register` — crea el usuario con la contraseña hasheada (bcrypt).
- `POST /auth/login` — valida credenciales y devuelve access token + refresh token.
- `POST /auth/refresh` — emite un nuevo access token a partir de un refresh token válido.
- `POST /auth/logout` — invalida el refresh token del usuario.

```ts
// Ejemplo de guard sobre un endpoint protegido
@UseGuards(JwtAuthGuard)
@Get('me')
getProfile(@Req() req: RequestWithUser) {
  return req.user;
}
```

- Las contraseñas nunca se devuelven en las respuestas (usar `@Exclude()` de `class-transformer` o un mapper explícito).
- El `ValidationPipe` global rechaza propiedades no declaradas en los DTOs (`whitelist: true`, `forbidNonWhitelisted: true`).
- Rate limiting más estricto en `/auth/login` y `/auth/register` para mitigar fuerza bruta.
- CORS configurado explícitamente, no abierto a cualquier origen sin razón.

---

## 6. Git, GitHub y deploy

El uso de Git y GitHub forma parte del proyecto. Deberás cumplir con:

- Repositorio **público y nuevo** en GitHub para la API.
- Commits progresivos a medida que avanzás, no todo el proyecto en un solo commit final.
- **Conventional Commits**, claros y descriptivos.

### Conventional Commits

```
feat: add prisma schema and user model
feat: implement jwt access and refresh tokens
fix: hash password before saving user
feat: add products crud with owner guard
docs: document endpoints in README
```

Eviten commits genéricos como: `cambios`, `avance`, `arreglos`, `commit final`, `cosas` o `asdf`.

### Deploy

La API deberá estar publicada mediante un deploy funcional, con su propia base de PostgreSQL gestionada por el proveedor (por ejemplo Railway o Render). Las variables de entorno (`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`) se configuran en el proveedor, **nunca se commitean al repositorio**.

---

## 7. README y documentación de la API

El repositorio deberá incluir un `README.md` con: nombre del proyecto, descripción breve, tu nombre, idea heredada del Segundo Proyecto Integrador, tecnologías, instrucciones de instalación y variables de entorno necesarias, link al deploy, link al repositorio, y el detalle de cada endpoint disponible.

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/auth/register` | Crea un usuario nuevo |
| POST | `/auth/login` | Devuelve access y refresh token |
| POST | `/auth/refresh` | Renueva el access token |
| POST | `/auth/logout` | Invalida el refresh token |
| GET/POST/PATCH/DELETE | `/{recurso}` | CRUD del recurso protegido por JWT |

Esta tabla es un ejemplo mínimo: la completás con las rutas reales de tu idea.

---

## 8. Calidad

> **Recomendado pero no obligatorio:** ESLint 9 (flat config) sobre el proyecto de NestJS.

Se valora especialmente:

- DTOs con validación en cada endpoint que recibe datos del cliente.
- Manejo de errores consistente (no exponer stack traces ni detalles internos en producción).
- Separación clara por módulos (uno por recurso, siguiendo la convención de NestJS).
- Al menos un test automatizado sobre el flujo de autenticación.

---

## 9. Criterios de aprobación

Para que el proyecto sea aprobado, deberá cumplir con los requisitos mínimos técnicos, de proceso y de entrega:

- API funcional en NestJS + TypeScript + Prisma + PostgreSQL.
- Registro y login de usuarios con contraseñas hasheadas (bcrypt).
- Autenticación con JWT (access + refresh) y rutas protegidas correctamente.
- CRUD real de **al menos dos recursos** de tu idea, persistidos en base de datos.
- Seguridad básica aplicada: helmet, CORS, rate limiting, validación global.
- Repositorio público en GitHub con historial de commits propio.
- Deploy funcional y README con documentación de endpoints.

> Sin este proyecto terminado y funcionando **no se puede rendir el examen oral de fin de mes**. Planificá los tiempos para llegar con margen, no al límite.

---

## 10. Observación final

Este proyecto no busca solamente que la API responda. Debe demostrar que comprendés cómo **modelar datos con un ORM**, **proteger una aplicación con autenticación real**, y **tomar decisiones de seguridad conscientes** en lugar de copiadas sin entender.

Se evaluará la coherencia entre el modelo de datos, la autenticación, la seguridad aplicada, el proceso de trabajo en GitHub, la documentación y el deploy final. El examen oral de fin de mes se apoya directamente en este proyecto: vas a tener que explicar y defender tus propias decisiones técnicas.

---

*Fuente: `proyecto-4-integrartec-2026.pdf` (7 páginas) — transcripción fiel a Markdown.*
