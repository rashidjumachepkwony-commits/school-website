import { success, error } from '../utils/helpers.js';

// Boarding status is written by several screens (student management, clerk,
// register import) under different keys. Normalise so the clerk ledger and the
// Student Management card always agree.
const isBoardingStudent = s =>
  s.boarding === true || s.boarding === 'true' ||
  s.isBoarding === true || s.isBoarding === 'true' ||
  s.studentType === 'Boarder' || s.studentType === 'boarder';

export async function handleClerk(db, env, route, method, body, p, url) {
  const now = new Date().toISOString();

  if (route === '/clerk/fees-summary' && method === 'GET') {
    const students = await db.collection('students').find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).toArray();
    const payments = await db.collection('fee_payments').find({}).toArray();
    const structures = await db.collection('fee_structures').find({}).toArray();
    const byStudent = new Map();
    for (const pmt of payments) {
      const id = String(pmt.studentId || '');
      byStudent.set(id, (byStudent.get(id) || 0) + Number(pmt.totalAmount || pmt.amount || 0));
    }
    const totalDefault = structures.filter(s => s.isActive !== false).reduce((n, s) => n + Number(s.amount || 0), 0);
    const mapped = students.map(s => {
      const id = s.admissionNumber || s._id.toString();
      const paid = byStudent.get(id) || byStudent.get(s._id.toString()) || 0;
      const totalFees = Number(s.totalFees ?? totalDefault ?? 0);
      const name = `${s.firstName || ''} ${s.lastName || ''}`.trim();
      const boarding = isBoardingStudent(s);
      return { id, studentId: id, name, grade: s.grade || s.class || '', gender: s.gender || '', studentType: boarding ? 'Boarder' : 'Day Scholar', isBoarding: boarding, guardianPhone: s.phone || '', totalFees, paid, balance: Math.max(0, totalFees - paid) };
    });
    return success({ students: mapped, totalStudents: mapped.length, totalDayScholars: mapped.filter(s => !s.isBoarding).length, totalBoarders: mapped.filter(s => s.isBoarding).length, totalPaid: mapped.reduce((n,s)=>n+s.paid,0), totalBalance: mapped.reduce((n,s)=>n+s.balance,0) });
  }

  if (route === '/clerk/students' && method === 'POST') {
    const { name, grade, gender, studentType = 'Day Scholar' } = body;
    if (!name || !grade || !gender) return error('Name, grade and gender are required');
    const parts = String(name).trim().split(/\s+/); const firstName = parts.shift() || ''; const lastName = parts.join(' ') || '';
    const count = (await db.collection('students').find({}).toArray()).length;
    const admissionNumber = `ST${String(count + 1).padStart(3, '0')}`;
    const result = await db.collection('students').insertOne({ firstName, lastName, admissionNumber, class: grade, grade, gender, studentType, boarding: studentType === 'Boarder', isBoarding: studentType === 'Boarder', guardianPhone: '', status: 'ACTIVE', isActive: true, createdAt: now, updatedAt: now });
    return success({ message: 'Student added', student: { studentId: admissionNumber, id: admissionNumber, name, grade, gender, studentType, _id: result.insertedId } });
  }

  if (p[0] === 'clerk' && p[1] === 'students' && p[2] && method === 'DELETE') {
    const id = decodeURIComponent(p[2]);
    const student = await db.collection('students').findOne({ admissionNumber: id }) || await db.collection('students').findOne({ _id: id });
    if (!student) return error('Student not found', 404);
    await db.collection('students').deleteOne({ _id: student._id });
    return success({ message: 'Student deleted' });
  }

  if (route === '/clerk/payments' && method === 'GET') {
    const payments = await db.collection('fee_payments').find({}).sort({ paymentDate: -1 }).limit(500).toArray();
    return success({ payments });
  }

  if (route === '/clerk/payments' && method === 'POST') {
    if (!body.studentId) return error('studentId is required');

    // The clerk screen records a payment as separate category amounts
    // (School Fees, Boarding, Remedials, ...), so accept that shape as well as
    // a single amount. Either way one total is stored.
    let categories = {};
    let total = Number(body.totalAmount ?? body.amount ?? 0);

    if (body.payments && typeof body.payments === 'object' && !Array.isArray(body.payments)) {
      for (const [k, v] of Object.entries(body.payments)) {
        const n = Number(v);
        if (!Number.isNaN(n) && n > 0) categories[k] = n;
      }
      total = Object.values(categories).reduce((a, b) => a + b, 0);
    }

    if (!Number.isFinite(total) || total <= 0) {
      return error('Enter a payment amount greater than zero in at least one category', 400);
    }

    const paymentDate = body.paymentDate || now;
    const record = {
      ...body,
      categories,
      amount: total,
      totalAmount: total,
      method: body.method || 'Cash',
      paymentDate,
      createdAt: now,
      updatedAt: now
    };
    const result = await db.collection('fee_payments').insertOne(record);

    // Return a flat shape as well, because the receipt on the clerk screen
    // reads totalAmount, categories and date straight off the response.
    return success({
      message: 'Payment recorded',
      totalAmount: total,
      amount: total,
      categories,
      date: paymentDate,
      paymentId: result.insertedId.toString(),
      payment: { _id: result.insertedId, ...record }
    });
  }

  if (p[0] === 'clerk' && p[1] === 'payments' && p[2] && method === 'PUT') {
    const existing = await db.collection('fee_payments').findOne({ _id: p[2] });
    if (!existing) return error('Payment record not found', 404);
    // Keep amount and totalAmount in step, otherwise an edit appears to do nothing.
    const updates = { ...body, updatedAt: now };
    let total = Number(body.totalAmount ?? body.amount ?? 0);
    if (body.payments && typeof body.payments === 'object' && !Array.isArray(body.payments)) {
      const categories = {};
      for (const [k, v] of Object.entries(body.payments)) {
        const n = Number(v);
        if (!Number.isNaN(n) && n > 0) categories[k] = n;
      }
      total = Object.values(categories).reduce((a, b) => a + b, 0);
      updates.categories = categories;
    }
    if (total < 0) return error('Payment amount cannot be negative');
    if (total > 0) { updates.amount = total; updates.totalAmount = total; }
    await db.collection('fee_payments').updateOne({ _id: p[2] }, { $set: updates });
    return success({ message: 'Payment updated', totalAmount: updates.totalAmount ?? existing.totalAmount });
  }

  if (p[0] === 'clerk' && p[1] === 'payments' && p[2] && method === 'DELETE') {
    const existing = await db.collection('fee_payments').findOne({ _id: p[2] });
    if (!existing) return error('Payment record not found', 404);
    await db.collection('fee_payments').deleteOne({ _id: p[2] });
    return success({ message: 'Payment deleted' });
  }

  // GET /api/clerk/fees-report?grade=&studentId=&format=pdf
  // Fees, payments and balances for a whole class, or for one student.
  if (route === '/clerk/fees-report' && method === 'GET') {
    const grade = url.searchParams.get('grade') || '';
    const studentId = url.searchParams.get('studentId') || '';
    const format = (url.searchParams.get('format') || 'json').toLowerCase();

    const students = await db.collection('students').find(
      studentId ? {} : (grade ? { class: grade } : {})
    ).toArray();
    const scoped = studentId
      ? students.filter(s => (s.admissionNumber || '') === studentId || String(s._id.toString()) === studentId)
      : students;

    const payments = await db.collection('fee_payments').find({}).toArray();
    const structures = await db.collection('fee_structures').find({ isActive: { $ne: false } }).toArray();
    const dayFee = structures.find(s => s.type === 'day');
    const boardingFee = structures.find(s => s.type === 'boarding');
    const defaultFee = Number(dayFee?.amount || 0);

    const isBoarding = s =>
      s.boarding === true || s.boarding === 'true' ||
      s.isBoarding === true || s.isBoarding === 'true' || s.studentType === 'Boarder';

    const paidFor = adm => payments
      .filter(p => String(p.studentId || '') === String(adm || ''))
      .reduce((n, p) => n + Number(p.totalAmount || p.amount || 0), 0);

    const rows = scoped.map(s => {
      const adm = s.admissionNumber || s._id.toString();
      const boarder = isBoarding(s);
      const total = Number(s.totalFees ?? (boarder ? (boardingFee?.amount ?? defaultFee) : defaultFee) ?? 0);
      const paid = paidFor(adm);
      return {
        id: s._id.toString(),
        admissionNumber: adm,
        name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
        grade: s.grade || s.class || '',
        studentType: boarder ? 'Boarder' : 'Day Scholar',
        total, paid,
        balance: Math.max(0, total - paid),
        status: total <= 0 ? 'No fees set' : paid <= 0 ? 'Unpaid' : paid >= total ? 'Fully Paid' : 'Part Paid',
        payments: payments.filter(p => String(p.studentId || '') === String(adm))
          .sort((a, b) => String(b.paymentDate || '').localeCompare(String(a.paymentDate || '')))
          .map(p => ({
            id: p._id.toString(), date: p.paymentDate || p.createdAt || null,
            amount: Number(p.totalAmount || p.amount || 0),
            method: p.method || p.paymentMethod || 'Cash',
            term: p.term || '', note: p.notes || p.note || ''
          }))
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const totals = {
      students: rows.length,
      expected: rows.reduce((n, r) => n + r.total, 0),
      paid: rows.reduce((n, r) => n + r.paid, 0),
      balance: rows.reduce((n, r) => n + r.balance, 0),
      fullyPaid: rows.filter(r => r.status === 'Fully Paid').length,
      unpaid: rows.filter(r => r.status === 'Unpaid' || r.status === 'Part Paid').length
    };

    if (format === 'pdf') {
      const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const pill = s => s === 'Fully Paid' ? 'ok' : s === 'Unpaid' ? 'bad' : s === 'Part Paid' ? 'warn' : 'none';
      const bodyRows = rows.map(r => `<tr>
        <td>${esc(r.admissionNumber)}</td><td>${esc(r.name)}</td><td>${esc(r.grade)}</td>
        <td>${esc(r.studentType)}</td><td class="num">${r.total.toLocaleString()}</td>
        <td class="num">${r.paid.toLocaleString()}</td><td class="num">${r.balance.toLocaleString()}</td>
        <td class="ctr"><span class="pill ${pill(r.status)}">${esc(r.status)}</span></td>
        <td>${r.payments.length}</td></tr>`).join('');

      // Payment history for a single student, so their receipt is self-contained.
      let receipt = '';
      if (studentId && rows[0]) {
        const r = rows[0];
        const payRows = r.payments.map(p => `<tr><td>${esc(String(p.date || '').slice(0, 10))}</td><td>${esc(p.method)}</td>
          <td>${esc(p.term || '-')}</td><td class="num">${p.amount.toLocaleString()}</td><td>${esc(p.note || '')}</td></tr>`).join('');
        receipt = `<div class="box" style="margin-top:16px"><h3>Payment History - ${esc(r.name)}</h3>
          <table><thead><tr><th>Date</th><th>Method</th><th>Term</th><th class="num">Amount</th><th>Note</th></tr></thead>
          <tbody>${payRows || '<tr><td colspan="5" class="ctr">No payments recorded</td></tr>'}</tbody></table></div>`;
      }

      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Fees Report</title><style>
*{box-sizing:border-box}
@page{size:A4 landscape;margin:12mm 10mm}
body{font-family:"Segoe UI",Arial;margin:0;padding:18px;background:#eef1f5;color:#12233f;font-size:11px}
.sheet{max-width:1400px;margin:0 auto;background:#fff;padding:26px 30px;box-shadow:0 6px 28px rgba(0,0,0,.12)}
.hd{display:flex;align-items:center;gap:16px;border-bottom:3px solid #d4a017;padding-bottom:12px}
.crest{width:60px;height:60px;flex:0 0 60px;border-radius:50%;background:linear-gradient(135deg,#0a1628,#1c3a6e);color:#d4a017;display:flex;align-items:center;justify-content:center;font-size:26px}
.hd h1{margin:0;font-size:21px;color:#0a1628}
.hd .tag{font-size:11px;color:#5a6b85;text-transform:uppercase;letter-spacing:2px}
.hd .motto{font-size:11px;color:#8a6d1f;font-style:italic;margin-top:2px}
.meta{display:flex;flex-wrap:wrap;gap:8px 26px;margin:14px 0 6px;padding:10px 14px;background:#f7f9fc;border:1px solid #e3e9f2;border-radius:8px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th,td{border:1px solid #cfd8e6;padding:5px 7px;text-align:left}
thead th{background:#0a1628;color:#fff;font-size:10.5px;text-transform:uppercase}
tbody tr:nth-child(even){background:#fafcff}
.num{text-align:right}.ctr{text-align:center}
.pill{padding:2px 9px;border-radius:10px;font-weight:700;font-size:10px}
.ok{background:#dff3e4;color:#136b2c}.warn{background:#fff3cd;color:#856404}
.bad{background:#fbdcdc;color:#8c1c24}.none{background:#e8ecf1;color:#6c757d}
.stat-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.stat{flex:1;min-width:120px;border:1px solid #e3e9f2;border-radius:8px;padding:9px 12px;background:#fbfcfe}
.stat .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:#6b7a92}
.stat .v{font-size:17px;font-weight:700;color:#0a1628;margin-top:2px}
.box{margin-top:16px;border:1px solid #cfd8e6;border-radius:8px;overflow:hidden}
.box h3{margin:0;padding:8px 12px;background:#0a1628;color:#fff;font-size:12px;text-transform:uppercase;letter-spacing:.6px}
.foot{margin-top:14px;padding-top:8px;border-top:1px solid #e3e9f2;font-size:9.5px;color:#8a97ab;display:flex;justify-content:space-between}
.btn{display:inline-block;background:#d4a017;color:#12233f;border:0;border-radius:7px;padding:9px 18px;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit;margin-right:8px}
.btn.sec{background:#0a1628;color:#fff}
.toolbar{text-align:right;margin:0 auto 12px;max-width:1400px}
@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;padding:0;max-width:none}.toolbar{display:none}thead{display:table-header-group}tr{page-break-inside:avoid}}
</style></head><body>
<div class="toolbar"><button class="btn" onclick="window.print()">&#128424; Save as PDF / Print</button><button class="btn sec" onclick="window.close()">Close</button></div>
<div class="sheet">
  <div class="hd"><div class="crest">&#9734;</div><div>
    <h1>CHANGARA STAR ACADEMY</h1>
    <div class="tag">Fees, Payments &amp; Balances</div>
    <div class="motto">&ldquo;Assurance for Excellence&rdquo;</div></div></div>
  <div class="meta">
    <div><b>Scope:</b> ${studentId && rows[0] ? esc(rows[0].name) : (grade ? esc(grade) : 'All classes')}</div>
    <div><b>Students:</b> ${totals.students}</div>
    <div><b>Generated:</b> ${esc(new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' }))}</div>
  </div>
  <div class="stat-row">
    <div class="stat"><div class="k">Expected</div><div class="v">KES ${totals.expected.toLocaleString()}</div></div>
    <div class="stat"><div class="k">Paid</div><div class="v">KES ${totals.paid.toLocaleString()}</div></div>
    <div class="stat"><div class="k">Balance</div><div class="v">KES ${totals.balance.toLocaleString()}</div></div>
    <div class="stat"><div class="k">Fully Paid</div><div class="v">${totals.fullyPaid}</div></div>
    <div class="stat"><div class="k">Still Owing</div><div class="v">${totals.unpaid}</div></div>
  </div>
  <table><thead><tr><th>Adm. No.</th><th>Name</th><th>Class</th><th>Type</th>
    <th class="num">Expected</th><th class="num">Paid</th><th class="num">Balance</th><th class="ctr">Status</th><th class="ctr">Payments</th></tr></thead>
    <tbody>${bodyRows || '<tr><td colspan="9" class="ctr" style="padding:18px;color:#8a97ab">No students found.</td></tr>'}</tbody></table>
  ${receipt}
  <div class="foot"><span>Changara Star Academy &middot; Fees Report</span><span>Amounts in KES</span></div>
</div></body></html>`;
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    return success({ rows, totals, structures });
  }

  if (route === '/clerk/fees-structure' && method === 'GET') return success({ fees: await db.collection('fee_structures').find({}).sort({ name: 1 }).toArray() });
  if (route === '/clerk/fees-structure' && method === 'POST') { const r=await db.collection('fee_structures').insertOne({ ...body, type:'day', isActive:true, createdAt:now, updatedAt:now }); return success({message:'Fee structure saved',fee:{...body,_id:r.insertedId}}); }
  if (route === '/clerk/fees-structure/day' && method === 'PUT') { const r=await db.collection('fee_structures').findOne({type:'day'}); if(r) await db.collection('fee_structures').updateOne({_id:r._id},{$set:{...body,type:'day',updatedAt:now}}); else await db.collection('fee_structures').insertOne({...body,type:'day',isActive:true,createdAt:now,updatedAt:now}); return success({message:'Day scholar fees updated'}); }
  if (route === '/clerk/fees-structure/boarding' && method === 'PUT') { const r=await db.collection('fee_structures').findOne({type:'boarding'}); if(r) await db.collection('fee_structures').updateOne({_id:r._id},{$set:{...body,type:'boarding',updatedAt:now}}); else await db.collection('fee_structures').insertOne({...body,type:'boarding',isActive:true,createdAt:now,updatedAt:now}); return success({message:'Boarding fees updated'}); }
  if (route === '/clerk/boarding-fees' && method === 'GET') return success({ fees: await db.collection('fee_structures').find({type:'boarding'}).toArray() });

  if (p[0] === 'clerk' && p[1] === 'students' && p[2] && p[3] === 'fees' && method === 'GET') {
    const id = decodeURIComponent(p[2]); const payments = await db.collection('fee_payments').find({studentId:id}).sort({paymentDate:-1}).toArray(); const student = await db.collection('students').findOne({admissionNumber:id}) || await db.collection('students').findOne({_id:id});
    return success({ student: student ? { id: student.admissionNumber || student._id.toString(), name:`${student.firstName||''} ${student.lastName||''}`.trim(), grade:student.grade||student.class||'' } : {}, payments });
  }
  return null;
}
