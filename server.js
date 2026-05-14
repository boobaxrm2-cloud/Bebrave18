'use strict';
const express  = require('express');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const Loki     = require('lokijs');
const { generateCertificate } = require('./certGenerator');
const { generateContract, generateTeacherContract } = require('./contractGenerator');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Directories ──────────────────────────────────────────────
const DATA_DIR    = process.env.DATA_DIR    || path.join(__dirname, 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
const CERT_DIR      = path.join(UPLOADS_DIR, 'certs');
const CONTRACTS_DIR = path.join(UPLOADS_DIR, 'contracts');
[DATA_DIR, UPLOADS_DIR, CERT_DIR, CONTRACTS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Database ─────────────────────────────────────────────────
const DB_PATH = path.join(DATA_DIR, 'bebrave.db');
const db = new Loki(DB_PATH, {
  autoload: true, autosave: true, autosaveInterval: 2000,
  autoloadCallback: dbReady
});

let Users, Students, Teachers, Lessons, Files, Notes, Certificates, DeletedStudents, Contracts, TeacherContracts, Sessions, ForumPosts, ForumReplies, Suggestions, Payments, Messages, StudyPlans, NetworkRequests, AdminMessages, Notifications, Ratings;

function dbReady() {
  Users        = db.getCollection('users')        || db.addCollection('users',        { indices: ['login'] });
  Students     = db.getCollection('students')     || db.addCollection('students',     { indices: ['matricula', 'teacherLogin'] });
  Teachers     = db.getCollection('teachers')     || db.addCollection('teachers',     { indices: ['login'] });
  Lessons      = db.getCollection('lessons')      || db.addCollection('lessons',      { indices: ['studentMatricula', 'teacherLogin'] });
  Files        = db.getCollection('files')        || db.addCollection('files',        { indices: ['studentMatricula', 'teacherLogin'] });
  Notes        = db.getCollection('notes')        || db.addCollection('notes',        { indices: ['studentMatricula'] });
  Certificates    = db.getCollection('certificates')    || db.addCollection('certificates',    { indices: ['studentMatricula', 'certId'] });
  DeletedStudents = db.getCollection('deletedStudents') || db.addCollection('deletedStudents', { indices: ['matricula'] });
  Contracts        = db.getCollection('contracts')        || db.addCollection('contracts',        { indices: ['studentMatricula', 'contractId', 'teacherLogin'] });
  TeacherContracts = db.getCollection('teacherContracts') || db.addCollection('teacherContracts', { indices: ['teacherLogin', 'contractId'] });
  Sessions         = db.getCollection('sessions')         || db.addCollection('sessions',         { indices: ['sid'] });
  ForumPosts       = db.getCollection('forumPosts')       || db.addCollection('forumPosts',       { indices: ['teacherLogin'] });
  ForumReplies     = db.getCollection('forumReplies')     || db.addCollection('forumReplies',     { indices: ['postId'] });
  Suggestions      = db.getCollection('suggestions')      || db.addCollection('suggestions',      { indices: ['teacherLogin'] });
  Payments         = db.getCollection('payments')         || db.addCollection('payments',         { indices: ['studentMatricula', 'teacherLogin', 'month'] });
  Messages         = db.getCollection('messages')         || db.addCollection('messages',         { indices: ['fromLogin', 'toLogin', 'teacherLogin'] });
  StudyPlans       = db.getCollection('studyPlans')       || db.addCollection('studyPlans',       { indices: ['studentMatricula', 'teacherLogin'] });
  NetworkRequests  = db.getCollection('networkRequests')  || db.addCollection('networkRequests',  { indices: ['studentLogin', 'teacherLogin'] });
  AdminMessages    = db.getCollection('adminMessages')    || db.addCollection('adminMessages',    { indices: ['fromLogin'] });
  Notifications    = db.getCollection('notifications')    || db.addCollection('notifications',    { indices: ['toLogin'] });
  Ratings          = db.getCollection('ratings')          || db.addCollection('ratings',          { indices: ['teacherLogin', 'studentLogin'] });

  if (!Users.findOne({ role: 'admin' })) {
    Users.insert({ login: 'ADMIN', password: bcrypt.hashSync('05012018', 10), role: 'admin', name: 'Administrador', createdAt: now() });
    console.log('✅ Admin criado: ADMIN / 05012018');
  }
  console.log(`📦 DB: ${Users.count()} usuários | ${Teachers.count()} professores | ${Students.count()} alunos`);
}

// ── Helpers ──────────────────────────────────────────────────
const now   = () => new Date().toISOString();
const today = () => new Date().toISOString().split('T')[0];

function notify(toLogin, type, title, body) {
  try { Notifications.insert({ toLogin, type, title, body, read: false, createdAt: now() }); } catch(e) {}
}

// Brazil is UTC-3. Railway runs UTC, so we shift timestamps before extracting calendar day.
const BR_OFFSET_MS = -3 * 60 * 60 * 1000;
const todayBR  = ()   => new Date(Date.now() + BR_OFFSET_MS).toISOString().slice(0, 10);
const dateBR   = (ts) => new Date(Number(ts) + BR_OFFSET_MS).toISOString().slice(0, 10);
const isOverdueBR = (dueTs) => dateBR(dueTs) < todayBR();

function genMatricula() {
  let m;
  do { m = String(Math.floor(100000 + Math.random() * 900000)); }
  while (Students.findOne({ matricula: m }));
  return m;
}
function genCertId() {
  return 'CERT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}
function genContractId() {
  return 'CTR-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}
function initials(name) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}
const PALETTE = [
  { color: '#3b6ef5', bg: '#e8eeff' }, { color: '#10b981', bg: '#d1fae5' },
  { color: '#8b5cf6', bg: '#ede9fe' }, { color: '#f59e0b', bg: '#fef3c7' },
  { color: '#ec4899', bg: '#fce7f3' }, { color: '#06b6d4', bg: '#e0f7fa' },
  { color: '#ef4444', bg: '#fee2e2' }, { color: '#84cc16', bg: '#f0fdf4' },
];
function pickColor(idx) { return PALETTE[idx % PALETTE.length]; }

// ── Middleware ───────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
const PUBLIC_DIR = __dirname;
app.use(express.static(PUBLIC_DIR));
// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', dir: __dirname, files: require('fs').readdirSync(__dirname).filter(f => f.endsWith('.html') || f.endsWith('.js') || f.endsWith('.css')) }));
app.use('/uploads', express.static(UPLOADS_DIR));
// ── LokiJS Session Store ─────────────────────────────────────
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
class LokiStore extends session.Store {
  get(sid, cb) {
    if (!Sessions) return cb(null, null);
    const r = Sessions.findOne({ sid });
    if (!r) return cb(null, null);
    if (r.expires && Date.now() > r.expires) { Sessions.remove(r); return cb(null, null); }
    cb(null, r.data);
  }
  set(sid, data, cb) {
    if (!Sessions) return cb && cb();
    const existing = Sessions.findOne({ sid });
    const expires  = Date.now() + SESSION_TTL;
    if (existing) { existing.data = data; existing.expires = expires; Sessions.update(existing); }
    else           { Sessions.insert({ sid, data, expires }); }
    cb && cb();
  }
  destroy(sid, cb) {
    if (!Sessions) return cb && cb();
    const r = Sessions.findOne({ sid });
    if (r) Sessions.remove(r);
    cb && cb();
  }
  touch(sid, data, cb) { this.set(sid, data, cb); }
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'bebrave-secret-xK9pQ2026',
  resave: false,
  saveUninitialized: false,
  store: new LokiStore(),
  cookie: { maxAge: SESSION_TTL }
}));

// ── Multer ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ── Auth Guards ──────────────────────────────────────────────
const auth         = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: 'Não autenticado' });
const isAdmin      = (req, res, next) => req.session.user?.role === 'admin'   ? next() : res.status(403).json({ error: 'Acesso negado' });
const isTeach      = (req, res, next) => {
  if (req.session.user?.role !== 'teacher') return res.status(403).json({ error: 'Acesso negado' });
  const t = Teachers.findOne({ login: req.session.user.login });
  if (t?.blocked) return res.status(403).json({ error: 'TEACHER_BLOCKED', message: 'Sua conta está bloqueada. Entre em contato com o administrador.' });
  next();
};
const isAdminOrTeach = (req, res, next) => {
  if (!['admin','teacher'].includes(req.session.user?.role)) return res.status(403).json({ error: 'Acesso negado' });
  if (req.session.user.role === 'teacher') {
    const t = Teachers.findOne({ login: req.session.user.login });
    if (t?.blocked) return res.status(403).json({ error: 'TEACHER_BLOCKED', message: 'Sua conta está bloqueada. Entre em contato com o administrador.' });
  }
  next();
};

// ════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════
// ── Teacher self-registration (public) ────────────────────────
app.get('/api/check-login', (req, res) => {
  const login = (req.query.login || '').trim();
  if (!login) return res.json({ available: false });
  const exists = !!(Users.findOne({ login }) || Users.findOne({ login: login.toUpperCase() }));
  res.json({ available: !exists });
});

app.get('/api/check-cpf', (req, res) => {
  const digits = (req.query.cpf || '').replace(/\D/g, '');
  if (digits.length !== 11) return res.json({ available: false });
  const usedByTeacher = Teachers.find().some(t => t.cpf && t.cpf.replace(/\D/g,'') === digits);
  const usedByStudent = Students.find().some(s => s.cpf && s.cpf.replace(/\D/g,'') === digits);
  res.json({ available: !usedByTeacher && !usedByStudent });
});

app.post('/api/auth/register-teacher', (req, res) => {
  const { name, login: rawLogin, languages, email, whatsapp, password } = req.body;
  if (!name || !rawLogin || !email || !whatsapp || !password) return res.status(400).json({ error: 'Preencha todos os campos obrigatórios' });
  if (password.length < 4) return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres' });
  const login = rawLogin.trim();
  if (!/^[a-zA-Z0-9_]{4,20}$/.test(login)) return res.status(400).json({ error: 'Login deve ter entre 4 e 20 caracteres (letras, números e _)' });
  if (Users.findOne({ login }) || Users.findOne({ login: login.toUpperCase() })) return res.status(409).json({ error: 'Este login já está em uso. Escolha outro.' });
  const ini = initials(name);
  const { color, bg } = pickColor(Teachers.count());
  Users.insert({ login, password: bcrypt.hashSync(password, 10), role: 'teacher', name: name.trim(), createdAt: now() });
  Teachers.insert({ login, name: name.trim(), socialname: '', email: email.trim(), cpf: '', whatsapp: whatsapp.trim(), languages: languages || [], initials: ini, color, bg, createdAt: now(), plainPassword: password, termsAccepted: false, selfRegistered: true });
  res.json({ ok: true, login, name: name.trim() });
});

app.post('/api/auth/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Preencha todos os campos' });
  const user = Users.findOne({ login: login.trim().toUpperCase() }) || Users.findOne({ login: login.trim() });
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Login ou senha incorretos' });
  if (user.inactive) return res.status(403).json({ error: 'Acesso inativo. Entre em contato com seu professor.' });
  if (user.role === 'student') {
    const student = Students.findOne({ matricula: user.login });
    if (student) {
      const teacher = Teachers.findOne({ login: student.teacherLogin });
      if (teacher?.blocked) return res.status(403).json({ error: 'Seu professor está temporariamente indisponível. Entre em contato com seu professor para regularizar o acesso.' });
    }
  }
  user.lastLogin = now();
  Users.update(user);
  req.session.user = { id: user.$loki, login: user.login, role: user.role, name: user.name };
  if (user.role === 'teacher') {
    const t = Teachers.findOne({ login: user.login });
    return res.json({ role: user.role, name: user.name, login: user.login, termsAccepted: t?.termsAccepted || false });
  }
  if (user.role === 'student') {
    const s = Students.findOne({ matricula: user.login });
    return res.json({ role: user.role, name: user.name, login: user.login, teacherLogin: s?.teacherLogin || '', teacherName: s?.teacherName || '' });
  }
  res.json({ role: user.role, name: user.name, login: user.login });
});

app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Não autenticado' });
  const u = req.session.user;
  if (u.role === 'student') {
    const s = Students.findOne({ matricula: u.login });
    return res.json({ ...u, level: s?.level || 'A1', teacherLogin: s?.teacherLogin || '', teacherName: s?.teacherName || '' });
  }
  if (u.role === 'teacher') {
    const t = Teachers.findOne({ login: u.login });
    return res.json({ ...u, termsAccepted: t?.termsAccepted || false });
  }
  res.json(u);
});

app.post('/api/teacher/accept-terms', auth, isTeach, (req, res) => {
  const { signature, cpf } = req.body;
  if (!signature) return res.status(400).json({ error: 'Assinatura obrigatória' });
  if (!cpf) return res.status(400).json({ error: 'CPF obrigatório' });
  const cpfDigits = cpf.replace(/\D/g, '');
  if (cpfDigits.length < 11) return res.status(400).json({ error: 'CPF inválido — informe os 11 dígitos' });
  const currentLogin = req.session.user.login;
  const t = Teachers.findOne({ login: currentLogin });
  if (!t) return res.status(404).json({ error: 'Professor não encontrado' });
  // Validate CPF uniqueness
  const cpfUsed = Teachers.find().some(x => x.login !== currentLogin && x.cpf && x.cpf.replace(/\D/g,'') === cpfDigits)
    || Students.find().some(s => s.cpf && s.cpf.replace(/\D/g,'') === cpfDigits);
  if (cpfUsed) return res.status(409).json({ error: 'Este CPF já está cadastrado na plataforma.' });
  // Update teacher record (no login change)
  t.cpf = cpf.trim();
  t.termsAccepted = true;
  t.termsAcceptedAt = Date.now();
  t.termsSignature = signature;
  Teachers.update(t);
  res.json({ ok: true, newLogin: currentLogin });
});

app.get('/api/teacher/my-terms', auth, isTeach, (req, res) => {
  const t = Teachers.findOne({ login: req.session.user.login });
  if (!t) return res.status(404).json({ error: 'Professor não encontrado' });
  res.json({ accepted: t.termsAccepted || false, acceptedAt: t.termsAcceptedAt || null, signature: t.termsSignature || null, name: t.name, cpf: t.cpf || '' });
});

app.get('/api/admin/teachers/:login/terms-view', auth, isAdmin, (req, res) => {
  const t = Teachers.findOne({ login: req.params.login });
  if (!t || !t.termsAccepted) return res.status(404).send('<p>Termo não encontrado ou não assinado.</p>');
  const dateStr = new Date(t.termsAcceptedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>Termo de Uso — ${t.name}</title>
  <style>body{font-family:'Helvetica Neue',Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 24px;color:#1e293b;line-height:1.7}
  h1{font-size:20px;margin-bottom:4px}.sub{color:#64748b;font-size:14px;margin-bottom:32px}
  .section{margin-bottom:20px}.section h2{font-size:15px;margin-bottom:4px}
  .sig-box{border:1.5px solid #e2e8f0;border-radius:10px;padding:20px;margin-top:32px;background:#f8fafc}
  .sig-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:700;margin-bottom:8px}
  .sig-name{font-size:15px;font-weight:700;margin-top:12px}.sig-date{font-size:13px;color:#64748b}
  .stamp{display:inline-block;border:2px solid #22c55e;color:#15803d;border-radius:8px;padding:6px 18px;font-size:13px;font-weight:700;margin-top:20px}
  @media print{body{margin:20px}}</style></head><body>
  <h1>TERMO DE USO DA PLATAFORMA BEBRAVE</h1>
  <p class="sub">Documento aceito digitalmente em ${dateStr}</p>
  <div class="section"><h2>1. PERÍODO DE TESTE GRATUITO</h2><p>O acesso à plataforma BeBrave é concedido de forma gratuita durante o período de teste, com duração determinada e comunicada ao professor.</p></div>
  <div class="section"><h2>2. ENCERRAMENTO DO PERÍODO DE TESTE</h2><p>Após o término do período de testes, o acesso será automaticamente bloqueado, com notificação prévia ao professor.</p></div>
  <div class="section"><h2>3. CONTINUIDADE DO SERVIÇO</h2><p>Ao término do período de teste, o professor poderá continuar utilizando a plataforma mediante aceitação dos novos termos e condições comerciais vigentes.</p></div>
  <div class="section"><h2>4. DADOS E PRIVACIDADE</h2><p>Os dados cadastrados são utilizados exclusivamente para o funcionamento dos serviços da BeBrave, em conformidade com a legislação aplicável.</p></div>
  <div class="section"><h2>5. RESPONSABILIDADES</h2><p>O professor se compromete a utilizar a plataforma de forma ética e legal, respeitando os dados dos alunos e as políticas da BeBrave.</p></div>
  <div class="section"><h2>6. ALTERAÇÕES NOS TERMOS</h2><p>A BeBrave pode alterar estes termos mediante comunicação prévia. A continuidade do uso implica aceitação das novas condições.</p></div>
  <div class="sig-box">
    <div class="sig-label">Assinatura do Professor</div>
    <img src="${t.termsSignature}" alt="Assinatura" style="max-height:90px;display:block">
    <div class="sig-name">${t.name}${t.cpf ? ' · CPF: ' + t.cpf : ''}</div>
    <div class="sig-date">Aceito digitalmente em ${dateStr}</div>
    <div class="stamp">✅ Aceito e assinado digitalmente</div>
  </div>
  <script>window.onload=()=>window.print()</script>
  </body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.post('/api/auth/change-password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Senha deve ter ao menos 4 caracteres' });
  const user = Users.findOne({ login: req.session.user.login });
  if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(400).json({ error: 'Senha atual incorreta' });
  user.password = bcrypt.hashSync(newPassword, 10);
  Users.update(user);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  ADMIN — TEACHERS
// ════════════════════════════════════════════════════════════
app.get('/api/admin/teachers', auth, isAdmin, (req, res) => {
  const teachers = Teachers.find().map(t => {
    const u = Users.findOne({ login: t.login });
    return { ...t, studentCount: Students.find({ teacherLogin: t.login }).length, plainPassword: t.plainPassword || '', languages: t.languages || '', termsAccepted: t.termsAccepted || false, termsAcceptedAt: t.termsAcceptedAt || null, lastLogin: u?.lastLogin || null };
  });
  res.json(teachers);
});

app.post('/api/admin/teachers', auth, isAdmin, (req, res) => {
  const { name, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  const ini = initials(name);
  let login;
  do { login = ini + String(Math.floor(1000 + Math.random() * 9000)); }
  while (Users.findOne({ login }));
  const { color, bg } = pickColor(Teachers.count());
  const { cpf: tCpf, whatsapp: tWa, socialname: tSocial } = req.body;
  Users.insert({ login, password: bcrypt.hashSync('1234', 10), role: 'teacher', name: name.trim(), createdAt: now() });
  Teachers.insert({ login, name: name.trim(), socialname: tSocial||'', email: email || '', cpf: tCpf||'', whatsapp: tWa||'', initials: ini, color, bg, createdAt: now() });
  res.json({ ok: true, login, defaultPassword: '1234', name: name.trim() });
});

app.put('/api/admin/reset-password', auth, isAdmin, (req, res) => {
  const { login, newPassword } = req.body;
  if (!login || !newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Dados inválidos' });
  const user = Users.findOne({ login: login.toUpperCase() }) || Users.findOne({ login });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  user.password = bcrypt.hashSync(newPassword, 10);
  Users.update(user);
  res.json({ ok: true });
});

app.put('/api/admin/teachers/:login/toggle-block', auth, isAdmin, (req, res) => {
  const login = req.params.login;
  const t = Teachers.findOne({ login });
  if (!t) return res.status(404).json({ error: 'Professor não encontrado' });
  t.blocked = !t.blocked;
  Teachers.update(t);
  res.json({ ok: true, blocked: t.blocked });
});

app.delete('/api/admin/teachers/:login', auth, isAdmin, (req, res) => {
  const login = req.params.login;
  const t = Teachers.findOne({ login });
  if (!t) return res.status(404).json({ error: 'Professor não encontrado' });
  Teachers.remove(t);
  const u = Users.findOne({ login }); if (u) Users.remove(u);
  Students.find({ teacherLogin: login }).forEach(s => {
    Lessons.find({ studentMatricula: s.matricula }).forEach(l => Lessons.remove(l));
    Files.find({ studentMatricula: s.matricula }).forEach(f => { if(f.filename){ try{ fs.unlinkSync(path.join(UPLOADS_DIR,f.filename)); }catch(e){} } Files.remove(f); });
    Notes.find({ studentMatricula: s.matricula }).forEach(n => Notes.remove(n));
    Certificates.find({ studentMatricula: s.matricula }).forEach(c => { if(c.filename){ try{ fs.unlinkSync(path.join(CERT_DIR,c.filename)); }catch(e){} } Certificates.remove(c); });
    const su = Users.findOne({ login: s.matricula }); if (su) Users.remove(su);
    Students.remove(s);
  });
  res.json({ ok: true });
});

app.get('/api/admin/students', auth, isAdmin, (req, res) => {
  res.json(Students.find().map(s => {
    const u = Users.findOne({ login: s.matricula });
    return { ...s, lessonCount: Lessons.find({ studentMatricula: s.matricula }).length, lastLogin: u?.lastLogin || null };
  }));
});

app.delete('/api/admin/students/:matricula', auth, isAdmin, (req, res) => {
  const mat = req.params.matricula;
  const s = Students.findOne({ matricula: mat });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  // Archive before deleting (strip LokiJS metadata)
  const { $loki: _l2, meta: _m2, ...sClean2 } = s;
  DeletedStudents.insert({ ...sClean2, deletedAt: now(), deletedBy: req.session.user.login, lessonCount: Lessons.find({ studentMatricula: mat }).length });
  Lessons.find({ studentMatricula: mat }).forEach(l => Lessons.remove(l));
  Files.find({ studentMatricula: mat }).forEach(f => { if(f.filename){ try{ fs.unlinkSync(path.join(UPLOADS_DIR,f.filename)); }catch(e){} } Files.remove(f); });
  Notes.find({ studentMatricula: mat }).forEach(n => Notes.remove(n));
  Certificates.find({ studentMatricula: mat }).forEach(c => { if(c.filename){ try{ fs.unlinkSync(path.join(CERT_DIR,c.filename)); }catch(e){} } Certificates.remove(c); });
  const u = Users.findOne({ login: mat }); if (u) Users.remove(u);
  Students.remove(s);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  STUDENTS
// ════════════════════════════════════════════════════════════
app.get('/api/students', auth, isAdminOrTeach, (req, res) => {
  const u = req.session.user;
  const filter = u.role === 'admin' ? {} : { teacherLogin: u.login, active: { '$ne': false } };
  res.json(Students.find(filter).map(s => ({
    ...s,
    lessonsDone:      Lessons.find({ studentMatricula: s.matricula, status: 'done' }).length,
    lessonsScheduled: Lessons.find({ studentMatricula: s.matricula, status: 'scheduled' }).length,
  })));
});

app.get('/api/students/inactive', auth, isTeach, (req, res) => {
  const inactive = Students.find({ teacherLogin: req.session.user.login, active: false });
  res.json(inactive.map(s => ({
    ...s,
    lessonsDone: Lessons.find({ studentMatricula: s.matricula, status: 'done' }).length,
  })));
});

app.post('/api/students', auth, isTeach, (req, res) => {
  const { name, level } = req.body;
  if (!name || !level) return res.status(400).json({ error: 'Nome e nível são obrigatórios' });
  const teacher = Teachers.findOne({ login: req.session.user.login });
  const matricula = genMatricula();
  const ini = initials(name);
  const { color, bg } = pickColor(Students.count());
  const { lang, cpf, email, whatsapp, payday, price, socialname } = req.body;
  Users.insert({ login: matricula, password: bcrypt.hashSync('1234', 10), role: 'student', name: name.trim(), createdAt: now() });
  Students.insert({ matricula, name: name.trim(), socialname: socialname||'', initials: ini, level, color, bg,
    teacherLogin: req.session.user.login, teacherName: teacher?.name || req.session.user.name,
    lang: lang || 'en', cpf: cpf || '', email: email || '', whatsapp: whatsapp || '',
    payday: payday || '', price: price || '', active: true, createdAt: now() });
  res.json({ ok: true, matricula, defaultPassword: '1234', name: name.trim(), level, lang: lang || 'en' });
});

app.put('/api/students/:matricula', auth, isAdminOrTeach, (req, res) => {
  const s = Students.findOne({ matricula: req.params.matricula });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  if (req.session.user.role === 'teacher' && s.teacherLogin !== req.session.user.login)
    return res.status(403).json({ error: 'Sem permissão' });
  const { level, name, socialname, cpf, email, whatsapp, payday, price, lang } = req.body;
  if (level)      s.level      = level;
  if (name)       { s.name = name.trim(); s.initials = initials(name.trim()); }
  if (socialname !== undefined) s.socialname = socialname;
  if (cpf       !== undefined) s.cpf        = cpf;
  if (email     !== undefined) s.email      = email;
  if (whatsapp  !== undefined) s.whatsapp   = whatsapp;
  if (payday    !== undefined) s.payday     = payday;
  if (price     !== undefined) s.price      = price;
  if (lang      !== undefined) s.lang       = lang;
  Students.update(s);
  // Also update name in Users collection
  if (name) {
    const u = Users.findOne({ login: s.matricula });
    if (u) { u.name = name.trim(); Users.update(u); }
  }
  res.json({ ok: true });
});

app.delete('/api/students/:matricula', auth, isAdminOrTeach, (req, res) => {
  const mat = req.params.matricula;
  const s = Students.findOne({ matricula: mat });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  if (req.session.user.role === 'teacher' && s.teacherLogin !== req.session.user.login) return res.status(403).json({ error: 'Sem permissão' });
  // Archive before deleting
  DeletedStudents.insert({ ...s, deletedAt: now(), deletedBy: req.session.user.login, lessonCount: Lessons.find({ studentMatricula: mat }).length });
  Lessons.find({ studentMatricula: mat }).forEach(l => Lessons.remove(l));
  Files.find({ studentMatricula: mat }).forEach(f => { if(f.filename){ try{ fs.unlinkSync(path.join(UPLOADS_DIR,f.filename)); }catch(e){} } Files.remove(f); });
  Notes.find({ studentMatricula: mat }).forEach(n => Notes.remove(n));
  Certificates.find({ studentMatricula: mat }).forEach(c => { if(c.filename){ try{ fs.unlinkSync(path.join(CERT_DIR,c.filename)); }catch(e){} } Certificates.remove(c); });
  const u = Users.findOne({ login: mat }); if (u) Users.remove(u);
  Students.remove(s);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════

// ── STUDENT INACTIVATE / REACTIVATE ─────────────────────────────────────────
app.put('/api/students/:matricula/inactivate', auth, isTeach, (req, res) => {
  const s = Students.findOne({ matricula: req.params.matricula });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  if (s.teacherLogin !== req.session.user.login) return res.status(403).json({ error: 'Sem permissão' });
  s.active = false;
  s.inactivatedAt = now();
  Students.update(s);
  const u = Users.findOne({ login: req.params.matricula });
  if (u) { u.inactive = true; Users.update(u); }
  res.json({ ok: true });
});

app.put('/api/students/:matricula/reactivate-teacher', auth, isAdmin, (req, res) => {
  const s = Students.findOne({ matricula: req.params.matricula });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  s.active = true;
  s.inactivatedAt = null;
  Students.update(s);
  const u = Users.findOne({ login: req.params.matricula });
  if (u) { u.inactive = false; Users.update(u); }
  res.json({ ok: true });
});

//  LESSONS
// ════════════════════════════════════════════════════════════
app.get('/api/lessons', auth, (req, res) => {
  const u = req.session.user;
  let lessons;
  if (u.role === 'student') lessons = Lessons.find({ studentMatricula: u.login });
  else if (u.role === 'teacher') lessons = Lessons.find({ teacherLogin: u.login });
  else lessons = Lessons.find();
  res.json(lessons.sort((a, b) => a.date.localeCompare(b.date)));
});

app.post('/api/lessons', auth, isTeach, (req, res) => {
  const { studentMatricula, date, time, topic, duration, meetLink, subject } = req.body;
  if (!studentMatricula || !date || !time || !topic) return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  const s = Students.findOne({ matricula: studentMatricula });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  const jitsiRoom = 'BeBrave-' + s.name.replace(/\s+/g,'-') + '-' + date.replace(/-/g,'') + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
  const safeLink = meetLink ? (meetLink.startsWith('http') ? meetLink : 'https://' + meetLink) : '';
  const lesson = Lessons.insert({ studentMatricula, studentName: s.name, teacherLogin: req.session.user.login, teacherName: req.session.user.name, date, time, topic, subject: subject || topic, duration: parseInt(duration) || 60, status: 'scheduled', meetLink: safeLink, jitsiRoom, createdAt: now() });
  res.json(lesson);
});

app.put('/api/lessons/:id', auth, isTeach, (req, res) => {
  const l = Lessons.get(parseInt(req.params.id));
  if (!l) return res.status(404).json({ error: 'Aula não encontrada' });
  ['status','topic','subject','date','time','duration','feedback','homework'].forEach(k => { if (req.body[k] !== undefined) l[k] = req.body[k]; });
  if (req.body.meetLink !== undefined) {
    const ml = req.body.meetLink;
    l.meetLink = ml ? (ml.startsWith('http') ? ml : 'https://' + ml) : '';
  }
  Lessons.update(l);
  res.json(l);
});


app.delete('/api/lessons/:id', auth, isTeach, (req, res) => {
  const l = Lessons.get(parseInt(req.params.id));
  if (!l) return res.status(404).json({ error: 'Aula não encontrada' });
  Lessons.remove(l);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  FILES
// ════════════════════════════════════════════════════════════
app.get('/api/files', auth, (req, res) => {
  const u = req.session.user;
  if (u.role === 'student') return res.json(Files.find({ studentMatricula: u.login }));
  if (u.role === 'teacher') return res.json(Files.find({ teacherLogin: u.login }));
  res.json(Files.find());
});

app.post('/api/files', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  const u = req.session.user;
  let studentMatricula, studentName, teacherLogin;
  if (u.role === 'teacher') {
    studentMatricula = req.body.studentMatricula;
    const s = Students.findOne({ matricula: studentMatricula });
    if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
    studentName = s.name; teacherLogin = u.login;
  } else {
    studentMatricula = u.login; studentName = u.name;
    const s = Students.findOne({ matricula: u.login });
    teacherLogin = s?.teacherLogin || '';
  }
  const ext = path.extname(req.file.originalname).toLowerCase();
  const type = ext === '.pdf' ? 'pdf' : ['.mp3','.wav','.m4a'].includes(ext) ? 'audio' : ['.mp4','.mov'].includes(ext) ? 'video' : ['.jpg','.jpeg','.png','.gif','.webp'].includes(ext) ? 'img' : 'doc';
  const size = req.file.size < 1048576 ? Math.round(req.file.size/1024) + ' KB' : (req.file.size/1048576).toFixed(1) + ' MB';
  const rec = Files.insert({ studentMatricula, studentName, teacherLogin, name: req.file.originalname, filename: req.file.filename, type, size, date: today(), from: u.role === 'teacher' ? 'teacher' : 'student', uploader: u.name, createdAt: now() });
  res.json(rec);
});

app.delete('/api/files/:id', auth, (req, res) => {
  const f = Files.get(parseInt(req.params.id));
  if (!f) return res.status(404).json({ error: 'Arquivo não encontrado' });
  if (f.filename) { try { fs.unlinkSync(path.join(UPLOADS_DIR, f.filename)); } catch(e) {} }
  Files.remove(f);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  NOTES
// ════════════════════════════════════════════════════════════
app.get('/api/notes', auth, (req, res) => {
  const u = req.session.user;
  if (u.role === 'student') return res.json(Notes.find({ studentMatricula: u.login }));
  if (u.role === 'teacher') return res.json(Notes.find({ teacherLogin: u.login }));
  res.json(Notes.find());
});

app.post('/api/notes', auth, isTeach, (req, res) => {
  const { studentMatricula, text } = req.body;
  if (!studentMatricula || !text) return res.status(400).json({ error: 'Dados inválidos' });
  const s = Students.findOne({ matricula: studentMatricula });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  const n = Notes.insert({ studentMatricula, studentName: s.name, teacherLogin: req.session.user.login, text, date: today(), createdAt: now() });
  res.json(n);
});

app.delete('/api/notes/:id', auth, isTeach, (req, res) => {
  const n = Notes.get(parseInt(req.params.id));
  if (!n) return res.status(404).json({ error: 'Nota não encontrada' });
  Notes.remove(n);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  CERTIFICATES
// ════════════════════════════════════════════════════════════
app.get('/api/certificates', auth, (req, res) => {
  const u = req.session.user;
  if (u.role === 'student') return res.json(Certificates.find({ studentMatricula: u.login }));
  if (u.role === 'teacher') return res.json(Certificates.find({ teacherLogin: u.login }));
  res.json(Certificates.find());
});

app.post('/api/certificates/preview', auth, isTeach, async (req, res) => {
  const data = req.body;
  if (!data.student_name || !data.module) return res.status(400).json({ error: 'Dados incompletos' });
  data.cert_id = 'PREVIEW';
  try {
    const pdfBuf = await generateCertificate(data);
    res.json({ pdf: pdfBuf.toString('base64') });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erro ao gerar certificado' }); }
});

app.post('/api/certificates', auth, isTeach, async (req, res) => {
  const { studentMatricula, module, level, hours, period, location, teacher_signature } = req.body;
  if (!studentMatricula || !module) return res.status(400).json({ error: 'Dados incompletos' });
  const s = Students.findOne({ matricula: studentMatricula });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  const certId   = genCertId();
  const filename = certId + '.pdf';
  const outPath  = path.join(CERT_DIR, filename);
  const issuedDate = new Date().toLocaleDateString('pt-BR');
  const data = { student_name: s.name, teacher_name: req.session.user.name, module, level, hours, period, location: location || 'Brasil', issued_date: issuedDate, cert_id: certId, teacher_signature: teacher_signature || '', student_signature: '' };
  try {
    const pdfBuf = await generateCertificate(data);
    fs.writeFileSync(outPath, pdfBuf);
    const cert = Certificates.insert({ certId, filename, studentMatricula, studentName: s.name, teacherLogin: req.session.user.login, teacherName: req.session.user.name, module, level, hours, period, location: location || 'Brasil', issuedDate, teacherSignature: teacher_signature || '', studentSignature: '', status: 'pending_student', createdAt: now() });
    res.json({ ok: true, certId, $loki: cert.$loki });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erro ao gerar certificado' }); }
});

app.put('/api/certificates/:id/student-sign', auth, async (req, res) => {
  const cert = Certificates.get(parseInt(req.params.id));
  if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });
  if (req.session.user.role === 'student' && cert.studentMatricula !== req.session.user.login) return res.status(403).json({ error: 'Sem permissão' });
  const { student_signature } = req.body;
  if (!student_signature) return res.status(400).json({ error: 'Assinatura obrigatória' });
  const data = { student_name: cert.studentName, teacher_name: cert.teacherName, module: cert.module, level: cert.level, hours: cert.hours, period: cert.period, location: cert.location, issued_date: cert.issuedDate, cert_id: cert.certId, teacher_signature: cert.teacherSignature, student_signature };
  try {
    const pdfBuf = await generateCertificate(data);
    fs.writeFileSync(path.join(CERT_DIR, cert.filename), pdfBuf);
    cert.studentSignature = student_signature;
    cert.status = 'complete';
    Certificates.update(cert);
    res.json({ ok: true, certId: cert.certId });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erro ao regenerar certificado' }); }
});

app.get('/api/certificates/:certId/download', auth, (req, res) => {
  const cert = Certificates.findOne({ certId: req.params.certId });
  if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });
  const u = req.session.user;
  if (u.role === 'student' && cert.studentMatricula !== u.login) return res.status(403).json({ error: 'Sem permissão' });
  if (u.role === 'teacher' && cert.teacherLogin !== u.login)     return res.status(403).json({ error: 'Sem permissão' });
  const filePath = path.join(CERT_DIR, cert.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });
  res.download(filePath, `Certificado_${cert.studentName.replace(/\s+/g,'_')}_${cert.module.replace(/\s+/g,'_')}.pdf`);
});

app.delete('/api/certificates/:id', auth, isTeach, (req, res) => {
  const cert = Certificates.get(parseInt(req.params.id));
  if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });
  const fp = path.join(CERT_DIR, cert.filename);
  if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch(e) {}
  Certificates.remove(cert);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
//  CONTRACTS
// ════════════════════════════════════════════════════════════════

app.get('/api/contracts', auth, (req, res) => {
  const u = req.session.user;
  if (u.role === 'student') return res.json(Contracts.find({ studentMatricula: u.login }));
  if (u.role === 'teacher') return res.json(Contracts.find({ teacherLogin: u.login }));
  res.json(Contracts.find());
});

app.post('/api/contracts/preview', auth, isTeach, async (req, res) => {
  const data = { ...req.body, contract_id: 'PREVIEW' };
  if (!data.student_name) return res.status(400).json({ error: 'Dados incompletos' });
  try {
    const pdfBuf = await generateContract(data);
    res.json({ pdf: pdfBuf.toString('base64') });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erro ao gerar contrato' }); }
});

app.post('/api/contracts', auth, isTeach, async (req, res) => {
  const { studentMatricula, course, months, hours_per_week, price, payday,
          start_date, teacher_cpf, teacher_signature } = req.body;
  if (!studentMatricula) return res.status(400).json({ error: 'Aluno obrigatório' });
  if (!teacher_signature) return res.status(400).json({ error: 'Assinatura do professor obrigatória' });
  const s = Students.findOne({ matricula: studentMatricula });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  const t = Teachers.findOne({ login: req.session.user.login });
  const contractId = genContractId();
  const filename   = contractId + '.pdf';
  const outPath    = path.join(CONTRACTS_DIR, filename);
  const issuedDate = new Date().toLocaleDateString('pt-BR');
  const data = {
    student_name: s.name, student_cpf: s.cpf || '',
    teacher_name: req.session.user.name, teacher_cpf: teacher_cpf || (t?.cpf || ''),
    course: course || s.lang || 'inglês', months, hours_per_week,
    price: price || s.price || '', payday: payday || s.payday || '',
    start_date: start_date || issuedDate, issued_date: issuedDate,
    contract_id: contractId, teacher_signature, student_signature: '',
  };
  try {
    const pdfBuf = await generateContract(data);
    fs.writeFileSync(outPath, pdfBuf);
    const c = Contracts.insert({
      contractId, filename, studentMatricula, studentName: s.name, studentCpf: s.cpf || '',
      teacherLogin: req.session.user.login, teacherName: req.session.user.name,
      teacherCpf: data.teacher_cpf, course: data.course, months, hoursPerWeek: hours_per_week,
      price: data.price, payday: data.payday, startDate: data.start_date, issuedDate,
      teacherSignature: teacher_signature, studentSignature: '', status: 'pending_student', createdAt: now(),
    });
    notify(studentMatricula, 'contract_pending', 'Contrato aguardando sua assinatura ✍️', `${req.session.user.name} assinou o contrato — agora é a sua vez!`);
    res.json({ ok: true, contractId, $loki: c.$loki });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erro ao gerar contrato' }); }
});

app.put('/api/contracts/:id/student-sign', auth, async (req, res) => {
  const c = Contracts.get(parseInt(req.params.id));
  if (!c) return res.status(404).json({ error: 'Contrato não encontrado' });
  if (req.session.user.role === 'student' && c.studentMatricula !== req.session.user.login)
    return res.status(403).json({ error: 'Sem permissão' });
  const { student_signature, student_cpf } = req.body;
  if (!student_signature) return res.status(400).json({ error: 'Assinatura obrigatória' });
  if (c.studentCpf && student_cpf && c.studentCpf.replace(/\D/g,'') !== student_cpf.replace(/\D/g,''))
    return res.status(400).json({ error: 'CPF informado não corresponde ao cadastro' });
  const data = {
    student_name: c.studentName, student_cpf: c.studentCpf,
    teacher_name: c.teacherName, teacher_cpf: c.teacherCpf,
    course: c.course, months: c.months, hours_per_week: c.hoursPerWeek,
    price: c.price, payday: c.payday, start_date: c.startDate, issued_date: c.issuedDate,
    contract_id: c.contractId, teacher_signature: c.teacherSignature, student_signature,
  };
  try {
    const pdfBuf = await generateContract(data);
    fs.writeFileSync(path.join(CONTRACTS_DIR, c.filename), pdfBuf);
    c.studentSignature = student_signature;
    c.studentCpf = student_cpf || c.studentCpf;
    c.status = 'complete';
    Contracts.update(c);
    notify(c.teacherLogin, 'contract_signed', 'Contrato assinado! ✅', `${req.session.user.name} assinou o contrato`);
    res.json({ ok: true, contractId: c.contractId });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Erro ao finalizar contrato' }); }
});

async function _serveContract(c, res, inline = false) {
  const data = {
    student_name: c.studentName, student_cpf: c.studentCpf,
    teacher_name: c.teacherName, teacher_cpf: c.teacherCpf,
    course: c.course, months: c.months, hours_per_week: c.hoursPerWeek,
    price: c.price, payday: c.payday, start_date: c.startDate, issued_date: c.issuedDate,
    contract_id: c.contractId, teacher_signature: c.teacherSignature, student_signature: c.studentSignature || '',
  };
  const pdfBuf = await generateContract(data);
  const filename = `Contrato_${c.studentName.replace(/\s+/g,'_')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename}"`);
  res.send(pdfBuf);
}

app.get('/api/contracts/:contractId/download', auth, async (req, res) => {
  const c = Contracts.findOne({ contractId: req.params.contractId });
  if (!c) return res.status(404).json({ error: 'Contrato não encontrado' });
  const u = req.session.user;
  if (u.role === 'student' && c.studentMatricula !== u.login) return res.status(403).json({ error: 'Sem permissão' });
  if (u.role === 'teacher' && c.teacherLogin !== u.login)     return res.status(403).json({ error: 'Sem permissão' });
  try { await _serveContract(c, res, false); }
  catch(e) { console.error(e); res.status(500).json({ error: 'Erro ao gerar PDF' }); }
});

app.get('/api/contracts/:contractId/view', auth, async (req, res) => {
  const c = Contracts.findOne({ contractId: req.params.contractId });
  if (!c) return res.status(404).json({ error: 'Contrato não encontrado' });
  const u = req.session.user;
  if (u.role === 'student' && c.studentMatricula !== u.login) return res.status(403).json({ error: 'Sem permissão' });
  if (u.role === 'teacher' && c.teacherLogin !== u.login)     return res.status(403).json({ error: 'Sem permissão' });
  try { await _serveContract(c, res, true); }
  catch(e) { console.error(e); res.status(500).json({ error: 'Erro ao gerar PDF' }); }
});

// ════════════════════════════════════════════════════════════════
//  TEACHER CONTRACTS (admin creates, teacher signs)
// ════════════════════════════════════════════════════════════════

// Admin: view all student contracts
app.get('/api/admin/contracts', auth, isAdmin, (req, res) => {
  const all = Contracts.find().map(c => ({ ...c, teacherName: c.teacherName, studentName: c.studentName }));
  res.json(all);
});

// Admin: view all teacher contracts
app.get('/api/admin/teacher-contracts', auth, isAdmin, (req, res) => res.json(TeacherContracts.find()));

// Teacher: get own teacher contracts (pending/signed with BeBrave)
app.get('/api/teacher-contracts', auth, (req, res) => {
  const u = req.session.user;
  if (u.role === 'teacher') return res.json(TeacherContracts.find({ teacherLogin: u.login }));
  if (u.role === 'admin')   return res.json(TeacherContracts.find());
  res.json([]);
});

// Teacher: check pending count (for popup)
app.get('/api/teacher-contracts/pending-count', auth, (req, res) => {
  const u = req.session.user;
  if (u.role !== 'teacher') return res.json({ count: 0 });
  const count = TeacherContracts.find({ teacherLogin: u.login, status: 'pending_teacher' }).length;
  res.json({ count });
});

// Student: check pending count (for popup)
app.get('/api/contracts/pending-count', auth, (req, res) => {
  const u = req.session.user;
  if (u.role !== 'student') return res.json({ count: 0 });
  const count = Contracts.find({ studentMatricula: u.login, status: 'pending_student' }).length;
  res.json({ count });
});

// Admin: create teacher contract
app.post('/api/teacher-contracts', auth, isAdmin, async (req, res) => {
  const { teacherLogin, plan, monthly_value, admin_signature } = req.body;
  if (!teacherLogin) return res.status(400).json({ error: 'Professor obrigatório' });
  if (!admin_signature) return res.status(400).json({ error: 'Assinatura do admin obrigatória' });
  const t = Teachers.findOne({ login: teacherLogin });
  if (!t) return res.status(404).json({ error: 'Professor não encontrado' });
  const contractId = 'TCR-' + Date.now() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
  const issuedDate = new Date().toLocaleDateString('pt-BR');
  const c = TeacherContracts.insert({
    contractId, teacherLogin, teacherName: t.name, teacherCpf: t.cpf || '',
    plan: plan || 'trial', monthlyValue: monthly_value || '',
    startDate: issuedDate, issuedDate,
    adminSignature: admin_signature, teacherSignature: '',
    status: 'pending_teacher', createdAt: now(),
  });
  res.json({ ok: true, contractId, $loki: c.$loki });
});

// Teacher: sign own teacher contract
app.put('/api/teacher-contracts/:id/sign', auth, async (req, res) => {
  const c = TeacherContracts.get(parseInt(req.params.id));
  if (!c) return res.status(404).json({ error: 'Contrato não encontrado' });
  if (req.session.user.role === 'teacher' && c.teacherLogin !== req.session.user.login)
    return res.status(403).json({ error: 'Sem permissão' });
  const { teacher_signature, teacher_cpf } = req.body;
  if (!teacher_signature) return res.status(400).json({ error: 'Assinatura obrigatória' });
  if (c.teacherCpf && teacher_cpf && c.teacherCpf.replace(/\D/g,'') !== teacher_cpf.replace(/\D/g,''))
    return res.status(400).json({ error: 'CPF informado não corresponde ao cadastro' });
  c.teacherSignature = teacher_signature;
  c.teacherCpf = teacher_cpf || c.teacherCpf;
  c.status = 'complete';
  TeacherContracts.update(c);
  res.json({ ok: true, contractId: c.contractId });
});

async function _serveTeacherContract(c, res, inline = false) {
  const data = {
    teacher_name: c.teacherName, teacher_cpf: c.teacherCpf,
    plan: c.plan, monthly_value: c.monthlyValue,
    start_date: c.startDate, issued_date: c.issuedDate,
    contract_id: c.contractId,
    admin_signature: c.adminSignature, teacher_signature: c.teacherSignature || '',
  };
  const pdfBuf = await generateTeacherContract(data);
  const filename = `Contrato_BeBrave_${(c.teacherName||'').replace(/\s+/g,'_')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${inline?'inline':'attachment'}; filename="${filename}"`);
  res.send(pdfBuf);
}

app.get('/api/teacher-contracts/:contractId/view', auth, async (req, res) => {
  const c = TeacherContracts.findOne({ contractId: req.params.contractId });
  if (!c) return res.status(404).json({ error: 'Contrato não encontrado' });
  const u = req.session.user;
  if (u.role === 'teacher' && c.teacherLogin !== u.login) return res.status(403).json({ error: 'Sem permissão' });
  try { await _serveTeacherContract(c, res, true); }
  catch(e) { console.error(e); res.status(500).json({ error: 'Erro ao gerar PDF' }); }
});

app.get('/api/teacher-contracts/:contractId/download', auth, async (req, res) => {
  const c = TeacherContracts.findOne({ contractId: req.params.contractId });
  if (!c) return res.status(404).json({ error: 'Contrato não encontrado' });
  const u = req.session.user;
  if (u.role === 'teacher' && c.teacherLogin !== u.login) return res.status(403).json({ error: 'Sem permissão' });
  try { await _serveTeacherContract(c, res, false); }
  catch(e) { console.error(e); res.status(500).json({ error: 'Erro ao gerar PDF' }); }
});

// ════════════════════════════════════════════════════════════════
//  PROFILE
// ════════════════════════════════════════════════════════════════

// GET /api/profile — get current user's editable profile data
app.get('/api/profile', auth, (req, res) => {
  const u = req.session.user;
  const user = Users.findOne({ login: u.login });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  let extra = {};
  if (u.role === 'teacher') {
    const t = Teachers.findOne({ login: u.login });
    extra = { email: t?.email||'', whatsapp: t?.whatsapp||'', cpf: t?.cpf||'', socialname: t?.socialname||'', photo: t?.photo||'', instagram: t?.instagram||'' };
  } else if (u.role === 'student') {
    const s = Students.findOne({ matricula: u.login });
    extra = { email: s?.email||'', whatsapp: s?.whatsapp||'', cpf: s?.cpf||'', socialname: s?.socialname||'', photo: s?.photo||'' };
  } else {
    extra = { email: user.email||'', whatsapp: user.whatsapp||'', cpf: '', socialname: '', photo: user.photo||'' };
  }
  res.json({ name: u.name, role: u.role, login: u.login, ...extra });
});

// PUT /api/profile — update editable fields
app.put('/api/profile', auth, (req, res) => {
  const u = req.session.user;
  const { email, whatsapp, socialname, photo, instagram, currentPassword, newPassword } = req.body;

  // Password change (optional)
  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: 'Informe a senha atual' });
    if (newPassword.length < 4) return res.status(400).json({ error: 'Nova senha deve ter ao menos 4 caracteres' });
    const userRec = Users.findOne({ login: u.login });
    if (!bcrypt.compareSync(currentPassword, userRec.password)) return res.status(400).json({ error: 'Senha atual incorreta' });
    userRec.password = bcrypt.hashSync(newPassword, 10);
    Users.update(userRec);
  }

  // Update photo on user record
  if (photo !== undefined) {
    const userRec = Users.findOne({ login: u.login });
    if (userRec) { userRec.photo = photo; Users.update(userRec); }
  }

  // Update contact info on role-specific record
  if (u.role === 'teacher') {
    const t = Teachers.findOne({ login: u.login });
    if (t) {
      if (email      !== undefined) t.email      = email;
      if (whatsapp   !== undefined) t.whatsapp   = whatsapp;
      if (socialname !== undefined) t.socialname = socialname;
      if (photo      !== undefined) t.photo      = photo;
      if (instagram  !== undefined) t.instagram  = instagram;
      Teachers.update(t);
    }
  } else if (u.role === 'student') {
    const s = Students.findOne({ matricula: u.login });
    if (s) {
      if (email      !== undefined) s.email      = email;
      if (whatsapp   !== undefined) s.whatsapp   = whatsapp;
      if (socialname !== undefined) s.socialname = socialname;
      if (photo      !== undefined) s.photo      = photo;
      Students.update(s);
    }
  } else if (u.role === 'admin') {
    const userRec = Users.findOne({ login: u.login });
    if (userRec) {
      if (photo    !== undefined) userRec.photo    = photo;
      if (email    !== undefined) userRec.email    = email;
      if (whatsapp !== undefined) userRec.whatsapp = whatsapp;
      if (req.body.name) { userRec.name = req.body.name.trim(); req.session.user.name = userRec.name; }
      Users.update(userRec);
    }
  }

  res.json({ ok: true });
});

// ── SPA fallback ─────────────────────────────────────────────

// ── Setup route — resets admin password (remove after first use) ──
app.get('/setup-admin-bebrave2025', (req, res) => {
  const bcrypt = require('bcryptjs');
  let user = Users.findOne({ login: 'ADMIN' });
  if (user) {
    user.password = bcrypt.hashSync('05012018', 10);
    Users.update(user);
    res.json({ ok: true, msg: 'Admin resetado! Login: ADMIN | Senha: 05012018' });
  } else {
    Users.insert({ login: 'ADMIN', password: bcrypt.hashSync('05012018', 10), role: 'admin', name: 'Administrador', createdAt: new Date().toISOString() });
    res.json({ ok: true, msg: 'Admin criado! Login: ADMIN | Senha: 05012018' });
  }
});


// ════════════════════════════════════════════════════════════════
//  DELETED STUDENTS (Admin)
// ════════════════════════════════════════════════════════════════
app.get('/api/admin/students/deleted', auth, isAdmin, (req, res) => {
  res.json(DeletedStudents.find().map(s => ({
    ...s,
    lessonCount: s.lessonCount || 0
  })));
});

app.post('/api/admin/students/reactivate', auth, isAdmin, (req, res) => {
  const { matricula } = req.body;
  if (!matricula) return res.status(400).json({ error: 'Matrícula obrigatória' });
  const deleted = DeletedStudents.findOne({ matricula });
  if (!deleted) return res.status(404).json({ error: 'Aluno excluído não encontrado' });
  // Check if matricula is still free
  if (Students.findOne({ matricula })) return res.status(409).json({ error: 'Matrícula já em uso' });
  // Restore user login
  const existingUser = Users.findOne({ login: matricula });
  if (!existingUser) {
    Users.insert({ login: matricula, password: bcrypt.hashSync('1234', 10), role: 'student', name: deleted.name, createdAt: now() });
  }
  // Restore student record (clean loki meta)
  const { $loki, meta, deletedAt, deletedBy, ...studentData } = deleted;
  Students.insert({ ...studentData, reactivatedAt: now() });
  DeletedStudents.remove(deleted);
  res.json({ ok: true, name: deleted.name, matricula });
});



// PUT /api/profile/admin-update/:login — admin updates name/CPF of any user
app.put('/api/profile/admin-update/:login', auth, isAdmin, (req, res) => {
  const { name, cpf } = req.body;
  const targetLogin = req.params.login;

  const user = Users.findOne({ login: targetLogin }) || Users.findOne({ login: targetLogin.toUpperCase() });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  if (name) {
    user.name = name.trim();
    Users.update(user);
  }

  // Update in teachers or students collection too
  const t = Teachers.findOne({ login: targetLogin });
  if (t) { if (name) t.name = name.trim(); if (cpf) t.cpf = cpf; Teachers.update(t); }
  const s = Students.findOne({ matricula: targetLogin });
  if (s) { if (name) s.name = name.trim(); if (cpf) s.cpf = cpf; Students.update(s); }

  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  FORUM
// ════════════════════════════════════════════════════════════
function getTeacherLoginForUser(user) {
  if (user.role === 'teacher') return user.login;
  if (user.role === 'student') {
    const s = Students.findOne({ matricula: user.login });
    return s ? s.teacherLogin : null;
  }
  return null;
}

function getAuthorPhoto(authorLogin, authorRole) {
  if (authorRole === 'teacher') return Teachers.findOne({ login: authorLogin })?.photo || '';
  if (authorRole === 'student') return Students.findOne({ matricula: authorLogin })?.photo || '';
  return Users.findOne({ login: authorLogin })?.photo || '';
}

app.get('/api/forum', auth, (req, res) => {
  const tLogin = getTeacherLoginForUser(req.session.user);
  if (!tLogin) return res.json([]);
  const posts = ForumPosts.find({ teacherLogin: tLogin }).sort((a, b) => b.createdAt - a.createdAt);
  const result = posts.map(p => ({
    ...p,
    authorPhoto: getAuthorPhoto(p.authorLogin, p.authorRole),
    replies: ForumReplies.find({ postId: p.$loki }).sort((a, b) => a.createdAt - b.createdAt).map(r => ({
      ...r,
      authorPhoto: getAuthorPhoto(r.authorLogin, r.authorRole),
    })),
  }));
  res.json(result);
});

app.post('/api/forum', auth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Conteúdo obrigatório' });
  const u = req.session.user;
  if (u.role === 'teacher') {
    const t = Teachers.findOne({ login: u.login });
    if (t?.blocked) return res.status(403).json({ error: 'TEACHER_BLOCKED' });
  }
  const tLogin = getTeacherLoginForUser(u);
  if (!tLogin) return res.status(400).json({ error: 'Grupo não encontrado' });
  const post = ForumPosts.insert({ teacherLogin: tLogin, authorLogin: u.login, authorName: u.name, authorRole: u.role, content: content.trim(), createdAt: Date.now() });
  res.json({ ok: true, post });
});

app.delete('/api/forum/:id', auth, (req, res) => {
  const post = ForumPosts.get(parseInt(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  const u = req.session.user;
  const canDelete = u.role === 'admin' || post.authorLogin === u.login || (u.role === 'teacher' && post.teacherLogin === u.login);
  if (!canDelete) return res.status(403).json({ error: 'Sem permissão' });
  ForumReplies.find({ postId: post.$loki }).forEach(r => ForumReplies.remove(r));
  ForumPosts.remove(post);
  res.json({ ok: true });
});

app.post('/api/forum/:id/replies', auth, (req, res) => {
  const post = ForumPosts.get(parseInt(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Conteúdo obrigatório' });
  const u = req.session.user;
  if (u.role === 'teacher') {
    const t = Teachers.findOne({ login: u.login });
    if (t?.blocked) return res.status(403).json({ error: 'TEACHER_BLOCKED' });
  }
  const tLogin = getTeacherLoginForUser(u);
  if (tLogin !== post.teacherLogin) return res.status(403).json({ error: 'Sem permissão' });
  const reply = ForumReplies.insert({ postId: post.$loki, authorLogin: u.login, authorName: u.name, authorRole: u.role, content: content.trim(), createdAt: Date.now() });
  res.json({ ok: true, reply });
});

app.delete('/api/forum/replies/:id', auth, (req, res) => {
  const reply = ForumReplies.get(parseInt(req.params.id));
  if (!reply) return res.status(404).json({ error: 'Resposta não encontrada' });
  const u = req.session.user;
  const post = ForumPosts.get(reply.postId);
  const canDelete = u.role === 'admin' || reply.authorLogin === u.login || (u.role === 'teacher' && post?.teacherLogin === u.login);
  if (!canDelete) return res.status(403).json({ error: 'Sem permissão' });
  ForumReplies.remove(reply);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  SUGGESTIONS
// ════════════════════════════════════════════════════════════
// Blocked teacher contact — no isTeach middleware
app.post('/api/contact-admin', auth, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Mensagem obrigatória' });
  const u = req.session.user;
  AdminMessages.insert({ fromLogin: u.login, fromName: u.name, fromRole: u.role, content: content.trim(), createdAt: now(), read: false, adminReply: null, adminRepliedAt: null });
  res.json({ ok: true });
});

app.get('/api/admin/messages', auth, isAdmin, (req, res) => {
  res.json(AdminMessages.find().sort((a, b) => b.createdAt - a.createdAt));
});

app.put('/api/admin/messages/:id/read', auth, isAdmin, (req, res) => {
  const m = AdminMessages.get(parseInt(req.params.id));
  if (!m) return res.status(404).json({ error: 'Não encontrado' });
  m.read = true; AdminMessages.update(m);
  res.json({ ok: true });
});

app.put('/api/admin/messages/:id/reply', auth, isAdmin, (req, res) => {
  const { reply } = req.body;
  if (!reply?.trim()) return res.status(400).json({ error: 'Resposta obrigatória' });
  const m = AdminMessages.get(parseInt(req.params.id));
  if (!m) return res.status(404).json({ error: 'Não encontrado' });
  m.adminReply = reply.trim(); m.adminRepliedAt = now(); m.read = true;
  AdminMessages.update(m);
  res.json({ ok: true });
});

app.post('/api/suggestions', auth, isTeach, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Conteúdo obrigatório' });
  const u = req.session.user;
  Suggestions.insert({ teacherLogin: u.login, teacherName: u.name, content: content.trim(), createdAt: Date.now(), read: false });
  res.json({ ok: true });
});

app.get('/api/admin/suggestions', auth, isAdmin, (req, res) => {
  res.json(Suggestions.find().sort((a, b) => b.createdAt - a.createdAt));
});

app.put('/api/admin/suggestions/:id/read', auth, isAdmin, (req, res) => {
  const s = Suggestions.get(parseInt(req.params.id));
  if (!s) return res.status(404).json({ error: 'Sugestão não encontrada' });
  s.read = true;
  Suggestions.update(s);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  PAYMENTS
// ════════════════════════════════════════════════════════════
function ensurePaymentForStudent(student, month) {
  if (!student.price || !student.payday) return;
  const [y, m] = month.split('-').map(Number);
  const existing = Payments.findOne({ studentMatricula: student.matricula, month });
  if (!existing) {
    // Store dueDate as UTC noon on the due day — timezone-neutral anchor point
    const dueDate = Date.UTC(y, m - 1, parseInt(student.payday) || 1, 12, 0, 0);
    Payments.insert({
      studentMatricula: student.matricula, studentName: student.name,
      teacherLogin: student.teacherLogin, month,
      amount: parseFloat(student.price) || 0,
      dueDate, paidAt: null,
      status: isOverdueBR(dueDate) ? 'overdue' : 'pending',
    });
  } else if (existing.status === 'pending' && isOverdueBR(existing.dueDate)) {
    existing.status = 'overdue';
    Payments.update(existing);
  }
}

function ensureMonthlyPayments(teacherLogin, month) {
  Students.find({ teacherLogin }).forEach(s => ensurePaymentForStudent(s, month));
}

app.get('/api/payments', auth, isTeach, (req, res) => {
  const tLogin = req.session.user.login;
  const month  = req.query.month || new Date().toISOString().slice(0, 7);
  ensureMonthlyPayments(tLogin, month);
  const payments = Payments.find({ teacherLogin: tLogin, month })
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
  const paid     = payments.filter(p => p.status === 'paid');
  const pending  = payments.filter(p => p.status === 'pending');
  const overdue  = payments.filter(p => p.status === 'overdue');
  const totalAmount    = payments.reduce((s, p) => s + p.amount, 0);
  const receivedAmount = paid.reduce((s, p) => s + p.amount, 0);
  res.json({ payments, month, summary: { total: payments.length, paid: paid.length, pending: pending.length, overdue: overdue.length, totalAmount, receivedAmount } });
});

app.put('/api/payments/:id/mark-paid', auth, isTeach, (req, res) => {
  const p = Payments.get(parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: 'Pagamento não encontrado' });
  if (p.teacherLogin !== req.session.user.login) return res.status(403).json({ error: 'Sem permissão' });
  p.status = 'paid'; p.paidAt = Date.now();
  Payments.update(p);
  res.json({ ok: true });
});

app.put('/api/payments/:id/mark-unpaid', auth, isTeach, (req, res) => {
  const p = Payments.get(parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: 'Pagamento não encontrado' });
  if (p.teacherLogin !== req.session.user.login) return res.status(403).json({ error: 'Sem permissão' });
  p.status = isOverdueBR(p.dueDate) ? 'overdue' : 'pending'; p.paidAt = null;
  Payments.update(p);
  res.json({ ok: true });
});

app.get('/api/payments/student', auth, (req, res) => {
  const u = req.session.user;
  if (u.role !== 'student') return res.status(403).json({ error: 'Sem permissão' });
  const student = Students.findOne({ matricula: u.login });
  if (!student?.price || !student?.payday) return res.json({ hasPaymentPlan: false, payments: [] });
  const currentMonth = new Date().toISOString().slice(0, 7);
  ensurePaymentForStudent(student, currentMonth);
  const payments = Payments.find({ studentMatricula: u.login })
    .sort((a, b) => b.month.localeCompare(a.month));
  res.json({ hasPaymentPlan: true, price: student.price, payday: student.payday, payments });
});

app.get('/api/payments/student/alert', auth, (req, res) => {
  const u = req.session.user;
  if (u.role !== 'student') return res.json({ alert: false });
  const student = Students.findOne({ matricula: u.login });
  if (!student?.price || !student?.payday) return res.json({ alert: false });
  const currentMonth = new Date().toISOString().slice(0, 7);
  ensurePaymentForStudent(student, currentMonth);
  const p = Payments.findOne({ studentMatricula: u.login, month: currentMonth });
  if (!p || p.status === 'paid') return res.json({ alert: false });
  const todayStr = todayBR();
  const dueStr   = dateBR(p.dueDate);
  const daysUntilDue = Math.round((new Date(dueStr) - new Date(todayStr)) / 86400000);
  res.json({ alert: p.status === 'overdue' || daysUntilDue <= 4, status: p.status, daysUntilDue, amount: p.amount, dueDate: p.dueDate });
});

app.put('/api/students/:matricula/payment-plan', auth, isTeach, (req, res) => {
  const s = Students.findOne({ matricula: req.params.matricula });
  if (!s || s.teacherLogin !== req.session.user.login) return res.status(404).json({ error: 'Aluno não encontrado' });
  const { price, payday } = req.body;
  if (price  !== undefined) s.price  = price;
  if (payday !== undefined) s.payday = payday;
  Students.update(s);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  MESSAGES (student ↔ teacher)
// ════════════════════════════════════════════════════════════
app.post('/api/messages', auth, (req, res) => {
  const { content, toLogin } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Conteúdo obrigatório' });
  const u = req.session.user;
  let toUser, teacherLogin;
  if (u.role === 'student') {
    const student = Students.findOne({ matricula: u.login });
    if (!student) return res.status(404).json({ error: 'Dados não encontrados' });
    if (toLogin) {
      // Network contact: student messaging a teacher they found in Network
      toUser = Users.findOne({ login: toLogin, role: 'teacher' });
      if (!toUser) return res.status(404).json({ error: 'Professor não encontrado' });
      teacherLogin = toLogin;
    } else {
      toUser = Users.findOne({ login: student.teacherLogin });
      teacherLogin = student.teacherLogin;
    }
  } else if (u.role === 'teacher') {
    const student = Students.findOne({ matricula: toLogin });
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' });
    // Allow reply if formally linked OR if there's an existing message thread (Network contact)
    const isLinked = student.teacherLogin === u.login;
    const hasThread = Messages.find({ teacherLogin: u.login }).some(m => m.fromLogin === toLogin || m.toLogin === toLogin);
    if (!isLinked && !hasThread) return res.status(403).json({ error: 'Sem permissão' });
    toUser = Users.findOne({ login: toLogin });
    teacherLogin = u.login;
  } else {
    return res.status(403).json({ error: 'Sem permissão' });
  }
  if (!toUser) return res.status(404).json({ error: 'Destinatário não encontrado' });
  Messages.insert({ fromLogin: u.login, fromName: u.name, fromRole: u.role, toLogin: toUser.login, toName: toUser.name, toRole: toUser.role, teacherLogin, content: content.trim(), createdAt: Date.now(), read: false });
  notify(toUser.login, 'new_message', 'Nova mensagem', `${u.name} enviou uma mensagem`);
  res.json({ ok: true });
});

app.get('/api/messages/student-threads', auth, (req, res) => {
  const u = req.session.user;
  if (u.role !== 'student') return res.status(403).json({ error: 'Apenas alunos' });
  const all = Messages.find({}).filter(m => m.fromLogin === u.login || m.toLogin === u.login);
  const map = {};
  all.forEach(m => {
    const tLogin = m.fromRole === 'teacher' ? m.fromLogin : m.toLogin;
    const tName  = m.fromRole === 'teacher' ? m.fromName  : m.toName;
    if (!map[tLogin]) map[tLogin] = { teacherLogin: tLogin, teacherName: tName, unread: 0, last: null };
    if (!m.read && m.toLogin === u.login) map[tLogin].unread++;
    if (!map[tLogin].last || m.createdAt > map[tLogin].last.createdAt) map[tLogin].last = m;
  });
  res.json(Object.values(map).sort((a, b) => (b.last?.createdAt || 0) - (a.last?.createdAt || 0)));
});

app.get('/api/messages/threads', auth, isTeach, (req, res) => {
  const tLogin = req.session.user.login;
  const all = Messages.find({ teacherLogin: tLogin });
  const map = {};
  all.forEach(m => {
    const sLogin = m.fromRole === 'student' ? m.fromLogin : m.toLogin;
    const sName  = m.fromRole === 'student' ? m.fromName  : m.toName;
    if (!map[sLogin]) map[sLogin] = { studentLogin: sLogin, studentName: sName, unread: 0, last: null };
    if (!m.read && m.toLogin === tLogin) map[sLogin].unread++;
    if (!map[sLogin].last || m.createdAt > map[sLogin].last.createdAt) map[sLogin].last = m;
  });
  res.json(Object.values(map).sort((a, b) => (b.last?.createdAt || 0) - (a.last?.createdAt || 0)));
});

app.get('/api/messages/conversation/:login', auth, (req, res) => {
  const u = req.session.user;
  const other = req.params.login;
  const msgs = Messages.find({}).filter(m =>
    (m.fromLogin === u.login && m.toLogin === other) ||
    (m.fromLogin === other   && m.toLogin === u.login)
  ).sort((a, b) => a.createdAt - b.createdAt);
  res.json(msgs);
});

app.put('/api/messages/read/:login', auth, (req, res) => {
  const u = req.session.user;
  Messages.find({ fromLogin: req.params.login, toLogin: u.login, read: false })
    .forEach(m => { m.read = true; Messages.update(m); });
  res.json({ ok: true });
});

// ── Suggestion reply (admin) ───────────────────────────────
app.put('/api/admin/suggestions/:id/reply', auth, isAdmin, (req, res) => {
  const s = Suggestions.get(parseInt(req.params.id));
  if (!s) return res.status(404).json({ error: 'Sugestão não encontrada' });
  const { reply } = req.body;
  if (!reply?.trim()) return res.status(400).json({ error: 'Resposta obrigatória' });
  s.adminReply = reply.trim(); s.adminRepliedAt = Date.now(); s.read = true; s.teacherRead = false;
  Suggestions.update(s);
  res.json({ ok: true });
});

// Teacher: get own suggestions (with admin replies)
app.get('/api/teacher/suggestions', auth, isTeach, (req, res) => {
  const mine = Suggestions.find({ teacherLogin: req.session.user.login })
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json(mine);
});

app.put('/api/suggestions/mark-replies-read', auth, (req, res) => {
  const u = req.session.user;
  Suggestions.find({ teacherLogin: u.login }).forEach(s => {
    if (s.adminReply && !s.teacherRead) { s.teacherRead = true; Suggestions.update(s); }
  });
  res.json({ ok: true });
});

// ── Unified unread count ───────────────────────────────────
app.get('/api/unread-count', auth, (req, res) => {
  const u = req.session.user;
  if (u.role === 'student') {
    const count = Messages.find({ toLogin: u.login, read: false }).length;
    return res.json({ count, msgCount: count, suggCount: 0 });
  }
  if (u.role === 'teacher') {
    const msgCount  = Messages.find({ toLogin: u.login, read: false }).length;
    const suggCount = Suggestions.find({ teacherLogin: u.login }).filter(s => s.adminReply && !s.teacherRead).length;
    return res.json({ count: msgCount + suggCount, msgCount, suggCount });
  }
  if (u.role === 'admin') {
    const count = Suggestions.find({ read: false }).length;
    return res.json({ count, msgCount: 0, suggCount: count });
  }
  res.json({ count: 0, msgCount: 0, suggCount: 0 });
});

// ── Study Plans ──────────────────────────────────────────────
app.get('/api/study-plans', auth, isTeach, (req, res) => {
  res.json(StudyPlans.find({ teacherLogin: req.session.user.login }));
});

app.get('/api/study-plan/:matricula', auth, (req, res) => {
  const u = req.session.user;
  const { matricula } = req.params;
  if (u.role === 'teacher') {
    if (!Students.findOne({ matricula, teacherLogin: u.login })) return res.status(403).json({ error: 'Acesso negado' });
  } else if (u.role === 'student') {
    if (u.login !== matricula) return res.status(403).json({ error: 'Acesso negado' });
  } else if (u.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  res.json(StudyPlans.findOne({ studentMatricula: matricula }) || null);
});

app.put('/api/study-plan/:matricula', auth, isTeach, (req, res) => {
  const u = req.session.user;
  const { matricula } = req.params;
  if (!Students.findOne({ matricula, teacherLogin: u.login })) return res.status(403).json({ error: 'Acesso negado' });
  const { title, goalLevel, startDate, endDate, milestones } = req.body;
  let plan = StudyPlans.findOne({ studentMatricula: matricula });
  if (plan) {
    if (title      !== undefined) plan.title      = title;
    if (goalLevel  !== undefined) plan.goalLevel  = goalLevel;
    if (startDate  !== undefined) plan.startDate  = startDate;
    if (endDate    !== undefined) plan.endDate    = endDate;
    if (milestones !== undefined) plan.milestones = milestones;
    plan.updatedAt = now();
    StudyPlans.update(plan);
  } else {
    plan = StudyPlans.insert({
      studentMatricula: matricula, teacherLogin: u.login,
      title: title || '', goalLevel: goalLevel || '',
      startDate: startDate || '', endDate: endDate || '',
      milestones: milestones || [], createdAt: now(), updatedAt: now(),
    });
  }
  res.json(plan);
});

app.delete('/api/study-plan/:matricula', auth, isTeach, (req, res) => {
  const u = req.session.user;
  const { matricula } = req.params;
  if (!Students.findOne({ matricula, teacherLogin: u.login })) return res.status(403).json({ error: 'Acesso negado' });
  const plan = StudyPlans.findOne({ studentMatricula: matricula });
  if (plan) StudyPlans.remove(plan);
  res.json({ ok: true });
});

// ── Network ──────────────────────────────────────────────────────────────────
app.get('/api/network/teachers', (req, res) => {
  // Determine languages the student already has a teacher for (to exclude)
  let excludeLangs = [];
  const sess = req.session?.user;
  if (sess?.role === 'student') {
    const stu = Students.findOne({ matricula: sess.login });
    if (stu?.teacherLogin) {
      const myTeacher = Teachers.findOne({ login: stu.teacherLogin });
      excludeLangs = myTeacher?.networkLanguages || [];
    }
  }
  const teachers = Teachers.find({ networkVisible: true });
  const result = teachers
    .filter(t => {
      if (!excludeLangs.length) return true;
      const tLangs = t.networkLanguages || [];
      return !tLangs.some(l => excludeLangs.includes(l));
    })
    .map(t => {
      const u = Users.findOne({ login: t.login });
      const rs = Ratings ? Ratings.find({ teacherLogin: t.login }) : [];
      const avgRating = rs.length ? Math.round(rs.reduce((s, r) => s + r.stars, 0) / rs.length * 10) / 10 : 0;
      return {
        login: t.login, name: t.name, photo: u?.photo || null,
        bio: t.networkBio || '', languages: t.networkLanguages || [],
        rate: t.networkRate || null, rateNegotiable: t.networkRateNegotiable || false,
        publicEmail: t.networkEmail || '', publicWhatsapp: t.networkWhatsapp || '',
        studentCount: Students.find({ teacherLogin: t.login, active: { '$ne': false } }).length,
        avgRating, ratingCount: rs.length,
      };
    });
  res.json(result);
});

// ── Notifications ─────────────────────────────────────────────────────────────
app.get('/api/notifications', auth, (req, res) => {
  const all = Notifications.find({ toLogin: req.session.user.login })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 40);
  res.json(all);
});

app.put('/api/notifications/read-all', auth, (req, res) => {
  Notifications.find({ toLogin: req.session.user.login, read: false })
    .forEach(n => { n.read = true; Notifications.update(n); });
  res.json({ ok: true });
});

// ── Ratings ────────────────────────────────────────────────────────────────────
app.get('/api/ratings/my', auth, (req, res) => {
  const u = req.session.user;
  if (u.role !== 'student') return res.status(403).json({ error: 'Apenas alunos' });
  const student = Students.findOne({ matricula: u.login });
  if (!student?.teacherLogin) return res.json(null);
  const r = Ratings.findOne({ studentLogin: u.login, teacherLogin: student.teacherLogin });
  res.json(r || null);
});

app.post('/api/ratings', auth, (req, res) => {
  const u = req.session.user;
  if (u.role !== 'student') return res.status(403).json({ error: 'Apenas alunos podem avaliar' });
  const { stars, comment } = req.body;
  const s = parseInt(stars);
  if (!s || s < 1 || s > 5) return res.status(400).json({ error: 'Nota inválida (1–5)' });
  const student = Students.findOne({ matricula: u.login });
  if (!student?.teacherLogin) return res.status(400).json({ error: 'Você não tem professor vinculado' });
  const teacherLogin = student.teacherLogin;
  const existing = Ratings.findOne({ studentLogin: u.login, teacherLogin });
  if (existing) {
    existing.stars = s; existing.comment = comment?.trim() || ''; existing.updatedAt = now();
    Ratings.update(existing);
  } else {
    Ratings.insert({ teacherLogin, studentLogin: u.login, studentName: u.name, stars: s, comment: comment?.trim() || '', createdAt: now() });
  }
  res.json({ ok: true });
});

app.get('/api/ratings/:teacherLogin', (req, res) => {
  const rs = Ratings.find({ teacherLogin: req.params.teacherLogin });
  const avg = rs.length ? Math.round(rs.reduce((s, r) => s + r.stars, 0) / rs.length * 10) / 10 : 0;
  res.json({ avg, count: rs.length, ratings: rs.map(r => ({ stars: r.stars, comment: r.comment, studentName: r.studentName, createdAt: r.createdAt })) });
});

// ── Network Requests ──────────────────────────────────────────────────────────
app.post('/api/network/request', auth, (req, res) => {
  const u = req.session.user;
  if (u.role !== 'student') return res.status(403).json({ error: 'Apenas alunos podem solicitar' });
  const { teacherLogin } = req.body;
  if (!teacherLogin) return res.status(400).json({ error: 'Professor obrigatório' });
  const teacher = Teachers.findOne({ login: teacherLogin, networkVisible: true });
  if (!teacher) return res.status(404).json({ error: 'Professor não encontrado' });
  const existing = NetworkRequests.findOne({ studentLogin: u.login, status: 'pending' });
  if (existing) return res.status(400).json({ error: 'Você já tem uma solicitação pendente' });
  NetworkRequests.insert({ studentLogin: u.login, studentName: u.name, teacherLogin, teacherName: teacher.name, status: 'pending', createdAt: now() });
  notify(teacherLogin, 'network_request', 'Nova solicitação de aula 📬', `${u.name} quer ter aulas com você`);
  res.json({ ok: true });
});

app.get('/api/network/my-request', auth, (req, res) => {
  const u = req.session.user;
  if (u.role !== 'student') return res.status(403).json({ error: 'Apenas alunos' });
  const r = NetworkRequests.findOne({ studentLogin: u.login, status: 'pending' });
  res.json(r ? { status: r.status, teacherLogin: r.teacherLogin, teacherName: r.teacherName } : { status: null });
});

app.delete('/api/network/request', auth, (req, res) => {
  const u = req.session.user;
  if (u.role !== 'student') return res.status(403).json({ error: 'Apenas alunos' });
  const r = NetworkRequests.findOne({ studentLogin: u.login, status: 'pending' });
  if (!r) return res.status(404).json({ error: 'Solicitação não encontrada' });
  NetworkRequests.remove(r);
  res.json({ ok: true });
});

app.get('/api/network/requests', auth, isTeach, (req, res) => {
  const tLogin = req.session.user.login;
  const reqs = NetworkRequests.find({ teacherLogin: tLogin, status: 'pending' });
  res.json(reqs.map(r => ({
    id: r.$loki, studentLogin: r.studentLogin, studentName: r.studentName,
    teacherLogin: r.teacherLogin, status: r.status, createdAt: r.createdAt,
  })));
});

app.put('/api/network/request/:id/accept', auth, isTeach, (req, res) => {
  const r = NetworkRequests.get(parseInt(req.params.id));
  if (!r || r.teacherLogin !== req.session.user.login) return res.status(404).json({ error: 'Não encontrado' });
  r.status = 'accepted';
  NetworkRequests.update(r);
  notify(r.studentLogin, 'network_accepted', 'Solicitação aceita! 🎉', `${req.session.user.name} aceitou sua solicitação de aula`);
  res.json({ ok: true, studentLogin: r.studentLogin, studentName: r.studentName });
});

app.put('/api/network/request/:id/reject', auth, isTeach, (req, res) => {
  const r = NetworkRequests.get(parseInt(req.params.id));
  if (!r || r.teacherLogin !== req.session.user.login) return res.status(404).json({ error: 'Não encontrado' });
  r.status = 'rejected';
  NetworkRequests.update(r);
  notify(r.studentLogin, 'network_rejected', 'Solicitação recusada', `${req.session.user.name} não pôde aceitar sua solicitação no momento`);
  res.json({ ok: true });
});

app.post('/api/network/complete-registration', auth, isTeach, (req, res) => {
  const { studentLogin, price, payday } = req.body;
  if (!studentLogin || !price || !payday) return res.status(400).json({ error: 'Dados obrigatórios' });
  const t = req.session.user;
  const s = Students.findOne({ matricula: studentLogin });
  if (!s) return res.status(404).json({ error: 'Aluno não encontrado' });
  s.teacherLogin = t.login;
  s.teacherName  = t.name;
  s.price        = String(price);
  s.payday       = String(payday);
  Students.update(s);
  // Mark any accepted/pending request as contracted
  const r = NetworkRequests.findOne({ studentLogin, teacherLogin: t.login });
  if (r) { r.status = 'contracted'; NetworkRequests.update(r); }
  // Ensure next payment is scheduled
  try { ensurePaymentForStudent(s); } catch(e) { /* ok */ }
  res.json({ ok: true, studentMatricula: studentLogin });
});

app.get('/api/network/teachers/:login', (req, res) => {
  const t = Teachers.findOne({ login: req.params.login, networkVisible: true });
  if (!t) return res.status(404).json({ error: 'Professor não encontrado' });
  const u = Users.findOne({ login: t.login });
  res.json({
    login: t.login, name: t.name, photo: u?.photo || null,
    bio: t.networkBio || '', languages: t.networkLanguages || [],
    rate: t.networkRate || null, rateNegotiable: t.networkRateNegotiable || false,
    publicEmail: t.networkEmail || '', publicWhatsapp: t.networkWhatsapp || '', publicInstagram: t.networkInstagram || '',
  });
});

app.put('/api/teacher/network-profile', auth, isTeach, (req, res) => {
  const t = Teachers.findOne({ login: req.session.user.login });
  if (!t) return res.status(404).json({ error: 'Professor não encontrado' });
  const fields = ['networkVisible','networkBio','networkLanguages','networkRate','networkRateNegotiable','networkEmail','networkWhatsapp','networkInstagram'];
  fields.forEach(f => { if (req.body[f] !== undefined) t[f] = req.body[f]; });
  Teachers.update(t);
  res.json({ ok: true });
});

app.get('/api/teacher/network-profile', auth, isTeach, (req, res) => {
  const t = Teachers.findOne({ login: req.session.user.login });
  if (!t) return res.status(404).json({ error: 'não encontrado' });
  res.json({
    networkVisible: t.networkVisible || false,
    networkBio: t.networkBio || '',
    networkLanguages: t.networkLanguages || [],
    networkRate: t.networkRate || null,
    networkRateNegotiable: t.networkRateNegotiable || false,
    networkEmail: t.networkEmail || '',
    networkWhatsapp: t.networkWhatsapp || '',
    networkInstagram: t.networkInstagram || '',
  });
});

// ── Student self-registration ──────────────────────────────────────────────
app.post('/api/register/student', (req, res) => {
  const { name, login: rawLogin, cpf, dob, languages, email, whatsapp, password } = req.body;
  if (!name?.trim())      return res.status(400).json({ error: 'Nome é obrigatório' });
  if (!rawLogin?.trim())  return res.status(400).json({ error: 'Login é obrigatório' });
  if (!cpf?.trim())       return res.status(400).json({ error: 'CPF é obrigatório' });
  if (!dob?.trim())       return res.status(400).json({ error: 'Data de nascimento é obrigatória' });
  if (!languages?.length) return res.status(400).json({ error: 'Selecione ao menos um idioma' });
  if (!email?.trim())     return res.status(400).json({ error: 'E-mail é obrigatório' });
  if (!whatsapp?.trim())  return res.status(400).json({ error: 'WhatsApp é obrigatório' });
  if (!password || password.length < 4) return res.status(400).json({ error: 'Senha mínimo 4 caracteres' });
  const login = rawLogin.trim();
  if (!/^[a-zA-Z0-9_]{4,20}$/.test(login)) return res.status(400).json({ error: 'Login deve ter entre 4 e 20 caracteres (letras, números e _)' });
  if (Users.findOne({ login }) || Users.findOne({ login: login.toUpperCase() })) return res.status(409).json({ error: 'Este login já está em uso. Escolha outro.' });
  const cpfDigits = cpf.replace(/\D/g, '');
  if (cpfDigits.length !== 11) return res.status(400).json({ error: 'CPF deve ter 11 dígitos' });
  const cpfUsed = Teachers.find().some(t => t.cpf && t.cpf.replace(/\D/g,'') === cpfDigits)
    || Students.find().some(s => s.cpf && s.cpf.replace(/\D/g,'') === cpfDigits);
  if (cpfUsed) return res.status(409).json({ error: 'Este CPF já está cadastrado na plataforma.' });
  const ini = initials(name);
  const { color, bg } = pickColor(Students.count());
  Users.insert({ login, password: bcrypt.hashSync(password, 10), role: 'student', name: name.trim(), createdAt: now() });
  Students.insert({
    matricula: login, name: name.trim(), socialname: '', initials: ini, level: 'A1', color, bg,
    teacherLogin: null, teacherName: null,
    cpf: cpf.trim(), dob: dob.trim(), email: email.trim(), whatsapp: whatsapp.trim(),
    languages: Array.isArray(languages) ? languages : [languages],
    selfRegistered: true, createdAt: now(), active: true,
  });
  res.json({ ok: true, login, name: name.trim() });
});

// SPA fallback - serve index.html for all non-API routes
app.use((req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(500).send('ERROR: index.html not found in: ' + __dirname);
  }
});

app.listen(PORT, () => console.log(`\n🚀 BeBrave rodando em http://localhost:${PORT}\n   Admin: ADMIN / 05012018\n`));
