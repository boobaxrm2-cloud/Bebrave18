/* ============================================================
   BeBrave — Frontend App
   ============================================================ */

// ── State ─────────────────────────────────────────────────────
let ME = null;
let calMonthT = new Date(); calMonthT.setDate(1);
let calMonthS = new Date(); calMonthS.setDate(1);
let pendingLessonStudent = null;

const MONTHS_PT    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const DAYS_PT      = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

// ── Init ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const r = await api('GET', '/api/auth/me');
    ME = r;
    bootRole(ME.role);
  } catch {
    showPage('page-login');
  }
});

function bootRole(role) {
  if (role === 'admin')   { showPage('page-admin');   loadAdmin(); }
  if (role === 'teacher') { showPage('page-teacher'); loadTeacher(); }
  if (role === 'student') { showPage('page-student'); loadStudent(); }
}

// ── Auth ─────────────────────────────────────────────────────
async function doLogin() {
  const login    = document.getElementById('li-login').value.trim();
  const password = document.getElementById('li-pass').value;
  const err      = document.getElementById('login-err');
  err.classList.add('hidden');
  if (!login || !password) { err.textContent = 'Preencha todos os campos.'; err.classList.remove('hidden'); return; }
  try {
    ME = await api('POST', '/api/auth/login', { login: login.toUpperCase(), password });
    bootRole(ME.role);
  } catch(e) {
    err.textContent = e.message || 'Login ou senha incorretos.';
    err.classList.remove('hidden');
  }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('page-login').classList.contains('active')) doLogin();
});

async function doLogout() {
  try { await api('POST', '/api/auth/logout'); } catch(e) {}
  ME = null;
  const ov = document.getElementById('teacher-blocked-overlay');
  if (ov) ov.style.display = 'none';
  showPage('page-login');
  document.getElementById('li-login').value = '';
  document.getElementById('li-pass').value = '';
}

// ══════════════════════════════════════════════════════════════
//  ADMIN
// ══════════════════════════════════════════════════════════════
async function loadAdmin() {
  showPage('page-admin');
  // Set admin name and initials
  const initials = ME.name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
  const avatarEl = document.getElementById('adm-avatar-img');
  if (avatarEl) {
    avatarEl.style.backgroundImage = '';
    avatarEl.style.padding = '';
    avatarEl.innerHTML = '';
    avatarEl.textContent = initials;
  }
  const nameEl = document.getElementById('adm-name');
  if (nameEl) nameEl.textContent = ME.name;
  // Load admin profile photo
  try {
    const profile = await api('GET', '/api/profile');
    if (profile.photo) updateSidebarAvatar(profile.photo);
  } catch(e) {}
  loadAdminOverview();
  loadAdminTeachers();
  loadAdminStudents('');
  refreshInboxBadges();
}

async function loadAdminOverview() {
  const [teachers, students] = await Promise.all([
    api('GET','/api/admin/teachers'),
    api('GET','/api/admin/students')
  ]);
  const lessons = await api('GET','/api/lessons').catch(()=>[]);
  renderStats('adm-stats', [
    { icon:'👨‍🏫', val: teachers.length, lbl:'Professores', cls:'bc-amber' },
    { icon:'🎓', val: students.length, lbl:'Alunos', cls:'bc-blue' },
    { icon:'📅', val: lessons.length, lbl:'Aulas cadastradas', cls:'bc-green' },
    { icon:'✅', val: lessons.filter(l=>l.status==='done').length, lbl:'Aulas realizadas', cls:'bc-purple' },
  ]);
  // Teacher cards
  document.getElementById('adm-teacher-cards').innerHTML = teachers.length
    ? teachers.map(t => `<div class="person-card" onclick="showAdmin('adm-teachers',document.querySelector('#admin-sidebar .nav-item:nth-child(2)'))">
        <div class="pc-av" style="background:${t.bg||'#e8eeff'};color:${t.color||'#3b6ef5'}">${t.initials}</div>
        <div><div class="pc-name">${t.name}</div><div class="pc-sub">Login: ${t.login}</div><div class="pc-cnt">${t.studentCount} aluno${t.studentCount!==1?'s':''}</div></div>
      </div>`).join('')
    : '<p class="empty">Nenhum professor cadastrado ainda.</p>';
}

async function loadAdminTeachers() {
  const teachers = await api('GET','/api/admin/teachers');
  const el = document.getElementById('adm-teachers-list');
  if (!teachers.length) { el.innerHTML = '<p class="empty">Nenhum professor cadastrado ainda.</p>'; return; }
  el.innerHTML = `<table class="list-table"><thead><tr>
    <th>Professor</th><th>Login</th><th>Idiomas</th><th>Senha</th><th>Termo de Uso</th><th>Alunos</th><th>Cadastrado em</th><th>Ações</th>
  </tr></thead><tbody>
    ${teachers.map(t=>{
      const termsHtml = t.termsAccepted
        ? `<div style="display:flex;align-items:center;gap:6px">
            <span style="color:#22c55e;font-size:12px;font-weight:600">✅ Aceito</span>
            <a href="/api/admin/teachers/${encodeURIComponent(t.login)}/terms-view" target="_blank"
               style="font-size:11px;background:#e0f2fe;color:#0369a1;border:none;border-radius:6px;padding:3px 8px;text-decoration:none;font-weight:600;cursor:pointer">⬇ Ver</a>
           </div>`
        : `<span style="color:#f59e0b;font-size:12px;font-weight:600">⏳ Pendente</span>`;
      const pwId = `pw-${t.login.replace(/\W/g,'_')}`;
      const pwHtml = t.plainPassword
        ? `<div style="display:flex;align-items:center;gap:6px">
            <span id="${pwId}" style="font-family:monospace;font-size:13px;filter:blur(4px);transition:filter .2s">${escHtml(t.plainPassword)}</span>
            <button class="btn-icon" title="Mostrar/ocultar senha" onclick="(function(){const s=document.getElementById('${pwId}');s.style.filter=s.style.filter?'':'blur(4px)'})()" style="font-size:14px">👁</button>
           </div>`
        : `<span style="color:var(--g400);font-size:12px">—</span>`;
      const langsList = Array.isArray(t.languages) ? t.languages : (t.languages ? [t.languages] : []);
      const langsHtml = langsList.length
        ? `<span style="font-size:13px;color:var(--g700)">${langsList.join(', ')}</span>`
        : '<span style="color:var(--g400);font-size:12px">—</span>';
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:10px"><div class="lt-av" style="background:${t.bg||'#e8eeff'};color:${t.color||'#3b6ef5'}">${t.initials}</div><div><div>${t.name}</div>${t.blocked?'<span style="font-size:11px;color:#ef4444;font-weight:600">● Bloqueado</span>':''}</div></div></td>
        <td><span class="mat-badge" style="background:var(--navy2)">${t.login}</span></td>
        <td>${langsHtml}</td>
        <td>${pwHtml}</td>
        <td>${termsHtml}</td>
        <td>${t.studentCount} aluno${t.studentCount!==1?'s':''}</td>
        <td>${fmtDate(t.createdAt)}</td>
        <td><div class="lt-actions">
          <button class="btn-icon" title="${t.blocked?'Desbloquear':'Bloquear'} professor" onclick="toggleBlockTeacher('${t.login}',${!!t.blocked})" style="${t.blocked?'color:#22c55e':'color:#ef4444'}">${t.blocked?'🔓':'🔒'}</button>
          <button class="btn-icon" title="Redefinir senha" onclick="openResetPw('${t.login}','${t.name}')">🔑</button>
          <button class="btn-icon danger" title="Excluir" onclick="confirmDelete('teacher','${t.login}','${escJs(t.name)}')">🗑</button>
        </div></td>
      </tr>`;
    }).join('')}
  </tbody></table>`;
}

let _adminStudentFilter = '';
let _adminShowDeleted = false;

async function loadAdminStudents(teacherFilter) {
  if (teacherFilter !== undefined) _adminStudentFilter = teacherFilter;
  const [students, deleted, teachers] = await Promise.all([
    api('GET', '/api/admin/students'),
    api('GET', '/api/admin/students/deleted').catch(()=>[]),
    api('GET', '/api/admin/teachers'),
  ]);
  const el = document.getElementById('adm-students-list');

  // Build filter bar
  const filterBar = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
    <select id="adm-teacher-filter" onchange="loadAdminStudents(this.value)" style="font-size:13px;padding:8px 14px;border:1.5px solid var(--g200);border-radius:var(--r-sm);font-family:'DM Sans',sans-serif">
      <option value="">Todos os professores</option>
      <option value="__none__"${_adminStudentFilter==='__none__'?' selected':''}>⚠️ Sem professor</option>
      ${teachers.map(t=>`<option value="${t.login}"${t.login===_adminStudentFilter?' selected':''}>${t.name}</option>`).join('')}
    </select>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;color:var(--g600)">
      <input type="checkbox" ${_adminShowDeleted?'checked':''} onchange="_adminShowDeleted=this.checked;loadAdminStudents()" style="accent-color:var(--red)">
      Mostrar alunos excluídos
    </label>
    <span style="font-size:13px;color:var(--g400)">${students.filter(s=>s.active!==false).length} ativos${students.filter(s=>s.active===false).length?' • '+students.filter(s=>s.active===false).length+' inativo'+(students.filter(s=>s.active===false).length!==1?'s':''):''}${deleted.length?' • '+deleted.length+' excluído'+(deleted.length!==1?'s':''):''}</span>
  </div>`;

  // Separate active vs inactive
  const allFiltered = _adminStudentFilter === '__none__'
    ? students.filter(s => !s.teacherLogin)
    : _adminStudentFilter
      ? students.filter(s => s.teacherLogin === _adminStudentFilter)
      : students;
  let filtered  = allFiltered.filter(s => s.active !== false);
  const inactiveStudents = allFiltered.filter(s => s.active === false);

  const activeRows = filtered.map(s=>`<tr>
    <td><div style="display:flex;align-items:center;gap:10px"><div class="lt-av" style="background:${s.bg||'#e8eeff'};color:${s.color||'#3b6ef5'}">${s.initials}</div>${s.name}</div></td>
    <td><span class="mat-badge">${s.matricula}</span></td>
    <td><span class="badge b-sched">${s.level}</span></td>
    <td>${s.teacherName||'—'}</td>
    <td>${s.lessonCount}</td>
    <td>${fmtDate(s.createdAt)}</td>
    <td><div class="lt-actions">
      <button class="btn-icon" title="Redefinir senha" onclick="openResetPw('${s.matricula}','${escJs(s.name)}')">🔑</button>
      <button class="btn-icon danger" title="Excluir" onclick="confirmDelete('student','${s.matricula}','${escJs(s.name)}')">🗑</button>
    </div></td>
  </tr>`).join('');

  // Inactive students rows
  const inactiveRows = inactiveStudents.map(s=>`<tr style="background:#fff7ed;opacity:.9">
    <td><div style="display:flex;align-items:center;gap:10px"><div class="lt-av" style="background:#fed7aa;color:#c2410c">${s.initials||'?'}</div>${s.name} <span class="badge" style="background:#fed7aa;color:#c2410c;font-size:10px;margin-left:4px">Inativo</span></div></td>
    <td><span class="mat-badge" style="background:#f97316">${s.matricula}</span></td>
    <td>${s.level||'—'}</td>
    <td>${s.teacherName||'—'}</td>
    <td>${s.lessonCount||0}</td>
    <td>${s.inactivatedAt ? fmtDate(s.inactivatedAt) : '—'}</td>
    <td><button class="btn-sm" style="background:#d1fae5;color:#065f46;border-color:#6ee7b7" onclick="reactivateInactiveStudent('${s.matricula}','${escJs(s.name)}')">♻️ Reativar</button></td>
  </tr>`).join('');

  // Deleted students rows
  let deletedRows = '';
  if (_adminShowDeleted && deleted.length) {
    const delFiltered = _adminStudentFilter
      ? deleted.filter(s=>s.teacherLogin===_adminStudentFilter)
      : deleted;
    deletedRows = delFiltered.map(s=>`<tr style="background:#fef2f2;opacity:.85">
      <td><div style="display:flex;align-items:center;gap:10px"><div class="lt-av" style="background:#fee2e2;color:#dc2626">${s.initials||'?'}</div><span style="text-decoration:line-through;color:var(--g400)">${s.name}</span> <span class="badge" style="background:#fee2e2;color:#dc2626;font-size:10px">Excluído</span></div></td>
      <td><span class="mat-badge" style="background:#dc2626">${s.matricula}</span></td>
      <td>${s.level||'—'}</td>
      <td>${s.teacherName||'—'}</td>
      <td>${s.lessonCount||0}</td>
      <td>${fmtDate(s.deletedAt)}</td>
      <td><button class="btn-sm" style="background:#d1fae5;color:#065f46;border-color:#6ee7b7" onclick="reactivateStudent('${s.matricula}','${escJs(s.name)}')">♻️ Reativar</button></td>
    </tr>`).join('');
  }

  if (!filtered.length && !inactiveRows && !deletedRows) {
    el.innerHTML = filterBar + '<p class="empty">Nenhum aluno encontrado.</p>';
    return;
  }

  el.innerHTML = filterBar + `<table class="list-table"><thead><tr><th>Aluno</th><th>Matrícula</th><th>Nível</th><th>Professor</th><th>Aulas</th><th>Data</th><th>Ações</th></tr></thead><tbody>
    ${activeRows}${inactiveRows}${deletedRows}
  </tbody></table>`;
}

async function reactivateStudent(matricula, name) {
  if (!confirm('Reativar o aluno ' + name + '? Ele voltará a ter acesso ao sistema com a matrícula e senha originais.')) return;
  try {
    await api('POST', '/api/admin/students/reactivate', { matricula });
    showToast('✅ Aluno ' + name + ' reativado!');
    loadAdminStudents();
  } catch(e) { showToast('❌ ' + e.message); }
}

async function reactivateInactiveStudent(matricula, name) {
  if (!confirm('Reativar o aluno ' + name + '? Ele voltará a ter acesso ao sistema normalmente.')) return;
  try {
    await api('PUT', `/api/students/${matricula}/reactivate-teacher`);
    showToast('✅ Aluno ' + name + ' reativado!');
    loadAdminStudents();
  } catch(e) { showToast('❌ ' + e.message); }
}

async function adminAddTeacher() {
  const name     = document.getElementById('at-name').value.trim();
  const email    = document.getElementById('at-email').value.trim();
  const cpf      = document.getElementById('at-cpf')?.value.trim() || '';
  const whatsapp = document.getElementById('at-whatsapp')?.value.trim() || '';
  if (!name) return showToast('⚠️ Nome é obrigatório');
  try {
    const r = await api('POST','/api/admin/teachers',{name,email,cpf,whatsapp});
    document.getElementById('tcred-name').textContent  = r.name;
    document.getElementById('tcred-login').textContent = r.login;
    document.getElementById('tcred-pw').textContent    = r.defaultPassword;
    closeModal('modal-add-teacher');
    ['at-name','at-socialname','at-email','at-whatsapp','at-cpf'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value = '';
    });
    openModal('modal-teacher-cred');
    loadAdminOverview(); loadAdminTeachers();
    showToast('✅ Professor cadastrado!');
  } catch(e) { showToast('❌ '+e.message); }
}

async function adminResetPw() {
  const login = document.getElementById('adm-reset-login').value.trim();
  const pw    = document.getElementById('adm-reset-pw').value.trim();
  if (!login||!pw) return showToast('⚠️ Preencha todos os campos');
  try {
    await api('PUT','/api/admin/reset-password',{login,newPassword:pw});
    showToast('✅ Senha alterada!');
    document.getElementById('adm-reset-login').value='';
    document.getElementById('adm-reset-pw').value='';
  } catch(e) { showToast('❌ '+e.message); }
}

// ── Block / unblock teacher ───────────────────────────────────
async function toggleBlockTeacher(login, isCurrentlyBlocked) {
  const action = isCurrentlyBlocked ? 'desbloquear' : 'bloquear';
  if (!confirm(`Tem certeza que deseja ${action} este professor?`)) return;
  try {
    const r = await api('PUT', `/api/admin/teachers/${login}/toggle-block`);
    showToast(r.blocked ? '🔒 Professor bloqueado.' : '✅ Professor desbloqueado.');
    loadAdminTeachers();
  } catch(e) { showToast('❌ ' + e.message); }
}

// ── Delete confirm ────────────────────────────────────────────
let pendingDelete = null;
function confirmDelete(type, id, name) {
  const msg = type==='teacher'
    ? `Tem certeza que deseja excluir o professor <strong>${name}</strong>? Todos os alunos, aulas e arquivos vinculados serão removidos.`
    : `Tem certeza que deseja excluir o aluno <strong>${name}</strong>? Todas as aulas, notas e arquivos serão removidos.`;
  document.getElementById('confirm-msg').innerHTML = msg;
  pendingDelete = { type, id };
  document.getElementById('confirm-btn').onclick = executeDelete;
  openModal('modal-confirm');
}
async function executeDelete() {
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;
  try {
    if (type==='teacher') await api('DELETE',`/api/admin/teachers/${encodeURIComponent(id)}`);
    else await api('DELETE',`/api/admin/students/${id}`);
    closeModal('modal-confirm');
    showToast('✅ Excluído com sucesso!');
    loadAdminOverview(); loadAdminTeachers(); loadAdminStudents();
  } catch(e) { showToast('❌ '+e.message); }
}

// ── Reset PW modal ────────────────────────────────────────────
function openResetPw(login, name) {
  document.getElementById('rp-login').value = login;
  document.getElementById('rp-user-label').textContent = `Usuário: ${name} (${login})`;
  document.getElementById('rp-pw').value = '';
  openModal('modal-reset-pw');
}
async function submitResetPw() {
  const login = document.getElementById('rp-login').value;
  const pw    = document.getElementById('rp-pw').value.trim();
  if (!pw || pw.length<4) return showToast('⚠️ Senha deve ter ao menos 4 caracteres');
  try {
    await api('PUT','/api/admin/reset-password',{login,newPassword:pw});
    closeModal('modal-reset-pw');
    showToast('✅ Senha alterada com sucesso!');
  } catch(e) { showToast('❌ '+e.message); }
}

// ── Admin nav ─────────────────────────────────────────────────
function showAdmin(sec, el) {
  document.querySelectorAll('#page-admin .cs').forEach(s=>s.classList.remove('active'));
  document.getElementById(sec).classList.add('active');
  document.querySelectorAll('#admin-sidebar .nav-item').forEach(n=>n.classList.remove('active'));
  if(el) el.classList.add('active');
}

// ══════════════════════════════════════════════════════════════
//  TEACHER
// ══════════════════════════════════════════════════════════════
async function loadTeacher() {
  const initials = ME.name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
  const tAv = document.getElementById('t-avatar');
  tAv.style.backgroundImage = '';
  tAv.style.padding = '';
  tAv.innerHTML = '';
  tAv.textContent = initials;
  document.getElementById('t-name').textContent = ME.name;
  try {
    const profile = await api('GET', '/api/profile');
    if (profile.photo) updateSidebarAvatar(profile.photo);
  } catch(e) {}
  await refreshTeacherAll();
  checkPendingContracts('teacher');
  refreshInboxBadges();
  checkTermsAccepted();
}

async function refreshTeacherAll() {
  const [students, lessons, files, plans, inactive] = await Promise.all([
    api('GET','/api/students'),
    api('GET','/api/lessons'),
    api('GET','/api/files'),
    api('GET','/api/study-plans').catch(() => []),
    api('GET','/api/students/inactive').catch(() => []),
  ]);
  renderTeacherOverview(students, lessons);
  renderTeacherStudents(students, lessons, plans);
  renderInactiveStudents(inactive);
  renderTeacherCalendar(lessons);
  renderTeacherFiles(files, students);
  populateStudentSelects(students);
  loadTeacherContracts();
  loadTeacherBebraveContracts();
}

function renderTeacherOverview(students, lessons) {
  const done = lessons.filter(l=>l.status==='done').length;
  const upcoming = lessons.filter(l=>l.status==='scheduled').length;
  renderStats('t-stats', [
    { icon:'🎓', val:students.length, lbl:'Meus Alunos', cls:'bc-blue' },
    { icon:'📅', val:upcoming, lbl:'Aulas agendadas', cls:'bc-green' },
    { icon:'✅', val:done, lbl:'Aulas realizadas', cls:'bc-amber' },
    { icon:'📁', val:students.length, lbl:'Alunos ativos', cls:'bc-purple' },
  ]);
  // student cards
  document.getElementById('t-student-cards').innerHTML = students.length
    ? students.map(s=>`<div class="person-card" onclick="showTeacher('t-students',document.querySelector('#teacher-sidebar .nav-item:nth-child(2)'))">
        <div class="pc-av" style="background:${s.bg};color:${s.color}">${s.initials}</div>
        <div><div class="pc-name">${s.name}</div><div class="pc-sub">Nível ${s.level}</div><div class="pc-cnt">${s.lessonsDone||0} aulas realizadas</div></div>
      </div>`).join('')
    : '<p class="empty">Nenhum aluno cadastrado ainda. Clique em "Cadastrar Aluno".</p>';
  // upcoming lessons
  const upcoming3 = lessons.filter(l=>l.status==='scheduled').sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
  document.getElementById('t-upcoming').innerHTML = upcoming3.length
    ? upcoming3.map(l=>lessonItemHTML(l,true)).join('')
    : '<p class="empty">Nenhuma aula agendada.</p>';
}

function renderTeacherStudents(students, lessons, plans = []) {
  const el = document.getElementById('t-student-detail-list');
  if (!students.length) { el.innerHTML = '<div class="card"><p class="empty">Nenhum aluno cadastrado ainda.</p></div>'; return; }
  el.innerHTML = students.map(s=>{
    const done = lessons.filter(l=>l.studentMatricula===s.matricula&&l.status==='done').length;
    const sched = lessons.filter(l=>l.studentMatricula===s.matricula&&l.status==='scheduled').length;
    const absences = lessons.filter(l=>l.studentMatricula===s.matricula&&l.status==='absent').length;
    const plan = plans.find(p=>p.studentMatricula===s.matricula);
    const planBar = plan && plan.milestones && plan.milestones.length > 0 ? (()=>{
      const total = plan.milestones.length;
      const doneM = plan.milestones.filter(m=>m.done).length;
      const pct = Math.round(doneM / total * 100);
      return `<div style="margin-top:10px;padding:8px 12px;background:var(--g50);border-radius:var(--r-sm)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:11px;color:var(--g500);font-weight:500">📋 ${plan.title||'Plano de estudos'}</span>
          <span style="font-size:11px;color:var(--navy);font-weight:600">${doneM}/${total} marcos · ${pct}%</span>
        </div>
        <div style="height:6px;background:var(--g200);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--blue);border-radius:3px;transition:width .3s"></div>
        </div>
      </div>`;
    })() : '';
    const infoChips = [
      s.email    ? `<span>📧 ${s.email}</span>` : '',
      s.whatsapp ? `<span>📱 ${s.whatsapp}</span>` : '',
      s.cpf      ? `<span>CPF ${s.cpf}</span>` : '',
      s.payday   ? `<span>💰 Dia ${s.payday}${s.price?' · R$ '+s.price:''}</span>` : '',
    ].filter(Boolean).join('');
    return `<div class="sdc" data-search="${s.name.toLowerCase()} ${s.matricula} ${(s.email||'').toLowerCase()}">
      <div class="sdc-hd" style="padding:10px 14px">
        <div class="sdc-hd-av" style="width:34px;height:34px;font-size:12px;border-radius:50%;margin-right:10px">${s.initials}</div>
        <div style="flex:1;min-width:0">
          <div class="sdc-n" style="font-size:14px;line-height:1.3">${s.name}</div>
          <div class="sdc-sub" style="font-size:11px;margin-top:1px">Mat. ${s.matricula} &nbsp;·&nbsp; ${s.level} &nbsp;·&nbsp; ${langBadge(s.lang||'en')}</div>
        </div>
        <div class="sdc-hd-actions">
          <button class="btn-icon" style="background:rgba(255,255,255,.1);color:white;border-color:rgba(255,255,255,.2)" title="Redefinir senha" onclick="openResetPw('${s.matricula}','${escJs(s.name)}')">🔑</button>
          <button class="btn-icon" style="background:rgba(255,255,255,.1);color:white;border-color:rgba(255,255,255,.2)" title="Editar aluno" onclick="openEditStudent('${s.matricula}')">✏️</button>
          <button class="btn-icon" style="background:rgba(255,255,255,.1);color:white;border-color:rgba(255,255,255,.2)" title="Inativar aluno" onclick="confirmInactivateStudent('${s.matricula}','${escJs(s.name)}')">🚫</button>
        </div>
      </div>
      <div class="sdc-body" style="padding:10px 14px 12px">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:12px;padding-bottom:8px;border-bottom:1px solid var(--g100);margin-bottom:8px">
          <span style="color:var(--g600)">✅ <strong>${done}</strong> realizadas</span>
          <span style="color:var(--g600)">📅 <strong>${sched}</strong> agendadas</span>
          <span style="color:var(--g600)">❌ <strong>${absences}</strong> faltas</span>
          ${infoChips ? `<span style="color:var(--g300)">·</span><span style="color:var(--g400);display:flex;gap:10px;flex-wrap:wrap">${infoChips}</span>` : ''}
        </div>
        ${planBar}
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px">
          <button class="btn-primary" style="font-size:12px;padding:6px 12px" onclick="openLessonFor('${s.matricula}')">+ Agendar</button>
          <button class="btn-secondary" style="font-size:12px;padding:6px 11px" onclick="openNoteFor('${s.matricula}')">📝 Anotação</button>
          <select onchange="updateStudentLevel('${s.matricula}',this.value)" style="font-size:12px;padding:6px 10px;border:1.5px solid var(--g200);border-radius:var(--r-sm);cursor:pointer;font-family:'DM Sans',sans-serif">
            ${['A1','A2','B1','B2','C1','C2'].map(l=>`<option value="${l}"${l===s.level?' selected':''}>${l}</option>`).join('')}
          </select>
          <button class="btn-sm" style="font-size:12px;padding:6px 11px" onclick="openPaymentPlanModal('${s.matricula}','${escJs(s.name)}',${s.price||0},${s.payday||0})">💰 Mensalidade</button>
          <button class="btn-sm" style="font-size:12px;padding:6px 11px" onclick="openReportModal('${s.matricula}','${escJs(s.name)}')">📄 Relatório</button>
          <button class="btn-sm" style="font-size:12px;padding:6px 11px" onclick="openStudyPlan('${s.matricula}','${escJs(s.name)}')">📋 Plano</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterStudentCards(q) {
  const term = (q || '').toLowerCase().trim();
  const cards = document.querySelectorAll('#t-student-detail-list .sdc');
  let visible = 0;
  cards.forEach(card => {
    const match = !term || (card.dataset.search || '').includes(term);
    card.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  const empty = document.getElementById('t-search-empty');
  if (empty) empty.style.display = (term && visible === 0) ? '' : 'none';
}

let _calLessonsT = [];
function renderTeacherCalendar(lessons) {
  _calLessonsT = lessons;
  renderCal(calMonthT,'cal-t','cal-lbl-t', day=>{
    showCalDayT(day);
  }, _calLessonsT, null);
}
function showCalDayT(day) {
  document.getElementById('cal-day-lbl-t').textContent = formatDayLabel(day);
  const dayLessons = _calLessonsT.filter(l=>l.date===day);
  const el = document.getElementById('cal-events-t');
  el.innerHTML = dayLessons.length
    ? dayLessons.map(l=>dayEventHTML(l,true)).join('')
    : '<p class="empty">Nenhuma aula neste dia.</p>';
}

function renderTeacherFiles(files, students) {
  const sent     = files.filter(f=>f.from==='teacher');
  const received = files.filter(f=>f.from==='student');
  renderFileList('t-files-sent',     sent,     true);
  renderFileList('t-files-from-students', received, true);
  // populate student select for upload
  const sel = document.getElementById('t-file-student');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Selecione...</option>' + students.map(s=>`<option value="${s.matricula}"${s.matricula===cur?' selected':''}>${s.name}</option>`).join('');
}

function renderFileList(id, files, canDelete) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = files.length
    ? files.map(f=>`<div class="file-item">
        <div class="f-icon">${fileIcon(f.type)}</div>
        <div class="f-info"><div class="f-name">${f.name}</div><div class="f-meta">${f.from==='teacher'?'Para: '+f.studentName:'De: '+f.studentName} &nbsp;•&nbsp; ${f.date} &nbsp;•&nbsp; ${f.size}</div></div>
        <div class="f-actions">
          ${f.filename?`<a href="/uploads/${f.filename}" download="${f.name}" class="btn-sm">⬇ Baixar</a>`:'<span class="btn-sm" style="opacity:.5">Demo</span>'}
          ${canDelete?`<button class="btn-icon danger" onclick="deleteFile(${f.$loki})">🗑</button>`:''}
        </div>
      </div>`).join('')
    : '<p class="empty">Nenhum arquivo ainda.</p>';
}

function populateStudentSelects(students) {
  ['al-student','modal-lesson-student'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">Selecione o aluno...</option>'+students.map(s=>`<option value="${s.matricula}"${s.matricula===cur?' selected':''}>${s.name}</option>`).join('');
  });
  const al = document.getElementById('al-student');
  if(al && pendingLessonStudent) { al.value = pendingLessonStudent; pendingLessonStudent=null; }
}

// Teacher actions
async function teacherAddStudent() {
  const name       = document.getElementById('as-name').value.trim();
  const socialname = document.getElementById('as-socialname').value.trim();
  const level      = document.getElementById('as-level').value;
  const lang       = document.getElementById('as-lang').value;
  const cpf        = document.getElementById('as-cpf').value.trim();
  const email      = document.getElementById('as-email').value.trim();
  const whatsapp   = document.getElementById('as-whatsapp').value.trim();
  const payday     = document.getElementById('as-payday').value.trim();
  const price      = document.getElementById('as-price').value.trim();
  if (!name)    return showToast('⚠️ Nome é obrigatório');
  if (!cpf)     return showToast('⚠️ CPF é obrigatório');
  if (!email)   return showToast('⚠️ E-mail é obrigatório');
  if (!payday)  return showToast('⚠️ Dia de vencimento é obrigatório');
  if (!price)   return showToast('⚠️ Valor da mensalidade é obrigatório');
  try {
    const r = await api('POST','/api/students',{name,socialname,level,lang,cpf,email,whatsapp,payday,price});
    document.getElementById('cred-name').textContent  = r.name;
    document.getElementById('cred-login').textContent = r.matricula;
    document.getElementById('cred-pw').textContent    = r.defaultPassword;
    closeModal('modal-add-student');
    ['as-name','as-cpf','as-email','as-whatsapp','as-payday','as-price'].forEach(id=>{ const el=document.getElementById(id);if(el)el.value=''; });
    openModal('modal-credential');
    refreshTeacherAll();
    showToast('✅ Aluno cadastrado!');
  } catch(e) { showToast('❌ '+e.message); }
}

async function teacherAddLesson() {
  const studentMatricula = document.getElementById('al-student').value;
  const date     = document.getElementById('al-date').value;
  const time     = document.getElementById('al-time').value;
  const subject  = document.getElementById('al-subject').value.trim();
  const topic    = document.getElementById('al-topic').value.trim();
  const duration = document.getElementById('al-duration').value;
  const meetLink = document.getElementById('al-meet').value.trim();
  if (!studentMatricula||!date||!time||!subject) return showToast('⚠️ Preencha os campos obrigatórios (*)');
  try {
    await api('POST','/api/lessons',{studentMatricula,date,time,subject,topic:topic||subject,duration,meetLink});
    closeModal('modal-add-lesson');
    ['al-student','al-date','al-time','al-subject','al-topic','al-meet'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('al-duration').value='60';
    refreshTeacherAll();
    showToast('✅ Aula agendada!');
  } catch(e) { showToast('❌ '+e.message); }
}

async function markLessonDone(id) {
  try { await api('PUT',`/api/lessons/${id}`,{status:'done'}); refreshTeacherAll(); showToast('✅ Aula marcada como realizada!'); }
  catch(e) { showToast('❌ '+e.message); }
}

async function deleteLesson(id) {
  try { await api('DELETE',`/api/lessons/${id}`); refreshTeacherAll(); showToast('🗑 Aula removida'); }
  catch(e) { showToast('❌ '+e.message); }
}

async function deleteFile(id) {
  try { await api('DELETE',`/api/files/${id}`); refreshTeacherAll(); showToast('🗑 Arquivo removido'); }
  catch(e) { showToast('❌ '+e.message); }
}

async function teacherAddNote() {
  const mat  = document.getElementById('an-mat').value;
  const text = document.getElementById('an-text').value.trim();
  if(!text) return showToast('⚠️ Digite a anotação');
  try {
    await api('POST','/api/notes',{studentMatricula:mat,text});
    closeModal('modal-add-note');
    document.getElementById('an-text').value='';
    refreshTeacherAll();
    showToast('✅ Anotação salva!');
  } catch(e) { showToast('❌ '+e.message); }
}

async function updateStudentLevel(mat, level) {
  try { await api('PUT',`/api/students/${mat}`,{level}); showToast('✅ Nível atualizado!'); }
  catch(e) { showToast('❌ '+e.message); }
}

async function uploadTeacherFile(ev) {
  const file = ev.target.files[0]; if(!file) return;
  const mat = document.getElementById('t-file-student').value;
  if(!mat) { showToast('⚠️ Selecione um aluno primeiro'); ev.target.value=''; return; }
  const fd = new FormData(); fd.append('file',file); fd.append('studentMatricula',mat);
  try {
    await fetch('/api/files',{method:'POST',body:fd});
    ev.target.value=''; refreshTeacherAll(); showToast('✅ Arquivo enviado!');
  } catch { showToast('❌ Erro ao enviar arquivo'); }
}

function openLessonFor(mat) { pendingLessonStudent = mat; openModal('modal-add-lesson'); setTimeout(()=>{ const el=document.getElementById('al-student'); if(el) el.value=mat; },50); }
function openNoteFor(mat)  { document.getElementById('an-mat').value=mat; document.getElementById('an-text').value=''; openModal('modal-add-note'); }
function confirmDeleteStudent(mat,name) { confirmDelete('student',mat,name); }
function confirmInactivateStudent(mat, name) {
  document.getElementById('confirm-msg').innerHTML = `Deseja inativar o aluno <strong>${name}</strong>?<br><br>O aluno perderá acesso ao sistema. Para reativá-lo, entre em contato com o administrador.`;
  document.getElementById('confirm-btn').onclick = async () => {
    try {
      await api('PUT', `/api/students/${mat}/inactivate`);
      closeModal('modal-confirm');
      showToast('✅ Aluno inativado.');
      refreshTeacherAll();
    } catch(e) { showToast('❌ ' + e.message); }
  };
  openModal('modal-confirm');
}

function showStudentsTab(tab) {
  const activePanel  = document.getElementById('t-students-active-panel');
  const inactiveList = document.getElementById('t-student-inactive-list');
  const btnActive    = document.getElementById('tab-btn-active');
  const btnInactive  = document.getElementById('tab-btn-inactive');
  const isActive = tab === 'active';
  activePanel.style.display   = isActive ? '' : 'none';
  inactiveList.style.display  = isActive ? 'none' : '';
  btnActive.style.color               = isActive ? 'var(--blue)' : 'var(--g400)';
  btnActive.style.borderBottomColor   = isActive ? 'var(--blue)' : 'transparent';
  btnActive.style.fontWeight          = isActive ? '600' : '500';
  btnInactive.style.color             = isActive ? 'var(--g400)' : 'var(--blue)';
  btnInactive.style.borderBottomColor = isActive ? 'transparent' : 'var(--blue)';
  btnInactive.style.fontWeight        = isActive ? '500' : '600';
}

function renderInactiveStudents(students) {
  const el = document.getElementById('t-student-inactive-list');
  if (!el) return;
  if (!students || !students.length) {
    el.innerHTML = `<div class="card" style="text-align:center;padding:32px 24px">
      <p style="font-size:32px;margin-bottom:8px">✅</p>
      <p style="font-size:15px;font-weight:600;color:var(--navy);margin-bottom:4px">Nenhum aluno inativo</p>
      <p style="font-size:13px;color:var(--g400)">Todos os seus alunos estão ativos.</p>
    </div>`;
    return;
  }
  el.innerHTML = `<div class="card" style="margin-bottom:16px;background:#fff7ed;border-left:4px solid #f97316">
    <div style="display:flex;align-items:center;gap:10px">
      <span style="font-size:20px">ℹ️</span>
      <p style="font-size:13px;color:#92400e;margin:0">Para reativar um aluno, entre em contato com o <strong>administrador</strong> do sistema.</p>
    </div>
  </div>` + students.map(s => {
    const inactivatedStr = s.inactivatedAt ? new Date(s.inactivatedAt).toLocaleDateString('pt-BR') : '—';
    return `<div class="sdc" style="opacity:.85;border-left:4px solid #f97316">
      <div class="sdc-hd" style="background:linear-gradient(135deg,#9a3412,#c2410c)">
        <div style="display:flex;align-items:center;gap:12px;flex:1">
          <div class="sdc-av" style="background:rgba(255,255,255,.15);color:white">${s.initials||s.name.charAt(0)}</div>
          <div>
            <div class="sdc-name">${s.name}</div>
            <div class="sdc-sub">Matrícula ${s.matricula} · Nível ${s.level}</div>
          </div>
        </div>
        <span style="background:rgba(255,255,255,.15);color:white;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600">🚫 Inativo</span>
      </div>
      <div class="sdc-body">
        <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:12px">
          <div><span style="font-size:11px;color:var(--g400);display:block">Aulas realizadas</span><span style="font-size:20px;font-weight:700;color:var(--navy)">${s.lessonsDone||0}</span></div>
          <div><span style="font-size:11px;color:var(--g400);display:block">Nível</span><span style="font-size:20px;font-weight:700;color:var(--navy)">${s.level}</span></div>
          <div><span style="font-size:11px;color:var(--g400);display:block">Inativado em</span><span style="font-size:14px;font-weight:600;color:#c2410c">${inactivatedStr}</span></div>
        </div>
        ${s.email ? `<p style="font-size:13px;color:var(--g500);margin-bottom:4px">📧 ${s.email}</p>` : ''}
        <p style="font-size:12px;color:var(--g400);margin-top:8px">Para reativar este aluno, entre em contato com o administrador.</p>
      </div>
    </div>`;
  }).join('');
}

async function openEditStudent(matricula) {
  const students = await api('GET', '/api/students');
  const s = students.find(x => x.matricula === matricula);
  if (!s) return showToast('❌ Aluno não encontrado');
  document.getElementById('es-matricula').value  = s.matricula;
  document.getElementById('es-name').value       = s.name || '';
  document.getElementById('es-socialname').value = s.socialname || '';
  document.getElementById('es-cpf').value        = s.cpf || '';
  document.getElementById('es-email').value      = s.email || '';
  document.getElementById('es-whatsapp').value   = s.whatsapp || '';
  document.getElementById('es-payday').value     = s.payday || '';
  document.getElementById('es-price').value      = s.price || '';
  const langEl  = document.getElementById('es-lang');
  const levelEl = document.getElementById('es-level');
  if (langEl)  langEl.value  = s.lang  || 'en';
  if (levelEl) levelEl.value = s.level || 'A1';
  openModal('modal-edit-student');
}

async function saveEditStudent() {
  const matricula = document.getElementById('es-matricula').value;
  const name      = document.getElementById('es-name').value.trim();
  const socialname= document.getElementById('es-socialname').value.trim();
  const cpf       = document.getElementById('es-cpf').value.trim();
  const email     = document.getElementById('es-email').value.trim();
  const whatsapp  = document.getElementById('es-whatsapp').value.trim();
  const payday    = document.getElementById('es-payday').value.trim();
  const price     = document.getElementById('es-price').value.trim();
  const lang      = document.getElementById('es-lang').value;
  const level     = document.getElementById('es-level').value;
  if (!name)   return showToast('⚠️ Nome é obrigatório');
  if (!cpf)    return showToast('⚠️ CPF é obrigatório');
  if (!email)  return showToast('⚠️ E-mail é obrigatório');
  if (!payday) return showToast('⚠️ Dia de vencimento é obrigatório');
  if (!price)  return showToast('⚠️ Valor da mensalidade é obrigatório');
  try {
    await api('PUT', `/api/students/${matricula}`, {name,socialname,cpf,email,whatsapp,payday,price,lang,level});
    closeModal('modal-edit-student');
    showToast('✅ Aluno atualizado!');
    refreshTeacherAll();
  } catch(e) { showToast('❌ ' + e.message); }
}


async function changeMonthT(dir) { calMonthT=addMonth(calMonthT,dir); const lessons=await api('GET','/api/lessons'); _calLessonsT=lessons; renderCal(calMonthT,'cal-t','cal-lbl-t',day=>showCalDayT(day),_calLessonsT,null); }

function showTeacher(sec, el) {
  document.querySelectorAll('#page-teacher .cs').forEach(s=>s.classList.remove('active'));
  document.getElementById(sec).classList.add('active');
  document.querySelectorAll('#teacher-sidebar .nav-item').forEach(n=>n.classList.remove('active'));
  if(el) el.classList.add('active');
}

// ══════════════════════════════════════════════════════════════
//  STUDENT
// ══════════════════════════════════════════════════════════════
async function loadStudent() {
  const initials = ME.name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
  const sAv = document.getElementById('s-avatar');
  sAv.style.backgroundImage = '';
  sAv.style.padding = '';
  sAv.innerHTML = '';
  sAv.textContent = initials;
  document.getElementById('s-name').textContent  = ME.name;
  document.getElementById('s-greet').textContent = ME.name.split(' ')[0];
  try { const p = await api('GET','/api/profile'); if(p.photo) updateSidebarAvatar(p.photo); } catch(e) {}
  // Fetch teacher name from lessons if not in session
  let teacherName = ME.teacherName || '';
  if (!teacherName) {
    try {
      const lessons = await api('GET', '/api/lessons');
      if (lessons.length > 0) teacherName = lessons[0].teacherName || '';
    } catch(e) {}
  }
  document.getElementById('s-teacher-name').textContent = teacherName || '—';
  await refreshStudentAll();
  checkPendingContracts('student');
  checkPaymentAlert();
  refreshInboxBadges();
}

async function refreshStudentAll() {
  const [lessons, files, notes] = await Promise.all([
    api('GET','/api/lessons'),
    api('GET','/api/files'),
    api('GET','/api/notes')
  ]);
  renderStudentDashboard(lessons, notes);
  renderStudentCalendar(lessons);
  renderStudentFiles(files);
  renderStudentProgress(lessons, notes);
  loadStudentContracts();
}

function renderStudentDashboard(lessons, notes) {
  const done   = lessons.filter(l=>l.status==='done');
  const sched  = lessons.filter(l=>l.status==='scheduled');
  const subjects = [...new Set(done.map(l=>l.subject||l.topic).filter(Boolean))];

  const absent = lessons.filter(l=>l.status==='absent');
  renderStats('s-stats', [
    { icon:'📚', val:done.length, lbl:'Aulas realizadas', cls:'bc-blue' },
    { icon:'📅', val:sched.length, lbl:'Aulas agendadas', cls:'bc-green' },
    { icon:'❌', val:absent.length, lbl:'Faltas', cls:'bc-red' },
    { icon:'⭐', val:ME.level||'—', lbl:'Nível atual', cls:'bc-purple' },
  ]);

  // upcoming — show all scheduled lessons sorted by date
  const up3 = sched.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
  document.getElementById('s-upcoming').innerHTML = up3.length
    ? up3.map(l=>lessonItemHTML(l,false)).join('')
    : '<p class="empty">Nenhuma aula agendada ainda.</p>';

  // topics
  const recentSubjects = [...new Set(done.slice().reverse().map(l=>l.subject||l.topic).filter(Boolean))].slice(0,10);
  document.getElementById('s-topics').innerHTML = recentSubjects.length
    ? '<div style="display:flex;flex-wrap:wrap;gap:4px;padding-top:4px">'+recentSubjects.map(s=>`<span class="topic-tag">${s}</span>`).join('')+'</div>'
    : '<p class="empty">Nenhum assunto registrado ainda.</p>';

  // history table
  document.getElementById('s-history').innerHTML = done.length
    ? `<thead><tr><th>Data</th><th>Assunto</th><th>Feedback do Professor</th><th>Tarefa</th><th>Duração</th></tr></thead><tbody>
        ${done.slice().reverse().map(l=>`<tr>
          <td>${fmtDatePt(l.date)}</td>
          <td>${l.subject||'—'}</td>
          <td style="max-width:200px;font-size:12px">${l.feedback||'—'}</td>
          <td style="max-width:150px;font-size:12px">${l.homework||'—'}</td>
          <td>${l.duration}min</td>
        </tr>`).join('')}
      </tbody>`
    : '<tbody><tr><td colspan="5" style="text-align:center;padding:24px;color:var(--g400)">Nenhuma aula realizada ainda.</td></tr></tbody>';
}

let _calLessonsS = [];
function renderStudentCalendar(lessons) {
  _calLessonsS = lessons;
  renderCal(calMonthS,'cal-s','cal-lbl-s', day=>{
    showCalDayS(day);
  }, _calLessonsS, null);
}
function showCalDayS(day) {
  document.getElementById('cal-day-lbl-s').textContent = formatDayLabel(day);
  const dayLessons = _calLessonsS.filter(l=>l.date===day);
  const el = document.getElementById('cal-events-s');
  el.innerHTML = dayLessons.length
    ? dayLessons.map(l=>dayEventHTML(l,false)).join('')
    : '<p class="empty">Nenhuma aula neste dia.</p>';
}

function renderStudentFiles(files) {
  const received = files.filter(f=>f.from==='teacher');
  const sent     = files.filter(f=>f.from==='student');
  renderFileList('s-files-received', received, false);
  renderFileList('s-files-sent',     sent,     true);
}

function renderStudentProgress(lessons, notes) {
  const done = lessons.filter(l=>l.status==='done');
  const level = ME.level || 'A1';
  const levels = ['A1','A2','B1','B2','C1','C2'];
  const curIdx = levels.indexOf(level);

  document.getElementById('s-level-track').innerHTML = `<div class="lvl-row">
    ${levels.map((l,i)=>{
      const cls = i<curIdx?'done':i===curIdx?'curr':'future';
      return (i>0?`<div class="lvl-conn ${i<=curIdx?'done':''}"></div>`:'') + `<div class="lvl ${cls}">${l}</div>`;
    }).join('')}
  </div>
  <p class="lvl-desc">Você está no nível <strong>${level}</strong>. ${curIdx<levels.length-1?'Próximo objetivo: <strong>'+levels[curIdx+1]+'</strong>':' — Nível máximo atingido! 🏆'}</p>`;

  // Monthly chart
  const monthCounts = {};
  for(let i=5;i>=0;i--){
    const d=new Date(); d.setMonth(d.getMonth()-i);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const lbl=MONTHS_SHORT[d.getMonth()];
    monthCounts[lbl]=(done.filter(l=>l.date.startsWith(key)).length);
  }
  const maxV = Math.max(...Object.values(monthCounts),1);
  document.getElementById('s-monthly-chart').innerHTML = Object.entries(monthCounts).map(([m,v])=>
    `<div class="bcc"><div class="bcv">${v}</div><div class="bcb" style="height:${Math.round((v/maxV)*100)}px" title="${v} aulas em ${m}"></div><div class="bcl">${m}</div></div>`
  ).join('');

  // Subjects list
  const subjects = done.slice().reverse().map(l=>({s:l.subject||l.topic,d:l.date})).filter(x=>x.s);
  document.getElementById('s-subjects-list').innerHTML = subjects.length
    ? subjects.map(x=>`<div class="subject-item"><div class="si-name">📖 ${x.s}</div><div class="si-date">${fmtDatePt(x.d)}</div></div>`).join('')
    : '<p class="empty">Nenhum assunto registrado ainda.</p>';

  // Notes
  document.getElementById('s-notes').innerHTML = notes.length
    ? notes.slice().reverse().map(n=>`<div class="note-item"><div class="ni-text">${n.text}</div><div class="ni-date">📅 ${fmtDatePt(n.date)}</div></div>`).join('')
    : '<p class="empty">Nenhuma anotação do professor ainda.</p>';
}

async function uploadStudentFile(ev) {
  const file = ev.target.files[0]; if(!file) return;
  const fd = new FormData(); fd.append('file',file);
  try {
    await fetch('/api/files',{method:'POST',body:fd});
    ev.target.value=''; refreshStudentAll(); showToast('✅ Arquivo enviado ao professor!');
  } catch { showToast('❌ Erro ao enviar arquivo'); }
}

async function changeMonthS(dir) { calMonthS=addMonth(calMonthS,dir); const lessons=await api('GET','/api/lessons'); _calLessonsS=lessons; renderCal(calMonthS,'cal-s','cal-lbl-s',day=>showCalDayS(day),_calLessonsS,null); }

function showStudent(sec, el) {
  document.querySelectorAll('#page-student .cs').forEach(s=>s.classList.remove('active'));
  document.getElementById(sec).classList.add('active');
  document.querySelectorAll('#student-sidebar .nav-item').forEach(n=>n.classList.remove('active'));
  if(el) el.classList.add('active');
}

// ══════════════════════════════════════════════════════════════
//  CALENDAR RENDERER
// ══════════════════════════════════════════════════════════════
function renderCal(month, gridId, labelId, onDayClick, lessons, studentFilter) {
  document.getElementById(labelId).textContent = `${MONTHS_PT[month.getMonth()]} ${month.getFullYear()}`;
  const grid = document.getElementById(gridId);
  let html = ['D','S','T','Q','Q','S','S'].map(d=>`<div class="cdh">${d}</div>`).join('');
  const first = new Date(month.getFullYear(),month.getMonth(),1).getDay();
  const daysInMonth = new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const todayD = new Date(); const todayISO = todayStr();

  const lessonDays = new Set(
    lessons.filter(l=>{
      const d=new Date(l.date+'T12:00');
      return d.getMonth()===month.getMonth() && d.getFullYear()===month.getFullYear() && (!studentFilter||l.studentMatricula===studentFilter);
    }).map(l=>parseInt(l.date.split('-')[2]))
  );

  for(let i=0;i<first;i++) html+=`<div class="cd cd-empty"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const iso=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday=iso===todayISO; const hasL=lessonDays.has(d);
    html+=`<div class="cd${isToday?' cd-today':''}${hasL?' cd-has':''}" onclick="selectCalDay('${gridId}','${iso}')"><span>${d}</span></div>`;
  }
  grid.innerHTML=html;
  // trigger callback if provided
  if(onDayClick) onDayClick(null);
}

function selectCalDay(gridId, iso) {
  document.querySelectorAll(`#${gridId} .cd`).forEach(c=>c.classList.remove('cd-sel'));
  const cells=document.querySelectorAll(`#${gridId} .cd:not(.cd-empty)`);
  const d=parseInt(iso.split('-')[2]);
  cells.forEach(c=>{ if(parseInt(c.querySelector('span').textContent)===d) c.classList.add('cd-sel'); });
  // call the right handler
  if(gridId==='cal-t') showCalDayT(iso);
  else if(gridId==='cal-s') showCalDayS(iso);
}

// ══════════════════════════════════════════════════════════════
//  HTML HELPERS
// ══════════════════════════════════════════════════════════════
function lessonItemHTML(l, isTeacher) {
  const d=new Date(l.date+'T12:00');
  return `<div class="lesson-item">
    <div class="ld"><div class="ld-day">${d.getDate()}</div><div class="ld-mon">${MONTHS_SHORT[d.getMonth()]}</div></div>
    <div class="li-info">
      <div class="li-topic">📖 ${l.subject||l.topic}${l.topic&&l.topic!==l.subject?` <span style="font-weight:400;color:var(--g500);font-size:12px">— ${l.topic}</span>`:''}</div>
      <div class="li-meta">${DAYS_PT[d.getDay()]} • ${l.time} • ${l.duration}min${isTeacher?` • ${l.studentName}`:''}</div>
      ${meetBtnHTML(l)}
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0">
      <span class="badge b-sched">Agendada</span>
      ${isTeacher?`<button class="btn-sm" style="background:#d1fae5;color:#065f46;border-color:#6ee7b7" onclick="openFeedbackModal(${l.$loki},'${(l.subject||l.topic||'').replace(/'/g,'')}')" title="Concluir aula e dar feedback">✅ Concluir</button><button class="btn-icon danger" onclick="deleteLesson(${l.$loki})">🗑</button>`:''}
    </div>
  </div>`;
}

function dayEventHTML(l, isTeacher) {
  const statusClass = l.status==='done' ? 'dev-done' : l.status==='absent' ? 'dev-absent' : '';
  const badgeClass  = l.status==='done' ? 'b-done' : l.status==='absent' ? 'b-absent' : 'b-sched';
  const badgeLabel  = l.status==='done' ? 'Realizada' : l.status==='absent' ? '❌ Falta' : 'Agendada';
  return `<div class="dev ${statusClass}">
    <div class="dev-topic">📖 ${l.subject||l.topic}</div>
    <div class="dev-meta">⏰ ${l.time} • ${l.duration}min${isTeacher?` • 👤 ${l.studentName}`:''} • <span class="badge ${badgeClass}">${badgeLabel}</span></div>
    ${meetBtnHTML(l)}
    ${l.feedback&&l.status!=='scheduled'?`<div style="font-size:12px;color:var(--g600);margin-top:6px;background:var(--g50);padding:6px 10px;border-radius:6px">📝 ${l.feedback}</div>`:''}
    ${l.homework?`<div style="font-size:12px;color:#065f46;margin-top:4px;background:var(--green-pale);padding:5px 10px;border-radius:6px">📚 Tarefa: ${l.homework}</div>`:''}
    ${isTeacher&&l.status==='scheduled'?`<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="btn-sm" style="background:#d1fae5;color:#065f46;border-color:#6ee7b7" onclick="openFeedbackModal(${l.$loki},'${(l.subject||l.topic||'').replace(/'/g,'')}')">✅ Concluir aula</button>
      <button class="btn-sm" style="background:#fef3c7;color:#92400e;border-color:#fcd34d" onclick="markAbsent(${l.$loki})">❌ Aluno faltou</button>
      <button class="btn-icon danger" onclick="deleteLesson(${l.$loki})">🗑</button>
    </div>`:''}
  </div>`;
}

function renderStats(id, items) {
  const cls=['bc-blue','bc-green','bc-amber','bc-purple','bc-red'];
  document.getElementById(id).innerHTML = items.map((it,i)=>`
    <div class="stat-card ${it.cls||cls[i%cls.length]}">
      <div class="stat-icon">${it.icon}</div>
      <div><div class="stat-val">${it.val}</div><div class="stat-lbl">${it.lbl}</div></div>
    </div>`).join('');
}

function fileIcon(type) { return {pdf:'📄',doc:'📝',audio:'🎵',video:'🎬',img:'🖼'}[type]||'📁'; }

// ══════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (r.status === 401) {
    ME = null;
    showPage('page-login');
    showToast('⚠️ Sua sessão expirou. Faça login novamente.');
    throw new Error('Sessão expirada');
  }
  const json = await r.json();
  if (!r.ok) {
    if (json.error === 'TEACHER_BLOCKED') {
      showTeacherBlockedOverlay();
      throw new Error('TEACHER_BLOCKED');
    }
    throw new Error(json.error || 'Erro desconhecido');
  }
  return json;
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeModalOv(ev, id) { if(ev.target===ev.currentTarget) closeModal(id); }

function showTeacherBlockedOverlay() {
  let ov = document.getElementById('teacher-blocked-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'teacher-blocked-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.96);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;color:#fff;text-align:center;padding:32px';
    ov.innerHTML = `
      <div style="font-size:56px;margin-bottom:24px">🔒</div>
      <h2 style="font-size:22px;font-weight:700;margin-bottom:12px;font-family:'DM Sans',sans-serif">Conta Bloqueada</h2>
      <p style="font-size:15px;color:#94a3b8;max-width:420px;line-height:1.7;margin-bottom:28px;font-family:'DM Sans',sans-serif">Sua conta foi temporariamente bloqueada pelo administrador. Entre em contato com o administrador para regularizar o acesso.</p>
      <button onclick="doLogout()" style="background:#3b6ef5;color:#fff;border:none;border-radius:10px;padding:12px 32px;font-size:15px;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif">Sair</button>
    `;
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';
}

let toastT;
function showToast(msg) {
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.remove('hidden');
  clearTimeout(toastT); toastT=setTimeout(()=>el.classList.add('hidden'),3200);
}

function togglePw(id,btn) {
  const inp=document.getElementById(id);
  inp.type=inp.type==='password'?'text':'password';
  btn.textContent=inp.type==='password'?'👁':'🙈';
}

function todayStr() { return new Date().toISOString().split('T')[0]; }
function addMonth(d,n) { const r=new Date(d); r.setMonth(r.getMonth()+n); return r; }
function fmtDate(iso) { if(!iso) return '—'; return iso.split('T')[0].split('-').reverse().join('/'); }
function fmtDatePt(iso) {
  if(!iso) return '—';
  const [y,m,d]=iso.split('-');
  return `${d} ${MONTHS_SHORT[parseInt(m)-1]} ${y}`;
}
function formatDayLabel(iso) {
  const d=new Date(iso+'T12:00');
  return `${DAYS_PT[d.getDay()]}, ${d.getDate()} de ${MONTHS_PT[d.getMonth()]}`;
}
function escJs(s) { return (s||'').replace(/'/g,"\\'"); }

function langBadge(lang) {
  const langs = {
    en:    ['lang-badge-en', '🇺🇸 Inglês'],
    es:    ['lang-badge-es', '🇪🇸 Espanhol'],
    fr:    ['lang-badge-fr', '🇫🇷 Francês'],
    de:    ['lang-badge-de', '🇩🇪 Alemão'],
    it:    ['lang-badge-it', '🇮🇹 Italiano'],
    jp:    ['lang-badge-jp', '🇯🇵 Japonês'],
    zh:    ['lang-badge-zh', '🇨🇳 Mandarim'],
    ko:    ['lang-badge-ko', '🇰🇷 Coreano'],
    ru:    ['lang-badge-ru', '🇷🇺 Russo'],
    ar:    ['lang-badge-ar', '🇸🇦 Árabe'],
    pt:    ['lang-badge-pt', '🇧🇷 Português'],
    other: ['lang-badge-en', '🌐 Outro'],
  };
  const [cls, label] = langs[lang] || langs['en'];
  return `<span class="${cls}">${label}</span>`;
}


// ══════════════════════════════════════════════════════════════
//  CERTIFICATES
// ══════════════════════════════════════════════════════════════

// ── Signature pad ─────────────────────────────────────────────
const _sigState = {};

function initSigPad(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || _sigState[canvasId]) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#0f1b35';
  ctx.lineWidth   = 2.2;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  let drawing = false, lastX = 0, lastY = 0;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / r.width;
    const scaleY = canvas.height / r.height;
    if (e.touches) {
      return [(e.touches[0].clientX - r.left) * scaleX,
              (e.touches[0].clientY - r.top)  * scaleY];
    }
    return [(e.clientX - r.left) * scaleX,
            (e.clientY - r.top)  * scaleY];
  }

  function start(e) { e.preventDefault(); drawing = true; [lastX, lastY] = pos(e); }
  function move(e)  {
    if (!drawing) return; e.preventDefault();
    const [x, y] = pos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    [lastX, lastY] = [x, y];
  }
  function stop() { drawing = false; }

  canvas.addEventListener('mousedown',  start);
  canvas.addEventListener('mousemove',  move);
  canvas.addEventListener('mouseup',    stop);
  canvas.addEventListener('mouseleave', stop);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove',  move,  { passive: false });
  canvas.addEventListener('touchend',   stop);

  _sigState[canvasId] = true;
}

function clearSig(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function getSigDataURL(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return '';
  // Check if blank
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const blank = !data.some(v => v !== 0);
  if (blank) return '';
  return canvas.toDataURL('image/png');
}

// ── Open cert modal: init pads + populate students ─────────────
function openCertModal() {
  openModal('modal-cert');
  setTimeout(() => {
    initSigPad('sig-teacher');
    // populate student select
    const sel = document.getElementById('cert-student');
    if (sel && sel.options.length <= 1) {
      api('GET', '/api/students').then(students => {
        sel.innerHTML = '<option value="">Selecione...</option>' +
          students.map(s => `<option value="${s.matricula}">${s.name} (${s.level})</option>`).join('');
      });
    }
  }, 80);
}

// Override openModal to auto-init signature pads + populate cert students
const _origOpenModal = openModal;
window.openModal = function(id) {
  _origOpenModal(id);
  if (id === 'modal-cert') {
    setTimeout(() => initSigPad('sig-teacher'), 80);
    // Always refresh student list when opening cert modal
    api('GET', '/api/students').then(students => {
      const sel = document.getElementById('cert-student');
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="">Selecione o aluno...</option>' +
        students.map(s => `<option value="${s.matricula}"${s.matricula===cur?' selected':''} >${s.name} — Nível ${s.level}</option>`).join('');
    }).catch(()=>{});
  }
  if (id === 'modal-student-sign') setTimeout(() => initSigPad('sig-student'), 80);
};

// ── Cert form helpers ─────────────────────────────────────────
function getCertFormData() {
  return {
    studentMatricula: document.getElementById('cert-student').value,
    module:   document.getElementById('cert-module').value.trim(),
    level:    document.getElementById('cert-level').value,
    hours:    document.getElementById('cert-hours').value.trim(),
    period:   document.getElementById('cert-period').value.trim(),
    location: document.getElementById('cert-location').value.trim(),
    teacher_signature: getSigDataURL('sig-teacher'),
  };
}

async function previewCert() {
  const d = getCertFormData();
  if (!d.studentMatricula || !d.module) return showToast('⚠️ Preencha aluno e módulo');

  // get student name for preview
  const students = await api('GET', '/api/students');
  const s = students.find(st => st.matricula === d.studentMatricula);

  const previewData = {
    ...d,
    student_name:  s ? s.name : 'Aluno',
    teacher_name:  ME.name,
    issued_date:   new Date().toLocaleDateString('pt-BR'),
    cert_id:       'PREVIEW',
    student_signature: ''
  };

  showToast('⏳ Gerando pré-visualização...');
  try {
    const r = await api('POST', '/api/certificates/preview', previewData);
    const blob = b64toBlob(r.pdf, 'application/pdf');
    const url  = URL.createObjectURL(blob);
    document.getElementById('pdf-preview-frame').src = url;
    openModal('modal-pdf-preview');
  } catch(e) { showToast('❌ ' + e.message); }
}

async function issueCert() {
  const d = getCertFormData();
  if (!d.studentMatricula) return showToast('⚠️ Selecione um aluno');
  if (!d.module)  return showToast('⚠️ Informe o módulo/curso');
  if (!d.hours)   return showToast('⚠️ Informe a carga horária');
  if (!d.period)  return showToast('⚠️ Informe o período');

  showToast('⏳ Emitindo certificado...');
  try {
    await api('POST', '/api/certificates', d);
    closeModal('modal-cert');
    clearSig('sig-teacher');
    ['cert-student','cert-module','cert-hours','cert-period','cert-location'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value = '';
    });
    showToast('✅ Certificado emitido! O aluno deve assinar para liberar o download.');
    loadTeacherCerts();
  } catch(e) { showToast('❌ ' + e.message); }
}

async function loadTeacherCerts() {
  const certs = await api('GET', '/api/certificates').catch(() => []);
  const el = document.getElementById('t-certs-list');
  if (!el) return;
  if (!certs.length) { el.innerHTML = '<div class="card"><p class="empty">Nenhum certificado emitido ainda.</p></div>'; return; }

  el.innerHTML = certs.map(c => `
    <div class="cert-card">
      <div class="cert-icon">🎓</div>
      <div class="cert-info">
        <div class="cert-title">${c.module} — ${c.studentName}</div>
        <div class="cert-meta">Nível ${c.level} &nbsp;•&nbsp; ${c.hours}h &nbsp;•&nbsp; ${c.period} &nbsp;•&nbsp; Emitido em ${c.issuedDate}</div>
        <div class="cert-id">ID: ${c.certId}</div>
      </div>
      <div class="cert-actions">
        <span class="badge ${c.status === 'complete' ? 'b-done badge-complete' : 'badge b-sched badge-pending'}">${c.status === 'complete' ? '✅ Completo' : '⏳ Aguard. assinatura'}</span>
        ${c.status === 'complete' ? `<a href="/api/certificates/${c.certId}/download" class="btn-sm">⬇ PDF</a>` : ''}
        <button class="btn-icon danger" onclick="deleteCert(${c.$loki})">🗑</button>
      </div>
    </div>`).join('');
}

async function deleteCert(id) {
  if (!confirm('Excluir este certificado?')) return;
  try { await api('DELETE', `/api/certificates/${id}`); showToast('🗑 Certificado excluído'); loadTeacherCerts(); }
  catch(e) { showToast('❌ ' + e.message); }
}

// ── Student certs ─────────────────────────────────────────────
async function loadStudentCerts() {
  const certs = await api('GET', '/api/certificates').catch(() => []);
  const el = document.getElementById('s-certs-list');
  if (!el) return;
  if (!certs.length) { el.innerHTML = '<div class="card"><p class="empty">Nenhum certificado emitido ainda. Conclua um módulo com seu professor!</p></div>'; return; }

  el.innerHTML = certs.map(c => `
    <div class="cert-card">
      <div class="cert-icon">🎓</div>
      <div class="cert-info">
        <div class="cert-title">${c.module}</div>
        <div class="cert-meta">Nível ${c.level} &nbsp;•&nbsp; ${c.hours}h &nbsp;•&nbsp; ${c.period} &nbsp;•&nbsp; Prof. ${c.teacherName} &nbsp;•&nbsp; ${c.issuedDate}</div>
        <div class="cert-id">ID: ${c.certId}</div>
      </div>
      <div class="cert-actions">
        ${c.status === 'complete'
          ? `<span class="badge b-done badge-complete">✅ Assinado</span>
             <a href="/api/certificates/${c.certId}/download" class="btn-primary" style="font-size:13px;padding:8px 16px;text-decoration:none">⬇ Baixar PDF</a>`
          : `<span class="badge badge-pending">⏳ Aguardando sua assinatura</span>
             <button class="btn-primary" style="font-size:13px;padding:8px 16px" onclick="openStudentSign(${c.$loki})">✍️ Assinar</button>`
        }
      </div>
    </div>`).join('');
}

function openStudentSign(certLoki) {
  document.getElementById('sign-cert-id').value = certLoki;
  clearSig('sig-student');
  openModal('modal-student-sign');
}

async function submitStudentSign() {
  const id  = document.getElementById('sign-cert-id').value;
  const sig = getSigDataURL('sig-student');
  if (!sig) return showToast('⚠️ Por favor, faça sua assinatura');
  showToast('⏳ Salvando assinatura...');
  try {
    await api('PUT', `/api/certificates/${id}/student-sign`, { student_signature: sig });
    closeModal('modal-student-sign');
    showToast('✅ Certificado assinado! Já pode fazer o download.');
    loadStudentCerts();
  } catch(e) { showToast('❌ ' + e.message); }
}

// ── Utility: base64 → Blob ────────────────────────────────────
function b64toBlob(b64, mime) {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ── Hook into existing load functions ─────────────────────────
const _origShowTeacher = showTeacher;
window.showTeacher = function(sec, el) {
  _origShowTeacher(sec, el);
  if (sec === 't-certs') loadTeacherCerts();
};

const _origShowStudent = showStudent;
window.showStudent = function(sec, el) {
  _origShowStudent(sec, el);
  if (sec === 's-certs') loadStudentCerts();
};


async function inactivateStudent(mat, name) {
  if (!confirm(`Inativar o aluno ${name}?\n\nO acesso dele será revogado imediatamente. Você pode reativar a qualquer momento.`)) return;
  try {
    await api('PUT', `/api/students/${mat}/inactivate`);
    showToast('⏸ Aluno inativado. Acesso revogado.');
    refreshTeacherAll();
  } catch(e) { showToast('❌ ' + e.message); }
}


// ── Open Meet in new tab (guaranteed) ────────────────────────
function openMeet(url) {
  if (!url) return;
  // Ensure URL has protocol
  if (!url.startsWith('http')) url = 'https://' + url;
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    // Popup blocked fallback
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
}

// ── Lesson Feedback (teacher marks lesson done + feedback) ────
let pendingFeedbackId = null;

function openFeedbackModal(lessonId, topic) {
  pendingFeedbackId = lessonId;
  document.getElementById('fb-topic').textContent = topic || 'Aula';
  document.getElementById('fb-feedback').value = '';
  document.getElementById('fb-homework').value = '';
  openModal('modal-feedback');
}

async function submitFeedback() {
  const feedback = document.getElementById('fb-feedback').value.trim();
  const homework = document.getElementById('fb-homework').value.trim();
  if (!feedback) return showToast('⚠️ Escreva um breve resumo da aula');
  try {
    await api('PUT', `/api/lessons/${pendingFeedbackId}`, {
      status: 'done',
      feedback,
      homework
    });
    closeModal('modal-feedback');
    pendingFeedbackId = null;
    refreshTeacherAll();
    showToast('✅ Aula concluída com feedback salvo!');
  } catch(e) { showToast('❌ ' + e.message); }
}

// ── Mark lesson absent ────────────────────────────────────────
async function markAbsent(id) {
  try {
    await api('PUT', `/api/lessons/${id}`, { status: 'absent', feedback: 'Aluno não compareceu à aula.' });
    refreshTeacherAll();
    showToast('⚠️ Falta registrada para o aluno.');
  } catch(e) { showToast('❌ ' + e.message); }
}



// ══════════════════════════════════════════════════════════════
//  GOOGLE MEET BUTTON
// ══════════════════════════════════════════════════════════════
function extractMeetLink(input) {
  const text = input.value;
  const match = text.match(/https:\/\/meet\.google\.com\/[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/i);
  if (match) input.value = match[0];
}

function meetBtnHTML(lesson) {
  if (!lesson.meetLink || lesson.status !== 'scheduled') return '';
  const now     = new Date();
  const lessonDt = new Date(lesson.date + 'T' + lesson.time);
  const diffMin  = (lessonDt - now) / 60000;
  const isLive   = diffMin <= 30 && diffMin > -120;
  const style = isLive
    ? 'background:#1a73e8;color:#fff;border-color:#1a73e8;font-weight:600'
    : 'background:#e8f0fe;color:#1a73e8;border-color:#c5d4fb';
  return `<a href="${lesson.meetLink}" target="_blank" rel="noopener noreferrer"
    onclick="event.stopPropagation()"
    style="display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:8px;border:1.5px solid;font-size:13px;font-family:DM Sans,sans-serif;text-decoration:none;cursor:pointer;${style}">
    <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0"><path d="M29 24c0 2.76-2.24 5-5 5s-5-2.24-5-5 2.24-5 5-5 5 2.24 5 5z" fill="currentColor"/><path d="M39 12H9C6.8 12 5 13.8 5 16v24c0 2.2 1.8 4 4 4h30c2.2 0 4-1.8 4-4V16c0-2.2-1.8-4-4-4zm-4 26H13c-1.1 0-2-.9-2-2v-8h26v8c0 1.1-.9 2-2 2z" fill="currentColor" opacity=".3"/><path d="M43 16l-8 6v8l8 6V16z" fill="currentColor"/></svg>
    ${isLive ? 'Entrar no Google Meet' : 'Google Meet'}
  </a>`;
}

// ══════════════════════════════════════════════════════════════
//  PROFILE EDIT
// ══════════════════════════════════════════════════════════════
let _profilePhotoB64 = null;
let _cropState = { src: null, x: 0, y: 0, zoom: 1, dragging: false, sx: 0, sy: 0, imgNW: 0, imgNH: 0 };

async function openProfile() {
  try {
    const profile = await api('GET', '/api/profile');

    // Admin can edit their own name
    const nameInput = document.getElementById('profile-name');
    const nameLabel = document.getElementById('profile-name-label');
    if (ME && ME.role === 'admin') {
      nameInput.disabled = false;
      nameInput.style.opacity = '';
      nameInput.style.cursor = '';
      if (nameLabel) nameLabel.innerHTML = 'Nome completo';
    } else {
      nameInput.disabled = true;
      nameInput.style.opacity = '.6';
      nameInput.style.cursor = 'not-allowed';
    }

    nameInput.value                                    = profile.name     || '';
    document.getElementById('profile-login').value    = profile.login    || '';
    document.getElementById('profile-email').value    = profile.email    || '';
    document.getElementById('profile-whatsapp').value = profile.whatsapp || '';
    document.getElementById('profile-pw-current').value = '';
    document.getElementById('profile-pw-new').value     = '';
    _profilePhotoB64 = null;
    document.getElementById('profile-photo-input').value = '';

    // CPF field
    const cpfWrap  = document.getElementById('profile-cpf-wrap');
    const cpfInput = document.getElementById('profile-cpf');
    if (profile.cpf !== undefined && profile.cpf !== '') {
      cpfWrap.style.display = '';
      cpfInput.value = profile.cpf || '';
    } else {
      cpfWrap.style.display = 'none';
    }

    // Photo preview
    const preview = document.getElementById('profile-photo-preview');
    if (profile.photo) {
      preview.innerHTML = `<img src="${profile.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      preview.style.fontSize = '';
    } else {
      const ini = (profile.name||'?').split(' ').filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('');
      preview.innerHTML = '';
      preview.textContent = ini;
      preview.style.fontSize = '24px';
    }

    document.getElementById('profile-save-msg').classList.add('hidden');
    openModal('modal-profile');
  } catch(e) { showToast('❌ ' + e.message); }
}

// ── Crop photo ──────────────────────────────────────────────
function previewProfilePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('⚠️ Foto deve ter no máximo 2MB'); return; }
  const reader = new FileReader();
  reader.onload = (e) => _initCropModal(e.target.result);
  reader.readAsDataURL(file);
  event.target.value = '';
}

function _initCropModal(src) {
  _cropState = { src, x: 0, y: 0, zoom: 1, dragging: false, sx: 0, sy: 0, imgNW: 0, imgNH: 0 };
  const img = document.getElementById('crop-img');
  img.onload = () => {
    _cropState.imgNW = img.naturalWidth;
    _cropState.imgNH = img.naturalHeight;
    _applyCropTransform();
  };
  img.src = src;
  document.getElementById('crop-zoom').value = 1;

  const area = document.getElementById('crop-area');
  area.onmousedown  = (e) => { e.preventDefault(); _cropState.dragging=true; _cropState.sx=e.clientX-_cropState.x; _cropState.sy=e.clientY-_cropState.y; area.style.cursor='grabbing'; };
  area.onmousemove  = (e) => { if(!_cropState.dragging)return; _cropState.x=e.clientX-_cropState.sx; _cropState.y=e.clientY-_cropState.sy; _applyCropTransform(); };
  area.onmouseup    = () => { _cropState.dragging=false; area.style.cursor='grab'; };
  area.onmouseleave = () => { _cropState.dragging=false; area.style.cursor='grab'; };
  area.ontouchstart = (e) => { e.preventDefault(); _cropState.dragging=true; _cropState.sx=e.touches[0].clientX-_cropState.x; _cropState.sy=e.touches[0].clientY-_cropState.y; };
  area.ontouchmove  = (e) => { e.preventDefault(); if(!_cropState.dragging)return; _cropState.x=e.touches[0].clientX-_cropState.sx; _cropState.y=e.touches[0].clientY-_cropState.sy; _applyCropTransform(); };
  area.ontouchend   = () => { _cropState.dragging=false; };

  openModal('modal-crop-photo');
}

function _applyCropTransform() {
  const SIZE = 280, nw = _cropState.imgNW, nh = _cropState.imgNH;
  if (!nw || !nh) return;
  const base  = Math.max(SIZE/nw, SIZE/nh) * _cropState.zoom;
  const w = nw * base, h = nh * base;
  const img = document.getElementById('crop-img');
  img.style.width  = w + 'px';
  img.style.height = h + 'px';
  img.style.left   = (SIZE/2 + _cropState.x - w/2) + 'px';
  img.style.top    = (SIZE/2 + _cropState.y - h/2) + 'px';
}

function updateCropZoom() {
  _cropState.zoom = parseFloat(document.getElementById('crop-zoom').value);
  _applyCropTransform();
}

function applyCrop() {
  const SIZE = 280, OUT = 300;
  const nw = _cropState.imgNW, nh = _cropState.imgNH;
  const base  = Math.max(SIZE/nw, SIZE/nh) * _cropState.zoom * (OUT/SIZE);
  const w = nw * base, h = nh * base;
  const cx = OUT/2 + _cropState.x * (OUT/SIZE);
  const cy = OUT/2 + _cropState.y * (OUT/SIZE);

  const canvas = document.createElement('canvas');
  canvas.width = OUT; canvas.height = OUT;
  const ctx = canvas.getContext('2d');
  ctx.beginPath(); ctx.arc(OUT/2, OUT/2, OUT/2, 0, Math.PI*2); ctx.clip();
  const img = new Image(); img.src = _cropState.src;
  ctx.drawImage(img, cx - w/2, cy - h/2, w, h);

  _profilePhotoB64 = canvas.toDataURL('image/jpeg', 0.85);
  const preview = document.getElementById('profile-photo-preview');
  preview.innerHTML = `<img src="${_profilePhotoB64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  preview.style.fontSize = '';
  closeModal('modal-crop-photo');
}
// ── /Crop photo ─────────────────────────────────────────────

async function saveProfile() {
  const email    = document.getElementById('profile-email').value.trim();
  const whatsapp = document.getElementById('profile-whatsapp').value.trim();
  const curPw    = document.getElementById('profile-pw-current').value;
  const newPw    = document.getElementById('profile-pw-new').value;

  const payload = { email, whatsapp };
  if (ME && ME.role === 'admin') payload.name = document.getElementById('profile-name').value.trim();
  if (_profilePhotoB64) payload.photo = _profilePhotoB64;
  if (newPw) { payload.currentPassword = curPw; payload.newPassword = newPw; }

  const msg = document.getElementById('profile-save-msg');

  try {
    await api('PUT', '/api/profile', payload);
    msg.textContent = '✅ Perfil atualizado com sucesso!';
    msg.style.background = 'var(--green-pale)';
    msg.style.color = '#065f46';
    msg.style.border = '1px solid #6ee7b7';
    msg.classList.remove('hidden');

    if (_profilePhotoB64) updateSidebarAvatar(_profilePhotoB64);
    if (ME && ME.role === 'admin' && payload.name) {
      ME.name = payload.name;
      const el = document.getElementById('adm-name');
      if (el) el.textContent = payload.name;
    }
    setTimeout(() => closeModal('modal-profile'), 1500);
    showToast('✅ Perfil salvo!');
  } catch(e) {
    msg.textContent = '❌ ' + e.message;
    msg.style.background = 'var(--red-pale)';
    msg.style.color = 'var(--red)';
    msg.style.border = '1px solid #fca5a5';
    msg.classList.remove('hidden');
  }
}

function updateSidebarAvatar(photoB64) {
  const roleToId = { admin: 'adm-avatar-img', teacher: 't-avatar', student: 's-avatar' };
  const id = ME ? roleToId[ME.role] : null;
  if (!id) return;
  const el = document.getElementById(id);
  if (el) {
    el.innerHTML = `<img src="${photoB64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    el.style.padding = '0';
  }
}

// ══════════════════════════════════════════════════════════════
//  PROFILE EDIT
// ══════════════════════════════════════════════════════════════
let _profilePhoto = null; // base64 of new photo (if changed)
let _removePhoto  = false;


// ══════════════════════════════════════════════════════════════
//  CONTRACTS
// ══════════════════════════════════════════════════════════════
let _contractStudents = [];

async function openContractModal() {
  _contractStudents = await api('GET', '/api/students');
  const sel = document.getElementById('ctr-student');
  sel.innerHTML = '<option value="">Selecione o aluno...</option>' +
    _contractStudents.map(s => `<option value="${s.matricula}" data-lang="${s.lang||''}" data-price="${s.price||''}" data-payday="${s.payday||''}">${s.name}</option>`).join('');
  sel.onchange = () => {
    const opt = sel.selectedOptions[0];
    if (!opt) return;
    if (opt.dataset.lang)   document.getElementById('ctr-course').value  = opt.dataset.lang;
    if (opt.dataset.price)  document.getElementById('ctr-price').value   = opt.dataset.price;
    if (opt.dataset.payday) document.getElementById('ctr-payday').value  = opt.dataset.payday;
  };
  document.getElementById('ctr-months').value = '';
  document.getElementById('ctr-hours').value  = '';
  document.getElementById('ctr-course').value = '';
  document.getElementById('ctr-price').value  = '';
  document.getElementById('ctr-payday').value = '';
  document.getElementById('ctr-start').value  = '';
  document.getElementById('ctr-teacher-cpf').value = '';
  initSigPad('sig-contract-teacher');
  openModal('modal-contract');
}

function _getContractPayload() {
  const mat = document.getElementById('ctr-student').value;
  const s = _contractStudents.find(x => x.matricula === mat);
  return {
    studentMatricula: mat,
    student_name: s ? s.name : '',
    student_cpf:  s ? (s.cpf || '') : '',
    teacher_name: ME.name,
    course:         document.getElementById('ctr-course').value.trim() || (s?.lang || 'inglês'),
    months:         document.getElementById('ctr-months').value.trim(),
    hours_per_week: document.getElementById('ctr-hours').value.trim(),
    price:          document.getElementById('ctr-price').value.trim(),
    payday:         document.getElementById('ctr-payday').value.trim(),
    start_date:     document.getElementById('ctr-start').value
                      ? new Date(document.getElementById('ctr-start').value).toLocaleDateString('pt-BR')
                      : new Date().toLocaleDateString('pt-BR'),
    teacher_cpf:    document.getElementById('ctr-teacher-cpf').value.trim(),
    teacher_signature: getSigDataURL('sig-contract-teacher'),
  };
}

async function previewContract() {
  const payload = _getContractPayload();
  if (!payload.studentMatricula) { showToast('⚠️ Selecione um aluno'); return; }
  if (!payload.months)           { showToast('⚠️ Informe a duração'); return; }
  try {
    const r = await api('POST', '/api/contracts/preview', payload);
    const blob = new Blob([Uint8Array.from(atob(r.pdf), c => c.charCodeAt(0))], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    document.getElementById('pdf-preview-frame').src = url;
    document.querySelector('#modal-pdf-preview .mh h3').textContent = 'Pré-visualização do Contrato';
    openModal('modal-pdf-preview');
  } catch(e) { showToast('❌ ' + e.message); }
}

async function issueContract() {
  const payload = _getContractPayload();
  if (!payload.studentMatricula)   { showToast('⚠️ Selecione um aluno'); return; }
  if (!payload.months)             { showToast('⚠️ Informe a duração'); return; }
  if (!payload.hours_per_week)     { showToast('⚠️ Informe as horas por semana'); return; }
  if (!payload.teacher_cpf)        { showToast('⚠️ Informe seu CPF'); return; }
  if (!payload.teacher_signature || payload.teacher_signature.length < 200)
    { showToast('⚠️ Assine o contrato'); return; }
  try {
    await api('POST', '/api/contracts', payload);
    closeModal('modal-contract');
    showToast('✅ Contrato gerado! O aluno precisará assinar.');
    loadTeacherContracts();
  } catch(e) { showToast('❌ ' + e.message); }
}

async function loadTeacherContracts() {
  const contracts = await api('GET', '/api/contracts');
  const el = document.getElementById('t-contracts-list');
  if (!el) return;
  if (!contracts.length) {
    el.innerHTML = '<div class="card"><p class="empty">Nenhum contrato emitido ainda.</p></div>';
    return;
  }
  el.innerHTML = contracts.map(c => `
    <div class="cert-card">
      <div class="cert-icon">📋</div>
      <div class="cert-info">
        <div class="cert-title">${c.studentName}</div>
        <div class="cert-meta">${c.course} &nbsp;•&nbsp; ${c.months} ${parseInt(c.months)===1?'mês':'meses'} &nbsp;•&nbsp; ${c.hoursPerWeek}h/sem &nbsp;•&nbsp; R$ ${c.price}/mês &nbsp;•&nbsp; ${c.issuedDate}</div>
        <div class="cert-id">ID: ${c.contractId}</div>
      </div>
      <div class="cert-actions">
        ${c.status === 'complete'
          ? `<span class="badge b-done badge-complete">✅ Assinado</span>
             <a href="/api/contracts/${c.contractId}/download" class="btn-primary" style="font-size:13px;padding:8px 16px;text-decoration:none">⬇ Baixar PDF</a>`
          : `<span class="badge b-sched" style="background:#fef3c7;color:#92400e">⏳ Aguardando aluno</span>`
        }
      </div>
    </div>`).join('');
}

async function loadStudentContracts() {
  const contracts = await api('GET', '/api/contracts');
  const el = document.getElementById('s-contracts-list');
  if (!el) return;
  if (!contracts.length) {
    el.innerHTML = '<div class="card"><p class="empty">Nenhum contrato emitido ainda.</p></div>';
    return;
  }
  el.innerHTML = contracts.map(c => `
    <div class="cert-card">
      <div class="cert-icon">📋</div>
      <div class="cert-info">
        <div class="cert-title">Contrato — ${c.course}</div>
        <div class="cert-meta">${c.months} ${parseInt(c.months)===1?'mês':'meses'} &nbsp;•&nbsp; ${c.hoursPerWeek}h/sem &nbsp;•&nbsp; R$ ${c.price}/mês &nbsp;•&nbsp; Prof. ${c.teacherName} &nbsp;•&nbsp; ${c.issuedDate}</div>
        <div class="cert-id">ID: ${c.contractId}</div>
      </div>
      <div class="cert-actions">
        ${c.status === 'complete'
          ? `<span class="badge b-done badge-complete">✅ Assinado</span>
             <a href="/api/contracts/${c.contractId}/download" class="btn-primary" style="font-size:13px;padding:8px 16px;text-decoration:none">⬇ Baixar PDF</a>`
          : `<button class="btn-primary" style="font-size:13px" onclick="openStudentContractSign(${c.$loki},'${c.contractId}')">✍️ Assinar</button>`
        }
      </div>
    </div>`).join('');
}

function openStudentContractSign(lokiId, contractId) {
  document.getElementById('sign-contract-id').value = lokiId;
  document.getElementById('sign-contract-ctr-id').value = contractId;
  document.getElementById('sign-contract-cpf').value = '';
  initSigPad('sig-contract-student');
  openModal('modal-student-contract-sign');
}

function previewStudentContract() {
  const contractId = document.getElementById('sign-contract-ctr-id').value;
  if (!contractId) { showToast('⚠️ Contrato não identificado'); return; }
  window.open(`/api/contracts/${contractId}/view`, '_blank');
}

// ── Admin contract tabs ────────────────────────────────────────
function showAdmContractTab(tab) {
  document.getElementById('adm-teacher-contracts-list').classList.toggle('hidden', tab !== 'teacher');
  document.getElementById('adm-student-contracts-list').classList.toggle('hidden', tab !== 'student');
  document.getElementById('adm-ctr-tab-teacher').style.background = tab === 'teacher' ? 'var(--navy)' : '';
  document.getElementById('adm-ctr-tab-teacher').style.color      = tab === 'teacher' ? '#fff' : '';
  document.getElementById('adm-ctr-tab-student').style.background = tab === 'student' ? 'var(--navy)' : '';
  document.getElementById('adm-ctr-tab-student').style.color      = tab === 'student' ? '#fff' : '';
}

// ── Teacher contract tabs ──────────────────────────────────────
function showTeacherContractTab(tab) {
  document.getElementById('t-contracts-list').classList.toggle('hidden', tab !== 'students');
  document.getElementById('t-bebrave-contracts-list').classList.toggle('hidden', tab !== 'bebrave');
  document.getElementById('t-ctr-tab-students').style.background = tab === 'students' ? 'var(--navy)' : '';
  document.getElementById('t-ctr-tab-students').style.color      = tab === 'students' ? '#fff' : '';
  document.getElementById('t-ctr-tab-bebrave').style.background  = tab === 'bebrave'  ? 'var(--navy)' : '';
  document.getElementById('t-ctr-tab-bebrave').style.color       = tab === 'bebrave'  ? '#fff' : '';
}

// ── Admin: load all contracts ──────────────────────────────────
async function loadAdminContracts() {
  const [teacherCtrs, studentCtrs] = await Promise.all([
    api('GET', '/api/admin/teacher-contracts'),
    api('GET', '/api/admin/contracts'),
  ]);

  const tel = document.getElementById('adm-teacher-contracts-list');
  tel.innerHTML = teacherCtrs.length
    ? teacherCtrs.map(c => `
      <div class="cert-card">
        <div class="cert-icon">📋</div>
        <div class="cert-info">
          <div class="cert-title">${c.teacherName}</div>
          <div class="cert-meta">${c.plan === 'trial' ? 'Teste gratuito' : `Mensalidade R$ ${c.monthlyValue}`} &nbsp;•&nbsp; ${c.issuedDate}</div>
          <div class="cert-id">ID: ${c.contractId}</div>
        </div>
        <div class="cert-actions">
          ${c.status === 'complete'
            ? `<span class="badge b-done badge-complete">✅ Assinado</span>
               <a href="/api/teacher-contracts/${c.contractId}/download" class="btn-primary" style="font-size:13px;padding:8px 16px;text-decoration:none">⬇ Baixar</a>`
            : `<span class="badge b-sched" style="background:#fef3c7;color:#92400e">⏳ Aguardando professor</span>`}
        </div>
      </div>`).join('')
    : '<div class="card"><p class="empty">Nenhum contrato de professor emitido ainda.</p></div>';

  const sel = document.getElementById('adm-student-contracts-list');
  sel.innerHTML = studentCtrs.length
    ? studentCtrs.map(c => `
      <div class="cert-card">
        <div class="cert-icon">📋</div>
        <div class="cert-info">
          <div class="cert-title">${c.studentName} <span style="color:var(--g400);font-size:12px">• Prof. ${c.teacherName}</span></div>
          <div class="cert-meta">${c.course} &nbsp;•&nbsp; ${c.months} ${parseInt(c.months)===1?'mês':'meses'} &nbsp;•&nbsp; R$ ${c.price}/mês &nbsp;•&nbsp; ${c.issuedDate}</div>
          <div class="cert-id">ID: ${c.contractId}</div>
        </div>
        <div class="cert-actions">
          ${c.status === 'complete'
            ? `<span class="badge b-done badge-complete">✅ Assinado</span>
               <a href="/api/contracts/${c.contractId}/download" class="btn-primary" style="font-size:13px;padding:8px 16px;text-decoration:none">⬇ Baixar</a>`
            : `<span class="badge b-sched" style="background:#fef3c7;color:#92400e">⏳ Aguardando aluno</span>`}
        </div>
      </div>`).join('')
    : '<div class="card"><p class="empty">Nenhum contrato de aluno emitido ainda.</p></div>';
}

// ── Admin: open teacher contract modal ────────────────────────
async function openTeacherContractModal() {
  const teachers = await api('GET', '/api/admin/teachers');
  const sel = document.getElementById('tctr-teacher');
  sel.innerHTML = '<option value="">Selecione o professor...</option>' +
    teachers.map(t => `<option value="${t.login}">${t.name}</option>`).join('');
  document.getElementById('tctr-plan').value = 'trial';
  document.getElementById('tctr-value').value = '';
  document.getElementById('tctr-value-wrap').style.display = 'none';
  initSigPad('sig-teacher-contract-admin');
  openModal('modal-teacher-contract');
}
function toggleTeacherContractPlan() {
  const isMon = document.getElementById('tctr-plan').value === 'monthly';
  document.getElementById('tctr-value-wrap').style.display = isMon ? '' : 'none';
}
async function issueTeacherContract() {
  const teacherLogin = document.getElementById('tctr-teacher').value;
  const plan         = document.getElementById('tctr-plan').value;
  const monthly_value = document.getElementById('tctr-value').value.trim();
  const sig          = getSigDataURL('sig-teacher-contract-admin');
  if (!teacherLogin)          { showToast('⚠️ Selecione um professor'); return; }
  if (plan === 'monthly' && !monthly_value) { showToast('⚠️ Informe o valor mensal'); return; }
  if (!sig || sig.length < 200) { showToast('⚠️ Assine o contrato'); return; }
  try {
    await api('POST', '/api/teacher-contracts', { teacherLogin, plan, monthly_value, admin_signature: sig });
    closeModal('modal-teacher-contract');
    showToast('✅ Contrato enviado ao professor para assinatura!');
    loadAdminContracts();
  } catch(e) { showToast('❌ ' + e.message); }
}

// ── Teacher: load Termo de Uso ────────────────────────────────
async function loadTeacherBebraveContracts() {
  const el = document.getElementById('t-bebrave-contracts-list');
  if (!el) return;
  try {
    const d = await api('GET', '/api/teacher/my-terms');
    if (!d.accepted) {
      el.innerHTML = `<div class="card" style="text-align:center;padding:32px 24px">
        <div style="font-size:40px;margin-bottom:12px">📋</div>
        <p style="font-weight:600;color:var(--g700);margin-bottom:8px">Termo de Uso não assinado</p>
        <p style="font-size:14px;color:var(--g500)">O Termo de Uso será exibido automaticamente no próximo login.</p>
      </div>`;
      return;
    }
    const dateStr = d.acceptedAt ? new Date(d.acceptedAt).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' }) : '—';
    el.innerHTML = `
      <div style="border:1.5px solid var(--g200);border-radius:var(--r);background:#fff;overflow:hidden;max-width:680px;margin:0 auto">
        <div style="background:var(--navy);color:#fff;padding:18px 24px;display:flex;align-items:center;gap:12px">
          <span style="font-size:24px">📋</span>
          <div>
            <div style="font-size:16px;font-weight:700">Termo de Uso — BeBrave</div>
            <div style="font-size:12px;opacity:.8">Assinado em ${dateStr}</div>
          </div>
          <span style="margin-left:auto;background:#22c55e;color:#fff;font-size:12px;font-weight:700;padding:4px 12px;border-radius:99px">✅ Aceito</span>
        </div>
        <div style="padding:24px;font-size:13px;color:var(--g700);line-height:1.75;border-bottom:1px solid var(--g100)">
          <p><strong>TERMO DE USO DA PLATAFORMA BEBRAVE</strong></p><br>
          <p><strong>1. PERÍODO DE TESTE GRATUITO</strong><br>O acesso à plataforma BeBrave é concedido de forma gratuita durante o período de teste, com duração determinada e comunicada ao professor.</p><br>
          <p><strong>2. ENCERRAMENTO DO PERÍODO DE TESTE</strong><br>Após o término do período de testes, o acesso será automaticamente bloqueado, com notificação prévia.</p><br>
          <p><strong>3. CONTINUIDADE DO SERVIÇO</strong><br>Ao término do período de teste, o professor poderá continuar utilizando a plataforma mediante aceitação dos novos termos e condições comerciais vigentes.</p><br>
          <p><strong>4. DADOS E PRIVACIDADE</strong><br>Os dados cadastrados são utilizados exclusivamente para o funcionamento dos serviços da BeBrave, em conformidade com a legislação aplicável.</p><br>
          <p><strong>5. RESPONSABILIDADES</strong><br>O professor se compromete a utilizar a plataforma de forma ética e legal, respeitando os dados dos alunos e as políticas da BeBrave.</p><br>
          <p><strong>6. ALTERAÇÕES NOS TERMOS</strong><br>A BeBrave pode alterar estes termos mediante comunicação prévia. A continuidade do uso implica aceitação das novas condições.</p>
        </div>
        <div style="padding:20px 24px;background:var(--g50)">
          <div style="font-size:12px;color:var(--g500);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Assinatura do Professor</div>
          <div style="background:#fff;border:1px solid var(--g200);border-radius:var(--r-sm);padding:8px;display:inline-block">
            <img src="${d.signature}" alt="Assinatura" style="max-height:80px;display:block">
          </div>
          <div style="margin-top:12px;font-size:13px;color:var(--g600)">
            <strong>${escHtml(d.name)}</strong>${d.cpf ? ' · CPF: ' + d.cpf : ''}<br>
            <span style="font-size:12px;color:var(--g400)">Aceito digitalmente em ${dateStr}</span>
          </div>
        </div>
      </div>`;
  } catch(e) {
    el.innerHTML = '<p class="empty">Não foi possível carregar o Termo de Uso.</p>';
  }
}
function openTeacherSelfSign(lokiId, contractId) {
  document.getElementById('sign-tctr-id').value     = lokiId;
  document.getElementById('sign-tctr-ctr-id').value = contractId;
  document.getElementById('sign-tctr-cpf').value    = '';
  initSigPad('sig-teacher-self');
  openModal('modal-teacher-self-sign');
}
function previewTeacherSelfContract() {
  const contractId = document.getElementById('sign-tctr-ctr-id').value;
  if (!contractId) { showToast('⚠️ Contrato não identificado'); return; }
  window.open(`/api/teacher-contracts/${contractId}/view`, '_blank');
}
async function submitTeacherSelfSign() {
  const id  = document.getElementById('sign-tctr-id').value;
  const cpf = document.getElementById('sign-tctr-cpf').value.trim();
  const sig  = getSigDataURL('sig-teacher-self');
  if (!cpf)                { showToast('⚠️ Informe seu CPF'); return; }
  if (!sig || sig.length < 200) { showToast('⚠️ Assine o contrato'); return; }
  try {
    await api('PUT', `/api/teacher-contracts/${id}/sign`, { teacher_signature: sig, teacher_cpf: cpf });
    closeModal('modal-teacher-self-sign');
    showToast('✅ Contrato assinado! Disponível para download.');
    loadTeacherBebraveContracts();
  } catch(e) { showToast('❌ ' + e.message); }
}

// ── Pending contracts popup ────────────────────────────────────
async function checkPendingContracts(role) {
  try {
    if (role === 'student') {
      const r = await api('GET', '/api/contracts/pending-count');
      if (r.count > 0) {
        document.getElementById('pending-contracts-msg').textContent =
          `Você tem ${r.count} contrato${r.count > 1 ? 's' : ''} pendente${r.count > 1 ? 's' : ''} de assinatura. Assine para regularizar seu acesso à plataforma.`;
        document.getElementById('pending-contracts-btn').onclick = () => {
          closeModal('modal-pending-contracts');
          showStudent('s-contracts', document.querySelector('#student-sidebar .nav-item:last-child'));
        };
        openModal('modal-pending-contracts');
      }
    } else if (role === 'teacher') {
      const r = await api('GET', '/api/teacher-contracts/pending-count');
      if (r.count > 0) {
        document.getElementById('pending-contracts-msg').textContent =
          `Você tem ${r.count} contrato${r.count > 1 ? 's' : ''} com a BeBrave pendente${r.count > 1 ? 's' : ''} de assinatura.`;
        document.getElementById('pending-contracts-btn').onclick = () => {
          closeModal('modal-pending-contracts');
          showTeacher('t-contracts', document.querySelector('#teacher-sidebar .nav-item:last-child'));
          showTeacherContractTab('bebrave');
        };
        openModal('modal-pending-contracts');
      }
    }
  } catch(_) {}
}

async function submitStudentContractSign() {
  const id  = document.getElementById('sign-contract-id').value;
  const cpf = document.getElementById('sign-contract-cpf').value.trim();
  const sig  = getSigDataURL('sig-contract-student');
  if (!cpf)                 { showToast('⚠️ Informe seu CPF'); return; }
  if (!sig || sig.length < 200) { showToast('⚠️ Assine o contrato'); return; }
  try {
    await api('PUT', `/api/contracts/${id}/student-sign`, { student_signature: sig, student_cpf: cpf });
    closeModal('modal-student-contract-sign');
    showToast('✅ Contrato assinado! Disponível para download.');
    loadStudentContracts();
  } catch(e) { showToast('❌ ' + e.message); }
}

// ══════════════════════════════════════════════════════════════
//  PAYMENTS
// ══════════════════════════════════════════════════════════════
let _paymentMonth = new Date().toISOString().slice(0, 7);

function fmtMonthLabel(ym) {
  const [y, m] = ym.split('-');
  return MONTHS_PT[parseInt(m) - 1] + ' / ' + y;
}

function changePaymentMonth(delta) {
  const [y, m] = _paymentMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  _paymentMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  loadTeacherPayments();
}

async function loadTeacherPayments() {
  const data = await api('GET', `/api/payments?month=${_paymentMonth}`).catch(() => null);
  if (!data) return;
  const { payments, summary, month } = data;

  document.getElementById('t-payments-header').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn-sm" onclick="changePaymentMonth(-1)">&#8249; Anterior</button>
      <span style="font-weight:700;font-size:17px;color:var(--navy)">${fmtMonthLabel(month)}</span>
      <button class="btn-sm" onclick="changePaymentMonth(1)">Próximo &#8250;</button>
    </div>`;

  renderStats('t-payments-stats', [
    { icon: '💰', val: 'R$ ' + summary.totalAmount.toFixed(2).replace('.', ','), lbl: 'Total previsto',   cls: 'bc-blue'  },
    { icon: '✅', val: 'R$ ' + summary.receivedAmount.toFixed(2).replace('.', ','), lbl: summary.paid + ' pago' + (summary.paid !== 1 ? 's' : ''), cls: 'bc-green' },
    { icon: '⏳', val: summary.pending, lbl: 'Pendente' + (summary.pending !== 1 ? 's' : ''), cls: 'bc-amber' },
    { icon: '🔴', val: summary.overdue, lbl: 'Atrasado' + (summary.overdue !== 1 ? 's' : ''), cls: 'bc-red'   },
  ]);

  const el = document.getElementById('t-payments-list');
  if (!payments.length) {
    el.innerHTML = `<p class="empty" style="padding:24px">Nenhum aluno com mensalidade configurada neste mês.<br>
      <small style="color:var(--g400)">Configure o valor e dia de vencimento ao cadastrar o aluno ou clique em ⚙️ na tabela de alunos.</small></p>`;
    return;
  }

  const statusHtml = {
    paid:    '<span style="background:#d1fae5;color:#065f46;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600">✅ Pago</span>',
    pending: '<span style="background:#fef3c7;color:#92400e;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600">⏳ Pendente</span>',
    overdue: '<span style="background:#fee2e2;color:#991b1b;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600">🔴 Atrasado</span>',
  };

  el.innerHTML = `<table class="list-table"><thead><tr>
    <th>Aluno</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Pago em</th><th>Ação</th>
  </tr></thead><tbody>
    ${payments.map(p => {
      const due   = new Date(p.dueDate).toLocaleDateString('pt-BR');
      const paidAt = p.paidAt ? new Date(p.paidAt).toLocaleDateString('pt-BR') : '—';
      const action = p.status === 'paid'
        ? `<button class="btn-sm" style="background:#fee2e2;color:#991b1b;font-size:12px" onclick="markPaymentUnpaid(${p.$loki})">Desfazer</button>`
        : `<button class="btn-sm" style="background:#d1fae5;color:#065f46;font-size:12px" onclick="markPaymentPaid(${p.$loki})">Marcar pago</button>`;
      return `<tr>
        <td><strong>${p.studentName}</strong></td>
        <td>R$ ${p.amount.toFixed(2).replace('.', ',')}</td>
        <td>dia ${new Date(p.dueDate).getDate()}</td>
        <td>${statusHtml[p.status]}</td>
        <td style="color:var(--g500);font-size:13px">${paidAt}</td>
        <td>${action}</td>
      </tr>`;
    }).join('')}
  </tbody></table>`;
}

async function markPaymentPaid(id) {
  try {
    await api('PUT', `/api/payments/${id}/mark-paid`);
    showToast('✅ Pagamento registrado!');
    loadTeacherPayments();
  } catch(e) { showToast('❌ ' + e.message); }
}

async function markPaymentUnpaid(id) {
  if (!confirm('Desfazer o registro deste pagamento?')) return;
  try {
    await api('PUT', `/api/payments/${id}/mark-unpaid`);
    showToast('↩️ Pagamento desmarcado.');
    loadTeacherPayments();
  } catch(e) { showToast('❌ ' + e.message); }
}

function openPaymentPlanModal(matricula, name, price, payday) {
  document.getElementById('pp-matricula').value = matricula;
  document.getElementById('pp-student-name').textContent = name;
  document.getElementById('pp-price').value  = price  || '';
  document.getElementById('pp-payday').value = payday || '';
  openModal('modal-payment-plan');
}

async function savePaymentPlan() {
  const matricula = document.getElementById('pp-matricula').value;
  const price     = document.getElementById('pp-price').value;
  const payday    = document.getElementById('pp-payday').value;
  if (!price || !payday) { showToast('⚠️ Preencha valor e dia de vencimento'); return; }
  if (parseInt(payday) < 1 || parseInt(payday) > 31) { showToast('⚠️ Dia inválido (1–31)'); return; }
  try {
    await api('PUT', `/api/students/${matricula}/payment-plan`, { price: parseFloat(price), payday: parseInt(payday) });
    closeModal('modal-payment-plan');
    showToast('✅ Mensalidade configurada!');
    loadTeacherPayments();
  } catch(e) { showToast('❌ ' + e.message); }
}

// ── Network ───────────────────────────────────────────────────────────────────

const LANG_LABELS = { en:'🇺🇸 Inglês', es:'🇪🇸 Espanhol', fr:'🇫🇷 Francês', de:'🇩🇪 Alemão', it:'🇮🇹 Italiano', jp:'🇯🇵 Japonês', zh:'🇨🇳 Mandarim', ko:'🇰🇷 Coreano', ru:'🇷🇺 Russo', ar:'🇸🇦 Árabe', pt:'🇧🇷 Português' };

// ── Teacher: edit own network profile ────────────────────────────────────────
async function loadTeacherNetworkProfile() {
  const el = document.getElementById('t-network-content');
  el.innerHTML = '<p class="empty">Carregando...</p>';
  let p = {};
  try { p = await api('GET', '/api/teacher/network-profile'); } catch(e) {}

  const langCheckboxes = Object.entries(LANG_LABELS).map(([code, label]) =>
    `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;padding:6px 12px;border:1.5px solid var(--g200);border-radius:20px;${(p.networkLanguages||[]).includes(code)?'background:var(--blue);color:white;border-color:var(--blue)':''}">
      <input type="checkbox" value="${code}" ${(p.networkLanguages||[]).includes(code)?'checked':''} style="accent-color:#fff" onchange="updateNetworkLangStyle(this)"> ${label}</label>`
  ).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="ch" style="flex-wrap:wrap;gap:12px">
        <div>
          <h3>Visibilidade na Network</h3>
          <p class="sub">Quando ativo, novos alunos podem encontrar e visualizar seu perfil</p>
        </div>
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
          <span style="font-size:13px;color:var(--g500)">Aparecer na Network</span>
          <div style="position:relative;width:44px;height:24px">
            <input type="checkbox" id="np-visible" ${p.networkVisible?'checked':''} style="opacity:0;width:0;height:0;position:absolute" onchange="document.getElementById('np-toggle-track').style.background=this.checked?'var(--blue)':'var(--g200)';document.getElementById('np-toggle-thumb').style.left=this.checked?'22px':'2px'">
            <div id="np-toggle-track" style="position:absolute;inset:0;border-radius:12px;background:${p.networkVisible?'var(--blue)':'var(--g200)'};transition:.2s"></div>
            <div id="np-toggle-thumb" style="position:absolute;top:2px;left:${p.networkVisible?'22':'2'}px;width:20px;height:20px;border-radius:50%;background:white;box-shadow:0 1px 4px rgba(0,0,0,.2);transition:.2s"></div>
          </div>
        </label>
      </div>
    </div>
    <div class="card">
      <div class="ch"><h3>Informações do perfil</h3></div>
      <div style="display:grid;gap:14px">
        <div>
          <label style="font-size:12px;color:var(--g500);display:block;margin-bottom:6px">Sobre mim / Experiência</label>
          <textarea id="np-bio" rows="4" placeholder="Conte um pouco sobre você, sua experiência como professor, sua metodologia..." style="width:100%;padding:10px 12px;border:1.5px solid var(--g200);border-radius:var(--r-sm);font-family:'DM Sans',sans-serif;font-size:14px;resize:vertical;box-sizing:border-box">${escHtml(p.networkBio||'')}</textarea>
        </div>
        <div>
          <label style="font-size:12px;color:var(--g500);display:block;margin-bottom:8px">Idiomas que leciono</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px" id="np-langs-wrap">${langCheckboxes}</div>
        </div>
        <div>
          <label style="font-size:12px;color:var(--g500);display:block;margin-bottom:6px">Valor da hora/aula</label>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="position:relative">
              <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--g400);font-size:14px">R$</span>
              <input type="number" id="np-rate" min="0" placeholder="0,00" value="${p.networkRate||''}" ${p.networkRateNegotiable?'disabled':''} style="padding:10px 12px 10px 34px;border:1.5px solid var(--g200);border-radius:var(--r-sm);font-family:'DM Sans',sans-serif;font-size:14px;width:120px">
            </div>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
              <input type="checkbox" id="np-negotiable" ${p.networkRateNegotiable?'checked':''} style="accent-color:var(--blue)" onchange="document.getElementById('np-rate').disabled=this.checked">
              Vamos Combinar
            </label>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:12px;color:var(--g500);display:block;margin-bottom:6px">E-mail de contato público</label>
            <input type="email" id="np-email" value="${escHtml(p.networkEmail||'')}" placeholder="seu@email.com" style="width:100%;padding:10px 12px;border:1.5px solid var(--g200);border-radius:var(--r-sm);font-family:'DM Sans',sans-serif;font-size:14px;box-sizing:border-box">
          </div>
          <div>
            <label style="font-size:12px;color:var(--g500);display:block;margin-bottom:6px">WhatsApp público</label>
            <input type="text" id="np-whatsapp" value="${escHtml(p.networkWhatsapp||'')}" placeholder="(21) 99999-9999" style="width:100%;padding:10px 12px;border:1.5px solid var(--g200);border-radius:var(--r-sm);font-family:'DM Sans',sans-serif;font-size:14px;box-sizing:border-box">
          </div>
        </div>
      </div>
      <div class="mf" style="margin-top:20px;justify-content:flex-end">
        <button class="btn-primary" onclick="saveTeacherNetworkProfile()">💾 Salvar perfil</button>
      </div>
    </div>`;
}

function updateNetworkLangStyle(cb) {
  const label = cb.closest('label');
  if (cb.checked) { label.style.background='var(--blue)'; label.style.color='white'; label.style.borderColor='var(--blue)'; }
  else { label.style.background=''; label.style.color=''; label.style.borderColor='var(--g200)'; }
}

async function saveTeacherNetworkProfile() {
  const networkLanguages = [...document.querySelectorAll('#np-langs-wrap input:checked')].map(c => c.value);
  const networkRate = document.getElementById('np-negotiable').checked ? null : (parseFloat(document.getElementById('np-rate').value) || null);
  await api('PUT', '/api/teacher/network-profile', {
    networkVisible:       document.getElementById('np-visible').checked,
    networkBio:           document.getElementById('np-bio').value.trim(),
    networkLanguages,
    networkRate,
    networkRateNegotiable: document.getElementById('np-negotiable').checked,
    networkEmail:         document.getElementById('np-email').value.trim(),
    networkWhatsapp:      document.getElementById('np-whatsapp').value.trim(),
  }).then(() => showToast('✅ Perfil salvo!')).catch(e => showToast('❌ ' + e.message));
}

// ── Student: browse teacher network ──────────────────────────────────────────
let _networkTeachers = [];
let _networkActiveLang = 'all';

async function loadStudentNetwork() {
  const el = document.getElementById('s-network-content');
  el.innerHTML = '<p class="empty">Carregando professores...</p>';
  try {
    _networkTeachers = await api('GET', '/api/network/teachers');
    _networkActiveLang = 'all';
    renderNetworkPage();
  } catch(e) { el.innerHTML = `<div class="card"><p class="empty">Erro ao carregar: ${e.message}</p></div>`; }
}

function renderNetworkPage() {
  const el = document.getElementById('s-network-content');
  if (!_networkTeachers.length) {
    el.innerHTML = '<div class="card"><p class="empty" style="text-align:center;padding:32px 0">Nenhum professor disponível na Network no momento.</p></div>';
    return;
  }

  // Collect all unique languages across visible teachers
  const allLangs = [...new Set(_networkTeachers.flatMap(t => t.languages || []))].sort();

  // Filter
  const filtered = _networkActiveLang === 'all'
    ? _networkTeachers
    : _networkTeachers.filter(t => (t.languages||[]).includes(_networkActiveLang));

  // Pill styles
  const pillBase = 'border:none;cursor:pointer;border-radius:20px;padding:6px 16px;font-size:13px;font-weight:600;font-family:inherit;transition:all .15s;';
  const pillActive = pillBase + 'background:var(--blue);color:white;';
  const pillInactive = pillBase + 'background:#f1f5f9;color:var(--g600);';

  const filterBar = `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;align-items:center">
      <button style="${_networkActiveLang==='all'?pillActive:pillInactive}" onclick="filterNetworkByLang('all')">Todos</button>
      ${allLangs.map(l => `<button style="${_networkActiveLang===l?pillActive:pillInactive}" onclick="filterNetworkByLang('${l}')">${LANG_LABELS[l]||l}</button>`).join('')}
    </div>`;

  const noResult = filtered.length === 0
    ? '<p class="empty" style="text-align:center;padding:32px 0">Nenhum professor encontrado para este idioma.</p>'
    : '';

  const grid = filtered.length
    ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">` +
        filtered.map(t => {
          const photoHTML = t.photo
            ? `<img src="${t.photo}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.15)">`
            : `<div style="width:72px;height:72px;border-radius:50%;background:var(--blue);color:white;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.15)">${t.name.charAt(0).toUpperCase()}</div>`;
          const langs = (t.languages||[]).map(l => `<span style="font-size:11px;background:#e8eeff;color:var(--blue);padding:2px 8px;border-radius:20px">${LANG_LABELS[l]||l}</span>`).join('');
          const rateStr = t.rateNegotiable ? '<span style="font-size:12px;background:#d1fae5;color:#065f46;padding:3px 10px;border-radius:20px">💬 Vamos Combinar</span>'
            : (t.rate ? `<span style="font-size:12px;background:#fef3c7;color:#92400e;padding:3px 10px;border-radius:20px">R$ ${parseFloat(t.rate).toFixed(2).replace('.',',')}/h</span>` : '');
          const bioExcerpt = t.bio ? (t.bio.length > 90 ? t.bio.slice(0, 90) + '...' : t.bio) : '';
          return `<div style="background:white;border-radius:var(--r-md);box-shadow:0 1px 8px rgba(0,0,0,.08);overflow:hidden;display:flex;flex-direction:column">
            <div style="background:linear-gradient(135deg,var(--navy),#2a5fcc);padding:20px;display:flex;gap:14px;align-items:center">
              ${photoHTML}
              <div style="flex:1;min-width:0">
                <div style="font-size:15px;font-weight:700;color:white;margin-bottom:4px">${escHtml(t.name)}</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px">${langs||'<span style="font-size:11px;color:rgba(255,255,255,.6)">Idiomas não informados</span>'}</div>
              </div>
            </div>
            <div style="padding:14px 16px;flex:1;display:flex;flex-direction:column;gap:8px">
              ${rateStr}
              ${bioExcerpt ? `<p style="font-size:13px;color:var(--g500);line-height:1.5;flex:1">${escHtml(bioExcerpt)}</p>` : '<p style="font-size:13px;color:var(--g300);flex:1">Sem descrição.</p>'}
              <button class="btn-primary" style="width:100%;margin-top:8px" onclick="viewTeacherProfile('${t.login}')">👁 Visualizar perfil</button>
            </div>
          </div>`;
        }).join('') + '</div>'
    : '';

  el.innerHTML = filterBar + noResult + grid;
}

function filterNetworkByLang(lang) {
  _networkActiveLang = lang;
  renderNetworkPage();
}

async function viewTeacherProfile(login) {
  const el = document.getElementById('teacher-profile-view-content');
  el.innerHTML = '<p class="empty">Carregando...</p>';
  openModal('modal-teacher-profile-view');
  try {
    const t = await api('GET', `/api/network/teachers/${login}`);
    const photoHTML = t.photo
      ? `<img src="${t.photo}" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:4px solid var(--blue);display:block;margin:0 auto 12px">`
      : `<div style="width:96px;height:96px;border-radius:50%;background:var(--blue);color:white;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;margin:0 auto 12px">${t.name.charAt(0).toUpperCase()}</div>`;
    const langs = (t.languages||[]).map(l => `<span class="lang-badge-en" style="font-size:12px">${LANG_LABELS[l]||l}</span>`).join(' ');
    const rateStr = t.rateNegotiable ? '<span style="background:#d1fae5;color:#065f46;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:600">💬 Vamos Combinar</span>'
      : (t.rate ? `<span style="background:#fef3c7;color:#92400e;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:600">R$ ${parseFloat(t.rate).toFixed(2).replace('.',',')}/hora</span>` : '');
    el.innerHTML = `
      <div style="text-align:center;margin-bottom:20px">
        ${photoHTML}
        <h3 style="font-size:20px;color:var(--navy);margin-bottom:6px">${escHtml(t.name)}</h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:8px">${langs}</div>
        ${rateStr}
      </div>
      ${t.bio ? `<div style="background:var(--g50);border-radius:var(--r-sm);padding:14px 16px;margin-bottom:16px">
        <p style="font-size:13px;color:var(--g600);line-height:1.7;margin:0">${escHtml(t.bio)}</p>
      </div>` : ''}
      <div style="border-top:1px solid var(--g100);padding-top:16px">
        <p style="font-size:12px;font-weight:600;color:var(--g400);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">Contato</p>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${t.publicEmail ? `<a href="mailto:${t.publicEmail}" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--g50);border-radius:var(--r-sm);text-decoration:none;color:var(--navy)"><span style="font-size:18px">📧</span><span style="font-size:14px">${escHtml(t.publicEmail)}</span></a>` : ''}
          ${t.publicWhatsapp ? `<a href="https://wa.me/55${t.publicWhatsapp.replace(/\D/g,'')}" target="_blank" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#d1fae5;border-radius:var(--r-sm);text-decoration:none;color:#065f46"><span style="font-size:18px">💬</span><span style="font-size:14px">${escHtml(t.publicWhatsapp)}</span></a>` : ''}
          ${!t.publicEmail && !t.publicWhatsapp ? '<p style="font-size:13px;color:var(--g400);text-align:center">Nenhuma informação de contato disponível.</p>' : ''}
        </div>
      </div>
      <div style="border-top:1px solid var(--g100);padding-top:16px;margin-top:16px">
        <p style="font-size:12px;font-weight:600;color:var(--g400);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">Fale com o Professor</p>
        <div id="network-msg-area">
          <textarea id="network-msg-text" rows="3" placeholder="Escreva sua mensagem — combine data, horário e valor antes de solicitar aulas..." style="width:100%;box-sizing:border-box;border:1px solid var(--g200);border-radius:var(--r-sm);padding:10px 12px;font-size:13px;resize:vertical;font-family:inherit"></textarea>
          <button class="btn-primary" style="width:100%;margin-top:8px" onclick="sendNetworkMessage('${escHtml(t.login)}')">✉️ Enviar mensagem</button>
        </div>
      </div>`;
  } catch(e) { el.innerHTML = `<p class="empty">Erro ao carregar perfil: ${e.message}</p>`; }
}

function renderNetworkRequestButton(teacherLogin, teacherName, reqStatus) {
  const area = document.getElementById('s-conv-request-area');
  if (!area) return;
  if (reqStatus.status === 'pending') {
    if (reqStatus.teacherLogin === teacherLogin) {
      area.innerHTML = `
        <p style="font-size:13px;font-weight:600;color:#92400e;background:#fef3c7;padding:12px;border-radius:var(--r-sm);margin-bottom:10px;text-align:center">⏳ Solicitação enviada — aguardando resposta do professor</p>
        <button class="btn-secondary" style="width:100%" onclick="cancelNetworkRequest()">❌ Cancelar solicitação</button>`;
    } else {
      area.innerHTML = `<p style="font-size:13px;color:var(--g400);text-align:center">Você já tem uma solicitação pendente com outro professor.</p>`;
    }
  } else {
    area.innerHTML = `
      <div style="display:flex;gap:10px">
        <button class="btn-primary" style="flex:1;background:#16a34a;border-color:#16a34a" onmouseenter="this.style.background='#15803d'" onmouseleave="this.style.background='#16a34a'" onclick="requestTeacher('${teacherLogin}','${escHtml(teacherName)}')">🎓 Quero ter aulas com este professor</button>
        <button class="btn-secondary" style="flex:1;color:#dc2626;border-color:#dc2626" onclick="declineNetworkTeacher('${teacherLogin}')">❌ Não tenho interesse</button>
      </div>`;
  }
}

async function requestTeacher(teacherLogin, teacherName) {
  try {
    await api('POST', '/api/network/request', { teacherLogin });
    renderNetworkRequestButton(teacherLogin, teacherName, { status: 'pending', teacherLogin });
    toast('Solicitação enviada! O professor será notificado.');
    renderNetworkPage();
  } catch(e) { toast('Erro: ' + e.message); }
}

async function cancelNetworkRequest() {
  try {
    await api('DELETE', '/api/network/request');
    toast('Solicitação cancelada.');
    renderNetworkPage();
    if (_studentActiveConv) {
      const reqStatus = await api('GET', '/api/network/my-request');
      renderNetworkRequestButton(_studentActiveConv, '', reqStatus);
    }
  } catch(e) { toast('Erro: ' + e.message); }
}

function declineNetworkTeacher(teacherLogin) {
  const area = document.getElementById('s-conv-request-area');
  if (area) area.innerHTML = `<p style="font-size:13px;color:var(--g400);text-align:center;padding:8px 0">Tudo bem! Você pode continuar conversando ou encontrar outro professor em <strong>Network</strong>.</p>`;
}

async function sendNetworkMessage(teacherLogin) {
  const textarea = document.getElementById('network-msg-text');
  const content = textarea?.value.trim();
  if (!content) { toast('Escreva uma mensagem antes de enviar.'); return; }
  try {
    await api('POST', '/api/messages', { content, toLogin: teacherLogin });
    const area = document.getElementById('network-msg-area');
    if (area) area.innerHTML = '<p style="text-align:center;color:#065f46;background:#d1fae5;padding:12px;border-radius:var(--r-sm);font-size:14px">✅ Mensagem enviada! O professor irá respondê-la em breve.</p>';
  } catch(e) { toast('Erro ao enviar mensagem: ' + e.message); }
}

// ── Teacher: Network Requests ─────────────────────────────────────────────────
async function loadTeacherRequests() {
  const el = document.getElementById('t-requests-content');
  el.innerHTML = '<p class="empty">Carregando...</p>';
  try {
    const reqs = await api('GET', '/api/network/requests');
    updateRequestsBadge(reqs.length);
    if (!reqs.length) {
      el.innerHTML = '<div class="card"><p class="empty" style="text-align:center;padding:32px 0">Nenhuma solicitação pendente no momento.</p></div>';
      return;
    }
    el.innerHTML = reqs.map(r => `
      <div class="card" style="margin-bottom:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:180px">
          <p style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:4px">${escHtml(r.studentName)}</p>
          <p style="font-size:12px;color:var(--g400)">Solicitou aulas • ${new Date(r.createdAt).toLocaleDateString('pt-BR')}</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-secondary" style="color:#dc2626;border-color:#dc2626" onclick="rejectNetworkRequest(${r.id})">Recusar</button>
          <button class="btn-primary" onclick="acceptNetworkRequest(${r.id},'${escHtml(r.studentName)}','${r.studentLogin}')">Aceitar</button>
        </div>
      </div>`).join('');
  } catch(e) { el.innerHTML = `<div class="card"><p class="empty">Erro: ${e.message}</p></div>`; }
}

function updateRequestsBadge(count) {
  const badge = document.getElementById('t-requests-badge');
  if (!badge) return;
  if (count > 0) { badge.textContent = count; badge.style.display = 'inline-block'; }
  else badge.style.display = 'none';
}

async function acceptNetworkRequest(id, studentName, studentLogin) {
  // Don't call API yet — only open the modal. The request stays 'pending'
  // until the teacher actually submits the registration form.
  openCompleteNetworkReg(studentLogin, studentName, id);
}

async function rejectNetworkRequest(id) {
  try {
    await api('PUT', `/api/network/request/${id}/reject`);
    toast('Solicitação recusada.');
    loadTeacherRequests();
  } catch(e) { toast('Erro: ' + e.message); }
}

function openCompleteNetworkReg(studentLogin, studentName, requestId) {
  document.getElementById('cnr-student-login').value = studentLogin;
  document.getElementById('cnr-request-id').value = requestId || '';
  document.getElementById('cnr-student-name').textContent = '👤 ' + studentName;
  document.getElementById('cnr-price').value = '';
  document.getElementById('cnr-payday').value = '';
  const err = document.getElementById('cnr-err'); if (err) { err.style.display='none'; err.textContent=''; }
  openModal('modal-complete-network-reg');
}

async function submitCompleteNetworkReg() {
  const studentLogin = document.getElementById('cnr-student-login').value;
  const requestId    = document.getElementById('cnr-request-id').value;
  const price  = document.getElementById('cnr-price').value.trim();
  const payday = document.getElementById('cnr-payday').value.trim();
  const err = document.getElementById('cnr-err');
  const showErr = msg => { err.textContent = msg; err.style.display = 'block'; };
  err.style.display = 'none';
  if (!price || parseFloat(price) <= 0) return showErr('⚠️ Informe o valor da mensalidade');
  if (!payday || parseInt(payday) < 1 || parseInt(payday) > 28) return showErr('⚠️ Dia de vencimento deve ser entre 1 e 28');
  try {
    // Accept the request first (if it came from Solicitações tab)
    if (requestId) await api('PUT', `/api/network/request/${requestId}/accept`);
    await api('POST', '/api/network/complete-registration', { studentLogin, price, payday });
    closeModal('modal-complete-network-reg');
    toast('Aluno vinculado com sucesso! Agora gere o contrato na aba Contratos.');
    loadStudents();
    loadTeacherRequests();
    const contractNav = document.querySelector('#teacher-sidebar .nav-item:nth-child(7)');
    showTeacher('t-contracts', contractNav);
    loadTeacherContracts?.();
  } catch(e) { showErr('❌ ' + e.message); }
}

// ── Student self-registration ─────────────────────────────────────────────────
function openStudentRegister() {
  ['sr-name','sr-cpf','sr-email','sr-whatsapp','sr-password'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
  const dob = document.getElementById('sr-dob'); if(dob) dob.value = '';
  document.querySelectorAll('#sr-langs-wrap input[type=checkbox]').forEach(cb => cb.checked = false);
  const err = document.getElementById('sr-err'); if(err) { err.style.display='none'; err.textContent=''; }
  openModal('modal-student-register');
}

async function submitStudentRegister() {
  const name     = document.getElementById('sr-name').value.trim();
  const cpf      = document.getElementById('sr-cpf').value.trim();
  const dob      = document.getElementById('sr-dob').value.trim();
  const email    = document.getElementById('sr-email').value.trim();
  const whatsapp = document.getElementById('sr-whatsapp').value.trim();
  const password = document.getElementById('sr-password').value;
  const languages = [...document.querySelectorAll('#sr-langs-wrap input:checked')].map(c => c.value);
  const err = document.getElementById('sr-err');

  const showErr = msg => { err.textContent = msg; err.style.display = 'block'; };
  err.style.display = 'none';

  if (!name)          return showErr('⚠️ Nome é obrigatório');
  if (!cpf)           return showErr('⚠️ CPF é obrigatório');
  if (!dob)           return showErr('⚠️ Data de nascimento é obrigatória');
  if (!languages.length) return showErr('⚠️ Selecione ao menos um idioma');
  if (!email)         return showErr('⚠️ E-mail é obrigatório');
  if (!whatsapp)      return showErr('⚠️ WhatsApp é obrigatório');
  if (!password || password.length < 4) return showErr('⚠️ Senha mínimo 4 caracteres');

  try {
    const r = await api('POST', '/api/register/student', { name, cpf, dob, languages, email, whatsapp, password });
    document.getElementById('student-reg-success-login').textContent = r.login;
    openModal('modal-register-success');
  } catch(e) { showErr('❌ ' + e.message); }
}

// ── Student Progress Report ──────────────────────────────────────────────────

let _reportMatricula = '';
let _reportStudentName = '';

function openReportModal(matricula, name) {
  _reportMatricula = matricula;
  _reportStudentName = name;
  document.getElementById('report-student-name').textContent = name;
  const now = new Date();
  document.getElementById('report-month').value = now.getMonth() + 1;
  document.getElementById('report-year').value  = now.getFullYear();
  document.getElementById('report-preview').style.display = 'none';
  openModal('modal-report');
}

async function generateStudentReport() {
  const month = parseInt(document.getElementById('report-month').value);
  const year  = parseInt(document.getElementById('report-year').value);
  if (!year || year < 2020) { showToast('⚠️ Ano inválido'); return; }

  const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const monthLabel = MONTHS_PT[month - 1];
  const pad = n => String(n).padStart(2, '0');
  const prefix = `${year}-${pad(month)}`;

  let allLessons = [], allNotes = [], students = [];
  try {
    [allLessons, allNotes, students] = await Promise.all([
      api('GET', '/api/lessons'),
      api('GET', '/api/notes'),
      api('GET', '/api/students'),
    ]);
  } catch(e) { showToast('❌ Erro ao buscar dados: ' + e.message); return; }

  const student = students.find(s => s.matricula === _reportMatricula) || {};
  const lessons = allLessons.filter(l => l.studentMatricula === _reportMatricula && (l.date||'').startsWith(prefix));
  const notes   = allNotes.filter(n => n.studentMatricula === _reportMatricula);

  const done     = lessons.filter(l => l.status === 'done').length;
  const absent   = lessons.filter(l => l.status === 'absent').length;
  const sched    = lessons.filter(l => l.status === 'scheduled').length;
  const total    = lessons.length;

  if (!window.jspdf) { showToast('❌ jsPDF não carregado. Recarregue a página.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const PW = 210, PH = 297;
  const ML = 18, MR = 18, MT = 0;
  const CW = PW - ML - MR;

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(26, 42, 80);
  doc.rect(0, 0, PW, 38, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('BeBrave', ML, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 200, 230);
  doc.text('Language Tutoring Platform', ML, 25);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`Relatório de Progresso — ${monthLabel} ${year}`, PW - MR, 18, { align: 'right' });

  // ── Student info ─────────────────────────────────────────────────────────
  let y = 50;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 42, 80);
  doc.text(_reportStudentName, ML, y);

  y += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 110, 130);
  const infoLine = [
    student.level ? `Nível: ${student.level}` : '',
    student.email ? `E-mail: ${student.email}` : '',
    student.lang  ? `Idioma: ${student.lang}`  : '',
  ].filter(Boolean).join('   •   ');
  if (infoLine) doc.text(infoLine, ML, y);

  // divider
  y += 6;
  doc.setDrawColor(220, 225, 235);
  doc.setLineWidth(0.4);
  doc.line(ML, y, PW - MR, y);

  // ── Stats row ────────────────────────────────────────────────────────────
  y += 10;
  const statBoxW = CW / 4 - 3;
  const stats = [
    { val: done,   label: 'Aulas realizadas', color: [16, 185, 129]  },
    { val: absent, label: 'Faltas',            color: [239, 68, 68]   },
    { val: sched,  label: 'Agendadas',         color: [59, 130, 246]  },
    { val: total,  label: 'Total no mês',      color: [26, 42, 80]    },
  ];
  stats.forEach((st, i) => {
    const bx = ML + i * (statBoxW + 4);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(bx, y, statBoxW, 22, 3, 3, 'F');
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...st.color);
    doc.text(String(st.val), bx + statBoxW / 2, y + 11, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 110, 130);
    doc.text(st.label, bx + statBoxW / 2, y + 18, { align: 'center' });
  });

  y += 30;

  // ── Lessons table ─────────────────────────────────────────────────────────
  if (lessons.length > 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 42, 80);
    doc.text('Aulas do Período', ML, y);
    y += 6;

    // table header
    const cols = [
      { label: 'Data',     w: 24 },
      { label: 'Horário',  w: 20 },
      { label: 'Tópico',   w: 58 },
      { label: 'Status',   w: 24 },
      { label: 'Feedback', w: CW - 24 - 20 - 58 - 24 },
    ];
    doc.setFillColor(26, 42, 80);
    doc.rect(ML, y, CW, 7, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    let cx = ML + 2;
    cols.forEach(c => { doc.text(c.label, cx, y + 5); cx += c.w; });

    y += 7;
    const statusLabel = { done: 'Realizada', absent: 'Falta', scheduled: 'Agendada', cancelled: 'Cancelada' };
    const statusColor = { done: [16,185,129], absent: [239,68,68], scheduled: [59,130,246], cancelled: [156,163,175] };

    const sortedLessons = [...lessons].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    sortedLessons.forEach((l, idx) => {
      const rowH = 7;
      if (y + rowH > PH - 20) {
        doc.addPage();
        y = MT + 20;
      }
      doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
      doc.rect(ML, y, CW, rowH, 'F');

      const dateParts = (l.date||'').split('-');
      const dateStr = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : (l.date||'');
      const rowVals = [
        dateStr,
        l.time || '',
        l.topic || l.subject || '',
        statusLabel[l.status] || l.status || '',
        l.feedback || '',
      ];

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 70, 90);
      cx = ML + 2;
      cols.forEach((c, ci) => {
        if (ci === 3) {
          const sc = statusColor[l.status] || [100,110,130];
          doc.setTextColor(...sc);
        } else {
          doc.setTextColor(60, 70, 90);
        }
        const txt = doc.splitTextToSize(rowVals[ci], c.w - 3);
        doc.text(txt[0] || '', cx, y + 5);
        cx += c.w;
      });
      doc.setDrawColor(230, 235, 240);
      doc.setLineWidth(0.2);
      doc.line(ML, y + rowH, ML + CW, y + rowH);
      y += rowH;
    });
  } else {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150, 160, 175);
    doc.text('Nenhuma aula registrada neste período.', ML, y + 6);
    y += 14;
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (notes.length > 0) {
    y += 10;
    if (y + 30 > PH - 20) { doc.addPage(); y = MT + 20; }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 42, 80);
    doc.text('Anotações do Professor', ML, y);
    y += 6;

    notes.slice(0, 6).forEach(n => {
      const lines = doc.splitTextToSize('• ' + (n.text || ''), CW);
      const blockH = lines.length * 5 + 4;
      if (y + blockH > PH - 20) { doc.addPage(); y = MT + 20; }
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 70, 90);
      doc.text(lines, ML, y + 4);
      y += blockH;
    });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(248, 250, 252);
    doc.rect(0, PH - 12, PW, 12, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 160, 175);
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} · BeBrave Language Tutoring`, ML, PH - 5);
    doc.text(`${p} / ${totalPages}`, PW - MR, PH - 5, { align: 'right' });
  }

  const filename = `Relatorio_${_reportStudentName.replace(/\s+/g,'_')}_${monthLabel}_${year}.pdf`;
  doc.save(filename);
  closeModal('modal-report');
  showToast('✅ PDF gerado com sucesso!');
}

// ── Study Plan ───────────────────────────────────────────────────────────────

let _spMillestoneCounter = 0;

async function openStudyPlan(matricula, name) {
  document.getElementById('sp-matricula').value = matricula;
  document.getElementById('sp-student-name').textContent = name;
  document.getElementById('sp-title').value = '';
  document.getElementById('sp-goal-level').value = '';
  document.getElementById('sp-start').value = '';
  document.getElementById('sp-end').value = '';
  document.getElementById('sp-milestones').innerHTML = '';
  _spMillestoneCounter = 0;

  try {
    const plan = await api('GET', `/api/study-plan/${matricula}`);
    if (plan) {
      document.getElementById('sp-title').value      = plan.title      || '';
      document.getElementById('sp-goal-level').value = plan.goalLevel  || '';
      document.getElementById('sp-start').value      = plan.startDate  || '';
      document.getElementById('sp-end').value        = plan.endDate    || '';
      (plan.milestones || []).forEach(m => _addMilestoneRowData(m));
    }
  } catch(e) {}

  _updateNoMilestonesMsg();
  openModal('modal-study-plan');
}

function _addMilestoneRowData(m) {
  _spMillestoneCounter++;
  const id = m.id || ('ms-' + _spMillestoneCounter);
  const row = document.createElement('div');
  row.dataset.id = id;
  row.style.cssText = 'display:grid;grid-template-columns:auto 1fr auto auto;gap:8px;align-items:center;padding:8px 10px;background:var(--g50);border-radius:var(--r-sm)';
  row.innerHTML = `
    <input type="checkbox" ${m.done ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;accent-color:var(--blue)" onchange="_updateMilestoneDone(this)">
    <input type="text" value="${escHtml(m.title||'')}" placeholder="Descreva o marco..." style="padding:6px 10px;border:1.5px solid var(--g200);border-radius:var(--r-sm);font-size:13px;font-family:'DM Sans',sans-serif;width:100%;box-sizing:border-box">
    <input type="date" value="${m.targetDate||''}" style="padding:6px 8px;border:1.5px solid var(--g200);border-radius:var(--r-sm);font-size:13px;font-family:'DM Sans',sans-serif">
    <button onclick="removeMilestoneRow(this)" style="background:none;border:none;cursor:pointer;color:var(--g400);font-size:16px;line-height:1;padding:4px">✕</button>`;
  document.getElementById('sp-milestones').appendChild(row);
}

function addMilestoneRow() {
  _addMilestoneRowData({ id: 'ms-' + (++_spMillestoneCounter), title: '', targetDate: '', done: false });
  _updateNoMilestonesMsg();
}

function removeMilestoneRow(btn) {
  btn.closest('[data-id]').remove();
  _updateNoMilestonesMsg();
}

function _updateMilestoneDone(cb) {
  const row = cb.closest('[data-id]');
  const titleInput = row.querySelector('input[type="text"]');
  titleInput.style.textDecoration = cb.checked ? 'line-through' : '';
  titleInput.style.color = cb.checked ? 'var(--g400)' : '';
}

function _updateNoMilestonesMsg() {
  const rows = document.getElementById('sp-milestones').children.length;
  document.getElementById('sp-no-milestones').style.display = rows > 0 ? 'none' : '';
}

function _collectMilestones() {
  return [...document.getElementById('sp-milestones').children].map(row => ({
    id: row.dataset.id,
    title:      row.querySelector('input[type="text"]').value.trim(),
    targetDate: row.querySelector('input[type="date"]').value,
    done:       row.querySelector('input[type="checkbox"]').checked,
  }));
}

async function saveStudyPlan() {
  const matricula = document.getElementById('sp-matricula').value;
  const title     = document.getElementById('sp-title').value.trim();
  const goalLevel = document.getElementById('sp-goal-level').value;
  const startDate = document.getElementById('sp-start').value;
  const endDate   = document.getElementById('sp-end').value;
  if (!title) { showToast('⚠️ Informe o título do plano'); return; }
  const milestones = _collectMilestones().filter(m => m.title);
  try {
    await api('PUT', `/api/study-plan/${matricula}`, { title, goalLevel, startDate, endDate, milestones });
    closeModal('modal-study-plan');
    showToast('✅ Plano salvo!');
    refreshTeacherAll();
  } catch(e) { showToast('❌ ' + e.message); }
}

async function deleteStudyPlan() {
  const matricula = document.getElementById('sp-matricula').value;
  if (!confirm('Excluir o plano de estudos deste aluno?')) return;
  try {
    await api('DELETE', `/api/study-plan/${matricula}`);
    closeModal('modal-study-plan');
    showToast('✅ Plano excluído');
    refreshTeacherAll();
  } catch(e) { showToast('❌ ' + e.message); }
}

async function loadStudentPlan() {
  const el = document.getElementById('s-plan-content');
  el.innerHTML = '<p class="empty">Carregando...</p>';
  try {
    const plan = await api('GET', `/api/study-plan/${ME.login}`);
    if (!plan) {
      el.innerHTML = '<div class="card"><p class="empty" style="text-align:center;padding:32px 0">Nenhum plano definido pelo seu professor ainda.</p></div>';
      return;
    }
    const milestones = plan.milestones || [];
    const total = milestones.length;
    const doneM = milestones.filter(m => m.done).length;
    const pct   = total > 0 ? Math.round(doneM / total * 100) : 0;
    const today = new Date().toISOString().split('T')[0];

    const milestoneHTML = milestones.length > 0
      ? milestones.map(m => {
          const overdue = !m.done && m.targetDate && m.targetDate < today;
          const icon = m.done ? '✅' : (overdue ? '🔴' : '⏳');
          const dateStr = m.targetDate ? new Date(m.targetDate + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '';
          return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--g100)">
            <span style="font-size:18px;flex-shrink:0">${icon}</span>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:500;color:var(--navy);${m.done?'text-decoration:line-through;color:var(--g400)':''}">${escHtml(m.title)}</div>
              ${dateStr ? `<div style="font-size:12px;color:var(--g400);margin-top:2px">${dateStr}</div>` : ''}
            </div>
          </div>`;
        }).join('')
      : '<p style="color:var(--g400);font-size:13px">Nenhum marco definido ainda.</p>';

    const durationStr = (plan.startDate && plan.endDate)
      ? `${new Date(plan.startDate+'T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'numeric'})} → ${new Date(plan.endDate+'T12:00:00').toLocaleDateString('pt-BR',{month:'short',year:'numeric'})}`
      : '';

    el.innerHTML = `
      <div class="card">
        <div class="ch">
          <div>
            <h3>${escHtml(plan.title)}</h3>
            ${durationStr ? `<p class="sub">${durationStr}</p>` : ''}
          </div>
          ${plan.goalLevel ? `<span style="background:var(--blue);color:white;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:600">Objetivo: ${plan.goalLevel}</span>` : ''}
        </div>
        ${total > 0 ? `
        <div style="margin:16px 0">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:13px;color:var(--g500)">Progresso geral</span>
            <span style="font-size:13px;font-weight:700;color:var(--navy)">${doneM}/${total} marcos · ${pct}%</span>
          </div>
          <div style="height:10px;background:var(--g200);border-radius:5px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--blue),#10b981);border-radius:5px;transition:width .5s"></div>
          </div>
        </div>` : ''}
        <div style="margin-top:8px">${milestoneHTML}</div>
      </div>`;
  } catch(e) {
    el.innerHTML = `<div class="card"><p class="empty">Erro ao carregar plano: ${e.message}</p></div>`;
  }
}

async function loadStudentPayments() {
  const data = await api('GET', '/api/payments/student').catch(() => null);
  const el = document.getElementById('s-payments-content');
  if (!data?.hasPaymentPlan) {
    el.innerHTML = '<div class="card"><p class="empty">Nenhuma mensalidade configurada pelo seu professor ainda.</p></div>';
    return;
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const current = data.payments.find(p => p.month === currentMonth);
  const history = data.payments.filter(p => p.month !== currentMonth);

  const stMap = {
    paid:    { label: '✅ Pago',      bg: '#d1fae5', color: '#065f46' },
    pending: { label: '⏳ Pendente',  bg: '#fef3c7', color: '#92400e' },
    overdue: { label: '🔴 Atrasado',  bg: '#fee2e2', color: '#991b1b' },
  };

  let html = '';
  if (current) {
    const st  = stMap[current.status];
    const due = new Date(current.dueDate).toLocaleDateString('pt-BR');
    html += `<div class="card" style="margin-bottom:16px;border-left:4px solid ${st.color}">
      <div class="ch"><h3>Mensalidade Atual — ${fmtMonthLabel(current.month)}</h3></div>
      <div style="display:flex;gap:40px;flex-wrap:wrap;margin-top:8px;padding-bottom:8px">
        <div><div style="font-size:12px;color:var(--g400);margin-bottom:4px">Valor</div><div style="font-size:26px;font-weight:700">R$ ${current.amount.toFixed(2).replace('.', ',')}</div></div>
        <div><div style="font-size:12px;color:var(--g400);margin-bottom:4px">Vencimento</div><div style="font-size:18px;font-weight:600">${due}</div></div>
        <div><div style="font-size:12px;color:var(--g400);margin-bottom:4px">Status</div><span style="background:${st.bg};color:${st.color};padding:5px 16px;border-radius:20px;font-weight:600;font-size:14px">${st.label}</span></div>
        ${current.paidAt ? `<div><div style="font-size:12px;color:var(--g400);margin-bottom:4px">Pago em</div><div style="font-size:16px;font-weight:600">${new Date(current.paidAt).toLocaleDateString('pt-BR')}</div></div>` : ''}
      </div>
      ${current.status !== 'paid' ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--g100);display:flex;align-items:center;gap:12px">
        <span style="font-size:13px;color:var(--g500)">Dúvidas sobre o pagamento?</span>
        <button class="btn-sm" style="background:var(--blue);color:white;border-color:var(--blue)" onclick="showStudent('s-messages',document.getElementById('s-nav-messages'));loadStudentMessages()">💬 Contacte seu professor</button>
      </div>` : ''}
    </div>`;
  }

  if (history.length) {
    html += `<div class="card"><div class="ch"><h3>Histórico de Mensalidades</h3></div>
      <table class="list-table"><thead><tr><th>Mês</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Pago em</th></tr></thead><tbody>
        ${history.map(p => {
          const st = stMap[p.status];
          return `<tr>
            <td>${fmtMonthLabel(p.month)}</td>
            <td>R$ ${p.amount.toFixed(2).replace('.', ',')}</td>
            <td>${new Date(p.dueDate).toLocaleDateString('pt-BR')}</td>
            <td><span style="background:${st.bg};color:${st.color};padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">${st.label}</span></td>
            <td style="color:var(--g500);font-size:13px">${p.paidAt ? new Date(p.paidAt).toLocaleDateString('pt-BR') : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>`;
  }

  el.innerHTML = html || '<div class="card"><p class="empty">Nenhum registro de mensalidade ainda.</p></div>';
}

// ══════════════════════════════════════════════════════════════
//  INBOX BADGES
// ══════════════════════════════════════════════════════════════
async function refreshInboxBadges() {
  try {
    const { count, msgCount, suggCount } = await api('GET', '/api/unread-count');
    // For teachers: separate badge for messages vs suggestions
    if (ME.role === 'teacher') {
      const mb = document.getElementById('t-inbox-badge');
      if (mb) { mb.textContent = msgCount; mb.style.display = msgCount > 0 ? '' : 'none'; }
      const sb = document.getElementById('t-sugg-badge');
      if (sb) { sb.textContent = suggCount; sb.style.display = suggCount > 0 ? '' : 'none'; }
      // Network requests badge
      try {
        const reqs = await api('GET', '/api/network/requests');
        updateRequestsBadge(reqs.length);
      } catch(e) {}
      return;
    }
    const badgeId = ME.role === 'admin' ? 'adm-inbox-badge' : 's-inbox-badge';
    const badge = document.getElementById(badgeId);
    if (!badge) return;
    if (count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.style.display = 'inline-block'; }
    else { badge.style.display = 'none'; }
  } catch(e) {}
}

// ══════════════════════════════════════════════════════════════
//  MESSAGES — TEACHER
// ══════════════════════════════════════════════════════════════
let _activeThreadLogin = null;
let _activeThreadName  = null;

async function loadTeacherMessages() {
  _activeThreadLogin = null;
  document.getElementById('t-messages-threads').style.display = '';
  document.getElementById('t-messages-conversation').style.display = 'none';

  const threads = await api('GET', '/api/messages/threads').catch(() => []);
  const el = document.getElementById('t-messages-threads');
  if (!threads.length) {
    el.innerHTML = '<div class="card"><p class="empty">Nenhuma mensagem recebida ainda. Seus alunos poderão te enviar mensagens pelo painel deles.</p></div>';
    return;
  }
  el.innerHTML = threads.map(t => {
    const last = t.last;
    const preview = last ? (last.content.length > 60 ? last.content.slice(0, 60) + '...' : last.content) : '';
    const unreadBadge = t.unread > 0
      ? `<span style="background:#ef4444;color:#fff;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700">${t.unread}</span>`
      : `<span style="font-size:12px;color:var(--g400)">✓ lido</span>`;
    return `<div class="card" style="margin-bottom:10px;cursor:pointer;transition:box-shadow .15s" onmouseenter="this.style.boxShadow='0 4px 16px rgba(0,0,0,.08)'" onmouseleave="this.style.boxShadow=''" onclick="openMessageThread('${t.studentLogin}','${escJs(t.studentName)}')">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--g100);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;flex-shrink:0">${t.studentName.charAt(0)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:15px">${t.studentName}</div>
          <div style="font-size:13px;color:var(--g500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${preview}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
          ${unreadBadge}
          <span style="font-size:11px;color:var(--g400)">${last ? fmtTimeAgo(last.createdAt) : ''}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function openMessageThread(login, name) {
  _activeThreadLogin = login;
  _activeThreadName  = name;
  document.getElementById('t-messages-threads').style.display = 'none';
  document.getElementById('t-messages-conversation').style.display = '';
  document.getElementById('t-conv-title').textContent = name;
  document.getElementById('t-msg-input').value = '';
  await api('PUT', `/api/messages/read/${login}`).catch(() => {});
  await renderConversation('t-conv-messages', login);
  refreshInboxBadges();
}

function backToThreads() {
  _activeThreadLogin = null;
  document.getElementById('t-messages-threads').style.display = '';
  document.getElementById('t-messages-conversation').style.display = 'none';
  loadTeacherMessages();
}

async function sendTeacherMessage() {
  const input = document.getElementById('t-msg-input');
  const content = input.value.trim();
  if (!content || !_activeThreadLogin) return;
  try {
    await api('POST', '/api/messages', { content, toLogin: _activeThreadLogin });
    input.value = '';
    await renderConversation('t-conv-messages', _activeThreadLogin);
  } catch(e) { showToast('❌ ' + e.message); }
}

// ══════════════════════════════════════════════════════════════
//  MESSAGES — STUDENT
// ══════════════════════════════════════════════════════════════
let _studentActiveConv = null; // teacherLogin currently open

async function loadStudentMessages() {
  const el = document.getElementById('s-msg-area');
  el.innerHTML = '<p class="empty">Carregando...</p>';
  try {
    const threads = await api('GET', '/api/messages/student-threads');
    await refreshInboxBadges();

    if (!threads.length) {
      el.innerHTML = `<div class="card"><p class="empty" style="text-align:center;padding:32px 0">
        Nenhuma mensagem ainda.<br><span style="font-size:13px;color:var(--g400)">Encontre um professor em <strong>Network</strong> e inicie uma conversa.</span>
      </p></div>`;
      return;
    }

    // Thread list
    const threadItems = threads.map(t => `
      <div class="card" style="margin-bottom:10px;display:flex;align-items:center;gap:14px;cursor:pointer;padding:14px 16px" onclick="openStudentConv('${t.teacherLogin}','${escHtml(t.teacherName)}')">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--blue);color:white;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;flex-shrink:0">${t.teacherName.charAt(0)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:600;color:var(--navy)">${escHtml(t.teacherName)}</div>
          <div style="font-size:12px;color:var(--g400);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(t.last?.content || '')}</div>
        </div>
        ${t.unread > 0 ? `<span style="background:#ef4444;color:#fff;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700">${t.unread}</span>` : ''}
      </div>`).join('');
    el.innerHTML = threadItems;
  } catch(e) { el.innerHTML = `<div class="card"><p class="empty">Erro: ${e.message}</p></div>`; }
}

async function openStudentConv(teacherLogin, teacherName) {
  _studentActiveConv = teacherLogin;
  const el = document.getElementById('s-msg-area');
  el.innerHTML = `
    <div class="card" style="display:flex;flex-direction:column;gap:0">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <button class="btn-secondary" style="padding:6px 12px;font-size:13px" onclick="loadStudentMessages()">← Voltar</button>
        <h3 style="font-size:16px;font-weight:700;color:var(--navy);margin:0">${escHtml(teacherName)}</h3>
      </div>
      <div id="s-conv-messages" style="max-height:380px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:8px 0"></div>
      <div style="display:flex;gap:8px;margin-top:16px;padding-top:16px;border-top:1px solid var(--g100)">
        <input id="s-msg-input" type="text" placeholder="Escrever mensagem..." style="flex:1;padding:10px 14px;border:1.5px solid var(--g200);border-radius:var(--r-sm);font-family:'DM Sans',sans-serif;font-size:14px" onkeydown="if(event.key==='Enter')sendStudentMessage()">
        <button class="btn-primary" onclick="sendStudentMessage()">Enviar</button>
      </div>
      <div id="s-conv-request-area" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--g100)"></div>
    </div>`;
  await api('PUT', `/api/messages/read/${teacherLogin}`).catch(() => {});
  await renderConversation('s-conv-messages', teacherLogin);
  // Show solicitar/cancel buttons only if this teacher is not the formal teacher
  if (ME.teacherLogin !== teacherLogin) {
    try {
      const reqStatus = await api('GET', '/api/network/my-request');
      renderNetworkRequestButton(teacherLogin, teacherName, reqStatus);
    } catch(e) {}
  }
  await refreshInboxBadges();
}

async function sendStudentMessage() {
  const input = document.getElementById('s-msg-input');
  const content = input.value.trim();
  if (!content || !_studentActiveConv) return;
  try {
    const body = ME.teacherLogin === _studentActiveConv
      ? { content }
      : { content, toLogin: _studentActiveConv };
    await api('POST', '/api/messages', body);
    input.value = '';
    await renderConversation('s-conv-messages', _studentActiveConv);
  } catch(e) { showToast('❌ ' + e.message); }
}

// ── Shared conversation renderer ───────────────────────────
async function renderConversation(containerId, otherLogin) {
  if (!otherLogin) return;
  const msgs = await api('GET', `/api/messages/conversation/${otherLogin}`).catch(() => []);
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!msgs.length) {
    el.innerHTML = '<p class="empty" style="text-align:center;padding:24px 0">Nenhuma mensagem ainda. Inicie a conversa!</p>';
    return;
  }
  el.innerHTML = msgs.map(m => {
    const isMine = m.fromLogin === ME.login;
    return `<div style="display:flex;flex-direction:${isMine ? 'row-reverse' : 'row'};gap:8px;align-items:flex-end">
      <div style="width:30px;height:30px;border-radius:50%;background:${isMine ? 'var(--navy)' : 'var(--g100)'};color:${isMine ? '#fff' : 'var(--g700)'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${m.fromName.charAt(0)}</div>
      <div style="max-width:70%">
        <div style="background:${isMine ? 'var(--navy)' : 'var(--g50)'};color:${isMine ? '#fff' : 'var(--g800)'};padding:10px 14px;border-radius:${isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};font-size:14px;line-height:1.5">${escHtml(m.content)}</div>
        <div style="font-size:11px;color:var(--g400);margin-top:3px;text-align:${isMine ? 'right' : 'left'}">${fmtTimeAgo(m.createdAt)}</div>
      </div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

// ══════════════════════════════════════════════════════════════
//  SUGGESTIONS — TEACHER VIEW (with admin replies)
// ══════════════════════════════════════════════════════════════
async function loadTeacherSuggestions() {
  await api('PUT', '/api/suggestions/mark-replies-read').catch(() => {});
  const mine = await api('GET', '/api/teacher/suggestions').catch(() => []);
  const el = document.getElementById('t-suggestions-list');
  if (!el) return;
  if (!mine.length) {
    el.innerHTML = '<div class="card"><p class="empty">Você ainda não enviou nenhuma sugestão.</p></div>';
    refreshInboxBadges();
    return;
  }
  el.innerHTML = `<div class="ch" style="margin-bottom:12px"><h3>Minhas Sugestões</h3></div>` +
    mine.map(s => `
    <div class="card" style="margin-bottom:12px;border-left:4px solid ${s.adminReply ? '#2A5FCC' : 'var(--g200)'}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-size:12px;color:var(--g400)">${fmtTimeAgo(s.createdAt)}</span>
        ${s.adminReply
          ? `<span style="font-size:11px;font-weight:700;color:#2A5FCC;background:#eff6ff;padding:2px 10px;border-radius:99px">✉️ Respondida</span>`
          : `<span style="font-size:11px;font-weight:700;color:#92400e;background:#fef3c7;padding:2px 10px;border-radius:99px">⏳ Aguardando</span>`}
      </div>
      <p style="margin:0 0 12px;font-size:14px;color:var(--g700);white-space:pre-wrap;line-height:1.6">${escHtml(s.content)}</p>
      ${s.adminReply ? `
        <div style="background:#eff6ff;border-radius:var(--r-sm);padding:12px 16px;border-left:3px solid #2A5FCC">
          <div style="font-size:11px;font-weight:700;color:#2A5FCC;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">✉️ Resposta do Administrador · ${fmtTimeAgo(s.adminRepliedAt)}</div>
          <p style="margin:0;font-size:14px;color:var(--g800);white-space:pre-wrap;line-height:1.6">${escHtml(s.adminReply)}</p>
        </div>` : ''}
    </div>`).join('');
  refreshInboxBadges();
}

async function checkPaymentAlert() {
  try {
    const r = await api('GET', '/api/payments/student/alert');
    if (!r.alert) return;
    const isOverdue = r.status === 'overdue';
    const dias = r.daysUntilDue <= 0 ? 'hoje' : `em ${r.daysUntilDue} dia${r.daysUntilDue !== 1 ? 's' : ''}`;
    const msg  = isOverdue
      ? `🔴 Sua mensalidade de R$ ${r.amount.toFixed(2).replace('.', ',')} está em atraso!`
      : `📅 Sua mensalidade de R$ ${r.amount.toFixed(2).replace('.', ',')} vence ${dias}.`;
    const banner = document.getElementById('s-payment-alert-banner');
    if (banner) banner.innerHTML = `
      <div style="background:${isOverdue ? '#fee2e2' : '#fef3c7'};color:${isOverdue ? '#991b1b' : '#92400e'};padding:14px 18px;border-radius:var(--r-sm);margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <span style="font-weight:600;font-size:14px">${msg}</span>
        <button class="btn-sm" onclick="showStudent('s-payments',document.getElementById('s-nav-payments'));loadStudentPayments()">Ver detalhes</button>
      </div>`;
  } catch(e) {}
}

// ══════════════════════════════════════════════════════════════
//  FORUM
// ══════════════════════════════════════════════════════════════
function fmtTimeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'agora mesmo';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' min atrás';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h atrás';
  return new Date(ts).toLocaleDateString('pt-BR');
}

function forumAvatar(photo, name, size) {
  const s = size || 40;
  if (photo) return `<img src="${photo}" style="width:${s}px;height:${s}px;border-radius:50%;object-fit:cover;flex-shrink:0" alt="${name}">`;
  return `<div style="width:${s}px;height:${s}px;border-radius:50%;background:var(--g100);display:flex;align-items:center;justify-content:center;font-size:${Math.round(s*0.38)}px;font-weight:600;flex-shrink:0">${name.charAt(0).toUpperCase()}</div>`;
}

function renderForumPosts(posts, role, listId, inputId) {
  const el = document.getElementById(listId);
  if (!posts.length) {
    el.innerHTML = '<div class="card"><p class="empty">Nenhuma publicação ainda. Seja o primeiro a escrever!</p></div>';
    return;
  }
  el.innerHTML = posts.map(p => {
    const isAuthor = p.authorLogin === ME.login;
    const isTeacherOfGroup = ME.role === 'teacher';
    const canDelete = isAuthor || isTeacherOfGroup;
    const roleBadge = p.authorRole === 'teacher'
      ? `<span style="font-size:11px;background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:20px;font-weight:600">Professor</span>`
      : `<span style="font-size:11px;background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:20px;font-weight:600">Aluno</span>`;

    const repliesHtml = p.replies.map(r => {
      const rIsAuthor = r.authorLogin === ME.login;
      const rCanDelete = rIsAuthor || isTeacherOfGroup;
      const rBadge = r.authorRole === 'teacher'
        ? `<span style="font-size:10px;background:#dbeafe;color:#1d4ed8;padding:1px 7px;border-radius:20px;font-weight:600">Professor</span>`
        : `<span style="font-size:10px;background:#f0fdf4;color:#16a34a;padding:1px 7px;border-radius:20px;font-weight:600">Aluno</span>`;
      return `<div style="display:flex;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--g100)">
        ${forumAvatar(r.authorPhoto, r.authorName, 32)}
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-weight:600;font-size:13px">${r.authorName}</span>${rBadge}
            <span style="font-size:11px;color:var(--g400)">${fmtTimeAgo(r.createdAt)}</span>
            ${rCanDelete ? `<button onclick="deleteForumReply(${r.$loki},'${listId}','${inputId}')" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--g400);font-size:12px" title="Excluir">🗑</button>` : ''}
          </div>
          <p style="margin:0;font-size:14px;color:var(--g700);line-height:1.5">${escHtml(r.content)}</p>
        </div>
      </div>`;
    }).join('');

    return `<div class="card" style="margin-bottom:14px">
      <div style="display:flex;gap:12px">
        ${forumAvatar(p.authorPhoto, p.authorName, 40)}
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:14px">${p.authorName}</span>${roleBadge}
            <span style="font-size:12px;color:var(--g400)">${fmtTimeAgo(p.createdAt)}</span>
            ${canDelete ? `<button onclick="deleteForumPost(${p.$loki},'${listId}','${inputId}')" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--g400);font-size:13px" title="Excluir">🗑</button>` : ''}
          </div>
          <p style="margin:0 0 12px;font-size:15px;color:var(--g800);line-height:1.6">${escHtml(p.content)}</p>
          <div class="forum-replies">${repliesHtml}</div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <input type="text" placeholder="Responder..." id="reply-${p.$loki}" style="flex:1;padding:8px 12px;border:1.5px solid var(--g200);border-radius:var(--r-sm);font-family:'DM Sans',sans-serif;font-size:13px" onkeydown="if(event.key==='Enter')submitForumReply(${p.$loki},'${listId}','${inputId}')">
            <button class="btn-sm" onclick="submitForumReply(${p.$loki},'${listId}','${inputId}')">Enviar</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

async function loadTeacherForum() {
  try {
    const posts = await api('GET', '/api/forum');
    renderForumPosts(posts, 'teacher', 't-forum-list', 't-forum-input');
  } catch(e) { if (e.message !== 'TEACHER_BLOCKED') showToast('❌ ' + e.message); }
}

async function loadStudentForum() {
  try {
    const posts = await api('GET', '/api/forum');
    renderForumPosts(posts, 'student', 's-forum-list', 's-forum-input');
  } catch(e) { showToast('❌ ' + e.message); }
}

async function submitForumPost(role) {
  const inputId = role === 'teacher' ? 't-forum-input' : 's-forum-input';
  const listId  = role === 'teacher' ? 't-forum-list'  : 's-forum-list';
  const el = document.getElementById(inputId);
  const content = el.value.trim();
  if (!content) { showToast('⚠️ Escreva algo antes de publicar'); return; }
  try {
    await api('POST', '/api/forum', { content });
    el.value = '';
    role === 'teacher' ? loadTeacherForum() : loadStudentForum();
  } catch(e) { if (e.message !== 'TEACHER_BLOCKED') showToast('❌ ' + e.message); }
}

async function submitForumReply(postId, listId, inputId) {
  const el = document.getElementById(`reply-${postId}`);
  const content = el ? el.value.trim() : '';
  if (!content) return;
  try {
    await api('POST', `/api/forum/${postId}/replies`, { content });
    el.value = '';
    listId === 't-forum-list' ? loadTeacherForum() : loadStudentForum();
  } catch(e) { if (e.message !== 'TEACHER_BLOCKED') showToast('❌ ' + e.message); }
}

async function deleteForumPost(id, listId, inputId) {
  if (!confirm('Excluir esta publicação?')) return;
  try {
    await api('DELETE', `/api/forum/${id}`);
    listId === 't-forum-list' ? loadTeacherForum() : loadStudentForum();
  } catch(e) { showToast('❌ ' + e.message); }
}

async function deleteForumReply(id, listId, inputId) {
  if (!confirm('Excluir esta resposta?')) return;
  try {
    await api('DELETE', `/api/forum/replies/${id}`);
    listId === 't-forum-list' ? loadTeacherForum() : loadStudentForum();
  } catch(e) { showToast('❌ ' + e.message); }
}

// ══════════════════════════════════════════════════════════════
//  SUGGESTIONS
// ══════════════════════════════════════════════════════════════
async function submitSuggestion() {
  const el = document.getElementById('t-suggestion-input');
  const content = el.value.trim();
  if (!content) { showToast('⚠️ Escreva sua sugestão antes de enviar'); return; }
  try {
    await api('POST', '/api/suggestions', { content });
    el.value = '';
    showToast('✅ Sugestão enviada com sucesso!');
    loadTeacherSuggestions();
  } catch(e) { if (e.message !== 'TEACHER_BLOCKED') showToast('❌ ' + e.message); }
}

let _suggTab = 'pending';
async function loadAdminSuggestions(tab) {
  if (tab) _suggTab = tab;
  const suggestions = await api('GET', '/api/admin/suggestions').catch(() => []);
  const el = document.getElementById('adm-suggestions-list');
  refreshInboxBadges();

  const pending  = suggestions.filter(s => !s.adminReply);
  const historic = suggestions.filter(s =>  s.adminReply);
  const list     = _suggTab === 'pending' ? pending : historic;

  const tabs = `
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btn-sm" onclick="loadAdminSuggestions('pending')"
        style="${_suggTab==='pending' ? 'background:var(--navy);color:#fff' : ''}">
        Pendentes <span style="background:${pending.length?'#ef4444':'var(--g200)'};color:${pending.length?'#fff':'var(--g600)'};border-radius:99px;padding:0 7px;font-size:11px;font-weight:700">${pending.length}</span>
      </button>
      <button class="btn-sm" onclick="loadAdminSuggestions('history')"
        style="${_suggTab==='history' ? 'background:var(--navy);color:#fff' : ''}">
        Histórico <span style="background:var(--g200);color:var(--g600);border-radius:99px;padding:0 7px;font-size:11px;font-weight:700">${historic.length}</span>
      </button>
    </div>`;

  if (!list.length) {
    el.innerHTML = tabs + `<div class="card"><p class="empty">${_suggTab === 'pending' ? 'Nenhuma sugestão pendente.' : 'Nenhum histórico ainda.'}</p></div>`;
    return;
  }

  el.innerHTML = tabs + list.map(s => `
    <div class="card" style="margin-bottom:14px;${!s.read && !s.adminReply ? 'border-left:4px solid var(--navy)' : s.adminReply ? 'border-left:4px solid #22c55e' : ''}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:36px;height:36px;border-radius:50%;background:var(--g100);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">${(s.teacherName||'?').charAt(0)}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px">${escHtml(s.teacherName)}</div>
          <div style="font-size:12px;color:var(--g400)">${fmtTimeAgo(s.createdAt)} · ${s.adminReply ? '<span style="color:#16a34a;font-weight:600">✅ Respondida</span>' : s.read ? 'Lida' : '<strong style="color:var(--navy)">Nova</strong>'}</div>
        </div>
      </div>
      <p style="margin:0 0 12px;font-size:14px;color:var(--g700);line-height:1.6;white-space:pre-wrap">${escHtml(s.content)}</p>
      ${s.adminReply ? `
        <div style="background:#f0fdf4;border-radius:var(--r-sm);padding:12px 16px;border-left:3px solid #22c55e;margin-bottom:10px">
          <div style="font-size:11px;font-weight:700;color:#16a34a;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">✅ Sua resposta · ${fmtTimeAgo(s.adminRepliedAt)}</div>
          <p style="margin:0;font-size:14px;color:var(--g700);white-space:pre-wrap;line-height:1.6">${escHtml(s.adminReply)}</p>
        </div>` : ''}
      <div style="display:flex;gap:8px;align-items:flex-start;margin-top:4px">
        <textarea id="reply-input-${s.$loki}" rows="2" placeholder="${s.adminReply ? 'Atualizar resposta...' : 'Escrever resposta...'}" style="flex:1;padding:8px 12px;border:1.5px solid var(--g200);border-radius:var(--r-sm);font-family:'DM Sans',sans-serif;font-size:13px;resize:vertical"></textarea>
        <button class="btn-sm" style="margin-top:2px" onclick="replyToSuggestion(${s.$loki})">${s.adminReply ? 'Atualizar' : 'Responder'}</button>
      </div>
    </div>`).join('');
}

async function replyToSuggestion(id) {
  const input = document.getElementById(`reply-input-${id}`);
  const reply = input?.value.trim();
  if (!reply) { showToast('⚠️ Escreva uma resposta'); return; }
  try {
    await api('PUT', `/api/admin/suggestions/${id}/reply`, { reply });
    showToast('✅ Resposta enviada!');
    loadAdminSuggestions();
  } catch(e) { showToast('❌ ' + e.message); }
}

async function markSuggestionRead(id) {
  try {
    await api('PUT', `/api/admin/suggestions/${id}/read`);
    loadAdminSuggestions();
  } catch(e) { showToast('❌ ' + e.message); }
}

// ══════════════════════════════════════════════════════════════
//  TEACHER SELF-REGISTRATION
// ══════════════════════════════════════════════════════════════

function fmtCpf(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 9)      v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
  else if (v.length > 6) v = v.replace(/^(\d{3})(\d{3})(\d{0,3})/,        '$1.$2.$3');
  else if (v.length > 3) v = v.replace(/^(\d{3})(\d{0,3})/,               '$1.$2');
  input.value = v;
}

async function submitTeacherRegistration() {
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const whatsapp = document.getElementById('reg-whatsapp').value.trim();
  const password = document.getElementById('reg-password').value;

  if (!name)               { showToast('⚠️ Informe o nome completo'); return; }
  if (!email || !email.includes('@')) { showToast('⚠️ Informe um e-mail válido'); return; }
  if (!whatsapp)           { showToast('⚠️ Informe o WhatsApp'); return; }
  if (password.length < 4) { showToast('⚠️ A senha deve ter ao menos 4 caracteres'); return; }

  try {
    const r = await api('POST', '/api/auth/register-teacher', { name, email, whatsapp, password });
    document.getElementById('reg-success-login').textContent    = r.login;
    document.getElementById('reg-success-password').textContent = password;
    openModal('modal-registration-success');
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-whatsapp').value = '';
    document.getElementById('reg-password').value = '';
  } catch(e) { showToast('❌ ' + e.message); }
}

// ══════════════════════════════════════════════════════════════
//  TERMO DE USO — PRIMEIRO LOGIN
// ══════════════════════════════════════════════════════════════

function checkTermsAccepted() {
  if (ME && ME.termsAccepted === false) {
    openModal('modal-terms-of-use');
    // Init signature pad once modal is visible
    setTimeout(() => initSigPad('canvas-terms-sig'), 50);
  }
}

async function submitTermsAcceptance() {
  const cpf     = document.getElementById('terms-cpf')?.value.trim();
  const checked = document.getElementById('terms-agree-check')?.checked;

  if (!cpf || cpf.replace(/\D/g,'').length < 11) { showToast('⚠️ Informe um CPF válido'); return; }
  if (!checked) { showToast('⚠️ Marque que leu e concorda com os termos'); return; }

  const signature = getSigDataURL('canvas-terms-sig');
  if (!signature) { showToast('⚠️ Assine o termo antes de continuar'); return; }

  try {
    const r = await api('POST', '/api/teacher/accept-terms', { signature, cpf });
    ME.termsAccepted = true;
    ME.login = r.newLogin;
    closeModal('modal-terms-of-use');
    document.getElementById('new-login-display').textContent = r.newLogin;
    openModal('modal-new-login');
    loadTeacherBebraveContracts();
  } catch(e) { showToast('❌ ' + e.message); }
}
