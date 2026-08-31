# Diseño general — Build Arena

API de duelos por turnos entre builds, con combate resuelto íntegramente en el servidor y transmitido en tiempo real por WebSocket.

Documento de diseño del Cuarto Proyecto Integrador. La consigna original está en [`docs/brief`](../brief/proyecto-4-integrartec-2026.md).

> **Convención de este repositorio:** la documentación se escribe en español; carpetas, archivos, código, endpoints, modelos, campos y relaciones se escriben en inglés. El código no lleva comentarios.

---

## 1. La tesis del proyecto

Todo el diseño se apoya en una sola idea:

> **Si el cliente puede calcularlo, el cliente puede mentirlo.**

Un juego competitivo con ranking es el caso donde esa frase deja de ser teoría. Si el daño se calcula en el navegador, el jugador edita el número. Si la build se valida en el navegador, el jugador se pone 40 en todos los atributos. Si el turno lo decide el navegador, el jugador juega dos veces.

Por eso, en este proyecto **el servidor es la única autoridad** sobre:

| Qué | Por qué no puede vivir en el cliente |
| --- | --- |
| Tiradas de dados | El cliente elegiría siempre 20 |
| Cálculo de daño y críticos | El cliente reportaría el daño que quiera |
| Validación de builds | El cliente se asignaría puntos infinitos |
| De quién es el turno | El cliente jugaría fuera de orden |
| Si una reacción está disponible | El cliente reaccionaría siempre |
| Cálculo de ELO | El cliente se sumaría puntos |

El cliente solo declara **intención** (`quiero atacar con esta habilidad`). El servidor decide qué pasó.

Este es el argumento que sostiene el proyecto entero, y es lo que hay que poder defender.

---

## 2. Decisiones de diseño

Cada decisión está acá con su razón, porque en el oral la pregunta no va a ser *qué* elegiste sino *por qué*.

### 2.1 Combate en tiempo real, no simulación asíncrona

Los dos jugadores están conectados simultáneamente y el combate avanza mensaje a mensaje por WebSocket.

**Costo asumido:** el WebSocket no suma puntos en los criterios de aprobación. Es complejidad elegida, no exigida. Se mitiga con la regla de construcción de la sección 3.

### 2.2 Economía de acciones: acción + reacción

Cada ronda, cada combatiente dispone de:

- **1 acción**, en su propio turno.
- **1 reacción**, durante el turno del rival. Se recarga al comenzar su turno.

**Por qué la reacción es obligatoria en este diseño:** sin ella, el rival solo mira mientras esperás, y el tiempo real no aporta nada que un `POST` no diera. Con ella, durante tu turno el servidor interroga al rival y ambos jugadores están decidiendo al mismo tiempo. **La reacción es lo único que justifica el WebSocket.**

Se descartaron: acción adicional, concentración, movimiento y grilla. Es un duelo 1v1; el posicionamiento abriría un sistema paralelo de coordenadas, distancias y alcance que no aporta a lo que el proyecto demuestra.

### 2.3 Cuatro atributos con doble ruta ofensiva y defensiva

| Atributo | Ofensiva | Defensiva |
| --- | --- | --- |
| `strength` | Ataque físico contra la Clase de Armadura | — |
| `magic` | Ataque mágico que fuerza tirada de salvación | — |
| `dexterity` | Ataque físico contra la Clase de Armadura, en habilidades que la destreza desbloquea (ej. `PRECISE_SHOT`) | Clase de Armadura e iniciativa |
| `constitution` | — | Puntos de vida y tirada de salvación |

**El problema que esto resuelve:** con presupuesto fijo, un atributo que nadie sube es peso muerto y uno que todos suben es un impuesto, no una decisión. Si hubiera una sola ruta de ataque, la defensa que la frena sería obligatoria para todos.

Al existir **dos rutas de ataque con dos defensas distintas**, aparece un piedra-papel-tijera emergente, sin ninguna tabla de debilidades escrita a mano:

```
Build ágil        AC alta, HP bajos    resiste fisico, sufre magia
Build resistente  AC baja, HP altos    sufre fisico, resiste magia
```

**`dexterity` no abre una tercera ruta mecánica: resuelve la ofensiva física ya existente.** Una habilidad que `dexterity` desbloquea, como `PRECISE_SHOT`, tira ataque y daño con el modificador de destreza en lugar del de fuerza, pero contra la misma Clase de Armadura del rival, no una fórmula nueva. `strength` y `dexterity` compiten por el mismo casillero ofensivo físico; siguen existiendo dos rutas de ataque (física y mágica), y `constitution` sigue siendo puramente defensiva.

### 2.4 Compra de puntos con costo escalado

Los jugadores no progresan: **todos arrancan con el mismo presupuesto**. No hay experiencia, niveles ni farmeo. El leaderboard mide diseño de build y juego, no horas invertidas.

El costo de subir un atributo **no es lineal**, y esa es la pieza clave:

| Valor | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Costo acumulado | 0 | 1 | 2 | 3 | 4 | 5 | 7 | 9 |

**Por qué escalado:** con costo lineal, la build óptima es siempre la misma —todo a un atributo, mínimo en el resto— y es trivial de calcular. Con costo acelerado, especializarse duele, y aparece la pregunta real: *¿pago 9 por un 15, o compro dos 13 con lo mismo?*

El modificador se deriva del valor:

```
modifier(value) = floor((value - 10) / 2)
```

Consecuencia intencional: 14 y 15 dan el mismo `+2`, así que un valor impar es un punto desperdiciado salvo que algo lo levante.

**El presupuesto de atributos es de 20 puntos**, gastados desde una base de 8 en los
cuatro. Ese número no es arbitrario: es el que hace que las tres formas de repartir
cuesten lo mismo y ninguna domine a las otras.

| Build | Reparto | Cuenta |
| --- | --- | --- |
| Especialista | 15 / 14 / 12 / 8 | 9 + 7 + 4 + 0 = 20 |
| Equilibrada | 13 / 13 / 13 / 13 | 5 + 5 + 5 + 5 = 20 |
| Híbrida | 15 / 13 / 12 / 10 | 9 + 5 + 4 + 2 = 20 |

El piso también entra: la build más barata que cumple los requisitos de cuatro
habilidades —Fuerza 12, Magia 11, Constitución 12 y Destreza 12— cuesta 15 puntos, así
que sobran 5 para empujar algo a 14. Con un presupuesto mucho mayor la pregunta de esta
sección desaparece, porque alcanzaría para comprar todo.

### 2.5 Kit de habilidades con costo y requisitos

Cada build elige **2 habilidades de acción y 2 de reacción**, pagándolas de un presupuesto de kit separado del de atributos. Cada habilidad además exige un mínimo en un atributo.

**Por qué costo variable:** si todas costaran igual, existiría un mejor conjunto de cuatro y todos convergerían ahí. Es la trampa del costo lineal con otro nombre.

**Por qué requisitos de atributo:** atan las dos mitades de la build. Subir `magic` no solo aumenta daño, **desbloquea habilidades**. Los arquetipos aparecen solos, sin necesidad de definir clases.

**El presupuesto de kit es de 18 puntos.** El kit más barato del catálogo cuesta 15
(`POWER_STRIKE` + `VENOM_BOLT` + `BRACE` + `PARRY`) y el más caro 26, así que 18 deja
tres puntos de margen sobre el piso.

**Por qué 18 y no 20:** existe una build degenerada. Fuerza sola desbloquea las cuatro
habilidades —`RECKLESS_BLOW` y `COUNTER` piden Fuerza 14, `POWER_STRIKE` y `PARRY` piden
Fuerza 12— así que un único atributo en 14, siete puntos, alcanza para el kit entero y
deja trece libres. Eso contradice el párrafo anterior: los requisitos dejarían de atar
las dos mitades de la build. Ese kit cuesta exactamente 20 puntos, y con 18 queda fuera
de alcance.

No hace falta el mismo cuidado con los otros atributos: Magia tiene una sola reacción,
Destreza una sola acción y Constitución ninguna acción, así que el catálogo ya impide
sus versiones mono. Fuerza era el único hueco, y el presupuesto de kit lo cierra.

**Segunda consecuencia buscada:** `MIND_SPIKE` y `RIPOSTE` cuestan 7 cada una y las dos
ranuras restantes cuestan como mínimo 7, así que juntas suman 21 y nunca conviven. Las
dos habilidades más caras del catálogo son mutuamente excluyentes.

### 2.6 Sin equipamiento

Fuera de alcance. Reduce tablas y superficie de validación sin quitarle profundidad a la build, que ya la tiene en atributos y kit. Se puede retomar en fase 2.

### 2.7 Emparejamiento social, no por stats

La idea original contemplaba emparejar por stats similares. **Con presupuesto fijo eso perdió sentido:** todos son equivalentes por construcción, así que no hay nada similar que buscar. Peor aún, emparejar por stats juntaría siempre builds parecidas y mataría el piedra-papel-tijera de la sección 2.3.

Lo que queda para emparejar es habilidad, y eso lo mide el ELO.

En el núcleo, dos jugadores se encuentran por **desafío directo** —a un usuario cualquiera o a un amigo—. La cola de matchmaking por ELO queda para fase 2.

### 2.8 Las peleas entre amigos no puntúan

Dos amigos podrían escalar el ranking turnándose para perder. **Es un agujero de reglas de negocio, no de código**, y vive en el servidor igual que el cálculo de daño.

Las batallas con estado `ranked = false` no modifican el ELO de nadie. Una batalla es no puntuable cuando existe una amistad aceptada entre ambos participantes al momento de crearse.

### 2.9 El estado del combate vive en PostgreSQL

Cada turno resuelto se persiste. No se usa Redis ni memoria del proceso.

**Por qué no memoria:** Railway y Render reinician el proceso en cada deploy. Los combates en curso se evaporarían, incluida la demostración durante el oral.

**Por qué no Redis:** resuelve estado compartido entre múltiples instancias y escrituras de alto volumen. El proyecto corre en **una sola instancia** y escribe cuando un humano decide algo, cada varios segundos. Es la respuesta correcta a un problema que este proyecto no tiene, y agrega un servicio más que puede estar caído el día de la entrega.

**Beneficio adicional:** si cada turno queda persistido, el replay de la batalla no hay que construirlo. Es leer las filas que ya se escribieron. Durabilidad e historial son la misma tabla.

---

## 3. Regla de construcción: el motor primero

El motor de combate se escribe **puro y aislado**, antes de tocar NestJS, HTTP o WebSocket.

```
BattleEngine
  entrada:  estado de ambos combatientes + una accion declarada
  salida:   estado nuevo + eventos ocurridos
  sin dependencias de framework, red ni base de datos
```

Un motor puro se testea en milisegundos, es determinista si se le inyecta el generador de números aleatorios, y sobrevive a cualquier cambio de transporte.

El gateway de WebSocket es una capa que **maneja** ese motor: recibe el mensaje, carga el estado desde la base, invoca al motor, persiste el resultado y emite los eventos. Si el socket se cae, el motor sigue intacto.

**Motor primero, socket después. Nunca al revés.**

Cómo se reparte el trabajo entre controller, service y motor —y por qué no hay clases base— está en [`architecture.md`](./architecture.md).

---

## 4. Sistema de combate

### 4.1 Valores derivados

Valores iniciales, sujetos a balanceo.

```
armorClass = 10 + modifier(dexterity)
maxHp      = 30 + modifier(constitution) * 5
initiative = d20 + modifier(dexterity)
```

### 4.2 Resolución de un ataque físico

```
d20 + modifier(strength)  contra  armorClass del rival
```

Igualar o superar la Clase de Armadura impacta. Es binario: no hay daño parcial.

Un 20 natural es crítico y **duplica los dados de daño, no el modificador**. Duplicar también el modificador haría que un crítico borre a un rival del mapa.

```
damage = skillDice + modifier(strength)
damage = skillDice * 2 + modifier(strength)   en critico
```

### 4.3 Resolución de un ataque mágico

La magia **no tira contra la Clase de Armadura**. Fuerza al rival a defenderse:

```
saveDifficulty = 8 + modifier(magic) del atacante
d20 + modifier(constitution) del defensor  contra  saveDifficulty
```

Superar la dificultad reduce el daño a la mitad; fallarla lo recibe completo. Un ágil esquiva espadas pero se come los hechizos.

### 4.4 Ventaja y desventaja

```
ventaja     ->  se tiran 2d20 y se toma el alto
desventaja  ->  se tiran 2d20 y se toma el bajo
```

Sin sumas ni tablas: equivale en la práctica a unos `+5`, y se implementa en una línea. **No se acumula**: dos fuentes de ventaja siguen siendo ventaja, y ventaja con desventaja se cancelan a una tirada limpia.

### 4.5 Condiciones

Estado que persiste entre rondas y modifica tiradas futuras, con duración contada en rondas. Conjunto inicial: `POISONED`, `STUNNED`, `WEAKENED`.

### 4.6 Anatomía de una ronda

```
inicio de ronda
  se recarga la reaccion de quien va a actuar
  se descuenta duracion de condiciones activas

turno del actor
  el actor declara una accion
  si el rival tiene reaccion disponible y alguna es aplicable
    el servidor abre ventana de reaccion  (limite ~5s)
    el rival declara reaccion o la conserva
    si expira el plazo, la conserva
  el motor resuelve accion y reaccion juntas
  se persiste el turno y se emite a ambos

fin de ronda
  si algun combatiente quedo en 0 hp, la batalla termina
  si no, pasa el turno al rival
```

### 4.7 Bounded accuracy

Los modificadores se mantienen chicos a propósito, para que **el d20 nunca deje de mandar**. Es crítico en este proyecto: con leaderboard y builds de presupuesto fijo, si el poder aplasta al dado la build óptima gana el cien por ciento de las veces y el ranking se congela en la primera semana.

---

## 5. Modelo de datos

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum SkillType {
  ACTION
  REACTION
}

enum Attribute {
  STRENGTH
  MAGIC
  DEXTERITY
  CONSTITUTION
}

enum FriendshipStatus {
  PENDING
  ACCEPTED
}

enum BattleStatus {
  PENDING
  ACCEPTED
  IN_PROGRESS
  FINISHED
  REJECTED
  CANCELLED
}

enum ConditionType {
  POISONED
  STUNNED
  WEAKENED
}

model User {
  id               String   @id @default(uuid())
  email            String   @unique
  username         String   @unique
  passwordHash     String
  refreshTokenHash String?
  rating           Int      @default(1200)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  builds Build[]

  sentFriendRequests     Friendship[] @relation("FriendshipRequester")
  receivedFriendRequests Friendship[] @relation("FriendshipAddressee")

  challengesSent     Battle[] @relation("BattleChallenger")
  challengesReceived Battle[] @relation("BattleOpponent")
  battlesWon         Battle[] @relation("BattleWinner")

  combatants BattleCombatant[]

  @@index([rating])
}

model Build {
  id           String   @id @default(uuid())
  userId       String
  name         String
  strength     Int
  magic        Int
  dexterity    Int
  constitution Int
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user       User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  skills     BuildSkill[]
  combatants BattleCombatant[]

  @@unique([userId, name])
  @@index([userId])
}

model Skill {
  id                String    @id @default(uuid())
  code              String    @unique
  name              String
  description       String
  type              SkillType
  cost              Int
  requiredAttribute Attribute
  requiredValue     Int
  damageDice        String?
  appliesCondition  ConditionType?
  conditionRounds   Int?

  builds BuildSkill[]
}

model BuildSkill {
  buildId String
  skillId String

  build Build @relation(fields: [buildId], references: [id], onDelete: Cascade)
  skill Skill @relation(fields: [skillId], references: [id])

  @@id([buildId, skillId])
}

model Friendship {
  id          String           @id @default(uuid())
  requesterId String
  addresseeId String
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  requester User @relation("FriendshipRequester", fields: [requesterId], references: [id], onDelete: Cascade)
  addressee User @relation("FriendshipAddressee", fields: [addresseeId], references: [id], onDelete: Cascade)

  @@unique([requesterId, addresseeId])
  @@index([addresseeId, status])
}

model Battle {
  id           String       @id @default(uuid())
  challengerId String
  opponentId   String
  status       BattleStatus @default(PENDING)
  ranked       Boolean      @default(true)
  winnerId     String?
  currentRound Int          @default(0)
  activeUserId String?
  createdAt    DateTime     @default(now())
  startedAt    DateTime?
  endedAt      DateTime?

  challenger User  @relation("BattleChallenger", fields: [challengerId], references: [id])
  opponent   User  @relation("BattleOpponent", fields: [opponentId], references: [id])
  winner     User? @relation("BattleWinner", fields: [winnerId], references: [id])

  combatants BattleCombatant[]
  turns      BattleTurn[]

  @@index([challengerId, status])
  @@index([opponentId, status])
}

model BattleCombatant {
  id                String  @id @default(uuid())
  battleId          String
  userId            String
  buildId           String?
  strength          Int
  magic             Int
  dexterity         Int
  constitution      Int
  armorClass        Int
  maxHp             Int
  currentHp         Int
  initiative        Int
  reactionAvailable Boolean @default(true)

  battle     Battle            @relation(fields: [battleId], references: [id], onDelete: Cascade)
  user       User              @relation(fields: [userId], references: [id])
  build      Build?            @relation(fields: [buildId], references: [id], onDelete: SetNull)
  conditions ActiveCondition[]

  @@unique([battleId, userId])
}

model ActiveCondition {
  id              String        @id @default(uuid())
  combatantId     String
  type            ConditionType
  roundsRemaining Int

  combatant BattleCombatant @relation(fields: [combatantId], references: [id], onDelete: Cascade)

  @@unique([combatantId, type])
}

model BattleTurn {
  id          String    @id @default(uuid())
  battleId    String
  round       Int
  sequence    Int
  actorId     String
  kind        SkillType
  skillCode   String?
  attackRoll  Int?
  targetValue Int?
  hit         Boolean?
  critical    Boolean   @default(false)
  damage      Int       @default(0)
  createdAt   DateTime  @default(now())

  battle Battle @relation(fields: [battleId], references: [id], onDelete: Cascade)

  @@unique([battleId, round, sequence])
  @@index([battleId])
}
```

### 5.1 Decisiones del modelo que hay que poder defender

**`BattleCombatant` guarda una copia de los atributos, no solo una referencia a `Build`.**
Si el jugador edita o borra su build en mitad de una batalla, el combate no puede cambiar de reglas a mitad de camino. Los atributos, la Clase de Armadura y los puntos de vida máximos se **congelan** al iniciar la batalla. `buildId` queda como referencia opcional, solo para historial, y se anula si la build desaparece.

**`Friendship` es una relación muchos a muchos sobre la misma tabla.**
Requiere dos relaciones con nombre explícito (`FriendshipRequester` y `FriendshipAddressee`), porque Prisma no puede inferir cuál es cuál. Se guarda **una sola fila por amistad**, lo que implica dos consecuencias: consultar los amigos de alguien exige mirar las dos columnas, y hay que impedir que existan a la vez `A → B` y `B → A`. El `@@unique([requesterId, addresseeId])` solo cubre la mitad; la otra mitad es una regla del service.

**El catálogo `Skill` guarda datos, no comportamiento.**
La base almacena costo, requisito, dados y condición aplicada. El **motor** decide qué hace cada habilidad, buscándola por `code`. Construir un intérprete de reglas dentro de la base es un proyecto en sí mismo y no es este.

**`BattleTurn` es el log y el replay a la vez.**
Cada fila registra la tirada, el objetivo, si impactó y cuánto daño hizo. El `@@unique([battleId, round, sequence])` garantiza que no puedan insertarse dos turnos en la misma posición, que es la defensa contra un cliente que envía la misma acción dos veces.

---

## 6. API REST

### Autenticación

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/auth/register` | Crea el usuario con la contraseña hasheada |
| `POST` | `/auth/login` | Devuelve access token y refresh token |
| `POST` | `/auth/refresh` | Emite un nuevo access token |
| `POST` | `/auth/logout` | Invalida el refresh token |
| `GET` | `/auth/me` | Perfil del usuario autenticado |

### Builds

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/builds` | Builds del usuario autenticado |
| `POST` | `/builds` | Crea una build, validando presupuesto y requisitos |
| `GET` | `/builds/:id` | Detalle de una build propia |
| `PATCH` | `/builds/:id` | Modifica una build, revalidando por completo |
| `DELETE` | `/builds/:id` | Elimina una build |

### Catálogo

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/skills` | Catálogo de habilidades con costos y requisitos |

### Amistades

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/friends` | Amigos aceptados y solicitudes pendientes |
| `POST` | `/friends` | Envía una solicitud de amistad |
| `PATCH` | `/friends/:id` | Acepta o rechaza una solicitud recibida |
| `DELETE` | `/friends/:id` | Elimina un amigo o cancela una solicitud enviada |

### Batallas

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/battles` | Desafíos pendientes e historial |
| `POST` | `/battles` | Desafía a un usuario con una build elegida |
| `GET` | `/battles/:id` | Detalle y replay turno a turno |
| `PATCH` | `/battles/:id` | Acepta o rechaza un desafío recibido |
| `DELETE` | `/battles/:id` | Cancela un desafío propio aún pendiente |

### Ranking

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/leaderboard` | Ranking global por rating |

**Toda ruta lleva guardia de autenticación salvo `/auth/register` y `/auth/login`.** No hay excepciones por olvido: si alguna otra queda pública, la decisión se documenta.

### 6.1 Documentación con Scalar

La documentación de endpoints se sirve con **Scalar**, expuesta en `/reference`.

Conviene separar dos responsabilidades que suelen confundirse:

| Pieza | Rol |
| --- | --- |
| `@nestjs/swagger` | **Genera** el documento OpenAPI a partir de decoradores y DTOs |
| `@scalar/nestjs-api-reference` | **Renderiza** ese documento como referencia interactiva |

Scalar no reemplaza a `@nestjs/swagger`: reemplaza la interfaz de Swagger UI. Los decoradores siguen siendo necesarios, porque son la fuente del documento.

```typescript
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { apiReference } from '@scalar/nestjs-api-reference'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const config = new DocumentBuilder()
    .setTitle('Build Arena API')
    .setDescription('Turn-based build duels resolved server-side')
    .setVersion('1.0')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)

  app.use('/reference', apiReference({ content: document }))

  await app.listen(process.env.PORT ?? 3000)
}

void bootstrap()
```

Qué implica en la práctica:

- Los DTOs se anotan con `@ApiProperty`, y los controladores con `@ApiTags`, `@ApiOperation` y `@ApiResponse`.
- `.addBearerAuth()` habilita probar rutas protegidas desde la propia referencia, pegando el access token.
- Las rutas protegidas se marcan con `@ApiBearerAuth()` para que Scalar sepa cuáles requieren token.
- **La documentación se escribe junto al endpoint, no al final.** Un DTO sin `@ApiProperty` produce una referencia vacía, y reconstruirla en la última semana es trabajo doble.
- El WebSocket **no aparece en OpenAPI**: es un protocolo distinto. Sus eventos se documentan a mano en el README, con la tabla de la sección 7.

---

## 7. WebSocket

El gateway autentica el handshake con el mismo access token que la API REST. **Una conexión sin token válido se rechaza antes de unirse a ninguna sala.** Un WebSocket abierto sin autenticar es una puerta trasera a toda la lógica de combate.

Cada batalla en curso tiene su sala, y solo se admite a los dos participantes.

### Mensajes del cliente

| Evento | Contenido | Efecto |
| --- | --- | --- |
| `battle:join` | `battleId` | Une a la sala y devuelve el estado actual |
| `battle:action` | `battleId`, `skillCode` | Declara la acción del turno propio |
| `battle:reaction` | `battleId`, `skillCode` o nulo | Responde la ventana de reacción abierta |

### Mensajes del servidor

| Evento | Cuándo |
| --- | --- |
| `battle:state` | Al unirse o reconectar: estado completo |
| `battle:round_start` | Comienza una ronda, indicando a quién le toca |
| `battle:reaction_window` | Se abre ventana de reacción, con plazo y opciones aplicables |
| `battle:turn_resolved` | Turno resuelto: tiradas, impacto, daño, condiciones |
| `battle:ended` | Fin del combate: ganador y variación de rating |
| `battle:opponent_left` | El rival se desconectó |

### Validaciones que el gateway aplica a cada mensaje

Ninguna de estas es opcional. Cada una cierra una forma concreta de trampa.

1. El token es válido y el usuario es uno de los dos combatientes de esa batalla.
2. La batalla está en estado `IN_PROGRESS`.
3. Es el turno de quien envía, salvo que sea una reacción con ventana abierta.
4. La habilidad declarada pertenece al kit de esa build.
5. El tipo de la habilidad corresponde al momento: `ACTION` en el turno propio, `REACTION` en la ventana.
6. La reacción todavía está disponible en esta ronda.
7. No hay un turno ya registrado en esa posición de ronda y secuencia.

### Desconexiones

El estado vive en la base, así que reconectar es volver a leerlo. Al reconectar, `battle:join` devuelve el estado completo y el combate continúa. Si un jugador no vuelve dentro de un plazo, la batalla se cierra a favor del rival. Los plazos de reacción vencidos no bloquean: la reacción simplemente se conserva.

---

## 8. Seguridad y autorización

### 8.1 Autenticación

Requisitos de la consigna, y dónde se aplican:

| Medida | Implementación |
| --- | --- |
| Contraseñas hasheadas | `bcrypt`, costo 10-12. Nunca se registran ni se devuelven |
| Autenticación | `@nestjs/jwt` y `passport-jwt`: access ~15 min, refresh ~7 días |
| Refresh token | Se guarda hasheado en `User.refreshTokenHash`; `logout` lo borra |
| Validación | `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform` |
| Cabeceras | `helmet` |
| Orígenes | CORS declarado explícitamente, nunca abierto a cualquiera |
| Fuerza bruta | `@nestjs/throttler` global, más estricto en `/auth/login` y `/auth/register` |
| Configuración | `@nestjs/config`. `.env` nunca se commitea; `.env.example` sin secretos |

Además, propias del dominio:

- La contraseña se excluye de toda respuesta mediante mapper explícito, no confiando en que nadie la seleccione por accidente.
- La validación de build se ejecuta entera en el service. El cliente nunca decide si una build es legal.
- El WebSocket autentica el handshake antes de admitir a ninguna sala.

### 8.2 Autorización

Autenticación y autorización son dos preguntas distintas, y confundirlas es el error más caro de una API:

| | Pregunta | Quién la responde |
| --- | --- | --- |
| **Autenticación** | ¿Quién sos? | El token |
| **Autorización** | ¿Podés hacer *esto* sobre *este* recurso? | El dominio |

Un token válido no habilita nada por sí solo. Saber que sos el usuario 7 no te da ningún derecho sobre la build del usuario 9. **Un `AuthGuard` sin reglas de propiedad es una API abierta con pasos extra.**

Este proyecto **no tiene roles**. No hay administradores ni moderadores. Toda la autorización es por **propiedad del recurso** y por **participación en la batalla**. Declararlo es parte de la decisión, no un olvido: la regla de oro de la consigna exige que las excepciones sean explícitas, y la ausencia de roles también lo es.

#### Matriz de autorización

| Recurso | Operación | Quién puede |
| --- | --- | --- |
| `Build` | Crear | Cualquier usuario autenticado, siempre sobre sí mismo |
| `Build` | Leer, modificar, eliminar | Solo el dueño |
| `Build` | Ver la del rival | Solo si es combatiente de una batalla que compartís |
| `Skill` | Leer catálogo | Cualquier usuario autenticado |
| `Skill` | Escribir | Nadie: no existe endpoint de escritura, el catálogo se siembra |
| `Friendship` | Solicitar | Cualquiera, hacia un usuario distinto de sí mismo |
| `Friendship` | Aceptar o rechazar | **Solo el destinatario**, nunca el solicitante |
| `Friendship` | Cancelar pendiente | Solo el solicitante |
| `Friendship` | Eliminar aceptada | Cualquiera de los dos |
| `Friendship` | Leer | Solo las propias |
| `Battle` | Desafiar | Cualquiera, hacia un usuario distinto de sí mismo |
| `Battle` | Aceptar o rechazar | **Solo el desafiado** |
| `Battle` | Cancelar | Solo el desafiante, y solo mientras esté `PENDING` |
| `Battle` | Leer detalle y replay | Solo los dos participantes |
| `Battle` | Actuar en combate | Solo el participante a quien le toca el turno |
| `Leaderboard` | Leer | Cualquier usuario autenticado |
| `User` | Leer perfil completo | Solo el propio |
| `User` | Ver a otro usuario | Únicamente `username` y `rating`; nunca email ni hashes |

#### Cuatro reglas de cómo se hace cumplir

**1. La identidad sale del token, jamás del cuerpo de la petición.**

Aceptar un `userId` que manda el cliente es la vulnerabilidad más común de las APIs, y tiene nombre propio: referencia directa insegura a objetos. Si el cliente dice de quién es el recurso, el cliente decide de quién es el recurso.

```typescript
async remove(id: string, currentUserId: string) { ... }
```

El `currentUserId` viene del token extraído por el guard. Nunca de `body` ni de `query`.

**2. La consulta se acota, no se verifica después.**

```typescript
const build = await this.prisma.build.findFirst({
  where: { id, userId: currentUserId },
})
```

Traer el recurso y después comparar dueños funciona, pero deja una ventana: basta olvidar el `if` una vez. Acotar la consulta hace la fuga **estructuralmente imposible**, porque el dato ajeno nunca sale de la base.

**3. Sobre recursos ajenos se responde `404`, no `403`.**

Un `403` confirma que el recurso existe. Repitiendo la petición con distintos identificadores, alguien puede mapear qué existe y qué no sin ver un solo dato. `404` no distingue entre *no existe* y *no es tuyo*, y esa ambigüedad es deliberada.

**4. La autorización vive en el service, no en el controller.**

El controller traduce HTTP. La regla de quién puede qué es lógica de negocio, y tiene que valer aunque mañana la misma operación se invoque desde el gateway de WebSocket en lugar de desde una ruta REST.

#### Las transiciones de estado también son autorización

Este es el punto que más se pasa por alto. Aceptar un desafío **no es solo** comprobar que el estado sea `PENDING`: es comprobar que **vos** sos quien tiene derecho a aceptarlo.

| Transición | Validación de estado | Regla de autorización |
| --- | --- | --- |
| `PENDING` → `ACCEPTED` | Debe estar pendiente | Solo el desafiado |
| `PENDING` → `REJECTED` | Debe estar pendiente | Solo el desafiado |
| `PENDING` → `CANCELLED` | Debe estar pendiente | Solo el desafiante |
| `ACCEPTED` → `IN_PROGRESS` | Debe estar aceptada | Ambos participantes conectados |

Sin la segunda columna, un desafiante puede aceptarse su propio desafío y elegir cuándo empieza el combate.

#### Autorización sobre el WebSocket

El socket no hereda nada. Es una superficie de ataque **separada**, y toda la autorización del REST no sirve de nada si se entra por al lado.

Además del handshake autenticado, cada mensaje revalida participación, turno, pertenencia de la habilidad al kit y disponibilidad de la reacción. El detalle está en las siete validaciones de la sección 7.

---

## 9. Alcance

### Núcleo — obligatorio para aprobar

- Autenticación completa con JWT, refresh y logout.
- Seguridad: helmet, CORS, throttler, validación global.
- `Build`: CRUD completo con validación de presupuesto y requisitos en el servidor.
- `Skill`: catálogo sembrado y consultable.
- `Friendship`: CRUD completo con ciclo de solicitud, aceptación y baja.
- `Battle`: CRUD completo con ciclo de vida del desafío.
- Motor de combate puro, con tests.
- Gateway WebSocket con acción y reacción.
- Rating actualizado al cerrar cada batalla puntuable.
- Documentación de la API con Scalar en `/reference`.
- Deploy funcional y README con documentación de endpoints y eventos de WebSocket.

### Fase 2 — solo si sobra tiempo

- Cola de matchmaking por rating.
- Temporadas con reinicio programado.
- Equipamiento.

### Plan por semanas

| Semana | Foco |
| --- | --- |
| 1 | Proyecto NestJS, `schema.prisma`, migraciones, autenticación completa, seguridad global |
| 2 | Motor de combate puro con tests, catálogo de habilidades, `Build` con validación |
| 3 | `Friendship`, ciclo de vida de `Battle`, gateway WebSocket |
| 4 | Rating y leaderboard, deploy, README, margen para imprevistos |

El deploy se hace **temprano y vacío**, en la semana 1. Un deploy que se intenta por primera vez en la última semana es el modo más común de no llegar.

---

## 10. Trazabilidad con la consigna

| Criterio de aprobación | Dónde se cumple |
| --- | --- |
| API en NestJS, TypeScript, Prisma y PostgreSQL | Stack del proyecto |
| Registro y login con contraseñas hasheadas | Sección 8 |
| JWT access y refresh, rutas protegidas | Secciones 6 y 8.1 |
| Regla de oro: ninguna ruta sin guardia, excepciones justificadas | Guard global con `@Public()`, sección 6 |
| Autorización por propietario y participación | Sección 8.2, con matriz por recurso |
| CRUD real de al menos dos recursos | `Build`, `Friendship` y `Battle`: tres |
| Seguridad básica aplicada | Sección 8.1 |
| Repositorio público con historial propio | Ramas cortas y Conventional Commits desde el primer día, según [`git-workflow.md`](./git-workflow.md) |
| Documentación de endpoints en README o Swagger | Scalar sobre OpenAPI en `/reference`, más el README |
| Deploy funcional y README documentado | Semana 1 el deploy, semana 4 el README |

---

## 11. Riesgos conocidos

| Riesgo | Mitigación |
| --- | --- |
| El WebSocket consume el mes y el CRUD queda a medias | Motor puro primero; el gateway es una capa, no el proyecto |
| El balanceo se vuelve un pozo sin fondo | Los números de la sección 4 son iniciales y se ajustan al final, no durante |
| El deploy falla la última semana | Se despliega vacío en la semana 1 y se sube en cada avance |
| La build óptima congela el ranking | Bounded accuracy, costo escalado y doble ruta ofensiva |
| Dos amigos farmean rating | Las batallas entre amigos no puntúan |
