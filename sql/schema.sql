CREATE TYPE categoria_producto AS ENUM ('perecible', 'no_perecible');

CREATE TABLE productos_vendidos (
    id           BIGSERIAL PRIMARY KEY,
    codigo       VARCHAR(50)  NOT NULL,
    nombre       VARCHAR(150) NOT NULL,
    categoria    categoria_producto NOT NULL,
    precio       NUMERIC(12,2) NOT NULL,
    stock        INTEGER NOT NULL,
    fecha_venta  DATE NOT NULL,
    descripcion  TEXT,
    creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT codigo_unico UNIQUE (codigo),
    CONSTRAINT codigo_formato CHECK (codigo ~ '^[A-Za-z0-9_-]+$'),
    CONSTRAINT nombre_no_vacio CHECK (btrim(nombre) <> ''),
    CONSTRAINT nombre_caracteres_validos
        CHECK (nombre ~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9 .,-]+$'),
    CONSTRAINT precio_positivo CHECK (precio > 0),
    CONSTRAINT stock_no_negativo CHECK (stock >= 0),
    CONSTRAINT fecha_venta_valida
        CHECK (fecha_venta BETWEEN DATE '2000-01-01' AND CURRENT_DATE),
    -- TEXT se guarda vía TOAST (fuera de la fila principal, comprimido) si supera ~2KB,
    -- así que es eficiente incluso con contenido muy grande (p. ej. el texto completo
    -- de una novela). El tope de 5,000,000 caracteres (~5 MB) deja pasar cualquier
    -- descripción real y solo rechaza payloads verdaderamente descomunales.
    CONSTRAINT descripcion_tamano_valido CHECK (descripcion IS NULL OR char_length(descripcion) <= 5000000)
);
