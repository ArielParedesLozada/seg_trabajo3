# Registro de productos vendidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Postgres schema that enforces every validation rule by itself, an Express API that only forwards Postgres's raw errors, and a React mini-app to register and list sold products.

**Architecture:** `sql/schema.sql` defines an ENUM category type and a `productos_vendidos` table whose `CHECK`/`UNIQUE`/`NOT NULL`/column-type constraints reject every invalid input from the TODO. `server/` is a small Express app with two routes (`POST`/`GET` on `/api/productos`) backed by a `pg.Pool`; a single helper turns any Postgres error into a JSON envelope without rewriting its content. `client/` is a Vite + React app with a form, an error banner showing that envelope verbatim, and a table fed by the `GET` route.

**Tech Stack:** PostgreSQL (devenv service), Node.js + Express + `pg` (backend), React + Vite (frontend), Node's built-in `node:test` + `supertest` for backend tests, Vitest + React Testing Library for frontend tests.

**Spec:** `docs/superpowers/specs/2026-10-28-registro-productos-design.md`

## Global Constraints

- Schema lives in `sql/schema.sql`, loaded manually against Postgres (`psql -f`) — never auto-applied by app code or devenv.
- All validation (empty names, negative prices, invalid stock, bad category, oversized fields, duplicate codes, invalid dates, disallowed characters, corrupt data) is enforced by the schema itself — Express and React must not re-validate or pre-filter input before it reaches Postgres.
- The API must forward Postgres's error fields (`message`, `code`, `detail`, `constraint`, `table`) unmodified; no translated/summarized error text.
- No auth, no edit/delete, no pagination/search — only create (`POST`) and list (`GET`).
- No ORM — raw SQL via `pg`.
- `categoria` is a Postgres `ENUM` (`categoria_producto`), not a `CHECK IN (...)`.

## Review Focus

- **Invalid `categoria` value** (e.g. `"otra"`): Postgres must reject with `22P02` and the API must return it as a 400 envelope, not swallow it as a 500. Covered in Task 2 (API error-mapping test) and Task 1 (schema constraint test).
- **`codigo` exceeding 50 chars or containing disallowed characters**: must be rejected by type/regex, not silently truncated. Covered in Task 1.
- **`fecha_venta` in the future or before 2000-01-01**: must be rejected by `fecha_venta_valida`. Covered in Task 1.
- **Duplicate `codigo` on second insert**: must raise `23505` and the API must surface it as 400 with `constraint: "codigo_unico"`. Covered in Task 1 and Task 2.
- **POST body missing a required field entirely** (e.g. no `stock` key): Postgres raises `23502` (`not_null_violation`); the API must still produce a well-formed envelope rather than throwing on `undefined` reaching the query. Covered in Task 2.

---

## Task 1: SQL schema and database-level constraint tests

**Files:**
- Create: `sql/schema.sql`
- Create: `server/package.json`
- Create: `server/test/setupTestDb.js`
- Create: `server/test/schema.test.js`

**Interfaces:**
- Produces: `sql/schema.sql` — defines `TYPE categoria_producto` and `TABLE productos_vendidos` exactly as in the spec's schema section.
- Produces: `server/test/setupTestDb.js` exports `async function resetSchema(pool)` — drops `productos_vendidos` and `categoria_producto` if they exist, then executes the full contents of `sql/schema.sql` against the given `pg.Pool`. Later tasks' tests reuse this to get a clean schema per test run.

- [ ] **Step 1: Write `sql/schema.sql`**

Use exactly the schema from the spec's "Esquema SQL" section:

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

- [ ] **Step 2: Create `server/package.json` with the `pg` dependency and a `test` script**

```json
{
  "name": "server",
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": {
    "test": "node --test test/"
  },
  "dependencies": {
    "express": "^4.19.0",
    "pg": "^8.11.0"
  },
  "devDependencies": {
    "supertest": "^7.0.0"
  }
}
```

Run `npm install` inside `server/`.

- [ ] **Step 3: Write `server/test/setupTestDb.js`**

```js
const fs = require('node:fs');
const path = require('node:path');

async function resetSchema(pool) {
  await pool.query('DROP TABLE IF EXISTS productos_vendidos');
  await pool.query('DROP TYPE IF EXISTS categoria_producto');
  const sql = fs.readFileSync(
    path.join(__dirname, '..', '..', 'sql', 'schema.sql'),
    'utf8'
  );
  await pool.query(sql);
}

module.exports = { resetSchema };
```

- [ ] **Step 4: Write the failing constraint tests in `server/test/schema.test.js`**

One `test()` per rule from the spec's coverage table, each inserting a row that violates exactly one constraint (all other fields valid) and asserting on `err.code`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { resetSchema } = require('./setupTestDb');

const pool = new Pool();
const valid = {
  codigo: 'ABC-123', nombre: 'Manzana', categoria: 'perecible',
  precio: 10.5, stock: 5, fecha_venta: '2026-01-01',
};

function insert(overrides) {
  const row = { ...valid, ...overrides };
  return pool.query(
    `INSERT INTO productos_vendidos (codigo, nombre, categoria, precio, stock, fecha_venta)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [row.codigo, row.nombre, row.categoria, row.precio, row.stock, row.fecha_venta]
  );
}

test.before(() => resetSchema(pool));
test.after(() => pool.end());

test('accepts a fully valid row', async () => {
  await assert.doesNotReject(() => insert({}));
});

test('rejects empty nombre', async () => {
  await assert.rejects(() => insert({ codigo: 'X1', nombre: '   ' }), /nombre_no_vacio/);
});

test('rejects negative precio', async () => {
  await assert.rejects(() => insert({ codigo: 'X2', precio: -1 }), /precio_positivo/);
});

test('rejects negative stock', async () => {
  await assert.rejects(() => insert({ codigo: 'X3', stock: -1 }), /stock_no_negativo/);
});

test('rejects invalid categoria value', async () => {
  await assert.rejects(
    () => insert({ codigo: 'X4', categoria: 'otra' }),
    (err) => err.code === '22P02'
  );
});

test('rejects duplicate codigo', async () => {
  await insert({ codigo: 'DUP-1' });
  await assert.rejects(() => insert({ codigo: 'DUP-1' }), /codigo_unico/);
});

test('rejects future fecha_venta', async () => {
  await assert.rejects(
    () => insert({ codigo: 'X5', fecha_venta: '2999-01-01' }),
    /fecha_venta_valida/
  );
});

test('rejects disallowed characters in nombre', async () => {
  await assert.rejects(
    () => insert({ codigo: 'X6', nombre: 'Manzana<script>' }),
    /nombre_caracteres_validos/
  );
});

test('rejects codigo longer than 50 characters', async () => {
  await assert.rejects(
    () => insert({ codigo: 'A'.repeat(51) }),
    (err) => err.code === '22001'
  );
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd server && npm test`
Expected: FAIL — `relation "productos_vendidos" does not exist` (schema not loaded into the dev DB yet, or `resetSchema` not yet exercised against a real connection) or connection error if Postgres isn't running.

- [ ] **Step 6: Start Postgres and verify tests pass**

Run (inside devenv shell): `devenv up -d` or ensure `services.postgres` is running, then `cd server && npm test`.
Expected: all tests PASS. If any constraint test fails, fix `sql/schema.sql` (not the test) until it matches the spec's intent.

- [ ] **Step 7: Commit**

```bash
git add sql/schema.sql server/package.json server/package-lock.json server/test/setupTestDb.js server/test/schema.test.js
git commit -m "feat: add productos_vendidos schema with full constraint coverage"
```

---

## Task 2: Express API (`POST`/`GET /api/productos`)

**Files:**
- Create: `server/src/db.js`
- Create: `server/src/errorEnvelope.js`
- Create: `server/src/app.js`
- Create: `server/src/index.js`
- Create: `server/test/errorEnvelope.test.js`
- Create: `server/test/api.test.js`

**Interfaces:**
- Consumes: `resetSchema(pool)` from `server/test/setupTestDb.js` (Task 1).
- Produces: `server/src/db.js` exports `pool` (a `pg.Pool` instance, no-arg constructor — reads `PG*` env vars from the devenv shell).
- Produces: `server/src/errorEnvelope.js` exports `function envelopeFromPgError(err)` returning `{ status: number, body: { error: object } }`.
- Produces: `server/src/app.js` exports `function createApp()` returning an Express `app` (not listening) — later tasks and tests call this directly with `supertest`.

- [ ] **Step 1: Write the failing unit test for the error envelope in `server/test/errorEnvelope.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { envelopeFromPgError } = require('../src/errorEnvelope');

test('maps a Postgres error with a SQLSTATE code to 400 with only present fields', () => {
  const err = { message: 'duplicate key', code: '23505', constraint: 'codigo_unico', table: 'productos_vendidos' };
  const { status, body } = envelopeFromPgError(err);
  assert.equal(status, 400);
  assert.deepEqual(body, {
    error: { message: 'duplicate key', code: '23505', constraint: 'codigo_unico', table: 'productos_vendidos' },
  });
});

test('maps a data-exception code (class 22) to 400, not 500', () => {
  const { status } = envelopeFromPgError({ message: 'invalid input value for enum', code: '22P02' });
  assert.equal(status, 400);
});

test('maps an error with no SQLSTATE code to 500', () => {
  const { status, body } = envelopeFromPgError({ message: 'connection refused' });
  assert.equal(status, 500);
  assert.deepEqual(body, { error: { message: 'connection refused' } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && node --test test/errorEnvelope.test.js`
Expected: FAIL — `Cannot find module '../src/errorEnvelope'`

- [ ] **Step 3: Implement `envelopeFromPgError(err)` in `server/src/errorEnvelope.js`**

Status is `400` when `err.code` is a defined SQLSTATE string, `500` otherwise (per the spec's revised error-classification rule). Body's `error` object includes only whichever of `message`, `code`, `detail`, `constraint`, `table` are present (non-`undefined`) on `err`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && node --test test/errorEnvelope.test.js`
Expected: PASS

- [ ] **Step 5: Write `server/src/db.js`**

```js
const { Pool } = require('pg');
const pool = new Pool();
module.exports = { pool };
```

- [ ] **Step 6: Write the failing integration tests in `server/test/api.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { pool } = require('../src/db');
const { createApp } = require('../src/app');
const { resetSchema } = require('./setupTestDb');

const app = createApp();
const valid = {
  codigo: 'API-1', nombre: 'Pan', categoria: 'perecible',
  precio: 5, stock: 10, fecha_venta: '2026-01-01',
};

test.before(() => resetSchema(pool));
test.after(() => pool.end());

test('POST /api/productos creates a product and returns 201', async () => {
  const res = await request(app).post('/api/productos').send(valid);
  assert.equal(res.status, 201);
  assert.equal(res.body.codigo, 'API-1');
});

test('POST /api/productos with invalid categoria returns 400 with raw Postgres fields', async () => {
  const res = await request(app)
    .post('/api/productos')
    .send({ ...valid, codigo: 'API-2', categoria: 'otra' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, '22P02');
});

test('POST /api/productos with a missing required field returns 400, not a crash', async () => {
  const { stock, ...withoutStock } = valid;
  const res = await request(app)
    .post('/api/productos')
    .send({ ...withoutStock, codigo: 'API-3' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, '23502');
});

test('POST /api/productos with duplicate codigo returns 400 with constraint name', async () => {
  await request(app).post('/api/productos').send({ ...valid, codigo: 'API-DUP' });
  const res = await request(app).post('/api/productos').send({ ...valid, codigo: 'API-DUP' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.constraint, 'codigo_unico');
});

test('GET /api/productos lists created products ordered by creado_en desc', async () => {
  const res = await request(app).get('/api/productos');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some((p) => p.codigo === 'API-1'));
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd server && node --test test/api.test.js`
Expected: FAIL — `Cannot find module '../src/app'`

- [ ] **Step 8: Implement `createApp()` in `server/src/app.js`**

```js
const express = require('express');
const { pool } = require('./db');
const { envelopeFromPgError } = require('./errorEnvelope');

function createApp() {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  app.post('/api/productos', async (req, res) => {
    const { codigo, nombre, categoria, precio, stock, fecha_venta } = req.body;
    try {
      const { rows } = await pool.query(
        `INSERT INTO productos_vendidos (codigo, nombre, categoria, precio, stock, fecha_venta)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [codigo, nombre, categoria, precio, stock, fecha_venta]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      const { status, body } = envelopeFromPgError(err);
      res.status(status).json(body);
    }
  });

  app.get('/api/productos', async (_req, res) => {
    const { rows } = await pool.query(
      'SELECT * FROM productos_vendidos ORDER BY creado_en DESC'
    );
    res.json(rows);
  });

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd server && npm test`
Expected: all tests in `errorEnvelope.test.js`, `schema.test.js`, and `api.test.js` PASS.

- [ ] **Step 10: Write `server/src/index.js`**

```js
const { createApp } = require('./app');

const app = createApp();
const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`API escuchando en :${port}`);
});
```

- [ ] **Step 11: Commit**

```bash
git add server/src server/test/errorEnvelope.test.js server/test/api.test.js
git commit -m "feat: add Express API with raw Postgres error passthrough"
```

---

## Task 3: React mini-app (form, error banner, product table)

**Files:**
- Create: `client/package.json`, `client/vite.config.js`, `client/index.html`
- Create: `client/src/api.js`
- Create: `client/src/App.jsx`
- Create: `client/src/components/ProductForm.jsx`
- Create: `client/src/components/ErrorBanner.jsx`
- Create: `client/src/components/ProductTable.jsx`
- Create: `client/src/App.test.jsx`

**Interfaces:**
- Consumes: `POST /api/productos` and `GET /api/productos` from Task 2 (response shapes as implemented there: `201` + row object, `400`/`500` + `{error:{...}}`, `200` + array).
- Produces: `client/src/api.js` exports `async function createProducto(data)` → resolves to `{ ok: true, data }` on 2xx or `{ ok: false, error }` on non-2xx (where `error` is the parsed `body.error`), and `async function listProductos()` → resolves to an array.

- [ ] **Step 1: Scaffold the Vite React app**

Run: `npm create vite@latest client -- --template react` (or hand-write the minimal `package.json`/`vite.config.js`/`index.html` if offline). Add `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` as devDependencies. Add a `"test": "vitest run"` script.

- [ ] **Step 2: Write `client/src/api.js`**

```js
export async function createProducto(data) {
  const res = await fetch('/api/productos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  return res.ok ? { ok: true, data: body } : { ok: false, error: body.error };
}

export async function listProductos() {
  const res = await fetch('/api/productos');
  return res.json();
}
```

Add a Vite dev-server proxy for `/api` to `http://localhost:3001` in `client/vite.config.js` so `fetch('/api/...')` reaches Express without CORS setup.

- [ ] **Step 3: Write the failing component test in `client/src/App.test.jsx`**

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import * as api from './api';

beforeEach(() => {
  vi.spyOn(api, 'listProductos').mockResolvedValue([]);
});

it('shows the raw error fields when creating a product fails', async () => {
  vi.spyOn(api, 'createProducto').mockResolvedValue({
    ok: false,
    error: { message: 'invalid input value for enum categoria_producto: "otra"', code: '22P02' },
  });
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: /registrar/i }));
  await waitFor(() =>
    expect(screen.getByText(/22P02/)).toBeInTheDocument()
  );
  expect(screen.getByText(/invalid input value for enum/)).toBeInTheDocument();
});

it('adds the created product to the table on success', async () => {
  vi.spyOn(api, 'createProducto').mockResolvedValue({
    ok: true,
    data: { id: 1, codigo: 'X1', nombre: 'Pan', categoria: 'perecible', precio: '5.00', stock: 10, fecha_venta: '2026-01-01' },
  });
  render(<App />);
  await userEvent.click(screen.getByRole('button', { name: /registrar/i }));
  await waitFor(() => expect(screen.getByText('X1')).toBeInTheDocument());
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd client && npm test`
Expected: FAIL — `App` has no submit button / component not implemented yet.

- [ ] **Step 5: Implement `ProductForm`, `ErrorBanner`, `ProductTable`, and `App`**

- `ProductForm` ({ onSubmit }): controlled inputs for `codigo`, `nombre`, `categoria` (`<select>` with `perecible`/`no_perecible`), `precio`, `stock`, `fecha_venta`; calls `onSubmit(formValues)` on submit; button labeled "Registrar".
- `ErrorBanner` ({ error }): renders nothing when `error` is `null`; otherwise renders every key of `error` as plain text (e.g. `${key}: ${value}` per line) — no interpretation, no custom copy.
- `ProductTable` ({ productos }): renders one row per product with its columns.
- `App`: owns `productos` and `error` state; loads `listProductos()` on mount; on form submit calls `createProducto`, and on `{ok:false}` sets `error` to `result.error`, on `{ok:true}` clears `error`, prepends `result.data` to `productos`.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd client && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add client
git commit -m "feat: add React mini-app for product registration and listing"
```

---

## Task 4: Wire devenv to run Postgres, Express, and the Vite dev server together

**Files:**
- Modify: `devenv.nix`
- Create: `README.md` (quick-start instructions, since the schema load step is manual by design)

**Interfaces:**
- Consumes: `server/src/index.js` (Task 2) and `client` dev server (Task 3) as the two processes devenv launches.
- Produces: nothing consumed by other tasks — this is the final integration task.

- [ ] **Step 1: Add `processes` to `devenv.nix`**

```nix
processes = {
  server.exec = "cd server && node src/index.js";
  client.exec = "cd client && npm run dev";
};
```

- [ ] **Step 2: Write `README.md`** documenting, in order: `devenv shell`, create the dev database if it doesn't already exist, load the schema with `psql -f sql/schema.sql`, `npm install` in `server/` and `client/`, then `devenv up` to run Postgres + Express + Vite together.

- [ ] **Step 3: Manual verification (no automated test — this step exercises the whole stack together)**

Run: `devenv shell`, create/confirm the dev database, `psql -f sql/schema.sql`, `(cd server && npm install)`, `(cd client && npm install)`, `devenv up`.
In the browser: submit a product with `categoria: "otra"` and confirm the raw Postgres error (`22P02`, the enum message) renders in the error banner; submit a valid product and confirm it appears in the table.

- [ ] **Step 4: Commit**

```bash
git add devenv.nix README.md
git commit -m "chore: wire up devenv processes for server and client"
```
