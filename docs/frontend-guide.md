# Guía de integración para el frontend

Todo lo que hace falta para construir un cliente contra Build Arena API: los endpoints
REST, el contrato de WebSocket, los modelos de datos y cómo encaja todo en un flujo de
consola conversacional.

> **Convención:** la prosa va en español; rutas, campos, códigos y nombres de eventos van
> en inglés, tal cual viajan por el cable.

| | |
| --- | --- |
| Base URL | `https://build-arena-api.onrender.com` |
| WebSocket | la misma URL (Socket.IO sobre el mismo puerto) |
| Referencia interactiva | `/reference` |
| Local | `http://localhost:3000` |

> El plan gratuito de Render apaga el servicio tras 15 minutos sin tráfico y la primera
> petición después tarda cerca de un minuto y medio. **Despertalo antes de una demo.**

---

## 1. La regla que ordena todo

El cliente **declara intención**. Nunca calcula, nunca valida, nunca decide.

No tirás dados. No calculás daño. No decidís de quién es el turno. No determinás si una
build es legal ni si una reacción está disponible. Mandás `quiero atacar con esta
habilidad` y el servidor te contesta qué pasó.

Esto no es una restricción de la API: es la tesis del proyecto. Si el cliente puede
calcularlo, el cliente puede mentirlo.

**Consecuencia práctica para vos:** no repliques ninguna regla de combate en el front. Ni
la fórmula de daño, ni la de impacto, ni la de puntos de vida. Todo lo que necesitás
mostrar ya viene resuelto en los eventos. Si te encontrás escribiendo un `if` sobre reglas
de juego, algo está mal.

Lo único que **sí** conviene tener en el front es la tabla de costos de atributos, para
mostrar en vivo cuánto le queda al jugador mientras arma la build. Pero es una **ayuda
visual**: el servidor valida igual, y su respuesta manda.

---

## 2. Autenticación

Dos tokens. El `accessToken` es corto y va en cada petición; el `refreshToken` es largo y
solo se usa para renovar el par o para cerrar sesión.

```
Authorization: Bearer <accessToken>
```

Todas las rutas exigen token salvo `/health`, `/auth/register`, `/auth/login` y
`/auth/refresh`.

Cuando una petición devuelve **401**, el `accessToken` venció: llamá a `/auth/refresh` con
el `refreshToken` guardado, reemplazá el par y reintentá. Si el refresh también da 401, la
sesión terminó y hay que volver a loguear.

El WebSocket **no lee la cabecera `Authorization`**: el token va en el handshake (§7.1).

---

## 3. Modelos de datos

Lo que el servidor guarda. No todos estos campos salen por el cable: los hashes y el
`refreshTokenHash` no salen nunca.

### `User`

| Campo | Tipo | Nota |
| --- | --- | --- |
| `id` | uuid | |
| `email` | string | único. Solo lo ve su dueño |
| `username` | string | único, 3 a 20 caracteres, letras, números y guion bajo |
| `passwordHash` | string | **nunca sale** |
| `refreshTokenHash` | string? | **nunca sale** |
| `rating` | int | arranca en 1200 |
| `createdAt` / `updatedAt` | datetime | |

> **De otro jugador solo vas a ver tres campos: `id`, `username` y `rating`.** Es
> deliberado y vale para amistades, batallas y leaderboard por igual.

### `Build`

| Campo | Tipo | Nota |
| --- | --- | --- |
| `id` | uuid | |
| `userId` | uuid | dueño |
| `name` | string | 3 a 40 caracteres, único **por usuario** |
| `strength` `magic` `dexterity` `constitution` | int | 8 a 15 |
| `skills` | Skill[] | exactamente 2 acciones y 2 reacciones |
| `createdAt` / `updatedAt` | datetime | |

### `Skill` — el catálogo, sembrado y de solo lectura

| Campo | Tipo | Nota |
| --- | --- | --- |
| `code` | string | identificador estable. **Es lo que se manda en todos lados** |
| `name` / `description` | string | para mostrar |
| `type` | `ACTION` \| `REACTION` | |
| `cost` | int | puntos del presupuesto de kit |
| `requiredAttribute` | `STRENGTH` \| `MAGIC` \| `DEXTERITY` \| `CONSTITUTION` | |
| `requiredValue` | int | mínimo que ese atributo debe alcanzar |
| `damageDice` | string? | `1d8`, `2d6`… o `null` |
| `appliesCondition` | `POISONED` \| `STUNNED` \| `WEAKENED` \| null | |
| `conditionRounds` | int? | duración de la condición |

### `Friendship`

| Campo | Tipo | Nota |
| --- | --- | --- |
| `id` | uuid | |
| `requesterId` / `addresseeId` | uuid | |
| `status` | `PENDING` \| `ACCEPTED` | |

Único por par `(requester, addressee)`.

### `Battle`

| Campo | Tipo | Nota |
| --- | --- | --- |
| `id` | uuid | |
| `challengerId` / `opponentId` | uuid | |
| `status` | `PENDING` \| `ACCEPTED` \| `IN_PROGRESS` \| `FINISHED` \| `REJECTED` \| `CANCELLED` | |
| `ranked` | bool | `false` si hay amistad aceptada al crearse |
| `winnerId` | uuid? | |
| `currentRound` | int | |
| `activeUserId` | uuid? | de quién es el turno |
| `startedAt` / `endedAt` | datetime? | |

### `BattleCombatant` — la foto congelada

Al aceptar el desafío, los atributos de las dos builds **y su kit** se copian acá. Editar
o borrar la build después ya no cambia esa pelea.

`userId`, `buildId?`, `strength`, `magic`, `dexterity`, `constitution`, `armorClass`,
`maxHp`, `currentHp`, `initiative`, `reactionAvailable`, `conditions[]`, `skills[]`.

El kit congelado apunta directo al catálogo, no a la build, así que sobrevive a borrarla.
Viaja al cliente como `skillCodes` dentro de `CombatantView` (§7.3).

### `BattleTurn` — el historial

Dos filas por ronda: la acción (`sequence: 1`) y la reacción (`sequence: 2`).

`round`, `sequence`, `actorId`, `kind`, `skillCode?`, `attackRoll?`, `attackTotal?`,
`targetValue?`, `hit?`, `critical`, `damage`.

**Los tres campos de tirada significan una sola cosa cada uno**, en ataque físico y en
mágico por igual:

| Campo | Qué es |
| --- | --- |
| `attackRoll` | el d20 crudo, sin modificadores |
| `attackTotal` | ese dado **más sus modificadores**: lo que se logró |
| `targetValue` | lo que había que **superar** (Clase de Armadura o dificultad) |

En un ataque **mágico**, `attackRoll` y `attackTotal` describen **la tirada de salvación
del defensor**, no la del atacante. Se invierte quién tira, no qué significan los campos.

Podés renderizar cualquier fila así, sin saber qué tipo de ataque fue:

```
10 (+2) = 12  contra 11  ->  impacto
```

---

## 4. Endpoints REST

Los errores de validación de payload vienen del `ValidationPipe` global:

```json
{ "statusCode": 400, "message": ["email must be an email"], "error": "Bad Request" }
```

### Salud

| | |
| --- | --- |
| `GET /health` | Público |

```json
{ "status": "ok", "version": "0.1.0", "uptime": 564, "timestamp": "2026-09-02T18:57:39.097Z" }
```

### Autenticación

| Método | Ruta | Público | Cuerpo | Respuesta |
| --- | --- | --- | --- | --- |
| `POST` | `/auth/register` | sí | `{ email, username, password }` | **201** + perfil |
| `POST` | `/auth/login` | sí | `{ email, password }` | **200** + par de tokens |
| `POST` | `/auth/refresh` | sí | `{ refreshToken }` | **200** + par nuevo |
| `POST` | `/auth/logout` | sí | `{ refreshToken }` | **204**, sin cuerpo |
| `GET` | `/auth/me` | no | — | **200** + perfil |

- `password`: 8 a 72 caracteres. El tope de 72 no es capricho: bcrypt trunca más allá.
- `username`: 3 a 20, solo letras, números y `_`.
- `register` devuelve **201** y el perfil. **No devuelve tokens**: hay que loguear después.
- `login` y `refresh` devuelven `{ accessToken, refreshToken }`.
- `refresh` **rota**: el refresh viejo queda inválido. Guardá siempre el nuevo.
- `GET /auth/me` → `{ id, email, username, rating, createdAt }`.

### Catálogo

| | |
| --- | --- |
| `GET /skills` | Las 12 habilidades, con costo y requisito |

Traelo **una vez al arrancar** y guardalo. No cambia entre despliegues.

### Builds

| Método | Ruta | Cuerpo |
| --- | --- | --- |
| `POST` | `/builds` | `{ name, strength, magic, dexterity, constitution, skillCodes[] }` |
| `GET` | `/builds` | — |
| `GET` | `/builds/:id` | — |
| `PATCH` | `/builds/:id` | cualquier subconjunto del cuerpo de creación |
| `DELETE` | `/builds/:id` | — |

Todas están acotadas al dueño: la build de otro devuelve **404**, nunca 403. Que exista no
es asunto tuyo.

Una build ilegal devuelve **400** con un envoltorio propio, distinto del de validación:

```json
{
  "message": "The build breaks the rules of the arena",
  "violations": [
    { "rule": "ATTRIBUTE_BUDGET_EXCEEDED", "message": "The spread costs 24 points and the budget is 20" }
  ]
}
```

| `rule` | Qué pasó |
| --- | --- |
| `ATTRIBUTE_OUT_OF_RANGE` | Un atributo fuera de 8..15 |
| `ATTRIBUTE_BUDGET_EXCEEDED` | El reparto cuesta más de 20 |
| `SLOT_COUNT` | No son exactamente 2 acciones y 2 reacciones |
| `UNKNOWN_SKILL` | Un código que no existe en el catálogo |
| `DUPLICATE_SKILL` | La misma habilidad dos veces |
| `KIT_BUDGET_EXCEEDED` | El kit cuesta más de 18 |
| `ATTRIBUTE_REQUIREMENT_NOT_MET` | Una habilidad exige más de lo que la build tiene |

**Mostralas todas juntas.** El servidor devuelve el arreglo completo, no la primera: el
jugador arregla todo de una en vez de ir descubriendo problemas de a uno.

### Amistades

| Método | Ruta | Cuerpo | Qué hace |
| --- | --- | --- | --- |
| `POST` | `/friendships` | `{ addresseeId }` | Envía la solicitud |
| `GET` | `/friendships` | — | Solicitudes y amistades, desde tu punto de vista |
| `PATCH` | `/friendships/:id/accept` | — | Acepta una **recibida** |
| `DELETE` | `/friendships/:id` | — | Rechaza, cancela o elimina |

`GET` devuelve cada fila ya orientada a quien pregunta:

```json
{
  "id": "…", "status": "PENDING", "direction": "INCOMING",
  "player": { "id": "…", "username": "grace", "rating": 1350 },
  "createdAt": "…", "updatedAt": "…"
}
```

`direction` te dice si la mandaste vos (`OUTGOING`) o si la recibiste (`INCOMING`), y
`player` es **siempre el otro**. No tenés que compararlo con tu propio id.

`DELETE` es un solo verbo para tres cosas según el estado y tu rol: rechazar una recibida,
cancelar una enviada, o romper una amistad ya aceptada.

> No hay endpoint de búsqueda de usuarios. Para agregar a alguien necesitás su `id`, que
> obtenés de una batalla previa, del leaderboard o compartido a mano.

### Batallas

| Método | Ruta | Cuerpo | Qué hace |
| --- | --- | --- | --- |
| `POST` | `/battles` | `{ opponentId, buildId }` | Desafía. Queda `PENDING` |
| `GET` | `/battles` | — | Tus batallas |
| `GET` | `/battles/:id` | — | Una en la que participás |
| `PATCH` | `/battles/:id/accept` | `{ buildId }` | Acepta y **congela a los dos** |
| `PATCH` | `/battles/:id/reject` | — | Rechaza una recibida |
| `PATCH` | `/battles/:id/cancel` | — | Cancela una enviada |

```json
{
  "id": "…", "status": "ACCEPTED", "ranked": true,
  "role": "CHALLENGER",
  "rival": { "id": "…", "username": "grace", "rating": 1350 },
  "outcome": null, "currentRound": 0,
  "createdAt": "…", "startedAt": null, "endedAt": null
}
```

Igual que en amistades: `role` y `rival` vienen ya orientados a vos, y `outcome` es
`WON` / `LOST` / `null` sin que tengas que comparar `winnerId`.

`ranked` sale en `false` si al crear el desafío ya existía una amistad aceptada entre los
dos. **Las peleas entre amigos no mueven el rating.**

Desafiarte a vos mismo devuelve 400 con `{ "rule": "SELF_CHALLENGE" }`.

**El REST llega hasta acá.** Aceptada la batalla, el combate se juega por WebSocket.

### Leaderboard

| | |
| --- | --- |
| `GET /leaderboard?limit=50` | `limit` 1 a 100, por defecto 50 |

```json
[{ "rank": 1, "id": "…", "username": "ada", "rating": 1216 }]
```

---

## 5. Reglas de build

Lo que necesitás para armar el asistente de creación.

### Atributos

Los cuatro arrancan en **8**, el tope es **15** y el presupuesto es **20 puntos**. El costo
es acumulado y **acelerado**:

| Valor | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Costo | 0 | 1 | 2 | 3 | 4 | 5 | 7 | 9 |

El costo del reparto es la suma de los cuatro. Ejemplo: `14/13/12/10` cuesta
`7 + 5 + 4 + 2 = 18`, y sobran 2.

El modificador que usa el combate es `floor((valor - 10) / 2)`:

| Valor | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Modificador | −1 | −1 | 0 | 0 | +1 | +1 | +2 | +2 |

> **Avisale al jugador:** 14 y 15 dan el mismo `+2`, y ninguna habilidad pide más de 14.
> Llegar a 15 cuesta dos puntos extra y no devuelve nada. Es legal, pero es un mal negocio.

### Valores derivados

No se envían: los calcula el servidor al congelar. Podés previsualizarlos:

```
armorClass = 10 + mod(dexterity)
maxHp      = 30 + mod(constitution) * 5
initiative = d20 + mod(dexterity)      <- se tira al aceptar, decide quién arranca
```

### Kit

Exactamente **2 acciones y 2 reacciones**, presupuesto de **18 puntos**, y cada habilidad
exige un mínimo en su atributo.

| Código | Tipo | Costo | Exige | Daño | Condición |
| --- | --- | --- | --- | --- | --- |
| `POWER_STRIKE` | ACTION | 4 | STRENGTH 12 | 1d8 | — |
| `RECKLESS_BLOW` | ACTION | 5 | STRENGTH 14 | 1d10 | — |
| `PRECISE_SHOT` | ACTION | 4 | DEXTERITY 13 | 1d8 | — |
| `FIREBALL` | ACTION | 5 | MAGIC 12 | 1d12 | — |
| `VENOM_BOLT` | ACTION | 4 | MAGIC 11 | 1d4 | POISONED, 3 rondas |
| `MIND_SPIKE` | ACTION | 7 | MAGIC 14 | 1d10 | STUNNED, 1 ronda |
| `BRACE` | REACTION | 3 | CONSTITUTION 12 | — | — |
| `PARRY` | REACTION | 4 | STRENGTH 12 | — | — |
| `DODGE` | REACTION | 4 | DEXTERITY 12 | — | — |
| `ARCANE_WARD` | REACTION | 5 | MAGIC 12 | — | — |
| `COUNTER` | REACTION | 6 | STRENGTH 14 | 1d6 | — |
| `RIPOSTE` | REACTION | 7 | DEXTERITY 14 | 1d8 | WEAKENED, 2 rondas |

**Qué hace cada reacción**, y contra qué sirve:

| Reacción | Responde a | Efecto |
| --- | --- | --- |
| `BRACE` | cualquiera | Resta `mod(constitution)` al daño, mínimo 1 |
| `PARRY` | solo físico | **Parte el daño al medio** |
| `DODGE` | solo físico | Suma `mod(dexterity)` a la armadura, antes de la tirada |
| `ARCANE_WARD` | solo mágico | Suma `mod(magic)` a la tirada de salvación |
| `COUNTER` | cualquiera | Come el golpe y devuelve `1d6 + mod(strength)` **si impactaron** |
| `RIPOSTE` | solo físico | Devuelve `1d8 + mod(dexterity)` **si fallaron**, y aplica WEAKENED |

> **Decíselo al jugador al armar la build:** `DODGE`, `PARRY` y `RIPOSTE` **solo responden
> a ataques físicos**. Una build con esas dos reacciones no tiene **ninguna** respuesta
> contra magia y come los hechizos enteros. `BRACE` y `COUNTER` responden a cualquiera.

### Cómo se resuelve un ataque

| | |
| --- | --- |
| **Físico** | `d20 + mod(atributo que desbloquea la habilidad)` contra la Clase de Armadura del rival. Igualar o superar impacta. 20 natural siempre impacta y es crítico (duplica los **dados**, no el modificador). 1 natural siempre falla |
| **Mágico** | No tira contra armadura: **el defensor** tira `d20 + mod(constitution)` contra `8 + mod(magic del atacante)`. Superarla **reduce el daño a la mitad**; fallarla lo recibe entero |

**La magia nunca falla del todo.** Un ataque físico que erra hace cero; uno mágico siempre
hace algo. Es una diferencia importante para explicarle al jugador por qué su build ágil
pierde contra un mago.

---

## 6. Condiciones

| Condición | Efecto |
| --- | --- |
| `POISONED` | Desventaja al atacar (tira 2d20 y toma el bajo), y baja en 2 la dificultad de salvación que **impone** |
| `STUNNED` | Pierde **la acción y la reacción** de esa ronda |
| `WEAKENED` | El daño que **inflige** se parte al medio |

Duran en rondas y bajan al inicio del turno del que las carga. Vienen en
`CombatantView.conditions` como `{ type, roundsRemaining }`.

---

## 7. WebSocket

Socket.IO sobre la misma URL. Una sala por batalla, con los dos participantes y nadie más.

### 7.1 Handshake

```js
import { io } from 'socket.io-client';

const socket = io(API_URL, {
  transports: ['websocket'],
  auth: { token: accessToken },   // NO va en Authorization
});
```

Sin token, con un token deforme, con firma inválida o vencido, **la conexión se rechaza en
el handshake**: escuchá `connect_error`. El socket nunca llega a existir, así que no hay
un evento de error de aplicación para este caso.

### 7.2 Del cliente al servidor

| Evento | Payload |
| --- | --- |
| `battle:join` | `{ battleId }` |
| `battle:action` | `{ battleId, skillCode }` |
| `battle:reaction` | `{ battleId, skillCode }` — `skillCode: null` es **declinar** |

`battle:join` hace dos cosas: te mete en la sala y, si la batalla estaba `ACCEPTED`,
**la arranca**. También es cómo se reconecta: mandalo de nuevo y te devuelve el estado
completo desde la base.

### 7.3 Del servidor al cliente

| Evento | Cuándo |
| --- | --- |
| `battle:state` | Al entrar o reconectar: estado completo |
| `battle:round_start` | Arranca una ronda |
| `battle:reaction_window` | Se abrió una ventana **para vos** |
| `battle:turn_resolved` | El turno se resolvió |
| `battle:ended` | Terminó, con la variación de rating |
| `battle:opponent_left` | El rival se desconectó |
| `battle:error` | Tu mensaje fue rechazado |

**`battle:state`**

```json
{
  "battleId": "…", "status": "IN_PROGRESS", "currentRound": 3,
  "activeUserId": "…",
  "combatants": [{
    "userId": "…", "combatantId": "…",
    "strength": 14, "magic": 13, "dexterity": 12, "constitution": 10,
    "armorClass": 11, "maxHp": 35, "currentHp": 22,
    "initiative": 14, "reactionAvailable": true,
    "conditions": [{ "type": "POISONED", "roundsRemaining": 2 }],
    "skillCodes": ["POWER_STRIKE", "FIREBALL", "PARRY", "DODGE"]
  }],
  "turns": [ /* TurnView, en orden */ ],
  "openWindow": null,
  "opponentLeft": null
}
```

`skillCodes` es **el kit congelado de esa pelea**, en el orden en que se congeló. De ahí
armás el menú de acciones: cruzá esos códigos con el catálogo de `GET /skills` y filtrá
por `type: 'ACTION'`. **No llames a `/builds` para esto** — la build de hoy puede no ser
la que está peleando.

`openWindow` y `opponentLeft` **no son adorno**: si reconectás con una ventana abierta,
`openWindow` trae el `remainingMs` que queda y tenés que volver a mostrar el prompt.

**`battle:reaction_window`** — llega **solo al defensor**

```json
{
  "battleId": "…", "round": 3,
  "actorUserId": "…", "actionSkillCode": "POWER_STRIKE",
  "deadline": "2026-09-02T18:57:54.000Z", "remainingMs": 15000,
  "applicableSkillCodes": ["PARRY", "BRACE"]
}
```

**`applicableSkillCodes` es la lista exacta que tenés que ofrecer.** Ya está filtrada por
tipo de ataque y por disponibilidad. No la calcules vos.

La ventana dura **15 segundos**. Si expira, el turno se resuelve sin reacción y **la
reacción no se gasta** — lo mismo que si declinás con `null`.

**`battle:turn_resolved`** — llega a los dos, con el **mismo** objeto

```json
{
  "battleId": "…", "round": 3,
  "turns": [ /* dos filas: acción y reacción */ ],
  "events": [ /* la narración, ver §7.4 */ ],
  "combatants": [ /* mismo CombatantView que battle:state, skillCodes incluido */ ],
  "defeatedId": null
}
```

**`battle:ended`**

```json
{
  "battleId": "…", "winnerId": "…",
  "reason": "DEFEAT",
  "endedAt": "…",
  "ranked": true,
  "ratingChanges": [
    { "userId": "…", "before": 1200, "change": 16, "after": 1216 },
    { "userId": "…", "before": 1200, "change": -16, "after": 1184 }
  ]
}
```

`ratingChanges` trae **siempre a los dos jugadores**. En una batalla no puntuable llegan
los ratings reales con `change: 0`, no un campo ausente. Nunca tenés que interpretar una
ausencia.

**`battle:opponent_left`** trae `{ battleId, userId, deadline }`. El rival tiene **2
minutos** para volver; pasado eso, la batalla se cierra a tu favor la próxima vez que
mandes cualquier mensaje.

### 7.4 `events`: la narración lista para el chat

Esto es lo que hace que un front de consola quede bien. `turn_resolved` y `round_start`
traen la secuencia de lo que ocurrió, en orden, y cada tipo se mapea a una línea:

| `type` | Campos | Línea sugerida |
| --- | --- | --- |
| `ROUND_STARTED` | `round`, `actorId` | `— Ronda 3 —` |
| `REACTION_RECHARGED` | `combatantId` | `Tu reacción está disponible` |
| `CONDITION_TICKED` | `combatantId`, `condition`, `roundsRemaining` | `POISONED: quedan 2 rondas` |
| `CONDITION_EXPIRED` | `combatantId`, `condition` | `POISONED se disipó` |
| `CONDITION_APPLIED` | `combatantId`, `condition`, `rounds`, `refreshed` | `¡Envenenado por 3 rondas!` |
| `TURN_SKIPPED` | `combatantId`, `reason` | `Aturdido: pierde el turno` |
| `REACTION_IGNORED` | `combatantId`, `skillCode`, `reason` | `DODGE no aplica contra magia` |
| `ATTACK_ROLLED` | `rolls`, `kept`, `total`, `targetValue`, `hit`, `critical` | `d20: 10 (+2) = 12 vs 11 → impacto` |
| `SAVE_ROLLED` | `rolls`, `kept`, `total`, `difficulty`, `passed` | `Salvación: 9 (+1) = 10 vs 10 → resiste` |
| `DAMAGE_MITIGATED` | `targetId`, `skillCode`, `before`, `after` | `PARRY reduce 9 a 4` |
| `DAMAGE_APPLIED` | `targetId`, `amount`, `currentHp` | `−4 → 18 HP` |
| `COUNTER_ATTACKED` | `actorId`, `skillCode`, `damage` | `¡COUNTER devuelve 5!` |
| `COMBATANT_DEFEATED` | `combatantId` | `Cae derrotado` |

`rolls` trae **las dos tiradas** cuando hubo ventaja o desventaja, y `kept` cuál se
conservó. Mostralo: `[16, 6] → 6` explica solo por qué el veneno duele.

> `events` viene **vacío** en un re-emit idempotente (cuando el mismo turno se vuelve a
> mandar porque dos caminos lo resolvieron a la vez). Las tiradas nunca se persisten, así
> que una relectura no las puede reconstruir. Si `events` está vacío, renderizá desde
> `turns` y `combatants`, que sí son el contrato.

### 7.5 `battle:error`

```json
{ "code": "NOT_YOUR_TURN", "message": "It is not your turn", "event": "battle:action" }
```

| `code` | Qué pasó |
| --- | --- |
| `NOT_FOUND` | La batalla no existe **o no estás en ella**. A propósito no se distingue |
| `WRONG_STATUS` | La batalla no está en el estado que ese mensaje necesita |
| `NOT_YOUR_TURN` | Quisiste actuar fuera de tu turno |
| `ALREADY_DECLARED` | Ya declaraste tu acción de esta ronda |
| `NO_OPEN_WINDOW` | No hay ventana abierta para vos |
| `SKILL_NOT_IN_KIT` | Esa habilidad no está en tu kit congelado |
| `WRONG_SKILL_TYPE` | Declaraste una reacción como acción, o al revés |
| `REACTION_UNAVAILABLE` | Tu reacción ya se gastó esta ronda |
| `TURN_ALREADY_RECORDED` | Ya hay un turno registrado en ese casillero |

**Un error nunca rompe la sesión.** El socket sigue vivo; mostrá el mensaje y volvé a
pedir. `message` viene en inglés y en tono de sistema: si querés texto de juego, mapeá
por `code`, nunca por el texto.

---

## 8. El flujo del chat de consola

Cómo encaja todo en la interfaz que querés.

### 8.1 Máquina de estados

```
   ANONIMO ──login──> LOBBY
                        │
        ┌───────────────┼────────────────┬──────────────┐
        │               │                │              │
   builds/kit       amistades        desafíos      leaderboard
        │                                │
        └────────────── build elegida ───┤
                                         │ accept
                                         ▼
                                  SALA (websocket)
                                         │
                       ┌─────────────────┴─────────────────┐
                       │                                   │
                  TU TURNO                            SU TURNO
              (elegí una acción)              (esperá, o respondé
                       │                       una ventana en 15s)
                       └─────────────────┬─────────────────┘
                                         ▼
                                   turn_resolved
                                         │
                              ¿defeatedId? ── sí ──> ended
                                         │ no
                                    round_start
```

### 8.2 Comandos y a qué llaman

| Comando | Llama a |
| --- | --- |
| `register <email> <user> <pass>` | `POST /auth/register`, después `POST /auth/login` |
| `login <email> <pass>` | `POST /auth/login` |
| `me` | `GET /auth/me` |
| `skills` | catálogo cacheado |
| `build new` | asistente guiado, después `POST /builds` |
| `builds` | `GET /builds` |
| `build rm <n>` | `DELETE /builds/:id` |
| `friends` | `GET /friendships` |
| `friend add <userId>` | `POST /friendships` |
| `friend ok <n>` | `PATCH /friendships/:id/accept` |
| `challenge <userId> <build>` | `POST /battles` |
| `battles` | `GET /battles` |
| `accept <n> <build>` | `PATCH /battles/:id/accept`, después conectar el socket |
| `top` | `GET /leaderboard` |
| *(en combate)* `1..2` | `battle:action` con el código correspondiente |
| *(en ventana)* `1..n` / `enter` | `battle:reaction` con el código, o `null` |

> Numerá las listas y aceptá el número. Nadie quiere tipear un uuid en una consola. Guardá
> el mapa `número → id` de la última lista mostrada.

### 8.3 El asistente de build

El paso donde más se gana con una consola bien hecha:

```
Presupuesto: 20 puntos.  Base 8 en los cuatro.

  strength     [8]  ────────  costo 0   restan 20
  > 14
  strength    [14]  ────────  costo 7   restan 13
```

Mostrá **en vivo** cuánto queda usando la tabla de §5. Cuando pase al kit, filtrá el
catálogo por lo que la build **ya puede pagar y desbloquear**:

```
Acciones disponibles (elegí 2, kit: 18 puntos)

  1) POWER_STRIKE    4pts  1d8    ✓
  2) RECKLESS_BLOW   5pts  1d10   ✓
  3) PRECISE_SHOT    4pts  1d8    ✗ necesita DEXTERITY 13, tenés 12
  4) FIREBALL        5pts  1d12   ✓
```

Mostrá las bloqueadas **con el motivo**, no las escondas: así el jugador entiende que los
atributos desbloquean habilidades, que es la mitad del diseño del juego.

Y validá igual contra el servidor. Tu filtro es una comodidad; la respuesta manda.

### 8.4 El turno

Cuando `battle:state` o `battle:round_start` dicen que `activeUserId` sos vos:

```
— Ronda 3 —   Vos 22/35 HP   grace 18/40 HP  [POISONED 2]

  1) POWER_STRIKE   1d8
  2) FIREBALL       1d12
>
```

Las dos opciones salen de tu `skillCodes` en `battle:state`, filtradas por `type:
'ACTION'` contra el catálogo cacheado. **No de `GET /builds`**: ese lee la build de ahora,
y la que está peleando es la que se congeló al aceptar.

Cuando llega `battle:reaction_window`, **cronómetro en pantalla** con `remainingMs`:

```
grace ataca con POWER_STRIKE.  Tenés 15s para reaccionar.

  1) PARRY   parte el daño al medio
  2) BRACE   resta tu constitución
  enter)     no reaccionar (conservás la reacción)
>
```

Las opciones salen de `applicableSkillCodes`, tal cual llegan. Si el jugador no contesta,
el servidor resuelve solo: no mandes nada al expirar.

### 8.5 Detalles que se olvidan

1. **Reconexión.** Si el socket se cae, reconectá y mandá `battle:join` de nuevo.
   `battle:state` te devuelve todo, incluida la ventana abierta con su tiempo restante.
2. **El rival se fue.** Con `battle:opponent_left`, mostrá la cuenta regresiva. Al vencer,
   la batalla se cierra a tu favor **cuando mandes tu próximo mensaje**, no sola.
3. **El `accessToken` vence.** Renovalo con `/auth/refresh` **y reconectá el socket**: el
   token del handshake ya se validó y no se revalida, pero una reconexión con uno vencido
   te rebota.
4. **Los dos reciben el mismo `turn_resolved`.** No pidas estado después de un turno: ya
   lo tenés.
5. **El historial ya está en `turns`.** Al reconectar podés re-renderizar todo el chat de
   la batalla desde ahí.
6. **Editar la build no toca la pelea.** El jugador puede editarla en medio de una
   batalla: los atributos y el kit de esa pelea siguen siendo los del momento en que se
   aceptó. Mostrá siempre `skillCodes`, nunca la build actual.

---

## 9. Resumen de una partida completa

```
POST /auth/login                          -> tokens
GET  /skills                              -> catálogo (cachear)
POST /builds                              -> build
GET  /leaderboard                          -> conseguir el id de un rival
POST /battles { opponentId, buildId }      -> PENDING

  (el rival)  PATCH /battles/:id/accept { buildId }   -> ACCEPTED, ambos congelados

socket = io(API, { auth: { token } })
socket.emit('battle:join', { battleId })   -> battle:state, IN_PROGRESS

  si activeUserId sos vos:
      emit  battle:action    { battleId, skillCode }
  si no:
      on    battle:reaction_window
      emit  battle:reaction  { battleId, skillCode }   (o null)

  on battle:turn_resolved    -> renderizar events, actualizar HP
  on battle:round_start      -> siguiente ronda
  on battle:ended            -> ganador y ratingChanges

GET /leaderboard                           -> el rating ya se movió
```
