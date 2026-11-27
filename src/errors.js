class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (message, details) => new HttpError(400, message, details);
const notFound = (what) => new HttpError(404, `${what} not found`);
const conflict = (message, details) => new HttpError(409, message, details);

/** Lets async route handlers throw; Express receives the rejection via next(). */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  // PostgreSQL error codes: 23505 unique violation, 23503 foreign key, 23514 check
  if (err.code === '23505') return res.status(409).json({ error: 'Duplicate record', details: err.detail });
  if (err.code === '23503') return res.status(409).json({ error: 'Referenced record does not exist or is still in use' });
  if (err.code === '23514') return res.status(400).json({ error: 'Value failed a database check' });

  if (process.env.NODE_ENV !== 'test') console.error(err);
  return res.status(500).json({ error: 'Something went wrong on the server' });
}

module.exports = { HttpError, badRequest, notFound, conflict, asyncHandler, notFoundHandler, errorHandler };
