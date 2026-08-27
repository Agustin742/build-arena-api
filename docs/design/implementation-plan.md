# Plan de implementación — Build Arena

Orden de construcción para el mes de trabajo. El diseño y sus justificaciones están en [`overview.md`](./overview.md); acá está el *cómo* y el *cuándo*.

---

## Reglas que ordenan el plan

Cinco reglas que no se negocian, porque cada una previene una forma conocida de no llegar.

1. **El deploy va primero, vacío.** Un NestJS pelado desplegado el día uno. El deploy no falla por el código: falla por la versión de Node, el comando de build, la `DATABASE_URL` o las migraciones. Descubrirlo la última semana es cómo se pierde la cursada.
2. **El motor antes que el socket.** La lógica de combate se escribe pura y con tests antes de que exista un gateway. El transporte es la última capa, no la primera.
3. **La documentación se escribe con el endpoint.** Un DTO sin `@ApiProperty` es un endpoint sin documentar. Reconstruir la referencia al final es trabajo doble.
4. **Cada fase termina con el deploy verde.** No se acumulan fases sin subir. Si algo rompe producción, se sabe cuál fue.
5. **Los números se balancean al final.** Los valores de daño, vida y presupuesto de la sección 4 del diseño son iniciales. Tocarlos durante el desarrollo es un pozo sin fondo.

---

## Fase 0 — Fundación

**Objetivo:** que exista una URL pública respondiendo antes de escribir una sola regla de negocio.

- Repositorio público y nuevo en GitHub, con `main` protegida exigiendo pull request. El flujo completo está en [`git-workflow.md`](./git-workflow.md).
- `nest new` con TypeScript y gestor de paquetes elegido.
- ESLint 9 con configuración plana.
- `.gitignore` con `.env`, y `.env.example` con las variables sin valores.
- Endpoint `GET /health` que devuelve estado y versión.
- API desplegada en Render (web service del plan gratuito).
- PostgreSQL en Neon (plan gratuito permanente). El PostgreSQL gratuito de Render expira a los 30 días y luego se borra, por lo que no sobrevive al período de corrección.
- Variables `DATABASE_URL`, `JWT_SECRET` y `JWT_REFRESH_SECRET` cargadas **en el proveedor**.

**Terminado cuando:** la URL de producción responde `200` en `/health`.

```
chore: scaffold nestjs project with typescript
chore: add eslint flat config
feat: add health endpoint
chore: configure render deployment
```

---

## Fase 1 — Persistencia

**Objetivo:** el modelo de datos completo, migrado y sembrado.

- Prisma inicializado con proveedor PostgreSQL.
- `schema.prisma` completo según la sección 5 del diseño.
- Primera migración aplicada en local y en producción.
- `PrismaService` con conexión gestionada por el ciclo de vida del módulo.
- Seed del catálogo de `Skill` con costos, requisitos y dados.

**Terminado cuando:** `prisma migrate deploy` corre limpio en producción y el catálogo está cargado.

```
feat: add prisma schema with user build and skill models
feat: add battle and friendship models
feat: add prisma service module
feat: seed skill catalog
```

**Cuidado acá:** el schema va completo desde el principio. Migrar en diez pasos porque el modelo se fue descubriendo genera un historial de migraciones ilegible, y eso sí se nota en el oral.

---

## Fase 2 — Autenticación y seguridad

**Objetivo:** el núcleo transversal. Todo lo demás se apoya sobre esto.

- `POST /auth/register` con hasheo `bcrypt` de costo 10-12.
- `POST /auth/login` devolviendo access y refresh token.
- `POST /auth/refresh` validando contra `refreshTokenHash`.
- `POST /auth/logout` anulando el hash guardado.
- `GET /auth/me`.
- `JwtAuthGuard` aplicado **globalmente**, con decorador `@Public()` para las excepciones explícitas.
- `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform`.
- `helmet`, CORS declarado por origen, `@nestjs/throttler` global y reforzado en login y register.
- Scalar sirviendo la referencia en `/reference`.
- Test automatizado del flujo completo de autenticación.

**Terminado cuando:** ninguna ruta responde sin token salvo las marcadas `@Public()`, y el test de autenticación pasa.

```
feat: add user registration with bcrypt hashing
feat: implement jwt access and refresh tokens
feat: add global jwt auth guard with public decorator
feat: apply helmet cors and rate limiting
feat: serve api reference with scalar
test: cover authentication flow end to end
```

**El guard va global, no por controlador.** Aplicarlo ruta por ruta significa que la seguridad depende de que nadie se olvide. Global con excepciones explícitas invierte la carga: olvidarse deja la ruta protegida, no abierta.

---

## Fase 3 — Motor de combate

**Objetivo:** la lógica del juego, pura y testeada, sin framework alrededor.

- Tipos del dominio: combatiente, acción declarada, resultado de turno, evento.
- Fuente de aleatoriedad **inyectada**, no `Math.random()` directo. Sin esto el motor no se puede testear.
- Resolución de ataque físico contra Clase de Armadura, con crítico en 20 natural.
- Resolución de ataque mágico por tirada de salvación, con daño mitad al superarla.
- Ventaja y desventaja, incluyendo su cancelación mutua.
- Aplicación y expiración de condiciones.
- Resolución conjunta de acción y reacción.
- Tests unitarios con dado fijo: impacto, fallo, crítico, salvación superada y fallada, condición aplicada y expirada, cancelación de ventaja.

**Terminado cuando:** el motor no importa nada de `@nestjs`, y los tests cubren cada rama de resolución.

```
feat: add combat domain types
feat: add injectable random source
feat: implement physical attack resolution
feat: implement magic attack with saving throw
feat: add advantage and disadvantage rolls
feat: add condition application and expiration
test: cover combat engine resolution branches
```

**Esta es la fase que hay que poder explicar en el oral.** Un motor puro y determinista es lo que separa un proyecto que funciona de uno que se entiende.

---

## Fase 4 — Builds y catálogo

**Objetivo:** que el jugador pueda construir, y que el servidor sea el que dice si la build es legal.

- `GET /skills` con el catálogo completo.
- CRUD de `Build` sobre el usuario autenticado.
- Validación **entera en el service**: presupuesto de atributos con costo escalado, presupuesto de kit, requisitos de atributo por habilidad, cantidad de slots por tipo.
- Autorización por propietario según la sección 8.2 del diseño: identidad tomada del token, consultas acotadas con `where: { id, userId }`, y `404` sobre recursos ajenos.
- DTOs anotados para la referencia de Scalar.

**Terminado cuando:** una build inválida se rechaza con `400` diciendo qué regla incumplió, y pedir la build de otro usuario devuelve `404` aunque exista.

```
feat: expose skill catalog endpoint
feat: add build crud scoped to authenticated owner
feat: validate attribute point budget with escalating cost
feat: validate skill kit budget slots and requirements
test: cover build validation rules
test: cover owner scoped access on builds
```

**Acá es donde se prueba la autorización, no en la fase 2.** El guard de autenticación ya está desde antes; lo que se estrena en esta fase es que un usuario autenticado **no pueda tocar lo ajeno**. El test que lo demuestra es un usuario pidiendo el recurso de otro y recibiendo `404`.

---

## Fase 5 — Social y desafíos

**Objetivo:** que dos jugadores puedan encontrarse.

- CRUD de `Friendship` con ciclo solicitar, aceptar, rechazar, eliminar.
- Reglas: no autoamistad, no solicitud duplicada en ninguna de las dos direcciones, solo el destinatario acepta o rechaza.
- CRUD de `Battle` con ciclo `PENDING`, `ACCEPTED`, `IN_PROGRESS`, `FINISHED`, y salidas `REJECTED` y `CANCELLED`.
- Al crear una batalla, `ranked` queda en `false` si existe amistad aceptada entre ambos.
- Al aceptar, se crean los dos `BattleCombatant` **congelando** atributos, Clase de Armadura, vida máxima e iniciativa.
- Autorización sobre cada transición, según la tabla de la sección 8.2 del diseño: acepta y rechaza **solo el destinatario o el desafiado**, cancela **solo quien la originó**.

**Terminado cuando:** el ciclo completo funciona en las dos direcciones, una batalla aceptada tiene sus combatientes congelados, y quien envió un desafío no puede aceptárselo a sí mismo.

```
feat: add friendship request lifecycle
feat: prevent duplicate and self friendship requests
feat: add battle challenge lifecycle
feat: restrict lifecycle transitions to the entitled participant
feat: freeze combatant stats when battle is accepted
feat: mark battles between friends as unranked
test: cover forbidden lifecycle transitions
```

**La trampa de esta fase:** validar el estado y creer que alcanza. Que un desafío esté `PENDING` no dice **quién** puede aceptarlo. Sin esa segunda comprobación, el desafiante se acepta su propio desafío y elige cuándo empieza el combate.

---

## Fase 6 — Tiempo real

**Objetivo:** el combate en vivo. Nada de esto empieza antes de que la fase 3 esté verde.

- Gateway con autenticación en el handshake: sin token válido no se entra a ninguna sala.
- Una sala por batalla, admitiendo solo a los dos participantes.
- `battle:join`, `battle:action` y `battle:reaction` del lado del cliente.
- Ventana de reacción con plazo, que al expirar conserva la reacción.
- Las siete validaciones de la sección 7 del diseño, en cada mensaje.
- Persistencia de cada turno en `BattleTurn` y actualización de `BattleCombatant`.
- Reconexión: `battle:join` devuelve el estado completo desde la base.
- Cierre de batalla por vida en cero o por abandono vencido el plazo.

**Terminado cuando:** dos clientes pelean de punta a punta, y desconectar y reconectar a uno recupera el combate en el punto exacto.

```
feat: add websocket gateway with handshake authentication
feat: add battle rooms and join event
feat: resolve declared actions through combat engine
feat: add reaction window with timeout
feat: persist resolved turns
feat: restore battle state on reconnect
```

---

## Fase 7 — Rating y cierre

**Objetivo:** cerrar el ciclo competitivo y entregar.

- Cálculo de rating al finalizar una batalla puntuable.
- `GET /leaderboard` ordenado por rating.
- Balanceo de los números iniciales del diseño, ahora sí.
- README completo: nombre, descripción, autor, tecnologías, instalación, variables de entorno, link al deploy, link al repositorio, tabla de endpoints y tabla de eventos de WebSocket.
- Verificación uno por uno de los criterios de aprobación de la consigna.

**Terminado cuando:** cada punto de la sección 9 de la consigna está tildado contra el deploy en producción, no contra el entorno local.

```
feat: update rating when ranked battle ends
feat: add global leaderboard endpoint
docs: document endpoints and websocket events in readme
chore: tune combat balance values
```

---

## Calendario

| Semana | Fases | Hito |
| --- | --- | --- |
| 1 | 0, 1, 2 | Deploy vivo con autenticación funcionando en producción |
| 2 | 3, 4 | Motor testeado y builds validadas por el servidor |
| 3 | 5, 6 | Dos jugadores peleando en vivo |
| 4 | 7 | Rating, documentación, balanceo y margen |

La semana 4 es margen deliberado. Si las fases 5 y 6 se corren, hay dónde absorberlo. Si no se corren, hay tiempo para la cola de matchmaking de fase 2 del alcance.

---

## Dependencias

```
Fase 0  ->  Fase 1  ->  Fase 2  ->  Fase 4  ->  Fase 5  ->  Fase 6  ->  Fase 7
                                      ^                       ^
Fase 3 (motor puro, sin dependencias)-+-----------------------+
```

La fase 3 no depende de nada: se puede escribir en paralelo a la 1 y la 2, porque no toca base de datos ni framework. Es la única del plan que se puede adelantar si aparece un rato libre.

---

## Puntos de control

Tres momentos donde hay que parar y mirar el calendario con honestidad.

| Momento | Pregunta | Si la respuesta es no |
| --- | --- | --- |
| Fin de semana 1 | ¿Hay autenticación funcionando en el deploy? | Parar todo y resolverlo antes de seguir |
| Fin de semana 2 | ¿El motor tiene tests verdes y las builds se validan? | Recortar el tiempo real y evaluar combate asíncrono |
| Fin de semana 3 | ¿Dos clientes pelean en vivo? | Congelar el WebSocket y cerrar con lo que hay |

El tercero es el importante. **El tiempo real es la parte que no exige la consigna.** Si en la semana 3 no está, se cierra el proyecto sin él y se aprueba igual. Lo que no se puede entregar incompleto es autenticación, CRUD, seguridad y deploy.
