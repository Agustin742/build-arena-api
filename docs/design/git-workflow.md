# Flujo de trabajo con Git

Cómo se rama, se commitea y se integra en este proyecto. El plan de fases está en [`implementation-plan.md`](./implementation-plan.md).

---

## Principios

1. **`main` siempre despliega.** Nunca se commitea directo sobre `main`. Si `main` está roto, producción está rota, y producción se mira desde el día uno.
2. **Ramas cortas.** Una rama vive horas o un par de días, no una semana. Cuanto más vive, más duele integrarla.
3. **Un commit, un cambio con sentido.** No se acumula un día entero en un commit, ni se parte una idea en seis.
4. **El historial se lee como el relato del proyecto.** `git log --oneline` sobre `main` tiene que contar qué se construyó y en qué orden. Eso es exactamente lo que se evalúa.

> La consigna es explícita: commits progresivos, nunca todo el proyecto en un commit final, y nada de `cambios`, `avance`, `arreglos`, `commit final`, `cosas` ni `asdf`.

---

## Ramas

### Estructura

Una sola rama permanente:

```
main                      siempre desplegable, protegida
  └─ feat/jwt-tokens      rama corta, se borra al integrar
  └─ feat/build-crud
  └─ fix/refresh-rotation
```

**No hay `develop`.** Este es un proyecto individual de un mes con despliegue continuo a un único entorno. Una rama de integración separada de `main` resuelve el problema de coordinar varios equipos hacia una fecha de lanzamiento, y ese problema no existe acá. Es una decisión, no una omisión.

### Nomenclatura

El prefijo de la rama es **el mismo tipo que va a llevar el commit**, seguido de una descripción corta en inglés y en `kebab-case`.

```
<type>/<short-description>
```

| Rama | Para qué |
| --- | --- |
| `feat/jwt-access-refresh` | Funcionalidad nueva |
| `fix/password-not-hashed` | Corrección de un defecto |
| `chore/eslint-flat-config` | Herramientas, configuración, dependencias |
| `docs/readme-endpoints` | Documentación |
| `test/combat-engine-branches` | Solo tests |
| `refactor/extract-dice-roller` | Reestructurar sin cambiar comportamiento |

### Tamaño de una rama

Una rama cubre **una unidad de trabajo**, no una fase entera. Una fase del plan son entre tres y seis ramas.

Ejemplo de la fase 2:

```
feat/user-registration
feat/jwt-access-refresh
feat/global-auth-guard
feat/security-middleware
feat/scalar-api-reference
```

Si una rama acumula más de unos diez commits, casi siempre eran dos ramas.

---

## Conventional Commits

### Anatomía

```
<type>(<scope>): <description>

[cuerpo opcional]

[pie opcional]
```

### Tipos

| Tipo | Cuándo |
| --- | --- |
| `feat` | Funcionalidad nueva visible para quien consume la API |
| `fix` | Corrección de un comportamiento defectuoso |
| `docs` | Solo documentación |
| `test` | Agregar o corregir tests |
| `refactor` | Cambio interno que no altera el comportamiento |
| `chore` | Configuración, dependencias, andamiaje |
| `perf` | Mejora de rendimiento |
| `build` | Sistema de build o empaquetado |
| `ci` | Integración continua |

### Ámbitos de este proyecto

El `scope` nombra el módulo tocado. Los de este proyecto:

```
auth  user  build  skill  friendship  battle  combat  ws  rating  prisma  config
```

### Reglas del mensaje

- **En inglés**, como todo el código.
- **Modo imperativo**: `add`, no `added` ni `adds`. El commit describe qué hace al aplicarse.
- **Minúscula inicial** en la descripción, **sin punto final**.
- **Máximo 72 caracteres** en la primera línea.
- El **cuerpo explica el porqué**, no el qué. El qué ya está en el diff.

### Ejemplos correctos

```
feat(auth): add user registration with bcrypt hashing
feat(auth): implement jwt access and refresh tokens
feat(build): validate attribute budget with escalating cost
fix(auth): hash refresh token before persisting
test(combat): cover critical hit damage doubling
refactor(combat): extract dice roller behind injectable source
docs(readme): document websocket events
chore(config): add throttler with stricter auth limits
```

### Ejemplos incorrectos

| Mensaje | Qué está mal |
| --- | --- |
| `cambios` | Prohibido por la consigna. No dice nada |
| `feat: stuff` | Sin ámbito y sin contenido |
| `Added JWT tokens.` | Pasado, mayúscula, punto final, sin tipo |
| `feat(auth): add jwt tokens and build crud and fix seed` | Tres cambios en un commit |
| `wip` | No llega a `main` jamás |

### Cambios que rompen compatibilidad

```
feat(auth)!: return refresh token in body instead of cookie

BREAKING CHANGE: los clientes que leían la cookie deben leer el cuerpo.
```

En un proyecto de un mes casi no aparece, pero se documenta por completitud.

---

## Flujo de trabajo

```
1.  git switch main
2.  git pull
3.  git switch -c feat/jwt-access-refresh
4.  trabajar, commiteando de a cambios con sentido
5.  git push -u origin feat/jwt-access-refresh
6.  abrir pull request hacia main
7.  releer el propio diff antes de integrar
8.  integrar con squash
9.  borrar la rama
10. verificar que el despliegue quedó verde
```

El paso 7 no es decorativo. **Leer el propio diff en la interfaz de GitHub encuentra cosas que no se ven en el editor**: un `console.log` olvidado, un archivo que no correspondía, un secreto que se coló. Trabajar solo no elimina la revisión; la vuelve tu responsabilidad.

### Pull requests

Aunque no haya nadie más, los pull requests dejan registro del proceso, que es parte de lo que se evalúa.

- **El título del pull request es un Conventional Commit**, porque al integrar con squash se convierte en el commit de `main`.
- El cuerpo dice qué resuelve y qué fase del plan cubre.
- Se integran de a uno, verificando el despliegue después de cada uno.

### Estrategia de integración: squash

```
Squash and merge
```

Cada pull request se convierte en **un commit limpio en `main`**. Consecuencias:

- `main` se lee como un registro de cambios: un commit por unidad de trabajo, todos en Conventional Commits.
- Los commits intermedios de la rama —incluidos los tanteos— quedan en el pull request, visibles pero fuera del historial principal.
- El historial es lineal, sin telaraña de merges.

Esto **no** contradice el requisito de commits progresivos: al final del mes `main` tiene decenas de commits con sentido repartidos en cuatro semanas, no uno solo.

### Protección de `main`

En la configuración del repositorio, activar sobre `main`:

- Requerir pull request antes de integrar.
- Borrar la rama automáticamente al integrar.

Sí, te obliga a vos mismo. **Esa es la idea**: la disciplina que depende de acordarse no es disciplina.

---

## Qué nunca se commitea

```
.env
node_modules/
dist/
*.log
```

`.env` va en `.gitignore` **desde el primer commit**. Si un secreto entra al historial, borrarlo del archivo no lo saca: queda en los commits anteriores y hay que rotar la credencial.

`.env.example` sí se commitea, con las claves y sin valores:

```
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
PORT=
CORS_ORIGIN=
```

---

## Automatización opcional

`commitlint` con `husky` rechaza un commit mal formado en el momento de escribirlo, en lugar de descubrirlo al revisar el historial en la última semana.

```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional husky
npx husky init
```

`commitlint.config.js`:

```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'auth',
        'user',
        'build',
        'skill',
        'friendship',
        'battle',
        'combat',
        'ws',
        'rating',
        'prisma',
        'config',
      ],
    ],
  },
}
```

`.husky/commit-msg`:

```bash
npx --no -- commitlint --edit "$1"
```

No es obligatorio, pero cuesta cinco minutos y elimina una clase entera de error.

---

## Relación con las fases y con SDD

Cada fase del plan de implementación se cubre con varias ramas. Ejemplo completo de la fase 1:

| Rama | Commits |
| --- | --- |
| `feat/prisma-schema` | `feat(prisma): add user build and skill models`<br>`feat(prisma): add battle and friendship models` |
| `feat/prisma-service` | `feat(prisma): add prisma service module` |
| `feat/skill-seed` | `feat(skill): seed skill catalog` |

En las fases 3 y 6, que se trabajan con SDD, **la rama toma el nombre de la change**:

```
feat/add-combat-engine
feat/add-realtime-battle
```

Los artefactos de SDD —propuesta, especificación, tareas— se commitean **en esa misma rama**, con tipo `docs`, antes de los commits de implementación. Así el pull request muestra la secuencia completa: primero qué se decidió, después cómo se construyó.

```
docs(combat): add sdd proposal and spec for combat engine
docs(combat): add design and task breakdown
feat(combat): add combat domain types
feat(combat): add injectable random source
```
