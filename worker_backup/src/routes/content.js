/**
 * Content management route handlers.
 */
import { success, error } from '../utils/helpers.js';

export async function handleContent(db, env, route, method, body) {
  const today = new Date().toISOString();

  // GET /api/content
  if (route === '/content' && method === 'GET') {
    const row = await db.collection('contents').findOne({ section_key: 'main' }) ||
                await db.collection('content').findOne({ section_key: 'main' });

    let content;
    if (row && row.content) {
      try { content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content; }
      catch { content = row.content; }
    } else {
      content = defaultContent();
    }

    return success({ success: true, content });
  }

  // PUT /api/content
  if (route === '/content' && method === 'PUT') {
    const contentJson = JSON.stringify(body);

    const existing = await db.collection('contents').findOne({ section_key: 'main' }) ||
                     await db.collection('content').findOne({ section_key: 'main' });

    if (existing) {
      await db.collection(existing.collectionHint || 'contents').updateOne(
        { section_key: 'main' },
        { $set: { content: contentJson, updated_at: today } }
      ).catch(async () => {
        await db.collection('contents').updateOne(
          { section_key: 'main' },
          { $set: { content: contentJson, updated_at: today } }
        );
      });
    } else {
      await db.collection('contents').insertOne({
        section_key: 'main', content: contentJson, created_at: today, updated_at: today
      });
    }

    return success({ success: true, message: 'Content updated successfully!', content: body });
  }

  // GET /api/content/notice
  if (route === '/content/notice' && method === 'GET') {
    const row = await db.collection('contents').findOne({ section_key: 'notice' }) ||
                await db.collection('content').findOne({ section_key: 'notice' });

    if (!row || !row.content) return success({ success: true, notice: null });

    let notice;
    try { notice = typeof row.content === 'string' ? JSON.parse(row.content) : row.content; }
    catch { notice = row.content; }

    return success({ success: true, notice });
  }

  // PUT /api/content/notice
  if (route === '/content/notice' && method === 'PUT') {
    const notice = body.notice || body;
    const contentJson = JSON.stringify(notice);
    const today = new Date().toISOString();

    const existing = await db.collection('contents').findOne({ section_key: 'notice' }) ||
                     await db.collection('content').findOne({ section_key: 'notice' });

    if (existing) {
      await db.collection('contents').updateOne(
        { section_key: 'notice' },
        { $set: { content: contentJson, updated_at: today } }
      );
    } else {
      await db.collection('contents').insertOne({
        section_key: 'notice', content: contentJson, created_at: today, updated_at: today
      });
    }

    return success({ success: true, message: 'Notice updated successfully!' });
  }

  return null;
}

function defaultContent() {
  return {
    heroTitle: 'Welcome to Changara Star Academy',
    heroSubtitle: 'Your trusted partner in quality education and school management',
    aboutTitle: 'About Changara Star Academy',
    aboutMission: 'To provide quality education that nurtures talent, builds character, and prepares students for a successful future.',
    aboutVision: 'To be a center of excellence in education, producing well-rounded individuals who contribute positively to society.',
    aboutValues: 'Excellence, Integrity, Respect, Innovation, Community Engagement',
    aboutCommitment: 'Changara Star Academy is dedicated to providing a safe, nurturing, and stimulating environment.',
    features: [],
    stats: { students: '500+', staff: '50+', attendance: '98%', years: '15+' },
    contact: { address: 'Nairobi, Kenya', phone: '+254 700 000 000', email: 'info@changarastaracademy.co.ke', workingHours: 'Monday - Friday: 7:00 AM - 6:00 PM' },
    footerText: 'Committed to providing quality education and fostering excellence.'
  };
}
