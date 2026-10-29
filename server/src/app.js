const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { envelopeFromPgError } = require('./errorEnvelope');

function createApp() {
  const app = express();
  app.use(cors());
  // El límite real contra payloads enormes vive en el CHECK de la base
  // (descripcion_tamano_valido); este límite de Express solo necesita ser
  // generoso para que texto legítimamente grande (p. ej. una descripción
  // de varios MB) llegue intacto a Postgres en vez de cortarse aquí.
  app.use(express.json({ limit: '20mb' }));

  app.post('/api/productos', async (req, res) => {
    const { codigo, nombre, categoria, precio, stock, fecha_venta, descripcion } = req.body;
    try {
      const { rows } = await pool.query(
        `INSERT INTO productos_vendidos (codigo, nombre, categoria, precio, stock, fecha_venta, descripcion)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [codigo, nombre, categoria, precio, stock, fecha_venta, descripcion ?? null]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      const { status, body } = envelopeFromPgError(err);
      res.status(status).json(body);
    }
  });

  app.get('/api/productos', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM productos_vendidos ORDER BY creado_en DESC'
      );
      res.json(rows);
    } catch (err) {
      const { status, body } = envelopeFromPgError(err);
      res.status(status).json(body);
    }
  });

  return app;
}

module.exports = { createApp };
