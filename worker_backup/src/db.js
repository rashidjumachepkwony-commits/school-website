/**
 * MongoDB connection manager for Cloudflare Workers.
 *
 * Key Workers-specific considerations:
 * 1. maxPoolSize=1 — Workers processes a single request at a time per instance.
 * 2. The MongoClient is cached at module scope (persist across requests in the
 *    same Worker instance) but validated with a cheap ping() before reuse.
 * 3. If the cached connection is stale (TCP idle timeout, etc.) we reconnect
 *    transparently so the caller never sees a broken connection.
 * 4. Connection details are only logged from the host portion — never the URI.
 */
import { MongoClient } from 'mongodb';

let cachedClient = null;
let cachedDb = null;

const CONNECT_TIMEOUT_MS = 10000;
const SERVER_SELECTION_TIMEOUT_MS = 5000;
const SOCKET_TIMEOUT_MS = 30000;
const PING_TIMEOUT_MS = 5000;

export async function connectToDatabase(env) {
  // --- Reuse cached connection if healthy ---
  if (cachedClient && cachedDb) {
    try {
      await cachedDb.admin().command({ ping: 1, $comment: 'healthcheck' }, { timeoutMS: PING_TIMEOUT_MS });
      return cachedDb;
    } catch (pingErr) {
      console.warn('MongoDB cached connection stale, reconnecting:', pingErr.message);
      try { await cachedClient.close(); } catch { /* ignore */ }
      cachedClient = null;
      cachedDb = null;
    }
  }

  // --- Create new connection ---
  const connectionString = env.MONGODB_URI || process.env.MONGODB_URI;
  if (!connectionString) {
    console.error('MONGODB_URI not configured in env');
    throw new Error('Database not configured');
  }

  // Extract host for logging (never log the full URI with credentials)
  let hostLog = 'unknown';
  try {
    const u = new URL(connectionString);
    hostLog = u.hostname || u.host || 'unknown';
  } catch { /* ignore */ }

  console.log(`Connecting to MongoDB at host: ${hostLog}`);

  const client = new MongoClient(connectionString, {
    maxPoolSize: 1,
    minPoolSize: 0,
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    socketTimeoutMS: SOCKET_TIMEOUT_MS,
    retryWrites: true,
    retryReads: true,
    tls: connectionString.includes('mongodb+srv') || connectionString.includes('ssl=true') || connectionString.includes('tls=true'),
    directConnection: false,
    family: 4, // force IPv4 to avoid DNS resolution issues
  });

  await client.connect();

  // Extract database name from connection string
  let dbName = 'school';
  try {
    const u = new URL(connectionString);
    dbName = u.pathname.replace(/^\//, '').replace(/\/$/, '') || 'school';
    if (dbName.includes('?')) dbName = dbName.split('?')[0];
  } catch { /* use default */ }

  const db = client.db(dbName);

  // Verify connection with a ping
  try {
    await db.admin().command({ ping: 1, $comment: 'initial-connect' }, { timeoutMS: PING_TIMEOUT_MS });
    console.log('MongoDB connection verified ✓');
  } catch (pingErr) {
    console.error('MongoDB initial ping failed:', pingErr.message);
    try { await client.close(); } catch { /* ignore */ }
    throw new Error('Failed to verify MongoDB connection');
  }

  cachedClient = client;
  cachedDb = db;

  return db;
}

/**
 * Diagnostic helper — ping the database and return status.
 * Never exposes credentials or connection strings.
 */
export async function checkDbHealth(env) {
  try {
    const db = await connectToDatabase(env);
    const start = Date.now();
    await db.admin().command({ ping: 1 }, { timeoutMS: PING_TIMEOUT_MS });
    const latency = Date.now() - start;

    // Try a simple collection read to confirm end-to-end connectivity
    const collInfo = await db.collection('contents').findOne(
      { section_key: 'main' }
    ).catch(() => null);

    return {
      ok: true,
      latencyMs: latency,
      dbName: db.databaseName,
      collectionAccessible: collInfo !== undefined
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      code: err.code || err.cause?.code || 'UNKNOWN',
    };
  }
}
