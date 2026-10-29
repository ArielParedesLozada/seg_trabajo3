# Diseño: Registro seguro de productos vendidos (validación a nivel de esquema)

## Intención y por qué

Trabajo académico de Seguridad (Trabajo 3). El escenario es una empresa de
comercio electrónico que necesita registrar, vía API, los productos que
vende. El punto central del ejercicio no es la app en sí, sino demostrar
que **toda la validación de datos vive en el esquema de Postgres** (tipos,
`NOT NULL`, `CHECK`, `UNIQUE`, `ENUM`), y que la capa de aplicación se
limita a reenviar sin traducir el error que la base de datos produce
cuando una regla se viola. La mini-app React existe para que ese error
"crudo" sea visible a un humano sin tener que leer logs del servidor.

## Goals

- Un archivo SQL en `./sql/` que, cargado manualmente contra Postgres
  (`psql -f`), cree un esquema que por sí solo rechace: nombres vacíos,
  precios negativos, stock inválido, categorías fuera de
  {perecible, no_perecible}, payloads/campos enormes, códigos duplicados,
  fechas inválidas, caracteres no permitidos y datos corruptos en general.
- Una API Express mínima con dos endpoints: registrar un producto
  (`POST`) y listar los productos existentes (`GET`).
- Una mini-app React con un formulario de alta y una tabla de productos,
  que muestre el error de Postgres tal cual venga cuando el `INSERT`
  falla.

## Non-goals

- No hay autenticación/autorización de usuarios (fuera de alcance del
  ejercicio).
- No hay edición ni borrado de productos — solo alta y listado, como se
  confirmó explícitamente.
- No hay paginación, búsqueda ni filtros en el listado.
- No se usa un ORM; el acceso a datos es SQL directo vía el driver `pg`,
  para no ocultar el error crudo de Postgres detrás de una capa de
  traducción de errores de un ORM.

## Anti-goals

- Que la validación "se escape" a JavaScript (ni en Express ni en React):
  si una regla de negocio se valida en el cliente o en el servidor de
  aplicación antes de llegar a la base, se pierde el objetivo del
  ejercicio. La app confía en que Postgres rechace lo inválido.
- Que la API reinterprete o resuma el error de Postgres ("Precio
  inválido" en vez del mensaje real). El mensaje debe llegar íntegro.

## Restricciones

- Postgres, cargado con un `source`-like manual (`psql -f sql/schema.sql`
  o equivalente), no un script de migración automático.
- Entorno gestionado con devenv (`devenv.nix` ya tiene `services.postgres`
  y `languages.javascript.enable`).
- Backend: Node.js + Express. Frontend: React.

## Approaches (decisiones ya tomadas)

1. **Categoría**: tipo `ENUM` de Postgres (`categoria_producto`), en vez
   de `CHECK IN (...)` o tabla de lookup con FK. Decisión del usuario.
2. **Exposición de errores**: Express envuelve el error crudo de `pg` en
   un sobre mínimo (`{ "error": { message, code, detail, constraint,
   table } }`) con un status HTTP genérico, sin reescribir el contenido.
   Decisión del usuario.
3. **Alcance funcional**: solo registrar y ver productos vendidos (altas
   y listado). Sin edición ni borrado. Decisión del usuario.

## Esquema SQL (`./sql/schema.sql`)

```sql
CREATE TYPE categoria_producto AS ENUM ('perecible', 'no_perecible');

CREATE TABLE productos_vendidos (
    id           BIGSERIAL PRIMARY KEY,
    codigo       VARCHAR(50)  NOT NULL,
    nombre       VARCHAR(150) NOT NULL,
    categoria    categoria_producto NOT NULL,
    precio       NUMERIC(12,2) NOT NULL,
    stock        INTEGER NOT NULL,
    fecha_venta  DATE NOT NULL,
    creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT codigo_unico UNIQUE (codigo),
    CONSTRAINT codigo_formato CHECK (codigo ~ '^[A-Za-z0-9_-]+$'),
    CONSTRAINT nombre_no_vacio CHECK (btrim(nombre) <> ''),
    CONSTRAINT nombre_caracteres_validos
        CHECK (nombre ~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9 .,-]+$'),
    CONSTRAINT precio_positivo CHECK (precio > 0),
    CONSTRAINT stock_no_negativo CHECK (stock >= 0),
    CONSTRAINT fecha_venta_valida
        CHECK (fecha_venta BETWEEN DATE '2000-01-01' AND CURRENT_DATE)
);
```

Cómo cubre cada restricción del TODO:

| Restricción del TODO     | Mecanismo en el esquema |
|---------------------------|--------------------------|
| Nombres vacíos             | `nombre_no_vacio` (tras `btrim`) |
| Precios negativos           | `precio_positivo` (`> 0`, no solo `>= 0`, porque un producto vendido con precio 0 no tiene sentido de negocio) |
| Stock inválido               | `stock_no_negativo` + tipo `INTEGER` (rechaza decimales/strings) |
| Categorías incorrectas       | tipo `ENUM categoria_producto` |
| Payloads/campos enormes      | límites `VARCHAR(n)`: Postgres rechaza nativamente con error de tipo si el valor excede la longitud |
| Códigos duplicados           | `codigo_unico` (`UNIQUE`) |
| Fechas inválidas              | tipo `DATE` (rechaza formato) + `fecha_venta_valida` (rechaza fechas fuera de rango razonable) |
| Caracteres no permitidos      | `codigo_formato` y `nombre_caracteres_validos` (regex `CHECK`) |
| Datos corruptos (general)     | combinación de `NOT NULL` + tipos estrictos (`NUMERIC`, `INTEGER`, `DATE`, `ENUM`) en todas las columnas |

**Mi call** (decisión menor, se puede ajustar sin cambiar el diseño): el
rango de fechas válidas (2000-01-01 hasta hoy) y el regex de caracteres
permitidos para `nombre` (letras con tildes, dígitos, espacio, `.`, `,`,
`-`) y `codigo` (alfanumérico, `_`, `-`). Son valores razonables por
defecto para un catálogo de e-commerce, ajustables si el caso de prueba
del profesor espera otra cosa.

## API Express

Dos rutas, sin capa de validación propia:

- `POST /api/productos` — recibe el body JSON, hace
  `INSERT ... RETURNING *` contra `productos_vendidos`. Si Postgres
  acepta, responde `201` con la fila creada. Si Postgres rechaza,
  el error handler captura la excepción del driver `pg` y responde con:

  ```json
  {
    "error": {
      "message": "...",
      "code": "23505",
      "detail": "...",
      "constraint": "codigo_unico",
      "table": "productos_vendidos"
    }
  }
  ```

  Status `400` si el error traído por el driver `pg` tiene un `code`
  de Postgres (SQLSTATE, 5 caracteres) — cubre tanto violaciones de
  integridad (`23xxx`: `UNIQUE`, `CHECK`, `NOT NULL`) como errores de
  tipo/dato (`22xxx`: valor de `ENUM` inválido, fecha mal formada,
  texto que excede el `VARCHAR(n)`, entero inválido para `stock`) —
  es decir, cualquier rechazo que venga de Postgres se trata como error
  de validación del cliente. `500` solo si el error no trae `code`
  (fallo de conexión, bug de programación — no un rechazo de datos).
  Los campos que `pg` no provea para un error dado simplemente se omiten
  del objeto, no se rellenan con valores inventados.

- `GET /api/productos` — `SELECT * FROM productos_vendidos ORDER BY
  creado_en DESC`, responde el arreglo tal cual.

Conexión a Postgres vía `pg.Pool`, usando las variables de entorno que
expone el servicio de devenv (`PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`
— devenv los inyecta automáticamente dentro del shell).

**Dejado al builder**: nombre exacto de la base de datos a usar (puede
ser la default de devenv o una creada explícitamente antes de cargar el
schema), y si el `express.json()` body-parser limita el tamaño del
payload HTTP (recomendado como defensa en profundidad, p.ej. `limit:
'10kb'`, aunque la validación de fondo sigue siendo la de Postgres).

## Mini-app React

Una sola pantalla:

- Formulario de alta: `codigo`, `nombre`, `categoria` (select con las dos
  opciones), `precio`, `stock`, `fecha_venta`. Botón "Registrar".
- Debajo, un bloque de error que se muestra solo cuando el último submit
  falló, con el JSON del campo `error` impreso sin formatear/interpretar
  (texto crudo, no un mensaje traducido).
- Tabla con los productos existentes (`GET /api/productos`), recargada
  tras cada alta exitosa (y al montar el componente).

**Dejado al builder**: el andamiaje exacto de la app (Vite + React es el
default razonable, consistente con `languages.javascript.enable` en
devenv), y estilo visual — no es parte del ejercicio.

## Estructura de carpetas propuesta

```
sql/
  schema.sql
server/
  package.json
  index.js
  db.js
client/
  package.json
  src/App.jsx
  ...
```

`devenv.nix` se extiende con dos `processes` (o se documenta en un
README cómo levantar server y client) para `devenv up` levante Postgres,
Express y el dev server de Vite juntos. El esquema SQL no se carga
automáticamente desde `devenv.nix` — el usuario lo aplica a mano con
`psql`, como en MySQL `source ./sql/...`.
