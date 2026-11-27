const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { notFoundHandler, errorHandler } = require('./errors');

/**
 * Optional password protection. When APP_PASSWORD is set, every page and API call
 * needs HTTP Basic Auth (the browser shows a login prompt). Leave it empty to disable.
 */
function basicAuth(username, password) {
  return (req, res, next) => {
    if (req.path === '/api/health') return next();
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const [user, ...rest] = Buffer.from(encoded, 'base64').toString().split(':');
      if (user === username && rest.join(':') === password) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Evacuation Relief Tracker"');
    return res.status(401).json({ error: 'Login required' });
  };
}

function createApp(db, options = {}) {
  const app = express();
  const auth = options.auth ?? {
    username: process.env.APP_USERNAME || 'admin',
    password: process.env.APP_PASSWORD,
  };

  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'img-src': ["'self'", 'data:'] } },
  }));
  if (auth && auth.password) app.use(basicAuth(auth.username, auth.password));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch (err) {
      res.status(503).json({ status: 'error', database: 'unreachable' });
    }
  });

  app.use('/api/centers', require('./routes/centers')(db));
  app.use('/api/families', require('./routes/families')(db));
  app.use('/api/items', require('./routes/items')(db));
  app.use('/api/distributions', require('./routes/distributions')(db));
  app.use('/api/dashboard', require('./routes/dashboard')(db));
  app.use('/api', notFoundHandler);

  app.use('/vendor', express.static(path.join(path.dirname(require.resolve('chart.js')), '..', 'dist')));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
