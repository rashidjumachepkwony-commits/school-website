import { success, error } from '../utils/helpers.js';

export async function handleClerk(db, env, route, method, body, p) {
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
      return { id, studentId: id, name, grade: s.grade || s.class || '', gender: s.gender || '', studentType: s.studentType || 'Day Scholar', isBoarding: s.isBoarding === true || s.studentType === 'Boarder', totalFees, paid, balance: Math.max(0, totalFees - paid) };
    });
    return success({ students: mapped, totalStudents: mapped.length, totalDayScholars: mapped.filter(s => !s.isBoarding).length, totalBoarders: mapped.filter(s => s.isBoarding).length, totalPaid: mapped.reduce((n,s)=>n+s.paid,0), totalBalance: mapped.reduce((n,s)=>n+s.balance,0) });
  }

  if (route === '/clerk/students' && method === 'POST') {
    const { name, grade, gender, studentType = 'Day Scholar' } = body;
    if (!name || !grade || !gender) return error('Name, grade and gender are required');
    const parts = String(name).trim().split(/\s+/); const firstName = parts.shift() || ''; const lastName = parts.join(' ') || '';
    const count = (await db.collection('students').find({}).toArray()).length;
    const admissionNumber = `ST${String(count + 1).padStart(3, '0')}`;
    const result = await db.collection('students').insertOne({ firstName, lastName, admissionNumber, class: grade, grade, gender, studentType, isBoarding: studentType === 'Boarder', isActive: true, createdAt: now, updatedAt: now });
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
    const amount = Number(body.totalAmount || body.amount || 0); if (amount <= 0) return error('Payment amount must be greater than zero');
    const result = await db.collection('fee_payments').insertOne({ ...body, amount, totalAmount: amount, paymentDate: body.paymentDate || now, createdAt: now, updatedAt: now });
    return success({ message: 'Payment saved', payment: { ...body, _id: result.insertedId, amount, totalAmount: amount } });
  }

  if (p[0] === 'clerk' && p[1] === 'payments' && p[2] && method === 'PUT') {
    await db.collection('fee_payments').updateOne({ _id: p[2] }, { $set: { ...body, updatedAt: now } });
    return success({ message: 'Payment updated' });
  }

  if (p[0] === 'clerk' && p[1] === 'payments' && p[2] && method === 'DELETE') {
    await db.collection('fee_payments').deleteOne({ _id: p[2] });
    return success({ message: 'Payment deleted' });
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
