// Loads .env when present (local dev). On Render the keys come from the dashboard.
// Imported first so modules that read process.env at load time (cache.js) see it.
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
