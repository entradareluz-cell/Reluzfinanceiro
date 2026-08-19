
/**
 * RELUZ FINANCEIRO
 * Google Sheets + Google Apps Script API
 *
 * A planilha é o banco de dados.
 * O Firebase Authentication continua sendo usado somente para login.
 */

const CONFIG = {
  SPREADSHEET_ID: "", // vazio = planilha à qual este script está vinculado
  TIMEZONE: "America/Sao_Paulo"
};

const TABLES = {
  LANCAMENTOS: "LANCAMENTOS",
  CATEGORIAS: "CATEGORIAS",
  CONTAS: "CONTAS",
  CARTOES: "CARTOES",
  RECORRENTES: "RECORRENTES",
  METAS: "METAS",
  TAXAS: "TAXAS",
  USUARIOS: "USUARIOS",
  SUBCATEGORIAS: "SUBCATEGORIAS",
  RECEBIMENTOS: "RECEBIMENTOS",
  PARCELAS: "PARCELAS",
  CLIENTES: "CLIENTES",
  FORNECEDORES: "FORNECEDORES",
  CENTROS_CUSTO: "CENTROS_CUSTO",
  PROJETOS: "PROJETOS",
  PEDIDOS: "PEDIDOS",
  AUDITORIA: "AUDITORIA"
};

const INITIAL_HEADERS = {
  LANCAMENTOS: ["id","user_id","type","amount","original_amount","remaining_amount","transaction_date","competence_date","paid_date","category_id","subcategory","account_id","card_id","payment_method","status","name","description","notes","dre_class","attachment_url","recurrence","group_id","payment_parts","payment_received_amount","payment_fee_total","metal_value","initial_kg","final_kg","category_name","fee_percent","installment_number","installment_total","rate_id","transfer_group_id","created_at","updated_at"],
  CATEGORIAS: ["id","user_id","name","type","active","created_at","updated_at"],
  CONTAS: ["id","user_id","name","type","initial_balance","active","created_at","updated_at"],
  CARTOES: ["id","user_id","name","limit_amount","closing_day","due_day","last4","machine_fee_percent","active","created_at","updated_at"],
  TAXAS: ["id","user_id","name","credit_percent","debit_percent","pix_percent","active","created_at","updated_at"],
  RECORRENTES: ["id","user_id","type","description","amount","category_id","due_day","start_date","end_date","active","created_at","updated_at"],
  METAS: ["id","user_id","name","target_amount","current_amount","deadline","status","created_at","updated_at"],
  USUARIOS: ["id","user_id","name","email","password_hash","perfil","ativo","created_at","updated_at"],
  SUBCATEGORIAS: ["id","user_id","category_id","name","active","created_at","updated_at"],
  RECEBIMENTOS: ["id","lancamento_id","user_id","method","amount","card_id","installments","fee_percent","fee_value","net_amount","rate_id","date","notes","created_at"],
  PARCELAS: ["id","lancamento_id","user_id","installment_number","installment_total","transaction_date","competence_date","paid_date","amount","original_amount","fee_percent","payment_fee_total","status","account_id","card_id","created_at","updated_at"],
  CLIENTES: ["id","user_id","name","cpf_cnpj","phone","email","active","created_at","updated_at"],
  FORNECEDORES: ["id","user_id","name","cpf_cnpj","phone","email","active","created_at","updated_at"],
  CENTROS_CUSTO: ["id","user_id","name","code","budget","active","created_at","updated_at"],
  PROJETOS: ["id","user_id","name","client_id","budget","start_date","end_date","status","notes","created_at","updated_at"],
  PEDIDOS: ["id","user_id","lancamento_id","client_id","name","amount","metal_value","initial_kg","final_kg","created_at","updated_at"],
  AUDITORIA: ["id","user_id","action","table_name","record_id","data","date"]
};

function ss_() {
  return CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function now_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
}

function normalizeEmail_(email) {
  return String(email || "").trim().toLowerCase();
}

function today_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
}

function dateOnly_(value) {
  if (value === null || value === undefined || value === "") return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, CONFIG.TIMEZONE, "yyyy-MM-dd");
  }
  const s=String(value).trim();
  if (!s) return "";
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1]+"-"+("0"+m[2]).slice(-2)+"-"+("0"+m[3]).slice(-2);
  m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3]+"-"+("0"+m[2]).slice(-2)+"-"+("0"+m[1]).slice(-2);
  const d=new Date(s);
  return isNaN(d.getTime()) ? s : Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM-dd");
}

function id_() {
  return Utilities.getUuid();
}

// Identidade principal do usuário: o e-mail normalizado.
// Mantemos UUID como fallback para registros que não pertencem a usuário.
function userId_(email) {
  const clean = normalizeEmail_(email);
  return clean || id_();
}

function userKeys_(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const keys = [uid];
  // Compatibilidade com contas antigas cujo id ainda era UUID.
  try {
    const u = findUserByEmail_(uid);
    if (u) {
      const legacy = String(u.id || '').trim();
      const email = normalizeEmail_(u.email);
      if (email && !keys.includes(email)) keys.push(email);
      if (legacy && !keys.includes(legacy)) keys.push(legacy);
    }
  } catch (e) {}
  return keys;
}


function findUserByEmail_(email) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean) return null;
  const users = list_(TABLES.USUARIOS, "");
  return users.find(u => String(u.email || "").trim().toLowerCase() === clean) || null;
}

function publicUser_(u) {
  if (!u) return null;
  return {
    uid: normalizeEmail_(u.email) || String(u.id || u.user_id || ""),
    displayName: String(u.name || ""),
    email: String(u.email || ""),
    perfil: String(u.perfil || "usuario"),
    ativo: u.ativo !== false && String(u.ativo).toLowerCase() !== "false"
  };
}

function login_(email, passwordHash) {
  const u = findUserByEmail_(email);
  if (!u || !u.password_hash || String(u.password_hash) !== String(passwordHash || "")) {
    throw new Error("E-mail ou senha incorretos.");
  }
  if (u.ativo === false || String(u.ativo).toLowerCase() === "false") {
    throw new Error("Usuário inativo.");
  }
  return publicUser_(u);
}

function signup_(email, name, passwordHash) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean || !clean.includes("@")) throw new Error("E-mail inválido.");
  if (!passwordHash) throw new Error("Senha obrigatória.");
  if (findUserByEmail_(clean)) throw new Error("Este e-mail já está cadastrado.");
  const uid = userId_(clean);
  const user = create_(TABLES.USUARIOS, {
    id: uid,
    user_id: uid,
    name: String(name || clean.split("@")[0]).trim(),
    email: clean,
    password_hash: String(passwordHash),
    perfil: "usuario",
    ativo: true
  });
  const defaultCategories = [
    ["Salário","entrada"],["Extra","entrada"],["Reembolso","entrada"],["Outros recebimentos","entrada"],
    ["Casa","saida"],["Mercado","saida"],["Alimentação","saida"],["Carro","saida"],["Combustível","saida"],
    ["Contas","saida"],["Celular/Internet","saida"],["Cartão","saida"],["Lazer","saida"],["Compras","saida"],
    ["Pets","saida"],["Família","saida"],["Investimentos","saida"],["Outros","saida"]
  ];
  defaultCategories.forEach(([n,t]) => create_(TABLES.CATEGORIAS, {
    user_id: uid, name:n, type:t, active:true
  }));
  return publicUser_(user);
}

function out_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function input_(e) {
  try {
    if (e && e.postData && e.postData.contents) return JSON.parse(e.postData.contents);
  } catch (err) {}
  return e && e.parameter ? e.parameter : {};
}

function sheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function headers_(sh) {
  if (sh.getLastColumn() === 0) return [];
  return sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
}

function ensureHeaders_(sh, required) {
  let h = headers_(sh);
  if (!h.length || h.every(x => !x)) {
    sh.getRange(1,1,1,required.length).setValues([required]);
    sh.setFrozenRows(1);
    h = required.slice();
  }
  const missing = required.filter(x => !h.includes(x));
  if (missing.length) {
    sh.getRange(1,h.length+1,1,missing.length).setValues([missing]);
    h = h.concat(missing);
  }
  return h;
}

function ensureForRecord_(sh, record) {
  let h = headers_(sh);
  if (!h.length || h.every(x => !x)) {
    h = ["id"].concat(Object.keys(record).filter(k => k !== "id"));
    sh.getRange(1,1,1,h.length).setValues([h]);
    sh.setFrozenRows(1);
  } else {
    const missing = Object.keys(record).filter(k => !h.includes(k));
    if (missing.length) {
      sh.getRange(1,h.length+1,1,missing.length).setValues([missing]);
      h = h.concat(missing);
    }
  }
  return h;
}

function rows_(sh) {
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(1,1,sh.getLastRow(),sh.getLastColumn()).getValues();
}

function recordFromRow_(h,row) {
  const o = {};
  h.forEach((k,i) => {
    let v = row[i] === undefined ? "" : row[i];
    // Campos estruturados são armazenados como JSON dentro de uma célula.
    // Isso permite que múltiplas formas de pagamento continuem funcionando
    // depois de sair do Firebase e passar a usar o Google Sheets.
    if (k === "payment_parts" && typeof v === "string" && v.trim()) {
      try { v = JSON.parse(v); } catch (_) {}
    }
    o[k] = v;
  });
  return o;
}

function cellValue_(v) {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v) || (typeof v === "object" && !(v instanceof Date))) {
    return JSON.stringify(v);
  }
  return v;
}

function list_(sheetName, userId) {
  const sh = sheet_(sheetName);
  const values = rows_(sh);
  if (values.length <= 1) return [];
  const h = values[0].map(String);
  return values.slice(1)
    .filter(r => r.some(v => v !== ""))
    .map(r => recordFromRow_(h,r))
    .filter(r => !userId || !("user_id" in r) || userKeys_(userId).some(k => String(r.user_id) === String(k)));
}

function find_(sheetName,id) {
  const sh = sheet_(sheetName);
  const values = rows_(sh);
  if (values.length <= 1) return null;
  const h = values[0].map(String);
  const ix = h.indexOf("id");
  if (ix < 0) return null;
  for (let i=1;i<values.length;i++) {
    if (String(values[i][ix]) === String(id)) return recordFromRow_(h,values[i]);
  }
  return null;
}

function create_(sheetName,record) {
  const sh = sheet_(sheetName);
  const rec = Object.assign({}, record || {});
  if (rec.user_id) rec.user_id = normalizeEmail_(rec.user_id) || String(rec.user_id);
  if (!rec.id) rec.id = id_();
  if (!rec.created_at) rec.created_at = now_();
  rec.updated_at = now_();
  const h = ensureForRecord_(sh,rec);
  sh.appendRow(h.map(k => cellValue_(rec[k])));
  return rec;
}

function update_(sheetName,id,record) {
  const sh = sheet_(sheetName);
  const values = rows_(sh);
  if (values.length <= 1) throw new Error("Registro não encontrado.");
  const h = ensureForRecord_(sh,Object.assign({id:id},record||{}));
  const idIx = h.indexOf("id");
  for (let i=1;i<values.length;i++) {
    if (String(values[i][idIx]) === String(id)) {
      const current = recordFromRow_(h,values[i]);
      const merged = Object.assign({},current,record||{},{id:id,updated_at:now_()});
      sh.getRange(i+1,1,1,h.length).setValues([h.map(k => cellValue_(merged[k]))]);
      return merged;
    }
  }
  throw new Error("Registro não encontrado.");
}

function upsert_(sheetName,id,record) {
  const found = find_(sheetName,id);
  return found ? update_(sheetName,id,record) : create_(sheetName,Object.assign({},record,{id:id}));
}

function delete_(sheetName,id) {
  const sh = sheet_(sheetName);
  const values = rows_(sh);
  if (values.length <= 1) throw new Error("Registro não encontrado.");
  const h = values[0].map(String);
  const ix = h.indexOf("id");
  for (let i=1;i<values.length;i++) {
    if (String(values[i][ix]) === String(id)) {
      sh.deleteRow(i+1);
      return {success:true,id:id};
    }
  }
  throw new Error("Registro não encontrado.");
}

function setupDatabase() {
  const ss = ss_();
  Object.keys(TABLES).forEach(k => {
    const name = TABLES[k];
    const sh = sheet_(name);
    ensureHeaders_(sh, INITIAL_HEADERS[name] || ["id","user_id","created_at","updated_at"]);
    if (sh.getLastColumn()) sh.getRange(1,1,1,sh.getLastColumn()).setFontWeight("bold");
    sh.setFrozenRows(1);
  });
  return {success:true,message:"Banco do Reluz Financeiro criado/atualizado."};
}

function removeDuplicateCategories_(userId) {
  const sh = sheet_(TABLES.CATEGORIAS);
  const values = rows_(sh);
  if (values.length <= 1) return {removed:0};
  const h = values[0].map(String);
  const ui=h.indexOf("user_id"), ni=h.indexOf("name"), ti=h.indexOf("type");
  const seen={}, del=[];
  for(let i=1;i<values.length;i++){
    if(userId && ui>=0 && String(values[i][ui])!==String(userId)) continue;
    const key=String(values[i][ni]||"").trim().toLowerCase()+"::"+String(values[i][ti]||"").trim().toLowerCase();
    if(seen[key]) del.push(i+1); else seen[key]=true;
  }
  del.sort((a,b)=>b-a).forEach(r=>sh.deleteRow(r));
  return {removed:del.length};
}

function dashboard_(userId) {
  const tx=list_(TABLES.LANCAMENTOS,userId);
  let entradas=0,saidas=0;
  tx.forEach(t=>{
    const v=Math.abs(Number(t.amount)||0);
    if(["entrada","income","receita"].includes(String(t.type||"").toLowerCase())) entradas+=v;
    if(["saida","expense","despesa"].includes(String(t.type||"").toLowerCase())) saidas+=v;
  });
  return {saldo:entradas-saidas,entradas,saidas,resultado:entradas-saidas,quantidadeLancamentos:tx.length};
}

function dre_(userId) {
  const tx=list_(TABLES.LANCAMENTOS,userId);
  let receitaBruta=0,deducoes=0,custos=0,despesasOperacionais=0,despesasFinanceiras=0,investimentos=0;
  tx.forEach(t=>{
    const v=Math.abs(Number(t.amount)||0);
    const type=String(t.type||"").toLowerCase();
    const c=String(t.dre_class||"").toLowerCase();
    if(c==="deducao_receita") { deducoes+=v; return; }
    if(["entrada","income","receita"].includes(type)) receitaBruta+=v;
    if(["saida","expense","despesa"].includes(type)){
      if(c==="custo") custos+=v;
      else if(c==="despesa_financeira") despesasFinanceiras+=v;
      else if(c==="investimento") investimentos+=v;
      else despesasOperacionais+=v;
    }
  });
  const receitaLiquida=receitaBruta-deducoes;
  const resultadoOperacional=receitaLiquida-custos-despesasOperacionais;
  return {receitaBruta,deducoes,receitaLiquida,custos,despesasOperacionais,resultadoOperacional,despesasFinanceiras,resultadoLiquido:resultadoOperacional-despesasFinanceiras,investimentos};
}

function search_(userId,q) {
  q=String(q||"").trim().toLowerCase();
  if(!q)return [];
  const names=[TABLES.LANCAMENTOS,TABLES.CATEGORIAS,TABLES.CONTAS,TABLES.CARTOES,TABLES.CLIENTES,TABLES.FORNECEDORES,TABLES.PROJETOS];
  const out=[];
  names.forEach(name=>list_(name,userId).forEach(r=>{
    if(Object.values(r).join(" ").toLowerCase().includes(q)) out.push({tabela:name,registro:r});
  }));
  return out;
}


function normalizePaymentParts_(parts) {
  if (Array.isArray(parts)) return parts;
  if (typeof parts === "string" && parts.trim()) {
    try {
      const parsed = JSON.parse(parts);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {}
  }
  return [];
}

function replacePaymentChildren_(userId, transactionId, transaction, payments) {
  const uid = normalizeEmail_(userId) || String(userId || "");
  list_(TABLES.RECEBIMENTOS, uid)
    .filter(r => String(r.lancamento_id) === String(transactionId))
    .forEach(r => delete_(TABLES.RECEBIMENTOS, r.id));
  list_(TABLES.PARCELAS, uid)
    .filter(r => String(r.lancamento_id) === String(transactionId))
    .forEach(r => delete_(TABLES.PARCELAS, r.id));

  const parts = normalizePaymentParts_(payments);
  let totalReceived = 0, totalFee = 0;
  parts.forEach(payment => {
    const amount = Number(payment.amount) || 0;
    const feePercent = Number(payment.fee_percent) || 0;
    const fee = amount * feePercent / 100;
    totalReceived += amount; totalFee += fee;
    create_(TABLES.RECEBIMENTOS, {
      id:id_(), lancamento_id:transactionId, user_id:uid,
      method:payment.method || payment.payment_method || "", amount:amount,
      card_id:payment.card_id || "", installments:Number(payment.installments)||1,
      fee_percent:feePercent, fee_value:fee, net_amount:amount-fee,
      rate_id:payment.rate_id || "", date:payment.date || transaction.transaction_date || today_(),
      notes:payment.notes || "", created_at:now_()
    });
    const totalInstallments = Math.max(1, Number(payment.installments)||1);
    if (totalInstallments > 1) {
      const installmentAmount = amount / totalInstallments;
      for (let i=1;i<=totalInstallments;i++) {
        const installmentDate = addMonths_(payment.date || transaction.transaction_date || today_(), i-1);
        create_(TABLES.PARCELAS, {
          id:id_(), lancamento_id:transactionId, user_id:uid,
          installment_number:i, installment_total:totalInstallments,
          transaction_date:installmentDate, competence_date:installmentDate, paid_date:"",
          amount:installmentAmount, original_amount:installmentAmount,
          fee_percent:feePercent, payment_fee_total:installmentAmount*feePercent/100,
          status:"pendente", account_id:payment.account_id || transaction.account_id || "",
          card_id:payment.card_id || "", created_at:now_(), updated_at:now_()
        });
      }
    }
  });
  return {totalReceived,totalFee,parts};
}

function updateTransaction_(userId, id, record) {
  const current = assertOwned_(TABLES.LANCAMENTOS, id, normalizeEmail_(userId));
  const patch = Object.assign({}, record || {});
  delete patch.user_id;

  if (patch.amount !== undefined) patch.amount = Number(patch.amount) || 0;
  if (patch.original_amount !== undefined) patch.original_amount = Number(patch.original_amount) || 0;
  if (patch.payment_received_amount !== undefined) patch.payment_received_amount = Number(patch.payment_received_amount) || 0;
  if (patch.payment_fee_total !== undefined) patch.payment_fee_total = Number(patch.payment_fee_total) || 0;

  if (patch.transaction_date) patch.transaction_date = dateOnly_(patch.transaction_date);
  if (patch.competence_date) patch.competence_date = dateOnly_(patch.competence_date);
  if (patch.paid_date) patch.paid_date = dateOnly_(patch.paid_date);

  const original =
    Number(patch.original_amount || current.original_amount || patch.amount || current.amount || 0) || 0;

  if (original <= 0) throw new Error("Valor do lançamento deve ser maior que zero.");

  if (patch.payment_parts !== undefined) {
    const parts = normalizePaymentParts_(patch.payment_parts);
    const child = replacePaymentChildren_(userId, id, Object.assign({}, current, patch), parts);

    if (child.totalReceived > original + 0.01) {
      throw new Error("A soma dos pagamentos não pode ultrapassar o valor do lançamento.");
    }

    patch.payment_parts = parts;
    patch.payment_received_amount = child.totalReceived;
    patch.payment_fee_total = child.totalFee;
    patch.original_amount = original;
    patch.remaining_amount = Math.max(0, original - child.totalReceived);
    patch.status = patch.remaining_amount <= 0.01 ? "pago" : "parcial";
  } else {
    const status = String(patch.status || current.status || "").toLowerCase();
    if (status === "pendente") {
      patch.payment_received_amount = 0;
    } else if (status === "parcial") {
      patch.payment_received_amount = Math.min(
        original,
        Number(patch.payment_received_amount ?? current.payment_received_amount) || 0
      );
    } else {
      patch.payment_received_amount = original;
      patch.status = "pago";
    }
    patch.original_amount = original;
    patch.remaining_amount = Math.max(0, original - patch.payment_received_amount);
    if (patch.remaining_amount <= 0.01) {
      patch.remaining_amount = 0;
      patch.status = "pago";
      patch.payment_received_amount = original;
    }
  }

  return update_(TABLES.LANCAMENTOS, id, patch);
}

function saveMultiplePayments_(userId, transaction, payments, dedupeKey) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const uid = String(userId || '').trim();
    if (!uid) throw new Error('Usuário não informado.');
    if (!Array.isArray(payments) || !payments.length) throw new Error('Nenhuma forma de pagamento informada.');
    const key = String(dedupeKey || '').trim();
    if (!key) throw new Error('Chave de segurança não informada.');

    const existing = list_(TABLES.LANCAMENTOS, uid);
    const duplicate = existing.find(r => String(r.dedupe_key || '') === key);
    if (duplicate) return {duplicate:true, id:duplicate.id, data:[duplicate]};

    const transactionId = transaction.id || id_();
    const total = Number(transaction.amount) || 0;
    if (total <= 0) throw new Error('Valor do lançamento deve ser maior que zero.');

    let totalReceived = 0;
    let totalFee = 0;
    payments.forEach(p => {
      const amount = Number(p.amount) || 0;
      if (amount < 0) throw new Error("Valor de pagamento não pode ser negativo.");
      const feePercent = Number(p.fee_percent) || 0;
      totalReceived += amount;
      totalFee += amount * feePercent / 100;
    });

    if (totalReceived > total) throw new Error("A soma dos pagamentos não pode ultrapassar o valor do lançamento.");
    const remainingAmount = Math.max(0, total - totalReceived);
    const main = create_(TABLES.LANCAMENTOS, Object.assign({}, transaction, {
      id: transactionId,
      user_id: uid,
      amount: total,
      original_amount: Number(transaction.original_amount || total),
      payment_parts: payments,
      payment_received_amount: totalReceived,
      payment_fee_total: totalFee,
      remaining_amount: remainingAmount,
      status: transaction.status || (remainingAmount > 0 ? "parcial" : "pago"),
      dedupe_key: key
    }));

    const received = [];
    payments.forEach(payment => {
      const amount = Number(payment.amount) || 0;
      const feePercent = Number(payment.fee_percent) || 0;
      const fee = amount * feePercent / 100;
      received.push(create_(TABLES.RECEBIMENTOS, {
        id:id_(),
        lancamento_id:transactionId,
        user_id:uid,
        method:payment.method || payment.payment_method || '',
        amount:amount,
        card_id:payment.card_id || '',
        installments:Number(payment.installments) || 1,
        fee_percent:feePercent,
        fee_value:fee,
        net_amount:amount-fee,
        rate_id:payment.rate_id || '',
        date:payment.date || transaction.transaction_date || '',
        notes:payment.notes || '',
        created_at:now_()
      }));
    });

    const installments = [];
    payments.forEach(payment => {
      const totalInstallments = Math.max(1, Number(payment.installments) || 1);
      if (totalInstallments <= 1) return;
      const amount = Number(payment.amount) || 0;
      const installmentAmount = amount / totalInstallments;
      const feePercent = Number(payment.fee_percent) || 0;
      for (let i=1; i<=totalInstallments; i++) {
        const installmentDate = addMonths_(payment.date || transaction.transaction_date || now_(), i-1);
        installments.push(create_(TABLES.PARCELAS, {
          id:id_(),
          lancamento_id:transactionId,
          user_id:uid,
          installment_number:i,
          installment_total:totalInstallments,
          transaction_date:installmentDate,
          competence_date:installmentDate,
          paid_date:'',
          amount:installmentAmount,
          original_amount:installmentAmount,
          fee_percent:feePercent,
          payment_fee_total:installmentAmount*feePercent/100,
          status:'pendente',
          account_id:payment.account_id || transaction.account_id || '',
          card_id:payment.card_id || '',
          created_at:now_(),
          updated_at:now_()
        }));
      }
    });

    return {duplicate:false, transaction:main, recebimentos:received, parcelas:installments};
  } finally {
    lock.releaseLock();
  }
}

function addMonths_(dateValue, months) {
  const raw = String(dateValue || "").trim();
  const m = Number(months || 0);

  if (!raw) return today_();

  // Datas YYYY-MM-DD são tratadas como calendário, evitando deslocamentos
  // de fuso horário do navegador.
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const y = Number(match[1]), month = Number(match[2]) - 1, day = Number(match[3]);
    const d = new Date(Date.UTC(y, month, 1));
    d.setUTCMonth(d.getUTCMonth() + m);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
    return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }

  const d = new Date(raw);
  if (isNaN(d.getTime())) return today_();
  d.setMonth(d.getMonth() + m);
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}


/* ===== SEGURANÇA ETAPA 2 — integração incremental ===== */
function authSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("RELUZ_AUTH_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty("RELUZ_AUTH_SECRET", secret);
  }
  return secret;
}
function b64e_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.newBlob(String(text)).getBytes()).replace(/=+$/g,"");
}
function b64d_(text) {
  const s=String(text||"");
  const pad=s+"=".repeat((4-(s.length%4))%4);
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(pad)).getDataAsString();
}
function sign_(text) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(String(text), authSecret_())
  ).replace(/=+$/g,"");
}
function createSessionToken_(user) {
  const payload={
    uid: normalizeEmail_(user.email) || String(user.id||""),
    email: normalizeEmail_(user.email),
    perfil: String(user.perfil||"usuario"),
    exp: Date.now()+7*24*60*60*1000
  };
  const body=b64e_(JSON.stringify(payload));
  return body+"."+sign_(body);
}
function verifySession_(token) {
  const raw=String(token||"").trim();
  if(!raw) throw new Error("Sessão ausente. Faça login novamente.");
  const p=raw.split(".");
  if(p.length!==2 || sign_(p[0])!==p[1]) throw new Error("Sessão inválida. Faça login novamente.");
  let payload;
  try { payload=JSON.parse(b64d_(p[0])); } catch(e) { throw new Error("Sessão inválida. Faça login novamente."); }
  if(!payload.email || !payload.uid || Number(payload.exp||0)<Date.now()) throw new Error("Sessão expirada. Faça login novamente.");
  const u=findUserByEmail_(payload.email);
  if(!u || String(u.ativo).toLowerCase()==="false") throw new Error("Usuário inativo ou inexistente.");
  return {uid:normalizeEmail_(u.email)||String(u.id||""),email:normalizeEmail_(u.email),perfil:String(u.perfil||"usuario")};
}
function requireAuth_(p){ return verifySession_(p && p.session_token); }
function assertSheet_(sheetName){
  const n=String(sheetName||"").trim().toUpperCase();
  if(!Object.values(TABLES).includes(n)) throw new Error("Tabela não autorizada.");
  return n;
}
function assertOwned_(sheetName,id,uid){
  const n=assertSheet_(sheetName);
  const r=find_(n,id);
  if(!r) throw new Error("Registro não encontrado.");
  if(!r.user_id || !userKeys_(uid).some(k=>String(r.user_id)===String(k))) throw new Error("Acesso negado ao registro.");
  return r;
}
function assertWritable_(sheetName,auth){
  const n=assertSheet_(sheetName);
  if([TABLES.USUARIOS,TABLES.AUDITORIA].includes(n) && String(auth.perfil).toLowerCase()!=="admin")
    throw new Error("Esta tabela é protegida.");
  return n;
}
function audit_(uid,action,tableName,recordId,data){
  try{
    create_(TABLES.AUDITORIA,{
      id:id_(), user_id:normalizeEmail_(uid)||String(uid||""),
      action:String(action||""), table_name:String(tableName||""),
      record_id:String(recordId||""), data:JSON.stringify(data||{}), date:now_()
    });
  }catch(e){ console.error("Falha na auditoria:",e); }
}
function hasAnyUser_(){
  try { return list_(TABLES.USUARIOS,"").length>0; } catch(e) { return false; }
}
function setupAuthorized_(auth){
  if(auth && String(auth.perfil||"").toLowerCase()==="admin") return true;
  return !hasAnyUser_();
}
/* ===== FIM SEGURANÇA ===== */

function doGet(e) {
  try {
    const p=input_(e), action=p.action||"health";
    if(action==="health") return out_({success:true,message:"RELUZ FINANCEIRO API — Google Sheets funcionando.",time:now_()});
    if(action==="login"){
      const user=login_(p.email,p.password_hash);
      return out_({success:true,data:{user,session_token:createSessionToken_(user)}});
    }
    if(action==="signup"){
      const user=signup_(p.email,p.name,p.password_hash);
      return out_({success:true,data:{user,session_token:createSessionToken_(user)}});
    }
    const auth=requireAuth_(p), uid=auth.uid;
    if(action==="initial_load"){
      return out_({success:true,data:initialLoad_(uid)});
    }
    if(action==="list") return out_({success:true,data:list_(p.sheet,uid)});
    if(action==="get") return out_({success:true,data:assertOwned_(p.sheet,p.id,uid)});
    if(action==="dashboard") return out_({success:true,data:dashboard_(uid)});
    if(action==="dre") return out_({success:true,data:dre_(uid)});
    if(action==="search") return out_({success:true,data:search_(uid,p.q)});
    return out_({success:false,error:"Ação não reconhecida."});
  } catch(err) { return out_({success:false,error:String(err.message||err)}); }
}

function initialLoad_(userId) {
  const uid=String(userId||"");
  const names={
    categories:TABLES.CATEGORIAS,
    accounts:TABLES.CONTAS,
    cards:TABLES.CARTOES,
    recurring:TABLES.RECORRENTES,
    goals:TABLES.METAS,
    transactions:TABLES.LANCAMENTOS,
    machine_rates:TABLES.TAXAS
  };
  const result={};
  Object.keys(names).forEach(k=>{
    result[k]=list_(names[k],uid);
  });
  return result;
}

function doPost(e) {
  try {
    const p=input_(e), action=p.action;
    if(action==="health") return out_({success:true,message:"RELUZ FINANCEIRO API — Google Sheets funcionando.",time:now_()});
    if(action==="login"){
      const user=login_(p.email,p.password_hash);
      return out_({success:true,data:{user,session_token:createSessionToken_(user)}});
    }
    if(action==="signup"){
      const user=signup_(p.email,p.name,p.password_hash);
      return out_({success:true,data:{user,session_token:createSessionToken_(user)}});
    }

    const auth=requireAuth_(p), uid=auth.uid;

    if(action==="setup"){
      if(!setupAuthorized_(auth)) throw new Error("Apenas administradores podem inicializar/atualizar o banco.");
      return out_(setupDatabase());
    }
    if(action==="list") return out_({success:true,data:list_(p.sheet,uid)});
    if(action==="get") return out_({success:true,data:assertOwned_(p.sheet,p.id,uid)});
    if(action==="save_transaction") return out_({success:true,data:saveTransaction_(uid,p.record||{},p.dedupe_key||"")});
    if(action==="save_transactions") return out_(Object.assign({success:true},saveTransactions_(uid,p.dedupe_key||"",p.rows||[])));
    if(action==="save_multiple_payments") return out_(Object.assign({success:true},saveMultiplePayments_(uid,p.transaction||{},p.payments||[],p.dedupe_key||"")));

    if(action==="create"){
      const sheet=assertWritable_(p.sheet,auth);
      const record=Object.assign({},p.record||{},{user_id:uid}); delete record.id;
      const created=create_(sheet,record);
      audit_(uid,"create",sheet,created.id,created);
      return out_({success:true,data:created});
    }
    if(action==="update_simple_transaction"){
      const sheet=TABLES.LANCAMENTOS;
      const id=String(p.id||"").trim();
      if(!id) throw new Error("ID do lançamento não informado.");
      assertOwned_(sheet,id,uid);
      const record=Object.assign({},p.record||{});
      delete record.user_id;
      delete record.id;
      const data=update_(sheet,id,record);
      audit_(uid,"update",sheet,id,data);
      return out_({success:true,data:data});
    }
    if(action==="update"){
      const sheet=assertWritable_(p.sheet,auth);
      assertOwned_(sheet,p.id,uid);
      const data=sheet===TABLES.LANCAMENTOS
        ? updateTransaction_(uid,p.id,p.record||{})
        : update_(sheet,p.id,Object.assign({},p.record||{},{user_id:uid}));
      audit_(uid,"update",sheet,p.id,data);
      return out_({success:true,data});
    }
    if(action==="upsert"){
      const sheet=assertWritable_(p.sheet,auth);
      const existing=p.id?find_(sheet,p.id):null;
      if(existing) assertOwned_(sheet,p.id,uid);
      const record=Object.assign({},p.record||{},{user_id:uid});
      const data=existing?update_(sheet,p.id,record):upsert_(sheet,p.id,record);
      audit_(uid,existing?"update":"create",sheet,data.id,data);
      return out_({success:true,data});
    }
    if(action==="delete"){
      const sheet=assertWritable_(p.sheet,auth);
      assertOwned_(sheet,p.id,uid);
      const result=delete_(sheet,p.id);
      audit_(uid,"delete",sheet,p.id,result);
      return out_(result);
    }
    if(action==="remove_duplicate_categories")
      return out_({success:true,data:removeDuplicateCategories_(uid)});
    if(action==="dashboard")
      return out_({success:true,data:dashboard_(uid)});
    if(action==="dre")
      return out_({success:true,data:dre_(uid)});
    if(action==="search")
      return out_({success:true,data:search_(uid,p.q)});

    return out_({success:false,error:"Ação não reconhecida."});
  } catch(err) {
    return out_({success:false,error:String(err.message||err)});
  }
}

function saveTransaction_(userId, record, dedupeKey) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const uid = normalizeEmail_(userId);
    if (!uid) throw new Error("Usuário não informado.");

    const rec = Object.assign({}, record || {});
    delete rec.user_id;
    rec.user_id = uid;

    rec.original_amount = Number(rec.original_amount || rec.amount) || 0;
    rec.amount = Number(rec.amount) || 0;
    rec.payment_fee_total = Number(rec.payment_fee_total) || 0;

    if (rec.original_amount <= 0 || rec.amount <= 0) {
      throw new Error("Valor do lançamento deve ser maior que zero.");
    }

    // Para lançamento simples, "pago" significa que o valor bruto foi
    // liquidado; a taxa reduz apenas o valor líquido contabilizado.
    if (String(rec.status || "").toLowerCase() === "pendente") {
      rec.payment_received_amount = 0;
    } else if (String(rec.status || "").toLowerCase() === "parcial") {
      rec.payment_received_amount = Number(rec.payment_received_amount) || 0;
    } else {
      rec.payment_received_amount = rec.original_amount;
      rec.status = "pago";
    }

    if (rec.payment_received_amount < 0) {
      throw new Error("Valor recebido não pode ser negativo.");
    }
    if (rec.payment_received_amount > rec.original_amount + 0.01) {
      throw new Error("Valor recebido não pode ultrapassar o valor original.");
    }

    rec.remaining_amount = Math.max(
      0,
      rec.original_amount - rec.payment_received_amount
    );

    if (rec.status === "parcial" && rec.remaining_amount <= 0.01) {
      rec.status = "pago";
      rec.payment_received_amount = rec.original_amount;
      rec.remaining_amount = 0;
    }

    if (rec.transaction_date) rec.transaction_date = dateOnly_(rec.transaction_date);
    if (rec.competence_date) rec.competence_date = dateOnly_(rec.competence_date);
    if (rec.paid_date) rec.paid_date = dateOnly_(rec.paid_date);

    const key = String(dedupeKey || rec.dedupe_key || "").trim();
    if (key) {
      const existing = list_(TABLES.LANCAMENTOS, uid)
        .find(r =>
          String(r.dedupe_key || "") === key &&
          (!rec.id || String(r.id) !== String(rec.id))
        );
      if (existing) {
        return {duplicate:true, id:existing.id, data:[existing]};
      }
      rec.dedupe_key = key;
    }

    // IDs existentes são tratados como edição somente se pertencerem ao usuário.
    if (rec.id) {
      const current = find_(TABLES.LANCAMENTOS, rec.id);
      if (current) {
        assertOwned_(TABLES.LANCAMENTOS, rec.id, uid);
        const updated = updateTransaction_(uid, rec.id, rec);
        audit_(uid, "update", TABLES.LANCAMENTOS, rec.id, updated);
        return {duplicate:false, data:[updated], id:updated.id};
      }
      delete rec.id;
    }

    const created = create_(TABLES.LANCAMENTOS, rec);
    audit_(uid, "create", TABLES.LANCAMENTOS, created.id, created);
    return {duplicate:false, data:[created], id:created.id};
  } finally {
    lock.releaseLock();
  }
}

function saveTransactions_(userId, dedupeKey, rows) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const uid = String(userId || "").trim();
    if (!uid) throw new Error("Usuário não informado.");
    if (!Array.isArray(rows) || !rows.length) throw new Error("Nenhum lançamento informado.");
    const key = String(dedupeKey || "").trim();
    if (!key) throw new Error("Chave de segurança do lançamento não informada.");

    // Idempotência: se o mesmo lançamento chegar novamente em poucos minutos,
    // não grava outra cópia. Isso protege contra duplo clique, reenvio do
    // navegador e repetição causada por redirecionamento do Apps Script.
    const existing = list_(TABLES.LANCAMENTOS, uid);
    const nowMs = Date.now();
    const windowMs = 15 * 60 * 1000;
    const duplicate = existing.find(r => {
      if (String(r.dedupe_key || "") !== key) return false;
      if (!r.created_at) return true;
      try {
        const t = Utilities.parseDate(String(r.created_at), CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss").getTime();
        return (nowMs - t) <= windowMs;
      } catch (_) {
        return true;
      }
    });
    if (duplicate) {
      return {duplicate:true, id:duplicate.id, data:[duplicate]};
    }

    const created = [];
    rows.forEach(row => {
      const rec = Object.assign({}, row, {
        user_id: uid,
        dedupe_key: key
      });
      const item = create_(TABLES.LANCAMENTOS, rec);
      created.push(item);
      audit_(uid,"create",TABLES.LANCAMENTOS,item.id,item);
    });
    return {duplicate:false, data:created};
  } finally {
    lock.releaseLock();
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("RELUZ FINANCEIRO")
    .addItem("Inicializar/atualizar banco","setupDatabase")
    .addItem("Remover categorias duplicadas","removeDuplicateCategoriesMenu")
    .addToUi();
}
function removeDuplicateCategoriesMenu(){ SpreadsheetApp.getUi().alert(JSON.stringify(removeDuplicateCategories_(""))); }
