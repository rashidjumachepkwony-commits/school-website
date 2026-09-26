/**
 * Seed the website gallery into the CMS so the images can be managed from the
 * admin dashboard instead of only being hard-coded in index.html.
 *
 * Preserves every other content field that already exists.
 * Safe to re-run: the gallery array is replaced wholesale.
 *
 *   node scripts/seed-gallery.mjs            # against the live API
 *   API=http://localhost:5000 node scripts/seed-gallery.mjs
 */
const API = (process.env.API || 'https://csa-api.rashidjumachepkwony.workers.dev').replace(/\/$/, '');

const GALLERY = [
  {
    file: '/images/school-compound.jpg',
    type: 'image',
    title: 'School Compound',
    category: '🏫 Facilities',
    description: 'The Changara Star Academy compound, with classrooms and play areas for every class.'
  },
  {
    file: '/images/ecde-section.jpg',
    type: 'image',
    title: 'E.C.D.E Section',
    category: '🧸 ECDE',
    description: 'Our Early Childhood Development Education section, where young learners begin their journey.'
  },
  {
    file: '/images/classroom-learning.jpg',
    type: 'image',
    title: 'Classroom Learning',
    category: '📚 Academics',
    description: 'Pupils engaged in active learning in our well-equipped classrooms.'
  },
  {
    file: '/images/computer-lab.jpg',
    type: 'image',
    title: 'Computer Lab',
    category: '💻 Technology',
    description: 'Students learning essential computer skills in our modern computer laboratory.'
  },
  {
    file: '/images/graduation-award-ceremony.jpg',
    type: 'image',
    title: 'Graduation & Award Ceremony',
    category: '🎓 Events',
    description: 'Learners in full uniform celebrate with their certificates and colour-coded garlands at the school gate.'
  },
  {
    file: '/images/outdoor-class-lesson.jpg',
    type: 'image',
    title: 'Open-Air Class Lesson',
    category: '📚 Academics',
    description: 'Our ECDE and lower-primary classes take to the lawns, where every learner joins in the discussion.'
  },
  {
    file: '/images/guidance-counselling.jpg',
    type: 'image',
    title: 'Guidance & Counselling',
    category: '🧭 Wellbeing',
    description: 'One-to-one guidance and counselling sessions help every child feel supported and confident.'
  },
  {
    file: '/images/scout-patrol-drill.jpg',
    type: 'image',
    title: 'Scouts & Patrol Drill',
    category: '🌿 Scouts',
    description: 'Our Scout patrols practise drills and teamwork alongside the rest of the school on the field.'
  },
  {
    file: '/images/school-transport-fleet.jpg',
    type: 'image',
    title: 'School Transport',
    category: '🚌 Transport',
    description: 'Our branded fleet keeps boarders and day scholars safe, comfortable and on time every day.'
  }
];

const getRes = await fetch(`${API}/api/content`);
const current = (await getRes.json()).content || {};
console.log('existing content keys:', Object.keys(current).length);

const merged = { ...current, gallery: GALLERY };
const putRes = await fetch(`${API}/api/content`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(merged)
});
const putJson = await putRes.json();
console.log('PUT /api/content ->', putRes.status, putJson.success ? 'ok' : JSON.stringify(putJson));

// verify round-trip
const verify = (await (await fetch(`${API}/api/content`)).json()).content || {};
console.log('gallery items now:', Array.isArray(verify.gallery) ? verify.gallery.length : 'ABSENT');
console.log('preserved keys   :', Object.keys(current).filter(k => k !== 'gallery' && verify[k] !== undefined).join(', ') || 'none');
for (const item of verify.gallery || []) console.log('  -', item.file, '|', item.title);
