# Capas y responsabilidades

Cómo se reparte el trabajo dentro del código y, sobre todo, **qué no se comparte**. El diseño del dominio está en [`overview.md`](./overview.md); el orden de construcción, en [`implementation-plan.md`](./implementation-plan.md).

---

## El mapa

```
HTTP  /  WebSocket
      |
  controller  /  gateway        traduce el transporte
      |
  service                       reglas de negocio y autorizacion
      |
  PrismaService                 acceso a datos
      |
  PostgreSQL

  combat/                       motor puro, no lo toca nadie de arriba
```

El motor de combate queda a un costado a propósito. No es una capa entre el service y la base: es una función pura que el service **usa**. Recibe estado y una acción declarada, devuelve estado nuevo y eventos. No sabe que existen HTTP, Prisma ni Nest.

---

## Qué hace cada capa

### Controller

Traduce HTTP y nada más. Lee la petición, invoca un método del service, devuelve el resultado.

Un controller no valida reglas de negocio, no arma consultas, no decide si alguien tiene permiso. Si un controller tiene un `if` sobre datos del dominio, esa línea está en el lugar equivocado.

La razón es concreta y aparece en la fase 7: la misma operación de combate se invoca desde una ruta REST **y** desde el gateway de WebSocket. Si la regla vive en el controller, hay que escribirla dos veces, y la segunda va a quedar desincronizada.

### Service

Acá vive todo lo que importa: las reglas del dominio y la autorización.

- Valida el presupuesto de atributos y el kit de habilidades
- Acota cada consulta al usuario del token
- Decide qué transiciones de estado son legales y quién puede dispararlas
- Invoca al motor de combate cuando corresponde

El detalle de las reglas de autorización está en la [sección 8.2 de `overview.md`](./overview.md#82-autorización).

### PrismaService

Acceso a datos. Una única instancia inyectada, con la conexión atada al ciclo de vida del módulo: abre en `onModuleInit`, cierra en `onModuleDestroy`.

No hay capa de repositorios por encima. Prisma **ya es** la abstracción sobre SQL, y envolverla en repositorios propios para este proyecto agrega una capa de traducción que no resuelve ningún problema real. Es una decisión, no un olvido: si el proyecto necesitara soportar dos motores de base distintos, la respuesta sería otra.

### Motor de combate

Puro. Sin `@nestjs`, sin Prisma, sin red. Determinista si se le inyecta la fuente de aleatoriedad.

Es la única parte del proyecto que se puede testear entera en milisegundos y sin levantar nada. Por eso se escribe primero.

---

## Por qué no hay clase base

La tentación es un `BaseService<T>` con `findAll`, `findOne`, `create`, `update` y `remove`, y un `BaseController<T>` que exponga eso. Para este dominio, no funciona. No es una cuestión de gusto: el modelo de datos lo rompe en el primer método.

Un `findOne(id, currentUserId)` genérico necesita saber cuál es la columna de propiedad. Mirá los recursos reales:

| Recurso | Cómo se determina quién puede verlo |
| --- | --- |
| `Build` | `userId` |
| `Friendship` | `requesterId` **o** `addresseeId`, según quién pregunte |
| `Battle` | `challengerId` **o** `opponentId`, y con reglas distintas por transición |
| `Skill` | No tiene dueño, y **no tiene escritura**: el catálogo se siembra |

De cuatro recursos, la clase base sirve para uno. En los otros tres hay que sobrescribir el método, agregarle parámetros o ignorarlo. Y en `Skill` sería activamente dañina: un CRUD heredado expondría endpoints de escritura que la matriz de autorización prohíbe.

Hay un problema más grave que la incomodidad. **Lo que se repite entre features no es el CRUD: es el acotado por propietario.** Y eso ya está resuelto metiendo la condición adentro del `where`, distinto en cada modelo. Esconderlo detrás de una superclase no lo unifica; lo vuelve invisible justo donde hace falta leerlo con atención, que es la autorización.

---

## Qué sí se comparte, y cómo

Todo lo transversal se resuelve por **composición**: piezas que Nest aplica desde afuera o inyecta.

| Necesidad | Mecanismo | No así |
| --- | --- | --- |
| Validar entrada | `ValidationPipe` global | Método heredado |
| Exigir token | `JwtAuthGuard` global con `@Public()` para las excepciones | `extends ProtectedController` |
| Leer el usuario actual | Decorador de parámetro `@CurrentUser()` | `this.getCurrentUser()` |
| Traducir errores de Prisma a HTTP | Exception filter | `try/catch` repetido |
| Limitar peticiones | `@nestjs/throttler` global | Contador en cada service |

La diferencia no es estética. La herencia ata al hijo con el constructor y el ciclo de vida del padre, y esa atadura no se puede deshacer sin tocar todos los hijos. La composición se agrega y se quita de a una pieza.

---

## Estructura de carpetas

```
src/
  common/
    decorators/
    filters/
    guards/
  prisma/
  health/
  auth/
  user/
  build/
  skill/
  friendship/
  battle/
  combat/
  ws/
  rating/
```

Cada carpeta de feature es un módulo de Nest con su controller, su service y sus DTOs. `combat/` es la excepción: no exporta ningún módulo de Nest porque no depende del framework.

Los módulos declaran sus dependencias de forma explícita. `PrismaModule` **no** es global a propósito: que cada módulo que necesita la base lo diga en sus `imports` cuesta una línea y hace visible quién toca datos y quién no.

---

## Cuándo abstraer

No antes de tener **tres casos reales** delante.

Con dos casos parecidos, siempre parecen el mismo y la abstracción sale prematura. Con tres se ve cuál era la diferencia que importaba, y recién ahí se sabe qué había que compartir de verdad.

Duplicar dos veces es barato. Desarmar una abstracción equivocada, con cuatro features colgando de ella, no lo es.
