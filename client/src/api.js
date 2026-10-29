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
