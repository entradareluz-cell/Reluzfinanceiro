
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
  LANCAMENTOS: ["id","user_id","type","amount","original_amount","transaction_date","competence_date","paid_date","category_id","subcategory","account_id","card_id","payment_method","status","name","description","notes","dre_class","attachment_url","recurrence","group_id","payment_parts","payment_received_amount","payment_fee_total","metal_value","initial_kg","final_kg","category_name","fee_percent","installment_number","installment_total","rate_id","transfer_group_id","created_at","updated_at"],
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

function id_() {
  return Utilities.getUuid();
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
    uid: String(u.id || u.user_id || ""),
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
  const uid = id_();
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
    .filter(r => !userId || !("user_id" in r) || String(r.user_id) === String(userId));
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
    const v=Number(t.amount)||0;
    if(["entrada","income","receita"].includes(String(t.type||"").toLowerCase())) entradas+=v;
    if(["saida","expense","despesa"].includes(String(t.type||"").toLowerCase())) saidas+=v;
  });
  return {saldo:entradas-saidas,entradas,saidas,resultado:entradas-saidas,quantidadeLancamentos:tx.length};
}

function dre_(userId) {
  const tx=list_(TABLES.LANCAMENTOS,userId);
  let receitaBruta=0,deducoes=0,custos=0,despesasOperacionais=0,despesasFinanceiras=0,investimentos=0;
  tx.forEach(t=>{
    const v=Number(t.amount)||0;
    const type=String(t.type||"").toLowerCase();
    const c=String(t.dre_class||"").toLowerCase();
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

function doGet(e) {
  try {
    const p=input_(e), action=p.action||"health";
    if(action==="health") return out_({success:true,message:"RELUZ FINANCEIRO API — Google Sheets funcionando.",time:now_()});
    if(action==="login") return out_({success:true,data:{user:login_(p.email,p.password_hash)}});
    if(action==="signup") return out_({success:true,data:{user:signup_(p.email,p.name,p.password_hash)}});
    if(action==="setup") return out_(setupDatabase());
    if(action==="list") return out_({success:true,data:list_(p.sheet,p.user_id||"")});
    if(action==="get") return out_({success:true,data:find_(p.sheet,p.id)});
    if(action==="dashboard") return out_({success:true,data:dashboard_(p.user_id||"")});
    if(action==="dre") return out_({success:true,data:dre_(p.user_id||"")});
    if(action==="search") return out_({success:true,data:search_(p.user_id||"",p.q)});
    return out_({success:false,error:"Ação não reconhecida."});
  } catch(err) { return out_({success:false,error:String(err.message||err)}); }
}

function doPost(e) {
  try {
    const p=input_(e), action=p.action;
    if(action==="login") return out_({success:true,data:{user:login_(p.email,p.password_hash)}});
    if(action==="signup") return out_({success:true,data:{user:signup_(p.email,p.name,p.password_hash)}});
    if(action==="setup") return out_(setupDatabase());
    if(action==="list") return out_({success:true,data:list_(p.sheet,p.user_id||"")});
    if(action==="get") return out_({success:true,data:find_(p.sheet,p.id)});
    if(action==="save_transactions") return out_(Object.assign({success:true}, saveTransactions_(p.user_id||"", p.dedupe_key||"", p.rows||[])));
    if(action==="create") return out_({success:true,data:create_(p.sheet,p.record||{})});
    if(action==="update") return out_({success:true,data:update_(p.sheet,p.id,p.record||{})});
    if(action==="upsert") return out_({success:true,data:upsert_(p.sheet,p.id,p.record||{})});
    if(action==="delete") return out_(delete_(p.sheet,p.id));
    if(action==="remove_duplicate_categories") return out_({success:true,data:removeDuplicateCategories_(p.user_id||"")});
    if(action==="dashboard") return out_({success:true,data:dashboard_(p.user_id||"")});
    if(action==="dre") return out_({success:true,data:dre_(p.user_id||"")});
    if(action==="search") return out_({success:true,data:search_(p.user_id||"",p.q)});
    return out_({success:false,error:"Ação não reconhecida."});
  } catch(err) {
    return out_({success:false,error:String(err.message||err),stack:String(err.stack||"")});
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
      created.push(create_(TABLES.LANCAMENTOS, rec));
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
