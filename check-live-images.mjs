const SITE = 'https://changarastaracademy.co.ke';
const IMAGES = [
  '/images/school-compound.jpg',
  '/images/ecde-section.jpg',
  '/images/classroom-learning.jpg',
  '/images/computer-lab.jpg',
  '/images/graduation-award-ceremony.jpg',
  '/images/outdoor-class-lesson.jpg',
  '/images/guidance-counselling.jpg',
  '/images/scout-patrol-drill.jpg',
  '/images/school-transport-fleet.jpg'
];

let bad = 0;
for (const r of IMAGES) {
  const res = await fetch(SITE + r);
  const ct = res.headers.get('content-type') || '';
  const isImage = ct.startsWith('image/');
  if (!isImage) bad++;
  console.log(`${isImage ? 'OK  ' : 'BAD '} ${String(res.status)} ${ct.padEnd(26)} ${r}`);
}
console.log(`\n${bad === 0 ? 'ALL 9 IMAGES SERVE AS REAL IMAGES' : bad + ' STILL BROKEN'}`);

const content = (await (await fetch('https://csa-api.rashidjumachepkwony.workers.dev/api/content')).json()).content || {};
console.log('\nCMS gallery items:', (content.gallery || []).length);
for (const g of content.gallery || []) console.log(`  ${g.category}  ${g.title}`);
