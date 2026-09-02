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
chore(config): scaffold nestjs project with typescript
chore(config): add eslint flat config
feat(health): add health endpoint
chore(config): configure render deployment
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
feat(prisma): add prisma schema with user build and skill models
feat(prisma): add battle and friendship models
feat(prisma): add prisma service module
feat(skill): seed skill catalog
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
feat(auth): add user registration with bcrypt hashing
feat(auth): implement jwt access and refresh tokens
feat(auth): add global jwt auth guard with public decorator
feat(auth): apply helmet cors and rate limiting
feat(auth): serve api reference with scalar
test(auth): cover authentication flow end to end
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
feat(combat): add combat domain types
feat(combat): add injectable random source
feat(combat): implement physical attack resolution
feat(combat): implement magic attack with saving throw
feat(combat): add advantage and disadvantage rolls
feat(combat): add condition application and expiration
test(combat): cover combat engine resolution branches
```

**Esta fase se trabaja con SDD.** La rama toma el nombre de la change —`feat/add-combat-engine`— y los artefactos de propuesta, especificación y tareas se commitean en esa misma rama, con tipo `docs`, **antes** de la implementación. El detalle está en [`git-workflow.md`](./git-workflow.md#relación-con-las-fases-y-con-sdd).

Es la fase donde SDD paga: las reglas de resolución son muchas y se contradicen entre sí con facilidad. Escribirlas como especificación antes de codificarlas evita descubrir a mitad de camino que el crítico y la ventaja se pisan.

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
feat(skill): expose skill catalog endpoint
feat(build): add build crud scoped to authenticated owner
feat(build): validate attribute point budget with escalating cost
feat(build): validate skill kit budget slots and requirements
test(build): cover build validation rules
test(build): cover owner scoped access on builds
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
feat(friendship): add friendship request lifecycle
feat(friendship): prevent duplicate and self friendship requests
feat(battle): add battle challenge lifecycle
feat(battle): restrict lifecycle transitions to the entitled participant
feat(battle): freeze combatant stats when battle is accepted
feat(battle): mark battles between friends as unranked
test(battle): cover forbidden lifecycle transitions
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
feat(ws): add websocket gateway with handshake authentication
feat(ws): add battle rooms and join event
feat(ws): resolve declared actions through combat engine
feat(ws): add reaction window with timeout
feat(ws): persist resolved turns
feat(ws): restore battle state on reconnect
```

**Esta fase también se trabaja con SDD**, con la rama nombrada por la change —`feat/add-realtime-battle`— y los artefactos commiteados antes de la implementación, igual que en la fase 3. Acá el motivo es distinto: el problema no son las reglas sino el **orden de los eventos**, y una ventana de reacción mal especificada se descubre tarde y en vivo.

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
feat(rating): update rating when ranked battle ends
feat(rating): add global leaderboard endpoint
docs(readme): document endpoints and websocket events in readme
chore(combat): tune combat balance values
```

---

## Fase 8 — Congelar el kit y exponerlo — CERRADA

**Objetivo:** cerrar los dos huecos que aparecieron al documentar la API para el cliente.
No agregaban funcionalidad: sacaban una inconsistencia y una omisión que obligaban al
frontend a adivinar.

Los dos eran el mismo problema visto desde dos lados. **El kit de una batalla no estaba
congelado y tampoco se publicaba.**

### El hueco 1: el kit se leía en vivo

`freezeCombatant` copiaba los cuatro atributos y los valores derivados, pero **no la lista
de habilidades**: se leía de `BuildSkill` en cada mensaje. Y `PATCH /builds/:id` con
`skillCodes` reemplaza el kit entero —`deleteMany` más `create`, porque un kit son cuatro
casilleros y no una lista a la que se agrega—, así que **un jugador podía editar su build
en medio de una pelea y cambiar las habilidades con las que estaba peleando**.

Contradecía de frente lo que la fase 5 dejó escrito. Hoy ya no.

### El hueco 2: el kit congelado no llegaba al cliente

`CombatantView` llevaba atributos, vida, iniciativa y condiciones, y ninguna habilidad.
Para las reacciones alcanzaba con `applicableSkillCodes`; para las acciones el cliente
tenía que pedir `GET /builds/:id` y filtrar por `ACTION` —y eso lee la build **actual**,
que por el hueco 1 podía no ser la que estaba en juego—.

### Cómo se cerró

- `BattleCombatantSkill` guarda el kit congelado y apunta **directo a `Skill`**, no a
  `BuildSkill`: así sobrevive tanto a editar la build como al `SET NULL` de borrarla.
- El kit se crea anidado dentro del mismo `create` que los atributos, en la única
  sentencia que acepta la batalla.
- Las siete validaciones y `applicableSkillCodes` leen ese kit desde la fila de la
  batalla. `BattleSessionService` ya no consulta `BuildSkill` en ningún camino.
- `CombatantView` suma `skillCodes`, con lo que `battle:state` y `battle:turn_resolved`
  lo llevan sin ningún evento nuevo. El resolver saca los dos kits de la misma
  transacción que ya leía las filas.
- La migración **rellena** el kit de toda batalla ya existente desde `BuildSkill`. No era
  opcional: sin eso, la validación V4 habría rechazado toda habilidad de toda batalla en
  curso. Un combatiente cuya build ya estaba borrada queda con el kit vacío que en los
  hechos ya tenía.
- `docs/frontend-guide.md` perdió su sección 9, que documentaba estos dos huecos.

**Verificado:** `test/frozen-kit.e2e-spec.ts` reescribe las dos builds en medio de la
batalla contra la base real y comprueba que la pelea no cambia — la habilidad agregada
después se rechaza con `SKILL_NOT_IN_KIT`, y la que se quitó de la build se sigue
aceptando.

```
feat(battle): freeze the skill kit alongside the frozen stats
feat(ws): publish each combatant's kit in the state payload
docs(design): drop the two gaps phase 8 closed
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

**La fase 8 quedó fuera de este calendario a propósito.** No es un punto de la consigna:
fue deuda que se descubrió documentando la API para el cliente y se saldó después de
entregar. El proyecto se aprobaba sin ella; el backend no quedaba pulido sin ella.

---

## Dependencias

```
Fase 0  ->  Fase 1  ->  Fase 2  ->  Fase 4  ->  Fase 5  ->  Fase 6  ->  Fase 7  ->  Fase 8
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
