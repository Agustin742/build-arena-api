# Motor de combate

Guía de lectura y funcionamiento de `src/combat/`.

El motor es **TypeScript puro**. No importa nada de `@nestjs`, no tiene `@Injectable()`
y no expone ningún módulo de Nest. Se consume como una función: le pasás estado, te
devuelve estado nuevo más los eventos que ocurrieron. Nunca muta lo que recibe.

Con la fuente de aleatoriedad fija, las mismas entradas producen **siempre** la misma
salida. Esa propiedad es lo que hace que un combate se pueda testear, reproducir y
auditar.

---

## 1. Cómo está organizado

```
src/combat/
├── index.ts        superficie pública (lo que importa la Fase 5)
├── turn.ts         LA ENTRADA — resuelve un turno entero
├── types.ts        vocabulario del dominio
├── core/           no sabe nada del juego
│   ├── arithmetic.ts      redondeo de reglas (dueño único)
│   ├── random-source.ts   la interfaz que hace testeable todo
│   ├── d20.ts             ventaja y desventaja
│   └── derived-stats.ts   Clase de Armadura, PV, iniciativa
├── attack/         resuelve UN golpe
│   ├── physical-attack.ts contra Clase de Armadura
│   ├── magic-attack.ts    por tirada de salvación
│   └── damage.ts          dados de daño y cadena de reducción
└── state/          lo que dura entre rondas
    ├── conditions.ts      POISONED, STUNNED, WEAKENED
    ├── reactions.ts       tabla de las seis reacciones
    └── round.ts           el tick de inicio de ronda
```

El criterio de agrupación es **cuánto sabe cada carpeta**. `core/` no sabe qué es un
ataque; podrías llevártelo a otro proyecto. `attack/` resuelve un golpe y no sabe que
existen las rondas. `state/` maneja lo que persiste. `turn.ts` los compone.

Cada archivo tiene su `.spec.ts` al lado, como el resto del repositorio.

---

## 2. Camino de lectura

Leelos en este orden. Cada uno se apoya solo en los anteriores.

| # | Archivo | Qué vas a entender |
| --- | --- | --- |
| 1 | `types.ts` | El vocabulario: combatiente, acción declarada, reacción, registro de turno, evento. Sin esto el resto no se lee. |
| 2 | `core/random-source.ts` | **Empezá por acá si solo vas a leer un archivo.** Es la decisión que sostiene todo lo demás. |
| 3 | `core/arithmetic.ts` | `modifier`, `halve`, `clampDamage`. Quince líneas que concentran todo el redondeo. |
| 4 | `core/d20.ts` | Cómo se componen ventaja y desventaja **afuera** de la interfaz de dados. |
| 5 | `core/derived-stats.ts` | Las tres fórmulas derivadas de los atributos. |
| 6 | `attack/damage.ts` | Los dados de daño, el crítico y la cadena ordenada de reducción. |
| 7 | `attack/physical-attack.ts` | La resolución contra Clase de Armadura. |
| 8 | `attack/magic-attack.ts` | La resolución por salvación, que no tira ataque. |
| 9 | `state/conditions.ts` | Qué hace cada condición y cómo se aplica. |
| 10 | `state/reactions.ts` | La tabla de reacciones y a qué responde cada una. |
| 11 | `state/round.ts` | El tick de inicio de ronda. Leé el comentario del test, no solo el código. |
| 12 | `turn.ts` | La tubería de nueve pasos que compone todo lo anterior. |

Si querés entender el motor **de arriba hacia abajo** en vez de de abajo hacia arriba,
leé `turn.ts` primero y andá abriendo lo que importa. Es más rápido pero menos firme.

---

## 3. La aleatoriedad inyectada

```ts
export interface RandomSource {
  rollD20: () => number;
  rollDice: (notation: string) => number;
}
```

Dos métodos. Esa interfaz es la razón por la que el motor se puede testear.

Con `Math.random()` incrustado adentro de la resolución no podés forzar un 20 natural,
no podés forzar un 1, y no podés reproducir un combate que salió mal. Tendrías que
tirar mil veces y esperar que la estadística te dé la razón, que no es un test: es una
apuesta.

Fijate también lo que la interfaz **no** sabe: no sabe qué es la ventaja. La ventaja se
compone afuera, llamando `rollD20()` dos veces y quedándose con el máximo. Si tuviera un
método `rollWithAdvantage()`, cada regla nueva del juego obligaría a tocarla.

Hay dos implementaciones: `SystemRandomSource` para producción y `SequenceRandomSource`,
que reproduce un guion de valores fijo. La segunda no es solo para tests: permite
**reproducir un combate registrado**, que es una capacidad real de las fases 5 y 6.

---

## 4. Las reglas

### Estadísticas derivadas

```
armorClass = 10 + modificador(destreza)
maxHp      = 30 + modificador(constitución) × 5
initiative = d20 + modificador(destreza)
```

### Ataque físico

`d20 + modificador(atributo que resuelve)` contra la Clase de Armadura. Igualar o
superar impacta. Es binario: no hay daño parcial.

Un **20 natural siempre impacta y es crítico**; un **1 natural siempre falla**. Las dos
cosas se deciden *antes* de mirar la Clase de Armadura, así que `DODGE` no puede anular
un crítico ni rescatar un 1 natural.

El crítico **duplica los dados, no el modificador**: se tira la notación del skill dos
veces y se suman. `2d6` en crítico son dos llamadas de `2d6`.

El atributo que resuelve es el que **desbloquea** la habilidad. `PRECISE_SHOT` exige
Destreza 13, así que tira y daña con Destreza, no con Fuerza.

### Ataque mágico

No hay tirada de ataque ni Clase de Armadura. El atacante impone
`dificultad = 8 + modificador(magia)`, y el defensor tira
`d20 + modificador(constitución)` contra ella. Superarla **reduce el daño a la mitad**;
fallarla lo cobra entero.

No hay crítico en la salvación: un 20 o un 1 natural del defensor no hacen nada especial.

El daño mágico **no suma modificador de atributo**, a diferencia del físico. Es el precio
de ignorar la Clase de Armadura y garantizar al menos daño mitad.

### Ventaja y desventaja

Se tiran 2d20 y se toma el alto o el bajo. **No se acumulan**: dos fuentes de ventaja
siguen siendo ventaja, y ventaja con desventaja se cancelan a una tirada limpia.

Consecuencia buscada y documentada: como el 20 natural es crítico, quedarse con el más
alto de dos dados sube la tasa de críticos del 5% a **≈9.75%**. No es un defecto; es la
combinación de dos reglas.

### Condiciones

Tres condiciones, tres ejes distintos para que no se pisen.

| Condición | Efecto |
| --- | --- |
| `POISONED` | Desventaja en tus tiradas de ataque **y** −2 a la dificultad de salvación que imponés con magia |
| `STUNNED` | Perdés tu acción **y** tu reacción esa ronda |
| `WEAKENED` | El daño que hacés se reduce a la mitad, redondeando abajo |

Puntería, tempo y daño.

Detalles que importan:

- Una condición aplicada a mitad de ronda **no afecta esa ronda**. Rige desde el próximo
  inicio de ronda.
- Reaplicar una condición activa **refresca** su duración. No se apilan: el schema lo
  impide con `@@unique([combatantId, type])`.
- `POISONED` no afecta a `COUNTER` ni a `RIPOSTE`, porque esas reacciones no tiran ataque.
- El daño mágico solo aplica su condición **si la salvación falla**.

### Reacciones

El comportamiento vive en una tabla tipada del motor; los números (`damageDice`,
`appliesCondition`, `conditionRounds`) vienen de la fila de `Skill` en la base. Una
reacción nueva del mismo tipo no necesita migración.

| Reacción | Responde a | Efecto |
| --- | --- | --- |
| `BRACE` | cualquiera | Reduce el daño en `modificador(constitución)`, con la **reducción** mínima en 1 |
| `PARRY` | física | Reduce el daño a la mitad, redondeando abajo |
| `DODGE` | física | `+modificador(destreza)` a la Clase de Armadura contra ese ataque |
| `ARCANE_WARD` | mágica | `+modificador(magia)` a la tirada de salvación |
| `COUNTER` | cualquiera | Come el daño entero y devuelve `1d6 + modificador(fuerza)` si impactaron |
| `RIPOSTE` | física | Solo si **fallan**: devuelve `1d8 + modificador(destreza)` y aplica `WEAKENED` 2 rondas |

`DODGE` es a lo físico lo que `ARCANE_WARD` es a lo mágico: los dos mejoran tu número de
defensa **antes** de la tirada. `BRACE` y `PARRY` reducen daño **después**. `COUNTER` y
`RIPOSTE` castigan, y ninguno tira ataque propio.

Una reacción no aplicable, no disponible o suprimida por `STUNNED` se **ignora con un
evento**, nunca con una excepción. El motor no tiene canal de error ni framework que lo
traduzca.

---

## 5. La tubería de nueve pasos

`resolveTurn` resuelve acción y reacción **juntas**, en este orden exacto:

```
1. Modificadores de defensa de la reacción   ← ANTES de la tirada
2. Resolver la tirada de la acción
3. Calcular daño
4. Mitigación de la reacción                 ← DESPUÉS de la tirada
5. Restar puntos de vida
6. ¿Cayó a 0? → termina el combate, sin contraataque y sin condición
7. Contraataque, si se cumplió su disparador
8. Aplicar condiciones
9. Emitir los registros de turno
```

El orden **es** el motor. Cambiar cualquier paso de lugar cambia el resultado de cada
combate.

El **paso 6** es explícito: si el defensor cae, `COUNTER` no dispara. El combate termina.

El **paso 8 es terminal**, y de eso depende que una condición aplicada este turno no
afecte este turno. Hoy se cumple porque nada tira después. Hay un test que fija esa
propiedad: si una fase futura inserta una tirada ahí, ese test se pone rojo.

### El orden del redondeo

Varias reglas parten valores a la mitad. El orden fijado es:

```
WEAKENED → salvación superada → PARRY → BRACE → clamp
```

Las mitades **conmutan** bajo división entera, porque `⌊⌊x/2⌋/2⌋ = ⌊x/4⌋`. Eso está
demostrado, no supuesto. Lo único sensible al orden es la resta plana de `BRACE`, que
va última: así una mitad posterior no puede convertir su mínimo garantizado de 1 en 0.

---

## 6. Invariantes que no se rompen

Estos se verifican con un comando, no con buena voluntad:

```bash
rg "@nestjs|@Injectable" src/combat/     # debe no devolver nada
rg "Math\.floor" src/combat/             # solo en core/arithmetic.ts y core/random-source.ts
```

- El motor **no importa nada del framework**.
- Todo el redondeo de reglas pasa por `core/arithmetic.ts`. Un `Math.floor` suelto en un
  resolvedor se ve de inmediato.
- `resolveTurn` y `startRound` son **puras**: no mutan sus entradas.
- Ningún archivo `.ts` del motor vive fuera de `src/`, porque eso rompería el comando de
  arranque de Render.

---

## 7. Cómo se usa

```ts
import { resolveTurn, startRound, SystemRandomSource } from './combat';

const afterTick = startRound({ round: 3, actor });

const resolution = resolveTurn({
  round: 3,
  actor: afterTick.actor,
  defender,
  action: { actorId: actor.id, skill: powerStrike },
  reaction: { actorId: defender.id, skill: parry },
  random: new SystemRandomSource(),
});

resolution.turns;      // 1 o 2 registros, listos para persistir como BattleTurn
resolution.events;     // qué ocurrió, para emitir por WebSocket
resolution.defeatedId; // quién cayó, o null
```

El motor **no decide cuándo** se llama a `startRound`: eso lo maneja la Fase 5. Las
reglas quedan adentro, la orquestación afuera.

---

## Documentos relacionados

- [`overview.md`](./overview.md) — las reglas del juego y por qué son así
- [`architecture.md`](./architecture.md) — por qué `combat/` es la excepción sin framework
- `openspec/changes/add-combat-engine/` — propuesta, especificaciones, diseño y tareas
