'use strict';
const PDFDocument = require('pdfkit');

/**
 * generateContract(data) → Promise<Buffer>
 * data: { student_name, student_cpf, teacher_name, teacher_cpf,
 *         course, months, hours_per_week, price, payday,
 *         start_date, issued_date, contract_id,
 *         teacher_signature, student_signature }
 */
function generateContract(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 0,
      info: { Title: `Contrato — ${data.student_name || ''}`, Author: 'BeBrave Language Platform' },
    });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end',  ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;  // 595.28
    const H = doc.page.height; // 841.89

    const NAVY    = '#0f1b35';
    const NAVY2   = '#1a2d52';
    const BLUE    = '#3b6ef5';
    const GOLD    = '#c9a84c';
    const GOLD_LT = '#e8d5a3';
    const WHITE   = '#ffffff';
    const GRAY    = '#64748b';
    const RED     = '#E8381E';

    const ML = 48;
    const CW = W - ML * 2;

    // Background
    doc.rect(0, 0, W, H).fill(WHITE);

    // Gold stripes
    doc.rect(0, 0, W, 10).fill(GOLD);
    doc.rect(0, H - 10, W, 10).fill(GOLD);

    // Navy side bars
    doc.rect(0, 0, 6, H).fill(NAVY);
    doc.rect(W - 6, 0, 6, H).fill(NAVY);

    // Watermark
    doc.save();
    doc.opacity(0.04);
    doc.translate(W / 2, H / 2);
    doc.rotate(-45);
    doc.fontSize(90).fillColor(NAVY).font('Helvetica-Bold')
       .text('BeBrave', -160, -48, { width: 320, align: 'center' });
    doc.restore();

    let y = 18;

    // ── Logo header ──────────────────────────────────────────────
    doc.fontSize(22).font('Helvetica-Bold');
    doc.fillColor(BLUE).text('Be', ML, y, { continued: true });
    doc.fillColor(RED).text('Brave');
    doc.fontSize(7).fillColor(GRAY).font('Helvetica')
       .text('LANGUAGE TUTORING PLATFORM', ML, y + 26);

    if (data.contract_id) {
      doc.fontSize(7).fillColor(GRAY).font('Helvetica')
         .text(`ID: ${data.contract_id}`, ML, y + 5, { width: CW, align: 'right' });
    }

    y += 46;

    // Divider
    doc.moveTo(ML, y).lineTo(W - ML, y).lineWidth(1.5).strokeColor(GOLD).stroke();
    y += 10;

    // Title
    doc.fontSize(12).fillColor(NAVY).font('Helvetica-Bold')
       .text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS', ML, y, { width: CW, align: 'center' });
    y += 26;

    doc.moveTo(ML, y).lineTo(W - ML, y).lineWidth(0.5).strokeColor(GOLD_LT).stroke();
    y += 12;

    // ── Parties ──────────────────────────────────────────────────
    doc.fontSize(9).fillColor(NAVY).font('Helvetica-Bold').text('DAS PARTES', ML, y);
    y += 13;

    const party = (label, name, cpf) => {
      doc.fontSize(8).fillColor(NAVY).font('Helvetica-Bold').text(label, ML, y, { continued: true });
      doc.fillColor(GRAY).font('Helvetica').text(' ' + (name || ''));
      y += 12;
      doc.fontSize(8).fillColor(NAVY).font('Helvetica-Bold').text('CPF:', ML, y, { continued: true });
      doc.fillColor(GRAY).font('Helvetica').text(' ' + (cpf || '___.___.___-__'));
      y += 15;
    };
    party('CONTRATANTE (Aluno):', data.student_name || '', data.student_cpf || '');
    party('CONTRATADO(A) (Professor):', data.teacher_name || '', data.teacher_cpf || '');

    y += 4;
    doc.moveTo(ML, y).lineTo(W - ML, y).lineWidth(0.5).strokeColor(GOLD_LT).stroke();
    y += 12;

    // ── Clauses ──────────────────────────────────────────────────
    const clause = (num, title, text) => {
      doc.fontSize(9).fillColor(NAVY).font('Helvetica-Bold')
         .text(`Cláusula ${num}ª — ${title}`, ML, y);
      y += 12;
      doc.fontSize(8).fillColor(GRAY).font('Helvetica')
         .text(text, ML, y, { width: CW, align: 'justify' });
      y += doc.heightOfString(text, { width: CW, align: 'justify' }) + 10;
    };

    const course     = data.course         || 'inglês';
    const months     = data.months         || '—';
    const hoursWk    = data.hours_per_week || '—';
    const price      = data.price          || '—';
    const payday     = data.payday         || '—';
    const startDate  = data.start_date     || new Date().toLocaleDateString('pt-BR');
    const monthWord  = parseInt(months) === 1 ? 'mês' : 'meses';

    clause('1', 'DO OBJETO',
      `O presente contrato tem por objeto a prestação de serviços educacionais de tutoria de ${course} pela plataforma BeBrave Language Tutoring Platform, prestados pelo CONTRATANTE ao CONTRATADO(A), conforme condições estabelecidas neste instrumento.`);

    clause('2', 'DA VIGÊNCIA',
      `O presente contrato terá vigência de ${months} ${monthWord}, com início em ${startDate}, podendo ser renovado mediante acordo mútuo entre as partes, com antecedência mínima de 7 (sete) dias antes do término.`);

    clause('3', 'DA CARGA HORÁRIA',
      `As aulas serão realizadas com carga horária de ${hoursWk} hora(s) por semana, em dias e horários a serem acordados entre as partes, podendo ser ajustados mediante aviso prévio de 24 horas.`);

    clause('4', 'DO VALOR E FORMA DE PAGAMENTO',
      `O CONTRATADO(A) pagará ao CONTRATANTE a mensalidade de R$ ${price}, com vencimento no dia ${payday} de cada mês. O não pagamento no prazo poderá resultar na suspensão temporária do acesso à plataforma até a regularização.`);

    clause('5', 'DAS OBRIGAÇÕES DAS PARTES',
      `O CONTRATANTE compromete-se a ministrar as aulas conforme horários acordados, com qualidade e pontualidade. O CONTRATADO(A) compromete-se a cumprir os horários, efetuar os pagamentos nos prazos definidos e manter conduta ética e respeitosa durante todas as interações na plataforma.`);

    clause('6', 'DA PRIVACIDADE E DADOS PESSOAIS',
      `As informações pessoais compartilhadas neste contrato são utilizadas exclusivamente para fins de prestação dos serviços educacionais, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018). Ambas as partes concordam em não divulgar dados pessoais da outra parte a terceiros.`);

    y += 4;

    const issued = data.issued_date || new Date().toLocaleDateString('pt-BR');
    doc.fontSize(8).fillColor(GRAY).font('Helvetica')
       .text(`Brasil, ${issued}`, ML, y, { width: CW, align: 'center' });
    y += 20;

    // ── Signatures ───────────────────────────────────────────────
    const sigY = y + 48;
    const cx   = W / 2;
    const tX   = cx - 125;
    const sX   = cx + 125;

    const drawSig = (centerX, name, role, cpf, sigB64) => {
      if (sigB64 && sigB64.length > 100 && sigB64.includes('base64,')) {
        try {
          const buf = Buffer.from(sigB64.split('base64,')[1], 'base64');
          if (buf[0] === 0x89 && buf[1] === 0x50 && buf.length > 200) {
            doc.image(buf, centerX - 85, sigY - 46, { width: 170, height: 44, fit: [170, 44] });
          }
        } catch (_) {}
      }
      doc.moveTo(centerX - 100, sigY).lineTo(centerX + 100, sigY)
         .lineWidth(0.8).strokeColor(NAVY2).stroke();
      doc.fontSize(8).fillColor(NAVY).font('Helvetica-Bold')
         .text(name, centerX - 110, sigY + 6, { width: 220, align: 'center' });
      doc.fontSize(7).fillColor(GRAY).font('Helvetica')
         .text(role, centerX - 110, sigY + 18, { width: 220, align: 'center' });
      if (cpf) {
        doc.fontSize(7).fillColor(GRAY).font('Helvetica')
           .text(`CPF: ${cpf}`, centerX - 110, sigY + 30, { width: 220, align: 'center' });
      }
    };

    drawSig(tX, data.student_name || 'Aluno(a)',     'CONTRATANTE', data.student_cpf || '', data.student_signature || '');
    drawSig(sX, data.teacher_name || 'Professor(a)', 'CONTRATADO(A)', data.teacher_cpf || '', data.teacher_signature || '');

    doc.end();
  });
}

/**
 * generateTeacherContract(data) → Promise<Buffer>
 * data: { teacher_name, teacher_cpf, plan ('monthly'|'trial'),
 *         monthly_value, start_date, issued_date, contract_id,
 *         admin_signature, teacher_signature }
 */
function generateTeacherContract(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 0,
      info: { Title: `Contrato BeBrave — ${data.teacher_name || ''}`, Author: 'BeBrave Language Platform' },
    });
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end',  ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const H = doc.page.height;

    const NAVY    = '#0f1b35';
    const NAVY2   = '#1a2d52';
    const BLUE    = '#3b6ef5';
    const GOLD    = '#c9a84c';
    const GOLD_LT = '#e8d5a3';
    const WHITE   = '#ffffff';
    const GRAY    = '#64748b';
    const RED     = '#E8381E';

    const ML = 48;
    const CW = W - ML * 2;

    doc.rect(0, 0, W, H).fill(WHITE);
    doc.rect(0, 0, W, 10).fill(GOLD);
    doc.rect(0, H - 10, W, 10).fill(GOLD);
    doc.rect(0, 0, 6, H).fill(NAVY);
    doc.rect(W - 6, 0, 6, H).fill(NAVY);

    // Watermark
    doc.save();
    doc.opacity(0.04);
    doc.translate(W / 2, H / 2);
    doc.rotate(-45);
    doc.fontSize(90).fillColor(NAVY).font('Helvetica-Bold')
       .text('BeBrave', -160, -48, { width: 320, align: 'center' });
    doc.restore();

    let y = 18;

    // Logo
    doc.fontSize(22).font('Helvetica-Bold');
    doc.fillColor(BLUE).text('Be', ML, y, { continued: true });
    doc.fillColor(RED).text('Brave');
    doc.fontSize(7).fillColor(GRAY).font('Helvetica')
       .text('LANGUAGE TUTORING PLATFORM', ML, y + 26);
    if (data.contract_id) {
      doc.fontSize(7).fillColor(GRAY).font('Helvetica')
         .text(`ID: ${data.contract_id}`, ML, y + 5, { width: CW, align: 'right' });
    }
    y += 46;

    doc.moveTo(ML, y).lineTo(W - ML, y).lineWidth(1.5).strokeColor(GOLD).stroke();
    y += 10;

    doc.fontSize(12).fillColor(NAVY).font('Helvetica-Bold')
       .text('CONTRATO DE USO DE PLATAFORMA EDUCACIONAL', ML, y, { width: CW, align: 'center' });
    y += 26;
    doc.moveTo(ML, y).lineTo(W - ML, y).lineWidth(0.5).strokeColor(GOLD_LT).stroke();
    y += 12;

    // Parties
    doc.fontSize(9).fillColor(NAVY).font('Helvetica-Bold').text('DAS PARTES', ML, y);
    y += 13;

    const party = (label, name, cpf) => {
      doc.fontSize(8).fillColor(NAVY).font('Helvetica-Bold').text(label, ML, y, { continued: true });
      doc.fillColor(GRAY).font('Helvetica').text(' ' + (name || ''));
      y += 12;
      if (cpf) {
        doc.fontSize(8).fillColor(NAVY).font('Helvetica-Bold').text('CPF:', ML, y, { continued: true });
        doc.fillColor(GRAY).font('Helvetica').text(' ' + cpf);
        y += 15;
      } else { y += 3; }
    };
    party('CONTRATANTE (Professor):', data.teacher_name || '', data.teacher_cpf || '');
    party('CONTRATADO (Plataforma):', 'BeBrave Language Tutoring Platform', '');

    y += 4;
    doc.moveTo(ML, y).lineTo(W - ML, y).lineWidth(0.5).strokeColor(GOLD_LT).stroke();
    y += 12;

    // Clauses
    const clause = (num, title, text) => {
      doc.fontSize(9).fillColor(NAVY).font('Helvetica-Bold').text(`Cláusula ${num}ª — ${title}`, ML, y);
      y += 12;
      doc.fontSize(8).fillColor(GRAY).font('Helvetica').text(text, ML, y, { width: CW, align: 'justify' });
      y += doc.heightOfString(text, { width: CW, align: 'justify' }) + 10;
    };

    const startDate = data.start_date || new Date().toLocaleDateString('pt-BR');
    const isTrial   = data.plan === 'trial';
    const value     = data.monthly_value || '—';

    clause('1', 'DO OBJETO',
      'O presente contrato tem por objeto a licença de uso da plataforma BeBrave Language Tutoring Platform pelo CONTRATANTE, para fins de gerenciamento de aulas, alunos, materiais didáticos, certificados e contratos digitais.');

    clause('2', 'DA VIGÊNCIA',
      isTrial
        ? `O presente contrato terá vigência de 1 (um) mês a título de período de teste gratuito, com início em ${startDate}. Após o período de teste, o CONTRATANTE poderá optar pela contratação do plano mensal mediante aditivo contratual.`
        : `O presente contrato terá vigência por prazo indeterminado a partir de ${startDate}, podendo ser rescindido por qualquer das partes mediante aviso prévio de 30 (trinta) dias.`);

    clause('3', 'DO VALOR E FORMA DE PAGAMENTO',
      isTrial
        ? 'Durante o período de teste de 1 (um) mês, não haverá cobrança de qualquer valor pelo uso da plataforma. Findo o período de teste, caso o CONTRATANTE opte pela continuidade, será firmado novo contrato com as condições comerciais vigentes.'
        : `O CONTRATANTE pagará à plataforma BeBrave o valor mensal de R$ ${value} (mensalidade), a ser pago até o dia 10 (dez) de cada mês. O não pagamento no prazo acarretará a suspensão temporária do acesso à plataforma.`);

    clause('4', 'DAS OBRIGAÇÕES DO CONTRATANTE',
      'O CONTRATANTE compromete-se a: (a) utilizar a plataforma exclusivamente para fins educacionais lícitos; (b) manter a confidencialidade de suas credenciais de acesso; (c) não compartilhar o acesso com terceiros não autorizados; (d) respeitar os direitos dos alunos cadastrados na plataforma; (e) manter seus dados cadastrais atualizados.');

    clause('5', 'DAS OBRIGAÇÕES DA PLATAFORMA',
      'A BeBrave compromete-se a: (a) disponibilizar a plataforma com disponibilidade mínima de 99% ao mês; (b) manter a segurança e confidencialidade dos dados cadastrados; (c) prestar suporte técnico dentro do horário comercial; (d) notificar o CONTRATANTE com antecedência mínima de 30 dias sobre alterações nas condições de uso.');

    clause('6', 'DA PRIVACIDADE E PROTEÇÃO DE DADOS',
      'O tratamento de dados pessoais realizado pela plataforma BeBrave observa rigorosamente as disposições da Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018). Os dados cadastrados são utilizados exclusivamente para a prestação dos serviços contratados.');

    y += 4;
    const issued = data.issued_date || new Date().toLocaleDateString('pt-BR');
    doc.fontSize(8).fillColor(GRAY).font('Helvetica')
       .text(`Brasil, ${issued}`, ML, y, { width: CW, align: 'center' });
    y += 20;

    // Signatures
    const sigY = y + 48;
    const cx   = W / 2;
    const tX   = cx - 125;
    const sX   = cx + 125;

    const drawSig = (centerX, name, role, cpf, sigB64) => {
      if (sigB64 && sigB64.length > 100 && sigB64.includes('base64,')) {
        try {
          const buf = Buffer.from(sigB64.split('base64,')[1], 'base64');
          if (buf[0] === 0x89 && buf[1] === 0x50 && buf.length > 200) {
            doc.image(buf, centerX - 85, sigY - 46, { width: 170, height: 44, fit: [170, 44] });
          }
        } catch (_) {}
      }
      doc.moveTo(centerX - 100, sigY).lineTo(centerX + 100, sigY)
         .lineWidth(0.8).strokeColor(NAVY2).stroke();
      doc.fontSize(8).fillColor(NAVY).font('Helvetica-Bold')
         .text(name, centerX - 110, sigY + 6, { width: 220, align: 'center' });
      doc.fontSize(7).fillColor(GRAY).font('Helvetica')
         .text(role, centerX - 110, sigY + 18, { width: 220, align: 'center' });
      if (cpf) {
        doc.fontSize(7).fillColor(GRAY).font('Helvetica')
           .text(`CPF: ${cpf}`, centerX - 110, sigY + 30, { width: 220, align: 'center' });
      }
    };

    drawSig(tX, data.teacher_name || 'Professor(a)', 'CONTRATANTE', data.teacher_cpf || '', data.teacher_signature || '');
    drawSig(sX, 'BeBrave Platform', 'CONTRATADO', '', data.admin_signature || '');

    doc.end();
  });
}

module.exports = { generateContract, generateTeacherContract };
