/**
 * Changara Star Academy Management System - Cloudflare Worker
 *
 * Production API backend handling all /api/* routes.
 * Uses MongoDB Atlas for storage and Cloudinary for file uploads.
 */

import { connectToDatabase, checkDbHealth } from './db.js';
import { handleCors } from './middleware/cors.js';
import { success, error } from './utils/helpers.js';
import { handleAuth } from './routes/auth.js';
import { handleContent } from './routes/content.js';
import { handleStaff } from './routes/staff.js';
import { handleAttendance } from './routes/attendance.js';
import { handleVisitors } from './routes/visitors.js';
import { handleStudents } from './routes/students.js';
import { handleAssessments } from './routes/assessments.js';
import { handleCurriculum } from './routes/curriculum.js';
import { handleUpload } from './routes/upload.js';
import { handleHolidayAssignments } from './routes/holidayAssignments.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsResult = handleCors(request, env);
    if (corsResult instanceof Response) return corsResult;

    const applyCors = (resp) => {
      const newHeaders = new Headers(resp.headers);
      Object.entries(corsResult).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(resp.body, { status: resp.status, headers: newHeaders });
    };

    try {
      if (url.pathname === '/api/test' && request.method === 'GET') {
        return applyCors(success({ message: 'Changara Star Academy API is running!', server: 'Cloudflare Worker' }));
      }

      if (url.pathname === '/api/config' && request.method === 'GET') {
        return applyCors(success({ success: true, apiBaseUrl: '', frontendUrl: env.FRONTEND_URL || '' }));
      }

      if (url.pathname === '/api/db-health' && request.method === 'GET') {
        const health = await checkDbHealth(env);
        if (health.ok) {
          return applyCors(success({ status: 'ok', latencyMs: health.latencyMs, dbName: health.dbName, collectionAccessible: health.collectionAccessible }));
        }
        return applyCors(error('Database connection failed', 503));
      }

      if (!url.pathname.startsWith('/api/')) {
        return applyCors(error('Not found', 404));
      }

      const db = await connectToDatabase(env);
      const pathParts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
      const route = '/' + pathParts.join('/');
      const method = request.method;

      let body = {};
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          body = await request.json().catch(() => ({}));
        }
        // multipart/form-data is handled by individual route handlers via request.formData()
      }

      const handlers = [
        () => handleAuth(db, env, route, method, body),
        () => handleContent(db, env, route, method, body),
        () => handleStaff(db, env, route, method, body, pathParts),
        () => handleAttendance(db, env, route, method, body, pathParts, url),
        () => handleVisitors(db, env, route, method, body, pathParts),
        () => handleStudents(db, env, route, method, body, pathParts),
        () => handleAssessments(db, env, route, method, body, pathParts, url),
        () => handleCurriculum(db, env, route, method, body, pathParts, url),
        () => handleUpload(db, env, route, method, body, pathParts, request),
        () => handleHolidayAssignments(db, env, route, method, body, pathParts, request),
      ];

      for (const handler of handlers) {
        const result = await handler();
        if (result) return applyCors(result);
      }

      return applyCors(success({ message: 'Endpoint under construction', route, method }, 200));

    } catch (err) {
      console.error('API error:', err);
      return applyCors(error('Internal server error', 500));
    }
  }
};
