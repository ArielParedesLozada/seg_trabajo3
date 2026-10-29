import { useEffect, useState } from 'react';
import { createProducto, listProductos } from './api.js';

const initialForm = {
  codigo: '',
  nombre: '',
  categoria: 'perecible',
  precio: '',
  stock: '',
  fecha_venta: '',
  descripcion: '',
};

export default function App() {
  const [productos, setProductos] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState(null);

  useEffect(() => {
    listProductos().then(setProductos);
  }, []);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const result = await createProducto(form);
    if (result.ok) {
      setError(null);
      setProductos([result.data, ...productos]);
      setForm(initialForm);
    } else {
      setError(result.error);
    }
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 800, margin: '2rem auto' }}>
      <h1>Registro de productos vendidos</h1>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
        <input name="codigo" placeholder="Código" value={form.codigo} onChange={handleChange} />
        <input name="nombre" placeholder="Nombre" value={form.nombre} onChange={handleChange} />
        <select name="categoria" value={form.categoria} onChange={handleChange}>
          <option value="perecible">Perecible</option>
          <option value="no_perecible">No perecible</option>
        </select>
        <input name="precio" placeholder="Precio" value={form.precio} onChange={handleChange} />
        <input name="stock" placeholder="Stock" value={form.stock} onChange={handleChange} />
        <input name="fecha_venta" type="date" value={form.fecha_venta} onChange={handleChange} />
        <textarea name="descripcion" placeholder="Descripción (opcional)" value={form.descripcion} onChange={handleChange} />
        <button type="submit">Registrar</button>
      </form>

      {error && (
        <pre style={{ background: '#fee', border: '1px solid #c33', padding: '1rem', whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(error, null, 2)}
        </pre>
      )}

      <table border="1" cellPadding="6" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Stock</th>
            <th>Fecha venta</th>
            <th>Descripción</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr key={p.id}>
              <td>{p.codigo}</td>
              <td>{p.nombre}</td>
              <td>{p.categoria}</td>
              <td>{p.precio}</td>
              <td>{p.stock}</td>
              <td>{String(p.fecha_venta).slice(0, 10)}</td>
              <td style={{ maxWidth: 260 }}>
                {p.descripcion ? (
                  <details>
                    <summary>
                      {p.descripcion.slice(0, 60)}
                      {p.descripcion.length > 60 ? '…' : ''}{' '}
                      ({p.descripcion.length.toLocaleString()} caracteres)
                    </summary>
                    <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>
                      {p.descripcion}
                    </pre>
                  </details>
                ) : (
                  <em>(sin descripción)</em>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
