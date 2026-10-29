function envelopeFromPgError(err) {
  const status = typeof err.code === 'string' ? 400 : 500;
  const error = {};
  for (const field of ['message', 'code', 'detail', 'constraint', 'table']) {
    if (err[field] !== undefined) error[field] = err[field];
  }
  return { status, body: { error } };
}

module.exports = { envelopeFromPgError };
