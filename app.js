// RELUZ FINANCEIRO — autenticação e banco 100% via Google Sheets + Apps Script.
const API_URL = "https://script.google.com/macros/s/AKfycbzE9bJFnzt1JCLOmKjn6m8SmbcknTEEwc2JgdzSyDpw6L9DPV-2Q2EoeUNKu82YXPfM/exec";
let editingTxId = null;
let machineRates = [];
let activeSaveKey = null;

const TABLES={
  transactions:"LANCAMENTOS",categories:"CATEGORIAS",accounts:"CONTAS",cards:"CARTOES",
  recurring:"RECORRENTES",goals:"METAS",machine_rates:"TAXAS",users:"USUARIOS",
  subcategories:"SUBCATEGORIAS",receivings:"RECEBIMENTOS",installments:"PARCELAS",
  clients:"CLIENTES",suppliers:"FORNECEDORES",cost_centers:"CENTROS_CUSTO",
  projects:"PROJETOS",orders:"PEDIDOS",audit:"AUDITORIA"
};
function sheetName(table){return TABLES[table]||String(table||"").toUpperCase();}
async function api(action,payload={}){
  // Autenticação usa GET porque o Google Apps Script redireciona Web Apps
  // e isso evita problemas de CORS/preflight no navegador. As operações
  // de dados continuam usando POST.
  const isAuth = action === "login" || action === "signup" || action === "health";
  let url = API_URL;
  const options = { method: isAuth ? "GET" : "POST" };
  if(isAuth){
    const params = new URLSearchParams({action, ...Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,String(v??"")]))});
    url += "?" + params.toString();
  }else{
    options.headers={"Content-Type":"text/plain;charset=utf-8"};
    const token = getSessionToken();
    options.body=JSON.stringify({action,...payload,...(isAuth?{}:{session_token:token||""})});
  }
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  options.signal=controller.signal;
  let res;
  try {
    res=await fetch(url,options);
  } catch(err) {
    if(err?.name === "AbortError") throw new Error("Tempo esgotado ao conectar ao Google Apps Script. Verifique se a implantação da URL da API está como Web App e acessível.");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  const text=await res.text();
  let data;
  try{
    data=JSON.parse(text);
  }catch{
    const detail=text||"Resposta vazia do Apps Script.";
    throw new Error(`Resposta inválida do Apps Script (${res.status}). ${detail.slice(0,300)}`);
  }
  if(!res.ok){
    throw new Error(data?.error||`Apps Script respondeu HTTP ${res.status}.`);
  }
  if(data?.success===false){
    const message=data.error||"Erro no Apps Script.";
    if(/sessão|sessao|acesso negado|usuário não informado|usuario nao informado/i.test(message) && !isAuth){
      clearSession();
    }
    throw new Error(message);
  }
  return data;
}
function apiError(error){console.error("Google Sheets/App Script",error);return {data:null,error};}
function collectionRef(name){return {sheet:sheetName(name)}}
function doc(_db,name,id){return {sheet:sheetName(name),id:String(id)}}
async function getDoc(ref){
  try{
    const r=await api("get",{sheet:ref.sheet,id:ref.id});
    return {exists:()=>!!r.data,data:()=>r.data||null};
  }catch(error){return {exists:()=>false,data:()=>null,error};}
}
async function setDoc(ref,data){
  try{const r=await api("upsert",{sheet:ref.sheet,id:ref.id,record:data});return {id:r.data?.id||ref.id};}
  catch(error){throw error;}
}
async function addDoc(ref,data){
  const r=await api("create",{sheet:ref.sheet,record:data});
  return {id:r.data?.id,data:r.data};
}
async function updateDoc(ref,data){await api("update",{sheet:ref.sheet,id:ref.id,user_id:user?.uid||"",record:data});}
async function deleteDoc(ref){await api("delete",{sheet:ref.sheet,id:ref.id});}
function serverTimestamp(){return new Date().toISOString();}
async function getDocs(ref){const r=await api("list",{sheet:ref.sheet});return {docs:(r.data||[]).map(x=>({id:x.id,data:()=>x}))};}

function builder(table){
 let filters=[],sort=null,maxRows=null,mode="select",insertData=null;
 const apiObj={
  select(_fields="*"){mode="select";return apiObj},
  eq(field,value){filters.push([field,value]);return apiObj},
  order(field,opts={}){sort=[field,!!opts.ascending];return apiObj},
  limit(n){maxRows=n;return apiObj},
  insert(data){mode="insert";insertData=data;return apiObj},
  delete(){mode="delete";return apiObj},
  then(resolve,reject){execute().then(resolve,reject)}
 };
 async function execute(){
  try{
   if(mode==="insert"){
    const rows=Array.isArray(insertData)?insertData:[insertData];
    const created=[];
    for(const row of rows){
      const r=await api("create",{sheet:sheetName(table),record:row});
      created.push(r.data);
    }
    return {data:created,error:null};
   }
   let r=await api("list",{sheet:sheetName(table)});
   let data=Array.isArray(r.data)?r.data:[];
   for(const [field,value] of filters)data=data.filter(x=>String(x?.[field]??"")===String(value??""));
   if(sort)data.sort((a,b)=>{const av=a?.[sort[0]],bv=b?.[sort[0]];if(av==bv)return 0;return (av>bv?1:-1)*(sort[1]?1:-1)});
   if(maxRows)data=data.slice(0,maxRows);
   data.forEach(x=>joinRelations(table,x));
   if(mode==="delete"){
     for(const row of data) if(row.id) await api("delete",{sheet:sheetName(table),id:row.id});
     return {data:null,error:null};
   }
   return {data,error:null};
  }catch(error){return apiError(error)}
 }
 return apiObj;
}
async function sha256(text){
  const data=new TextEncoder().encode(String(text));
  const hash=await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function saveSession(u,token){
  localStorage.setItem("reluz_session",JSON.stringify(u));
  if(token) localStorage.setItem("reluz_session_token",String(token));
}
function getSessionUser(){try{return JSON.parse(localStorage.getItem("reluz_session")||"null")}catch{return null}}
function getSessionToken(){return localStorage.getItem("reluz_session_token")||""}
function clearSession(){localStorage.removeItem("reluz_session");localStorage.removeItem("reluz_session_token");}
const sb={
 from:builder,
 auth:{
  getSession:async()=>{
    const u=getSessionUser();
    const token=getSessionToken();
    if(u && token) return {data:{session:{user:u,session_token:token}},error:null};
    if(u && !token) clearSession();
    return {data:{session:null},error:null};
  },
  signInWithPassword:async({email,password})=>{try{
    const r=await api("login",{email:String(email||"").trim().toLowerCase(),password_hash:await sha256(password)});
    if(!r.data?.user) throw new Error("E-mail ou senha incorretos.");
    saveSession(r.data.user,r.data.session_token); return {data:{user:r.data.user,session:{user:r.data.user,session_token:r.data.session_token}},error:null};
  }catch(error){return {data:null,error}}},
  signUp:async({email,password,options})=>{try{
    const cleanEmail=String(email||"").trim().toLowerCase();
    const name=options?.data?.name||cleanEmail.split("@")[0];
    const r=await api("signup",{email:cleanEmail,name,password_hash:await sha256(password)});
    if(!r.data?.user) throw new Error("Não foi possível criar a conta.");
    saveSession(r.data.user,r.data.session_token); return {data:{user:r.data.user,session:{user:r.data.user,session_token:r.data.session_token}},error:null};
  }catch(error){return {data:null,error}}},
  signOut:async()=>{clearSession();loginView();},
  onAuthStateChange:(callback)=>{const u=getSessionUser();setTimeout(()=>callback(u?"SIGNED_IN":"SIGNED_OUT",u?{user:u}:null),0);return {unsubscribe(){}};}
 }
};

let categoriesCache=[],accountsCache=[],cardsCache=[];
function joinRelations(table,row){
 if(table==="transactions"){
  row.categories=categoriesCache.find(x=>x.id===row.category_id)||null;
  row.accounts=accountsCache.find(x=>x.id===row.account_id)||null;
  row.cards=cardsCache.find(x=>x.id===row.card_id)||null;
 }
 if(table==="recurring") row.categories=categoriesCache.find(x=>x.id===row.category_id)||null;
 return row;
}
const defaults=[['Salário','entrada'],['Extra','entrada'],['Reembolso','entrada'],['Outros recebimentos','entrada'],['Casa','saida'],['Mercado','saida'],['Alimentação','saida'],['Carro','saida'],['Combustível','saida'],['Contas','saida'],['Celular/Internet','saida'],['Cartão','saida'],['Lazer','saida'],['Compras','saida'],['Pets','saida'],['Família','saida'],['Investimentos','saida'],['Outros','saida']];

let user,categories=[],accounts=[],cards=[],recurring=[],goalsList=[],txs=[],flowChart,catChart;
const $=x=>document.getElementById(x),today=new Date().toISOString().slice(0,10),thisMonth=today.slice(0,7);
const money=n=>Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function msg(id,t){$(id).textContent=t||""}
function friendlyError(err){
 const m=err?.message||String(err||"");
 if(m.includes("E-mail ou senha incorretos")) return "E-mail ou senha incorretos.";
 if(m.includes("E-mail já cadastrado")||m.includes("já está cadastrado")) return "Este e-mail já está cadastrado. Use Entrar.";
 if(m.includes("Senha")) return m;
 if(m.includes("Failed to fetch")||m.includes("NetworkError")) return "Não foi possível conectar ao Google Sheets.";
 return m;
}
document.addEventListener("DOMContentLoaded",async()=>{
  $("dashMonth").value=thisMonth;$("reportMonth").value=thisMonth;$("txDate").value=today;
  $("loginForm").onsubmit=login;$("signupForm").onsubmit=signup;$("logout").onclick=()=>sb.auth.signOut();
  $("txForm").onsubmit=saveTx;$("catForm").onsubmit=saveCategory;$("cardForm").onsubmit=saveCard;$("rateForm").onsubmit=saveMachineRate;$("recForm").onsubmit=saveRec;$("goalForm").onsubmit=saveGoal;$("accountForm").onsubmit=saveAccount;$("txType").onchange=fillCategorySelects;$("txCat").addEventListener("change",updateMetalFields);$("recType")?.addEventListener("change",fillCategorySelects);
  initPaymentBreakdown();
  document.querySelectorAll('[data-close-edit]').forEach(el=>el.addEventListener('click',()=>{closeEditTxModal();clearTxForm();}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$("editTxModal")?.classList.contains('hidden')){closeEditTxModal();clearTxForm();}});
  $("dashMonth").onchange=dashboard;$("reportMonth").onchange=report;$("transferForm")?.addEventListener("submit",saveTransfer);$("excel").onclick=excel;$("pdf").onclick=pdf;
  document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>page(b.dataset.page));
  try{
    const {data,error}=await sb.auth.getSession();
    if(error) throw error;
    if(data.session) await start(data.session.user); else loginView();
  }catch(err){console.error(err);loginView();msg("authMsg",friendlyError(err))}
});
function loginView(){$("loginView").classList.remove("hidden");$("app").classList.add("hidden")}
async function start(u){user=u;const r=await getDoc(doc(null,"users",u.uid));$("userName").textContent=r.exists()?r.data().name:(u.displayName||u.email);$("loginView").classList.add("hidden");$("app").classList.remove("hidden");await load();page("dashboard")}
function setAuthLoading(on,title="Entrando na sua conta...",text="Conectando ao Google Sheets e carregando seus dados."){
  const overlay=$("authLoading");
  if(overlay){
    $("authLoadingTitle").textContent=title;
    $("authLoadingText").textContent=text;
    overlay.classList.toggle("hidden",!on);
    const bar=$("authLoadingProgressBar");
    if(bar){
      bar.classList.remove("p25","p55","p80","p100");
      if(on){
        const t=String(title||"").toLowerCase();
        bar.classList.add(t.includes("final")?"p100":t.includes("carregando")||t.includes("preparando")?"p55":"p25");
      }
    }
  }
  [$("loginSubmit"),$("signupSubmit")].forEach(b=>{if(b)b.disabled=!!on;});
}
function setButtonLoading(button,on,label){
  if(!button)return;
  button.classList.toggle("is-loading",!!on);
  const text=button.querySelector(".btn-label");
  const spinner=button.querySelector(".btn-spinner");
  if(text && !text.dataset.original) text.dataset.original=text.textContent;
  if(text) text.textContent=on?label:text.dataset.original;
  if(spinner) spinner.classList.toggle("hidden",!on);
}
async function login(e){
  e.preventDefault();
  msg("authMsg","");
  const button=e.submitter||$("loginSubmit");
  setButtonLoading(button,true,"Entrando...");
  setAuthLoading(true,"Entrando na sua conta...","Validando seus dados com segurança.");
  try{
    const r=await sb.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
    if(r.error) throw r.error;
    setAuthLoading(true,"Carregando seu financeiro...","Login confirmado. Buscando categorias, contas, cartões e lançamentos.");
    await start(r.data.user);
  }catch(err){
    console.error("Erro ao entrar:",err);
    setAuthLoading(false);
    msg("authMsg",friendlyError(err));
  }finally{
    setButtonLoading(button,false,"Entrando na sua conta");
    if(!$("app")?.classList.contains("hidden")) setAuthLoading(false);
  }
}
async function signup(e){
  e.preventDefault();
  msg("authMsg","");
  const button=e.submitter||$("signupSubmit");
  setButtonLoading(button,true,"Criando...");
  setAuthLoading(true,"Criando sua conta...","Salvando seu acesso no Google Sheets.");
  try{
    const r=await sb.auth.signUp({email:$("signupEmail").value.trim(),password:$("signupPassword").value,options:{data:{name:$("signupName").value.trim()}}});
    if(r.error) throw r.error;
    setAuthLoading(true,"Preparando seu financeiro...","Conta criada. Carregando suas categorias e lançamentos.");
    await start(r.data.user);
  }catch(err){
    console.error("Erro ao criar conta:",err);
    setAuthLoading(false);
    msg("authMsg",friendlyError(err));
  }finally{
    setButtonLoading(button,false,"Criar minha conta");
    if(!$("app")?.classList.contains("hidden")) setAuthLoading(false);
  }
}

async function deduplicateCategories(rows){
  const seen=new Map();
  const duplicates=[];
  for(const c of (rows||[])){
    const key=`${String(c.name||"").trim().toLocaleLowerCase("pt-BR")}::${String(c.type||"").trim().toLocaleLowerCase("pt-BR")}`;
    if(!key || key.startsWith("::")) continue;
    if(seen.has(key)) duplicates.push(c);
    else seen.set(key,c);
  }
  if(duplicates.length){
    for(const c of duplicates){
      try{ await deleteDoc(doc(null,"categories",c.id)); }
      catch(err){ console.warn("Não foi possível remover categoria duplicada",c.id,err); }
    }
  }
  return Array.from(seen.values());
}

async function load(){
  if(!user?.uid) return;
  // Toda consulta é filtrada pelo UID para manter os dados de cada usuário separados na planilha.
  const uid=user.uid;
  const results=await Promise.all([
    sb.from("categories").select("*").eq("user_id",uid),
    sb.from("accounts").select("*").eq("user_id",uid),
    sb.from("cards").select("*").eq("user_id",uid),
    sb.from("recurring").select("*,categories(name)").eq("user_id",uid),
    sb.from("goals").select("*").eq("user_id",uid),
    sb.from("transactions").select("*,categories(name),accounts(name),cards(name)").eq("user_id",uid).limit(3000),
    sb.from("machine_rates").select("*").eq("user_id",uid)
  ]);
  const [a,b,c,d,e,f,g]=results;
  const names=["categories","accounts","cards","recurring","goals","transactions","machine_rates"];
  [a,b,c,d,e,f].forEach((r,i)=>{if(r.error) console.error("Erro ao carregar "+names[i],r.error)});
  categories=await deduplicateCategories(a.data||[]);categories.sort((x,y)=>String(x.name||"").localeCompare(String(y.name||"")));
  categoriesCache=categories;
  accounts=(b.data||[]).sort((x,y)=>String(x.name||"").localeCompare(String(y.name||"")));
  accountsCache=accounts;
  cards=(c.data||[]).sort((x,y)=>String(x.name||"").localeCompare(String(y.name||"")));
  cardsCache=cards;
  if(!categories.length){
    const defaults=[['Salário','entrada'],['Extra','entrada'],['Reembolso','entrada'],['Outros recebimentos','entrada'],['Casa','saida'],['Mercado','saida'],['Alimentação','saida'],['Carro','saida'],['Combustível','saida'],['Contas','saida'],['Celular/Internet','saida'],['Cartão','saida'],['Lazer','saida'],['Compras','saida'],['Pets','saida'],['Família','saida'],['Investimentos','saida'],['Outros','saida']];
    const seed=await sb.from("categories").insert(defaults.map(([name,type])=>({user_id:uid,name,type})));
    if(seed.error) console.error("Erro ao criar categorias padrão",seed.error);
    else {
      const fresh=await sb.from("categories").select("*").eq("user_id",uid);
      categories=await deduplicateCategories(fresh.data||[]);categories.sort((x,y)=>String(x.name||"").localeCompare(String(y.name||"")));
      categoriesCache=categories;
    }
  }
  recurring=d.data||[];
  goalsList=e.data||[];
  txs=f.data||[];
  machineRates=(g.data||[]).sort((x,y)=>String(x.name||"").localeCompare(String(y.name||"")));
  txs.sort((x,y)=>String(y.transaction_date||"").localeCompare(String(x.transaction_date||"")));
  txs.forEach(t=>joinRelations("transactions",t));
  recurring.forEach(r=>joinRelations("recurring",r));
  fill();render();window.__reluzLoaded=true
}
function fill(){
  fillCategorySelects();
  if($("transferFrom"))$("transferFrom").innerHTML=accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("");
  if($("transferTo"))$("transferTo").innerHTML=accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("");
  if($("transferDate"))$("transferDate").value=today;
  $("txAccount").innerHTML=accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("");
  $("txCard").innerHTML='<option value="">Nenhum</option>'+cards.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
  $("catBody").innerHTML=categories.map(c=>`<tr><td>${esc(c.name)}</td><td>${c.type==="saida"?"Saída":c.type==="entrada"?"Entrada":"Ambos"}</td><td><button type="button" class="danger" onclick="deleteCategory('${c.id}')">Excluir</button></td></tr>`).join("")||'<tr><td colspan="3">Nenhuma categoria cadastrada.</td></tr>';
  renderMachineRates();
  refreshPaymentRateOptions();
  updatePaymentParts();
}
function updateMetalFields(){
  const el=$("metalFields"), catId=$("txCat")?.value;
  if(!el)return;
  const cat=categories.find(c=>c.id===catId);
  const isPedido=String(cat?.name||"").trim().toLowerCase()==="pedido";
  el.classList.toggle("hidden",!isPedido);
}
function fillCategorySelects(){const type=$("txType")?.value||"saida";const available=categories.filter(c=>c.type==="ambos"||c.type===type);$("txCat").innerHTML=available.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")||'<option value="">Cadastre uma categoria primeiro</option>';const recurringType=$("recType")?.value||"saida";const recurringCats=categories.filter(c=>c.type==="ambos"||c.type===recurringType);$("recCat").innerHTML=recurringCats.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")||'<option value="">Cadastre uma categoria primeiro</option>';updateMetalFields()}
async function saveCategory(e){
  e.preventDefault();
  msg("catMsg","");
  const name=$("catName").value.trim();
  const type=$("catType").value;
  if(!user?.uid) return msg("catMsg","Sua sessão não está ativa. Entre novamente.");
  if(!name) return msg("catMsg","Informe o nome da categoria.");
  if(categories.some(c=>String(c.name||"").trim().toLowerCase()===name.toLowerCase() && c.type===type))
    return msg("catMsg","Essa categoria já existe.");
  try{
    // Grava diretamente no Google Sheets com o UID do usuário.
    const ref=await addDoc(collectionRef("categories"),{
      user_id:user.uid,
      name,
      type,
      created_at:serverTimestamp()
    });
    categories.push({id:ref.id,user_id:user.uid,name,type});
    categories.sort((x,y)=>String(x.name||"").localeCompare(String(y.name||"")));
    categoriesCache=categories;
    $("catForm").reset();
    fill();
    msg("catMsg","✓ Categoria cadastrada com sucesso.");
    page("categorias");
  }catch(err){
    console.error("Erro ao cadastrar categoria:",err);
    msg("catMsg","Não foi possível cadastrar: "+friendlyError(err));
  }
}
async function deleteCategory(id){
  if(!confirm("Excluir esta categoria? Os lançamentos existentes serão mantidos sem categoria."))return;
  try{
    const ref=doc(null,"categories",id);
    const snap=await getDoc(ref);
    if(!snap.exists() || snap.data().user_id!==user.uid) return msg("catMsg","Categoria não encontrada ou sem permissão.");
    await deleteDoc(ref);
    await load();
    page("categorias");
  }catch(err){console.error(err);msg("catMsg","Não foi possível excluir: "+friendlyError(err))}
}
function paymentTargetAmount(){
  const status=$("txStatus")?.value||"pago";
  const total=+$('txAmount')?.value||0;
  return status==="parcial" ? (+$('txPaidAmount')?.value||0) : total;
}
function paymentMethodLabel(v){return ({pix:'PIX',debit:'Débito',credit:'Cartão de crédito',cash:'Dinheiro',transfer:'Transferência',boleto:'Boleto',other:'Outro'})[v]||v}
function paymentPartTemplate(index,data={}){
  const methods=[['pix','PIX'],['debit','Débito'],['credit','Cartão de crédito'],['cash','Dinheiro'],['transfer','Transferência'],['boleto','Boleto'],['other','Outro']];
  const method=data.method||'pix';
  const cardsHtml=cards.map(c=>`<option value="${c.id}" ${data.card_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
  const ratesHtml=machineRates.map(r=>`<option value="${r.id}" ${data.rate_id===r.id?'selected':''}>${esc(r.name)}</option>`).join('');
  return `<div class="payment-part" data-payment-index="${index}">
    <div class="part-main-grid">
      <label>Forma de pagamento<select class="part-method">${methods.map(([v,l])=>`<option value="${v}" ${method===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <label>Valor desta forma<input class="part-amount" type="number" min="0" step="0.01" value="${data.amount??''}" placeholder="0,00"></label>
      <label class="part-card-wrap ${method==='credit'?'':'hidden'}">Cartão<select class="part-card"><option value="">Selecione</option>${cardsHtml}</select></label>
      <label class="part-rate-wrap ${method==='credit'?'':'hidden'}">Maquininha<select class="part-rate"><option value="">Sem taxa cadastrada</option>${ratesHtml}</select></label>
      <label class="part-install-wrap ${method==='credit'?'':'hidden'}">Parcelas<input class="part-install" type="number" min="1" value="${data.installments||1}"></label>
      <button type="button" class="part-remove ${index===0?'hidden':''}">Remover</button>
    </div>
    <div class="part-detail ${method==='credit'?'':'hidden'}">
      <label>Taxa aplicada (%)<input class="part-fee" type="number" min="0" max="100" step="0.01" value="${data.fee_percent??''}" placeholder="Ex.: 2,99"></label>
      <label>Taxa estimada<input class="part-fee-value" type="text" readonly value="R$ 0,00"></label>
      <label>Valor líquido total<input class="part-net" type="text" readonly value="R$ 0,00"></label>
    </div>
    <div class="part-schedule ${method==='credit'?'':'hidden'}"></div>
  </div>`;
}
function setupPaymentPart(part){
  const method=part.querySelector('.part-method'), card=part.querySelector('.part-card'), fee=part.querySelector('.part-fee'), rate=part.querySelector('.part-rate');
  const applyDefaults=()=>{
    const credit=method.value==='credit';
    part.querySelector('.part-card-wrap')?.classList.toggle('hidden',!credit);
    part.querySelector('.part-rate-wrap')?.classList.toggle('hidden',!credit);
    part.querySelector('.part-install-wrap')?.classList.toggle('hidden',!credit);
    part.querySelector('.part-detail')?.classList.toggle('hidden',!credit);
    part.querySelector('.part-schedule')?.classList.toggle('hidden',!credit);
    if(credit){
      const c=cards.find(x=>x.id===card?.value);
      const r=machineRates.find(x=>x.id===rate?.value);
      if(r && fee && !fee.value) fee.value=Number(r.credit_percent||0);
      else if(c && fee && !fee.value) fee.value=Number(c.machine_fee_percent||0);
    }
    updatePaymentParts();
  };
  method.addEventListener('change',applyDefaults);
  card?.addEventListener('change',()=>{const c=cards.find(x=>x.id===card.value);if(c&&fee){fee.value=c.machine_fee_percent??0}updatePaymentParts()});
  rate?.addEventListener('change',()=>{const r=machineRates.find(x=>x.id===rate.value);if(r&&fee)fee.value=Number(r.credit_percent||0);updatePaymentParts()});
  part.querySelectorAll('input,select').forEach(el=>{if(el!==method&&el!==card&&el!==rate)el.addEventListener('input',updatePaymentParts)});
  part.querySelector('.part-remove')?.addEventListener('click',()=>{part.remove();renumberPaymentParts();updatePaymentParts()});
  applyDefaults();
}
function renumberPaymentParts(){document.querySelectorAll('#paymentParts .payment-part').forEach((p,i)=>p.dataset.paymentIndex=i);document.querySelectorAll('#paymentParts .part-remove').forEach((b,i)=>b.classList.toggle('hidden',i===0));}
function addPaymentPart(data={}){const wrap=$("paymentParts");if(!wrap)return;const count=wrap.querySelectorAll('.payment-part').length;wrap.insertAdjacentHTML('beforeend',paymentPartTemplate(count,data));setupPaymentPart(wrap.lastElementChild);}
function addDefaultPartsForMultiple(){const wrap=$("paymentParts");if(!wrap)return;wrap.innerHTML="";addPaymentPart({method:'pix'});addPaymentPart({method:'credit'});}
function installmentDate(baseDate,index){const d=new Date((baseDate||today)+"T12:00:00");d.setDate(d.getDate()+30*(index+1));return d.toISOString().slice(0,10)}
function updatePaymentParts(){
  const box=$("paymentBreakdown"),method=$("txMethod")?.value,status=$("txStatus")?.value,target=paymentTargetAmount();
  if(!box)return;
  const active=method==='multiple'||status==='parcial';
  box.classList.toggle('hidden',!active);
  $("txPaidAmountWrap")?.classList.toggle('hidden',status!=='parcial');
  const parts=[...document.querySelectorAll('#paymentParts .payment-part')];let total=0;
  parts.forEach(p=>{
    const amount=+p.querySelector('.part-amount').value||0; total+=amount;
    const m=p.querySelector('.part-method').value;
    const detail=p.querySelector('.part-detail'),schedule=p.querySelector('.part-schedule');
    if(m==='credit'){
      detail?.classList.remove('hidden');schedule?.classList.remove('hidden');
      const fee=+p.querySelector('.part-fee').value||0,inst=Math.max(1,+p.querySelector('.part-install').value||1),feeValue=amount*fee/100,net=amount-feeValue;
      p.querySelector('.part-fee-value').value=money(feeValue);p.querySelector('.part-net').value=money(net);
      const perGross=amount/inst,perFee=perGross*fee/100,perNet=perGross-perFee;
      if(schedule)schedule.innerHTML=Array.from({length:Math.min(inst,24)},(_,i)=>`<div><span>${i+1}/${inst}</span><b>${money(perNet)}</b><small>${installmentDate($("txPaidDate")?.value||$("txDate")?.value||today,i)}</small></div>`).join('');
    }else{detail?.classList.add('hidden');schedule?.classList.add('hidden')}
  });
  const totalEl=$("paymentPartsTotal"),statusEl=$("paymentPartsStatus");if(totalEl)totalEl.textContent=money(total);
  if(statusEl){const diff=total-target;if(Math.abs(diff)<0.01&&target>0){statusEl.textContent="✓ Valores fechando corretamente.";statusEl.className="ok"}else if(target>0){statusEl.textContent=`Falta/sobra ${money(Math.abs(diff))}${diff>0?' a mais':' para completar'}.`;statusEl.className="error"}else{statusEl.textContent="Informe o valor a pagar/receber e as formas.";statusEl.className=""}}
}
function refreshPaymentRateOptions(){
  document.querySelectorAll('#paymentParts .part-rate').forEach(sel=>{const current=sel.value;sel.innerHTML='<option value="">Sem taxa cadastrada</option>'+machineRates.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('');if(current&&machineRates.some(r=>r.id===current))sel.value=current;});
}
function initPaymentBreakdown(){
  const wrap=$("paymentParts");if(!wrap)return;
  wrap.innerHTML="";addPaymentPart({method:'pix'});
  $("addPaymentPart")?.addEventListener('click',()=>{addPaymentPart();updatePaymentParts()});
  $("txMethod")?.addEventListener('change',()=>{
    const v=$("txMethod").value;
    if(v==='multiple') addDefaultPartsForMultiple();
    else if(v==='credit'){
      const first=document.querySelector('#paymentParts .payment-part');
      if(first){first.querySelector('.part-method').value='credit';first.querySelector('.part-card').value=$("txCard")?.value||'';setupPaymentPart(first)}
      else addPaymentPart({method:'credit'});
    } else {
      const first=document.querySelector('#paymentParts .payment-part');
      if(first){first.querySelector('.part-method').value=v;setupPaymentPart(first)}
    }
    updatePaymentParts();
  });
  $("txStatus")?.addEventListener('change',()=>{
    const status=$("txStatus").value;const box=$("paymentBreakdown");
    if(status==='parcial'){box?.classList.remove('hidden');$("txPaidAmountWrap")?.classList.remove('hidden');if(!document.querySelector('#paymentParts .payment-part'))addPaymentPart({method:'pix'});}
    updatePaymentParts();
  });
  $("txAmount")?.addEventListener('input',updatePaymentParts);$("txPaidAmount")?.addEventListener('input',updatePaymentParts);$("txPaidDate")?.addEventListener('change',updatePaymentParts);$("txDate")?.addEventListener('change',updatePaymentParts);
  $("txCard")?.addEventListener('change',()=>{const p=document.querySelector('#paymentParts .payment-part');if(p&&$("txMethod")?.value==='credit'){p.querySelector('.part-card').value=$("txCard").value;const c=cards.find(x=>x.id===$("txCard").value);if(c)p.querySelector('.part-fee').value=c.machine_fee_percent??0;updatePaymentParts()}});
  updatePaymentParts();
}
function collectPaymentParts(){return [...document.querySelectorAll('#paymentParts .payment-part')].map(p=>({method:p.querySelector('.part-method').value,amount:+p.querySelector('.part-amount').value||0,card_id:p.querySelector('.part-card')?.value||null,rate_id:p.querySelector('.part-rate')?.value||null,installments:+p.querySelector('.part-install')?.value||1,fee_percent:+p.querySelector('.part-fee')?.value||0})).filter(x=>x.amount>0)}
function normalizeDateInput(value){
  if(!value) return "";
  if(value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0,10);
  const v=String(value).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const iso=v.match(/^(\d{4}-\d{2}-\d{2})/); if(iso)return iso[1];
  const br=v.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/); if(br)return `${br[3]}-${br[2]}-${br[1]}`;
  const d=new Date(v); return isNaN(d.getTime())?"":d.toISOString().slice(0,10);
}
function setSelectValue(id,value, fallback=""){
  const el=$(id); if(!el)return;
  const v=value==null?fallback:String(value);
  if(v && ![...el.options].some(o=>String(o.value)===v)){
    const opt=document.createElement('option'); opt.value=v; opt.textContent=`Selecionado (${v})`; el.appendChild(opt);
  }
  el.value=v;
}
function openEditTxModal(){
  const modal=$("editTxModal"),host=$("editTxHost"),form=$("txForm");
  if(!modal||!host||!form)return;
  if(!$("txFormPlaceholder")){const ph=document.createElement('div');ph.id="txFormPlaceholder";form.parentNode.insertBefore(ph,form);}
  host.appendChild(form);
  modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');document.body.classList.add('edit-modal-open');
}
function closeEditTxModal(){
  const modal=$("editTxModal"),host=$("editTxHost"),form=$("txForm"),ph=$("txFormPlaceholder");
  if(ph&&form) ph.parentNode.insertBefore(form,ph.nextSibling);
  if(host) host.innerHTML="";
  if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}
  document.body.classList.remove('edit-modal-open');
  editingTxId=null;
}
function clearTxForm(){
  const wasEditing=!!editingTxId;
  if(wasEditing) closeEditTxModal();
  editingTxId=null;activeSaveKey=null;$('txForm')?.reset();$("txDate").value=today;$('txPaidDate').value="";$('txPaidAmount').value="";$('txMetalValue').value="";$('txInitialKg').value="";$('txFinalKg').value="";
  const submitBtn=$("txForm button[type=submit]");if(submitBtn)submitBtn.textContent="Salvar lançamento";$("txMsg").textContent="";initPaymentBreakdown();updateMetalFields();
}
async function editTx(id){
  const t=txs.find(x=>String(x.id)===String(id)); if(!t)return msg("txMsg","Lançamento não encontrado.");
  editingTxId=String(id); activeSaveKey=null; page('lancamentos');
  // O modal usa o mesmo formulário completo, mas isolado da tela de novo lançamento.
  openEditTxModal();
  setSelectValue("txType",t.type||"saida");
  fillCategorySelects();
  setSelectValue("txCat",t.category_id||"");
  setSelectValue("txAccount",t.account_id||"");
  setSelectValue("txCard",t.card_id||"");
  $("txAmount").value=t.original_amount!==undefined&&t.original_amount!==null&&t.original_amount!==""?Number(t.original_amount):Number(t.amount||0);
  $("txDate").value=normalizeDateInput(t.competence_date||t.transaction_date||"")||today;
  $("txPaidDate").value=normalizeDateInput(t.paid_date||"");
  $("txSubcategory").value=t.subcategory||"";
  $("txName").value=t.name||"";
  $("txDesc").value=t.description||"";
  $("txNotes").value=t.notes||"";
  $("txStatus").value=t.status||"pago";
  $("txDreClass").value=t.dre_class||($("txType").value==='entrada'?"receita":"despesa_operacional");
  $("txRecurring").value=t.recurrence||"none";
  $("txInstall").value=Number(t.installment_total||1);
  $("txPaidAmount").value=t.payment_received_amount!==undefined&&t.payment_received_amount!==null&&t.payment_received_amount!==""?Number(t.payment_received_amount):Number(t.amount||0);
  $("txMetalValue").value=t.metal_value!==undefined&&t.metal_value!==null&&t.metal_value!==""?Number(t.metal_value):"";
  $("txInitialKg").value=t.initial_kg!==undefined&&t.initial_kg!==null&&t.initial_kg!==""?Number(t.initial_kg):"";
  $("txFinalKg").value=t.final_kg!==undefined&&t.final_kg!==null&&t.final_kg!==""?Number(t.final_kg):"";
  let savedParts=t.payment_parts;
  if(typeof savedParts==='string'){try{savedParts=JSON.parse(savedParts)}catch(_){savedParts=null}}
  let parts=Array.isArray(savedParts)&&savedParts.length?savedParts:null;
  if(!parts){parts=[{method:t.payment_method||'pix',amount:Number(t.original_amount||t.amount||0),card_id:t.card_id||null,installments:Number(t.installment_total||1),fee_percent:Number(t.fee_percent||0),rate_id:t.rate_id||null}]}
  const effectiveMethod=parts.length>1?'multiple':(parts[0]?.method||t.payment_method||'pix');
  setSelectValue("txMethod",effectiveMethod);
  const wrap=$("paymentParts"); if(wrap){wrap.innerHTML="";parts.forEach(addPaymentPart);}
  updateMetalFields(); updatePaymentParts();
  $("txForm button[type=submit]").textContent="Salvar alterações";
}
window.editTx=editTx;
window.closeEditTxModal=closeEditTxModal;
async function saveTxCore(e){
 e.preventDefault();
 const total=+$('txAmount').value||0,status=$('txStatus').value,method=$('txMethod').value;
 if(total<=0)return msg("txMsg","Informe um valor maior que zero.");
 const target=status==='parcial'?(+$('txPaidAmount').value||0):total;
 if(status==='parcial'&&target<=0)return msg("txMsg","Informe quanto foi pago/recebido agora.");
 let parts=collectPaymentParts();
 if(status==='pendente' && !editingTxId)parts=[];
 if(method!=='multiple'&&parts.length===0&&status!=='pendente')parts=[{method,amount:target,card_id:$('txCard').value||null,rate_id:null,installments:method==='credit'?(+$('txInstall').value||1):1,fee_percent:method==='credit'?(+(cards.find(c=>c.id===$('txCard').value)?.machine_fee_percent||0)):0}];
 if(status!=='pendente'){const sum=parts.reduce((s,p)=>s+p.amount,0);if(Math.abs(sum-target)>0.01)return msg("txMsg",`As formas de pagamento somam ${money(sum)}, mas o valor a ${status==='parcial'?'pagar/receber agora':'pagar/receber'} é ${money(target)}.`)}
 const g=editingTxId||crypto.randomUUID();let attachmentUrl=txs.find(t=>t.id===editingTxId)?.attachment_url||null;const file=$("txAttachmentFile")?.files?.[0];if(file) attachmentUrl="arquivo-local:"+file.name;
 const categoryName=categories.find(c=>c.id===$('txCat').value)?.name||"";
 const base={user_id:user.uid,type:$('txType').value,amount:total,original_amount:total,transaction_date:$('txDate').value,competence_date:$('txDate').value,paid_date:$('txPaidDate').value||null,category_id:$('txCat').value,subcategory:$('txSubcategory').value||null,account_id:$('txAccount').value||null,card_id:$('txCard').value||null,payment_method:method,status,name:$('txName').value.trim(),description:$('txDesc').value.trim()||null,notes:$('txNotes').value||null,dre_class:$('txDreClass')?.value||($('txType').value==='entrada'?'receita':'despesa_operacional'),attachment_url:attachmentUrl,recurrence:$('txRecurring').value,group_id:g,payment_parts:parts,payment_received_amount:target,payment_fee_total:parts.reduce((s,p)=>s+p.amount*(p.fee_percent||0)/100,0),metal_value:+($("txMetalValue")?.value||0)||0,initial_kg:+($("txInitialKg")?.value||0)||0,final_kg:+($("txFinalKg")?.value||0)||0,category_name:categoryName};
 if(editingTxId){
   const current=txs.find(t=>t.id===editingTxId)||{};
   const totalFee=parts.reduce((s,p)=>s+(Number(p.amount)||0)*(Number(p.fee_percent)||0)/100,0);
   const netTotal=Math.max(0,total-totalFee);
   const editRecord={
     ...base,
     id:editingTxId,
     amount:netTotal,
     original_amount:total,
     payment_fee_total:totalFee,
     payment_received_amount:status==='pendente'?0:(status==='parcial'?target:total),
     remaining_amount:status==='pendente'?total:Math.max(0,total-(status==='parcial'?target:total)),
     fee_percent:parts.length===1?Number(parts[0].fee_percent||0):0,
     edited_at:new Date().toISOString(),
     installment_number:current.installment_number||1,
     installment_total:current.installment_total||1
   };
   const r=await api("save_transaction",{
     user_id:user.uid,
     dedupe_key:crypto.randomUUID(),
     record:editRecord
   });
   if(r?.duplicate && r.id!==editingTxId){
     throw new Error("Não foi possível identificar o lançamento que está sendo editado.");
   }
   msg("txMsg","Lançamento atualizado.");
   activeSaveKey=null;
   clearTxForm();
   await load();
   return;
 }
 let rows=[];
 for(const part of parts.length?parts:[{method,amount:target,card_id:$('txCard').value||null,rate_id:null,installments:1,fee_percent:0}]){
   const inst=Math.max(1,part.installments||1);
   if(part.method==='credit' && inst>1){
     const grossPart=part.amount/inst,feeValue=grossPart*(part.fee_percent||0)/100,netPart=grossPart-feeValue;
     for(let i=0;i<inst;i++){
       const d=installmentDate($('txPaidDate').value||$('txDate').value||today,i);
       rows.push({...base,amount:netPart,original_amount:grossPart,transaction_date:d,competence_date:$('txDate').value,paid_date:d,status:'pendente',payment_method:'credit',card_id:part.card_id||$('txCard').value||null,rate_id:part.rate_id||null,fee_percent:part.fee_percent||0,payment_fee_total:feeValue,payment_received_amount:netPart,installment_number:i+1,installment_total:inst,group_id:g});
     }
   }else if(part.method==='credit'){
     const gross=part.amount,feeValue=gross*(part.fee_percent||0)/100,net=gross-feeValue,d=installmentDate($('txPaidDate').value||$('txDate').value||today,0);
     rows.push({...base,amount:net,original_amount:gross,transaction_date:d,competence_date:$('txDate').value,paid_date:d,status:'pendente',payment_method:'credit',card_id:part.card_id||$('txCard').value||null,rate_id:part.rate_id||null,fee_percent:part.fee_percent||0,payment_fee_total:feeValue,payment_received_amount:net,installment_number:1,installment_total:1,group_id:g});
   }else{
     rows.push({...base,amount:part.amount,original_amount:part.amount,transaction_date:$('txPaidDate').value||$('txDate').value,competence_date:$('txDate').value,paid_date:$('txPaidDate').value||$('txDate').value,status:status==='parcial'?'pago':status,payment_method:part.method,card_id:part.card_id||null,rate_id:part.rate_id||null,fee_percent:part.fee_percent||0,payment_received_amount:part.amount,installment_number:1,installment_total:1,group_id:g});
   }
 }
 const dedupeKey=activeSaveKey||(activeSaveKey=crypto.randomUUID());
 let r;
 // Formas múltiplas/parciais usam a estrutura própria do Apps Script:
 // LANCAMENTOS + RECEBIMENTOS + PARCELAS. Isso evita gravar datas/valores
 // em colunas erradas e preserva cada valor de PIX, dinheiro, cartão etc.
 if((method==='multiple'||status==='parcial') && parts.length){
   const transaction={...base, id:g, amount:total, original_amount:total, payment_parts:parts.length};
   r=await api("save_multiple_payments",{
     user_id:user.uid,
     transaction,
     payments:parts.map(p=>({
       method:p.method,
       amount:Number(p.amount)||0,
       card_id:p.card_id||"",
       installments:Number(p.installments)||1,
       fee_percent:Number(p.fee_percent)||0,
       rate_id:p.rate_id||"",
       date:$('txPaidDate').value||$('txDate').value||today,
       notes:''
     })),
     dedupe_key:dedupeKey
   });
 }else{
   // Lançamento simples: grava diretamente um registro.
   // Não usa o fluxo de múltiplas parcelas, evitando que um lançamento
   // novo seja tratado acidentalmente como edição.
   const simpleFee=parts.reduce((s,p)=>s+(Number(p.amount)||0)*(Number(p.fee_percent)||0)/100,0);
   const simpleGross=(status==='pendente')?total:total;
   const simpleNet=Math.max(0,simpleGross-simpleFee);
   const simpleRow = {
     ...rows[0],
     ...base,
     amount:simpleNet,
     original_amount:simpleGross,
     payment_received_amount:status==='pendente'?0:simpleGross,
     remaining_amount:status==='pendente'?simpleGross:0,
     payment_fee_total:simpleFee,
     status:status==='pendente'?'pendente':'pago',
     fee_percent:parts.length===1?Number(parts[0].fee_percent||0):0
   };
   r=await api("save_transaction",{
     user_id:user.uid,
     dedupe_key:dedupeKey,
     record:simpleRow
   });
 }
 if(r?.success===false){msg("txMsg",r.error||"Não foi possível salvar o lançamento.");return;}
 if(r?.duplicate){msg("txMsg","Este lançamento já foi salvo. A duplicidade foi bloqueada.");return;}
 msg("txMsg", "Lançamento salvo com sucesso.");
 activeSaveKey=null;
 clearTxForm();
 await load();
}
let savingTx=false;
async function saveTx(e){
 e.preventDefault();
 if(savingTx)return msg("txMsg","Salvamento já está em andamento. Aguarde.");
 savingTx=true;
 const btn=$("txForm")?.querySelector('button[type="submit"]');
 const oldText=btn?.textContent;
 if(btn){btn.disabled=true;btn.textContent="Salvando...";}
 try{
   await saveTxCore(e);
 }catch(err){
   console.error("Erro ao salvar lançamento",err);
   msg("txMsg",friendlyError(err));
 }finally{
   savingTx=false;
   if(btn){btn.disabled=false;btn.textContent=editingTxId?"Salvar alterações":(oldText||"Salvar lançamento");}
 }
}
async function saveMachineRate(e){e.preventDefault();const name=$("rateName").value.trim();if(!name)return msg("rateMsg","Informe o nome da maquininha.");const r=await sb.from("machine_rates").insert({user_id:user.uid,name,credit_percent:+$("rateCredit").value||0,debit_percent:+$("rateDebit").value||0,pix_percent:+$("ratePix").value||0,active:true});msg("rateMsg",r.error?.message||"Taxa cadastrada.");if(!r.error){$("rateForm").reset();$("rateCredit").value=0;$("rateDebit").value=0;$("ratePix").value=0;await load()}}
async function deleteMachineRate(id){if(!confirm("Excluir esta taxa?"))return;try{await deleteDoc(doc(null,"machine_rates",id));await load()}catch(err){msg("rateMsg",friendlyError(err))}}
function renderMachineRates(){const el=$("rateBody");if(!el)return;el.innerHTML=machineRates.map(r=>`<div class="rate-row"><div><b>${esc(r.name)}</b><small>Crédito: ${Number(r.credit_percent||0).toFixed(2)}% · Débito: ${Number(r.debit_percent||0).toFixed(2)}% · PIX: ${Number(r.pix_percent||0).toFixed(2)}%</small></div><button type="button" class="danger" onclick="deleteMachineRate('${r.id}')">Excluir</button></div>`).join("")||'<div class="empty-rate">Nenhuma taxa cadastrada.</div>'}
async function saveCard(e){e.preventDefault();let r=await sb.from("cards").insert({user_id:user.uid,name:$("cardName").value,limit_amount:+$("cardLimit").value,closing_day:+$("cardClose").value,due_day:+$("cardDue").value,last4:$("cardLast4")?.value||null,machine_fee_percent:+$("cardFee")?.value||0,active:true});msg("cardMsg",r.error?.message||"Cartão cadastrado.");if(!r.error){$("cardForm").reset();await load()}}
async function saveRec(e){e.preventDefault();let r=await sb.from("recurring").insert({user_id:user.uid,type:$("recType")?.value||"saida",description:$("recDesc").value,amount:+$("recAmount").value,category_id:$("recCat").value,due_day:+$("recDay").value,start_date:$("recStart").value,end_date:$("recEnd").value||null});msg("recMsg",r.error?.message||"Cadastrado.");if(!r.error){$("recForm").reset();await load()}}
async function saveGoal(e){e.preventDefault();let r=await sb.from("goals").insert({user_id:user.uid,name:$("goalName").value,target_amount:+$("goalTarget").value,current_amount:+$("goalCurrent").value||0,deadline:$("goalDate").value||null});msg("goalMsg",r.error?.message||"Meta cadastrada.");if(!r.error){$("goalForm").reset();await load()}}
async function saveTransfer(e){e.preventDefault();const from=$("transferFrom").value,to=$("transferTo").value,amount=+$("transferAmount").value;if(!from||!to||from===to||!amount)return msg("transferMsg","Escolha contas diferentes e informe um valor.");const group=crypto.randomUUID(),date=$("transferDate").value||today,desc=$("transferDesc").value||"Transferência entre contas";const rows=[{user_id:user.uid,type:"saida",amount,transaction_date:date,competence_date:date,paid_date:date,account_id:from,status:"pago",description:desc,notes:"Transferência - origem",payment_method:"transfer",transfer_group_id:group},{user_id:user.uid,type:"entrada",amount,transaction_date:date,competence_date:date,paid_date:date,account_id:to,status:"pago",description:desc,notes:"Transferência - destino",payment_method:"transfer",transfer_group_id:group}];const r=await sb.from("transactions").insert(rows);msg("transferMsg",r.error?.message||"Transferência realizada.");if(!r.error){$("transferForm").reset();$("transferDate").value=today;await load()}}
async function saveAccount(e){e.preventDefault();let r=await sb.from("accounts").insert({user_id:user.uid,name:$("accountName").value,type:$("accountType").value,initial_balance:+$("accountInitial").value||0});msg("accountMsg",r.error?.message||"Conta cadastrada.");if(!r.error){$("accountForm").reset();await load()}}
function paymentSummary(t){const p=Array.isArray(t.payment_parts)?t.payment_parts:[];if(!p.length)return t.payment_method||"-";return p.map(x=>{let label=x.method==='credit'?`Cartão${x.installments>1?` ${x.installments}x`:''}`:({pix:'PIX',debit:'Débito',cash:'Dinheiro',transfer:'Transferência',boleto:'Boleto',other:'Outro'})[x.method]||x.method;return `${label}: ${money(x.amount)}${x.method==='credit'&&x.fee_percent?` · taxa ${x.fee_percent}%`:''}`}).join(' + ')}
function render(){
  $("txBody").innerHTML=txs.slice(0,200).map(t=>`<tr><td>${t.transaction_date}</td><td>${t.type}</td><td>${esc(t.name||t.description||"Sem nome")}</td><td>${esc(t.categories?.name||"-")}</td><td>${money(t.amount)}${t.original_amount&&Math.abs(Number(t.original_amount)-Number(t.amount))>0.001?`<small class="cell-sub">Bruto ${money(t.original_amount)}</small>`:""}</td><td>${t.metal_value?money(t.metal_value):"-"}</td><td>${t.initial_kg?Number(t.initial_kg).toFixed(3):"-"}</td><td>${t.final_kg?Number(t.final_kg).toFixed(3):"-"}</td><td><small>${esc(paymentSummary(t))}</small></td><td>${t.status}</td><td>${t.installment_total>1?t.installment_number+"/"+t.installment_total:"-"}</td><td><button type="button" class="secondary small-btn" onclick="editTx('${t.id}')">Editar</button></td></tr>`).join("");
  $("cardBody").innerHTML=cards.map(c=>{let u=txs.filter(t=>t.card_id===c.id&&t.type==="saida"&&t.transaction_date.startsWith(thisMonth)).reduce((a,t)=>a+ +t.amount,0);return`<tr><td>${esc(c.name)}</td><td>${money(c.limit_amount)}</td><td>${money(u)}</td><td>${money(Math.max(0,c.limit_amount-u))}</td><td>${c.closing_day}</td><td>${c.due_day}</td></tr>`}).join("");
  $("recBody").innerHTML=recurring.map(r=>`<tr><td>${esc(r.description)}</td><td>${money(r.amount)}</td><td>${esc(r.categories?.name||"-")}</td><td>${r.due_day}</td><td>${r.start_date}</td><td>${r.end_date||"-"}</td></tr>`).join("");
  $("goals").innerHTML=goalsData();$("accountBody").innerHTML=accounts.map(a=>{let m=txs.filter(t=>t.account_id===a.id).reduce((s,t)=>s+(t.type==="entrada"?1:-1)*+t.amount,0);return`<tr><td>${esc(a.name)}</td><td>${esc(a.type)}</td><td>${money(a.initial_balance)}</td><td>${money(m)}</td><td>${money(+a.initial_balance+m)}</td></tr>`}).join("");dashboard();report();
}
function updateDashboardAnalysis(rows){
  const income=rows.filter(t=>t.type==='entrada').reduce((s,t)=>s+Number(t.original_amount??t.amount)||0,0);
  const expense=rows.filter(t=>t.type==='saida').reduce((s,t)=>s+Number(t.amount)||0,0);
  const margin=income?((income-expense)/income)*100:0;
  const avg=rows.length?rows.reduce((s,t)=>s+Math.abs(Number(t.amount)||0),0)/rows.length:0;
  const expenses=rows.filter(t=>t.type==='saida');
  const cat={};expenses.forEach(t=>{const n=t.categories?.name||t.category_name||'Sem categoria';cat[n]=(cat[n]||0)+(Number(t.amount)||0)});
  const top=Object.entries(cat).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const best={};rows.filter(t=>t.type==='entrada').forEach(t=>{const d=String(t.transaction_date||'').slice(0,10);best[d]=(best[d]||0)+(Number(t.original_amount??t.amount)||0)});
  const bestDay=Object.entries(best).sort((a,b)=>b[1]-a[1])[0];
  if($('dashMargin'))$('dashMargin').textContent=`${margin>=0?'+':''}${margin.toFixed(1)}%`;
  if($('dashAvg'))$('dashAvg').textContent=money(avg);
  if($('dashTopExpense'))$('dashTopExpense').textContent=top.length?money(top[0][1]):money(0);
  if($('dashBestDay'))$('dashBestDay').textContent=bestDay?`${bestDay[0].split('-').reverse().slice(0,2).join('/')} · ${money(bestDay[1])}`:'—';
  const max=top[0]?.[1]||1;
  if($('dashCategoryList'))$('dashCategoryList').innerHTML=top.map(([name,value])=>`<div class="dash-cat-row"><span class="dash-cat-name">${esc(name)}</span><div class="dash-cat-bar"><span style="width:${Math.max(3,(value/max)*100)}%"></span></div><span class="dash-cat-value">${money(value)}</span></div>`).join('')||'<div class="dash-empty">Nenhuma despesa no período.</div>';
}
function dashboard(){
  const m=$("dashMonth").value||thisMonth;
  const r=txs.filter(t=>String(t.transaction_date||"").slice(0,7)===m);
  const num=v=>Number(v)||0;
  const ins=r.filter(t=>t.type==="entrada").reduce((s,t)=>s+num(t.original_amount??t.amount),0);
  const out=r.filter(t=>t.type==="saida").reduce((s,t)=>s+num(t.amount),0);
  const pending=txs.filter(t=>t.type==="saida"&&t.status!=="pago"&&String(t.transaction_date||"")>=today).reduce((s,t)=>s+num(t.amount),0);
  const receivable=txs.filter(t=>t.type==="entrada"&&t.status!=="pago").reduce((s,t)=>s+num(t.amount),0);
  const invoice=txs.filter(t=>t.type==="saida"&&t.card_id&&String(t.transaction_date||"").slice(0,7)===m).reduce((s,t)=>s+num(t.amount),0);
  const result=ins-out;
  updateDashboardAnalysis(r);
  $("inTotal").textContent=money(ins);$("outTotal").textContent=money(out);$("result").textContent=money(result);$("available").textContent=money(result-pending);
  $("payableTotal").textContent=money(pending);$("receivableTotal").textContent=money(receivable);$("invoiceTotal").textContent=money(invoice);

  const prevDate=new Date(`${m}-01T12:00:00`);prevDate.setMonth(prevDate.getMonth()-1);const pm=prevDate.toISOString().slice(0,7);
  const prev=txs.filter(t=>String(t.transaction_date||"").slice(0,7)===pm);
  const prevResult=prev.filter(t=>t.type==="entrada").reduce((s,t)=>s+num(t.original_amount??t.amount),0)-prev.filter(t=>t.type==="saida").reduce((s,t)=>s+num(t.amount),0);
  const variation=prevResult===0?(result===0?0:100):((result-prevResult)/Math.abs(prevResult))*100;
  $("monthCompare").textContent=`${variation>=0?"+":""}${variation.toFixed(1)}%`;

  const [yy,mm]=m.split('-').map(Number); const days=new Date(yy,mm,0).getDate();
  const labels=[],entries=[],expenses=[],results=[];
  for(let d=1;d<=days;d++){
    const day=String(d).padStart(2,"0"), key=`${m}-${day}`;labels.push(day);
    const dayRows=r.filter(t=>String(t.transaction_date||"").slice(0,10)===key);
    const ei=dayRows.filter(t=>t.type==="entrada").reduce((s,t)=>s+num(t.original_amount??t.amount),0);
    const eo=dayRows.filter(t=>t.type==="saida").reduce((s,t)=>s+num(t.amount),0);
    entries.push(ei);expenses.push(eo);results.push(ei-eo);
  }
  const cc={};r.filter(t=>t.type==="saida").forEach(t=>{const n=t.categories?.name||t.category_name||"Sem categoria";cc[n]=(cc[n]||0)+num(t.amount)});
  const catEntries=Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,8);
  flowChart?.destroy();catChart?.destroy();
  const flow=$('flow');const cats=$('cats');
  if(flow)flowChart=new Chart(flow,{type:'line',data:{labels,datasets:[
    {label:'Entradas',data:entries,borderWidth:2,tension:.35,pointRadius:2,fill:false},
    {label:'Saídas',data:expenses,borderWidth:2,tension:.35,pointRadius:2,fill:false},
    {label:'Resultado',data:results,borderWidth:3,tension:.35,pointRadius:1,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${money(c.raw)}`}}},scales:{y:{ticks:{callback:v=>money(v)}},x:{grid:{display:false}}}}});
  if(cats)catChart=new Chart(cats,{type:'bar',data:{labels:catEntries.map(x=>x[0]),datasets:[{label:'Gastos',data:catEntries.map(x=>x[1]),borderRadius:7}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>money(c.raw)}}},scales:{x:{ticks:{callback:v=>money(v)}},y:{grid:{display:false}}}}});
  $("due").innerHTML=txs.filter(t=>t.type==="saida"&&t.status!=="pago").sort((a,b)=>String(a.transaction_date).localeCompare(String(b.transaction_date))).slice(0,6).map(t=>`<div class="dash-list-row"><div><b>${esc(t.name||t.description||"Sem descrição")}</b><small>${t.transaction_date} · ${esc(t.categories?.name||t.category_name||"Sem categoria")}</small></div><strong>${money(t.amount)}</strong></div>`).join("")||'<div class="dash-empty">Nenhuma conta pendente.</div>';
  $("cardDash").innerHTML=cards.map(c=>{const used=txs.filter(t=>t.card_id===c.id&&t.type==="saida"&&String(t.transaction_date||"").slice(0,7)===m).reduce((s,t)=>s+num(t.amount),0);const pct=c.limit_amount?Math.min(100,used/num(c.limit_amount)*100):0;return`<div class="dash-card-row"><div><b>${esc(c.name)}</b><small>${money(used)} de ${money(c.limit_amount)}</small></div><div class="dash-mini-progress"><span style="width:${pct}%"></span></div></div>`}).join("")||'<div class="dash-empty">Nenhum cartão cadastrado.</div>';
  $("goalDash").innerHTML=goalsList.slice(0,5).map(g=>{const pct=num(g.target_amount)?Math.min(100,num(g.current_amount)/num(g.target_amount)*100):0;return`<div class="dash-goal-row"><div><b>${esc(g.name)}</b><small>${money(g.current_amount)} de ${money(g.target_amount)}</small></div><strong>${pct.toFixed(0)}%</strong></div>`}).join("")||'<div class="dash-empty">Nenhuma meta cadastrada.</div>';
  const forecast=txs.filter(t=>String(t.transaction_date||"")>=today&&String(t.transaction_date||"")<=new Date(Date.now()+30*86400000).toISOString().slice(0,10));
  $("forecast30").textContent=money(forecast.reduce((s,t)=>s+(t.type==='entrada'?1:-1)*num(t.amount),0));
  const f60=txs.filter(t=>String(t.transaction_date||"")>=today&&String(t.transaction_date||"")<=new Date(Date.now()+60*86400000).toISOString().slice(0,10));
  const f90=txs.filter(t=>String(t.transaction_date||"")>=today&&String(t.transaction_date||"")<=new Date(Date.now()+90*86400000).toISOString().slice(0,10));
  $("forecast60").textContent=money(f60.reduce((s,t)=>s+(t.type==='entrada'?1:-1)*num(t.amount),0));$("forecast90").textContent=money(f90.reduce((s,t)=>s+(t.type==='entrada'?1:-1)*num(t.amount),0));
}

function report(){
  const m=$("reportMonth").value||thisMonth,r=txs.filter(t=>String(t.transaction_date||"").startsWith(m));
  const i=r.filter(t=>t.type==="entrada").reduce((s,t)=>s+ +(t.original_amount??t.amount),0),o=r.filter(t=>t.type==="saida").reduce((s,t)=>s+ +t.amount,0);
  $("summary").innerHTML=`<p>Entradas <b>${money(i)}</b> · Saídas <b>${money(o)}</b> · Resultado <b>${money(i-o)}</b></p>`;
  $("reportBody").innerHTML=r.map(t=>`<tr><td>${t.transaction_date}</td><td>${t.type}</td><td>${esc(t.name||t.description||"Sem nome")}</td><td>${esc(t.categories?.name||"-")}</td><td>${money(t.amount)}</td><td>${t.metal_value?`${money(t.metal_value)} · ${Number(t.initial_kg||0).toFixed(3)}kg → ${Number(t.final_kg||0).toFixed(3)}kg`:'-'}</td><td>${t.status}</td></tr>`).join("");
}
function excel(){
 const m=$("reportMonth").value||thisMonth,r=txs.filter(t=>String(t.transaction_date||"").startsWith(m));
 const rows=r.map(t=>({Data:t.transaction_date,Tipo:t.type,Nome:t.name||t.description||"",Descrição:t.description||"",Categoria:t.categories?.name||"",Subcategoria:t.subcategory||"",Conta:t.accounts?.name||"",Cartão:t.cards?.name||"",Valor_Bruto:+(t.original_amount??t.amount),Valor_Liquido:+t.amount,Valor_Metal:+(t.metal_value||0),KG_Inicial:+(t.initial_kg||0),KG_Final:+(t.final_kg||0),Forma_de_Recebimento:paymentSummary(t),Taxa_Total:+(t.payment_fee_total||0),Classificação_DRE:t.dre_class||"",Status:t.status,Parcela:t.installment_total>1?`${t.installment_number}/${t.installment_total}`:""}));
 const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Financeiro");XLSX.writeFile(wb,`financeiro-${m}.xlsx`)
}
function pdf(){
 const m=$("reportMonth").value||thisMonth,r=txs.filter(t=>String(t.transaction_date||"").startsWith(m)),i=r.filter(t=>t.type==="entrada").reduce((s,t)=>s+ +(t.original_amount??t.amount),0),o=r.filter(t=>t.type==="saida").reduce((s,t)=>s+ +t.amount,0);
 const D=window.jspdf.jsPDF,d=new D();d.text("Relatório Financeiro Empresarial",14,18);d.setFontSize(10);d.text(`Mês: ${m}`,14,27);d.text(`Entradas: ${money(i)}  Saídas: ${money(o)}  Resultado: ${money(i-o)}`,14,36);
 const custos=r.filter(t=>t.type==="saida"&&t.dre_class==="custo").reduce((s,t)=>s+ +t.amount,0),op=r.filter(t=>t.type==="saida"&&(t.dre_class==="despesa_operacional"||!t.dre_class)).reduce((s,t)=>s+ +t.amount,0),fin=r.filter(t=>t.type==="saida"&&t.dre_class==="despesa_financeira").reduce((s,t)=>s+ +t.amount,0),ded=r.filter(t=>t.dre_class==="deducao_receita").reduce((s,t)=>s+ +t.amount,0);
 d.text("DRE",14,46);d.text(`Receita bruta: ${money(i)}`,14,54);d.text(`(-) Deduções: ${money(ded)}`,14,61);d.text(`Receita líquida: ${money(i-ded)}`,14,68);d.text(`(-) Custos: ${money(custos)}`,14,75);d.text(`(-) Despesas operacionais: ${money(op)}`,14,82);d.text(`Resultado operacional: ${money(i-ded-custos-op)}`,14,89);d.text(`(-) Despesas financeiras: ${money(fin)}`,14,96);d.text(`Resultado líquido: ${money(i-ded-custos-op-fin)}`,14,103);
 let y=114;d.setFontSize(8);r.forEach(t=>{if(y>285){d.addPage();y=15}const metal=t.metal_value?` | Metal ${money(t.metal_value)} | KG ${Number(t.initial_kg||0).toFixed(3)}→${Number(t.final_kg||0).toFixed(3)}`:"";d.text(`${t.transaction_date} | ${t.type} | ${String(t.name||t.description||"Sem nome").slice(0,28)} | ${money(t.amount)}${metal}`,14,y);y+=6});d.save(`financeiro-${m}.pdf`)
}
function page(p){document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));const target=$(p);if(!target)return;target.classList.remove("hidden");document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===p));if(p==="calendario")advCalendar();if(p==="dashboard")dashboard();window.scrollTo({top:0,behavior:"smooth"})}

/* Dashboard financeiro premium */
function moneyBR(v){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v)||0);}
function premiumArr(name){return Array.isArray(window[name])?window[name]:(typeof window[name[0]]!=="undefined"?window[name[0]]:[]);}
function premiumSum(arr,keys){return (arr||[]).reduce((s,x)=>{for(const k of keys){if(x&&x[k]!==undefined&&x[k]!==null&&x[k]!=="")return s+(Number(x[k])||0);}return s;},0);}
function updateCreditSummary(){
 try{
  const ca=Array.isArray(window.cards)?window.cards:(typeof cards!=="undefined"?cards:[]);
  const tx=Array.isArray(window.transactions)?window.transactions:(typeof txs!=="undefined"?txs:[]);
  const limit=premiumSum(ca,["limit_amount","limit"]);
  const due=tx.filter(t=>["expense","saida","despesa"].includes(t.type)&&(t.payment_method==="credit"||t.method==="credit"||t.payment==="credit"||t.card_id)).reduce((s,t)=>s+Math.abs(Number(t.amount||t.value||0)),0);
  const d=document.getElementById("creditDueTotal"),a=document.getElementById("creditAvailableTotal"),l=document.getElementById("creditLimitTotalLabel");
  if(d)d.textContent=moneyBR(due);if(a)a.textContent=moneyBR(Math.max(limit-due,0));if(l)l.textContent="Limite total: "+moneyBR(limit);
 }catch(e){console.warn(e)}
}
function renderPremiumReport(){
 const box=document.getElementById("pdfReport");if(!box)return;
 const tx=Array.isArray(window.transactions)?window.transactions:(typeof txs!=="undefined"?txs:[]);
 const inc=tx.filter(t=>["income","entrada","receita"].includes(t.type)).reduce((s,t)=>s+Math.abs(Number(t.amount||t.value||0)),0);
 const exp=tx.filter(t=>["expense","saida","despesa"].includes(t.type)).reduce((s,t)=>s+Math.abs(Number(t.amount||t.value||0)),0);
 box.innerHTML=`<div class="mini"><span>RECEITAS</span><strong>${moneyBR(inc)}</strong></div><div class="mini"><span>DESPESAS</span><strong>${moneyBR(exp)}</strong></div><div class="mini"><span>SALDO DO PERÍODO</span><strong>${moneyBR(inc-exp)}</strong></div>`;
}
async function generatePremiumPDF(){
 if(typeof window.jspdf==="undefined"&&typeof jsPDF==="undefined"){alert("Biblioteca de PDF não carregada.");return;}
 const PDF=window.jspdf?window.jspdf.jsPDF:jsPDF,doc=new PDF({unit:"mm",format:"a4"}),W=210;
 doc.setFillColor(16,43,89);doc.rect(0,0,W,45,"F");doc.setTextColor(255,255,255);doc.setFontSize(22);doc.text("MEU FINANCEIRO",16,19);doc.setFontSize(10);doc.text("RESUMO FINANCEIRO EXECUTIVO",16,27);doc.setFontSize(9);doc.text(new Date().toLocaleDateString("pt-BR"),16,35);
 const tx=Array.isArray(window.transactions)?window.transactions:(typeof txs!=="undefined"?txs:[]),ca=Array.isArray(window.cards)?window.cards:(typeof cards!=="undefined"?cards:[]);
 const inc=tx.filter(t=>["income","entrada","receita"].includes(t.type)).reduce((s,t)=>s+Math.abs(Number(t.amount||t.value||0)),0),exp=tx.filter(t=>["expense","saida","despesa"].includes(t.type)).reduce((s,t)=>s+Math.abs(Number(t.amount||t.value||0)),0),lim=premiumSum(ca,["limit_amount","limit"]),due=tx.filter(t=>["expense","saida","despesa"].includes(t.type)&&(t.payment_method==="credit"||t.method==="credit"||t.payment==="credit"||t.card_id)).reduce((s,t)=>s+Math.abs(Number(t.amount||t.value||0)),0);
 let y=58;const metrics=[["RECEITAS",inc],["DESPESAS",exp],["SALDO",inc-exp],["CARTÕES A PAGAR",due],["LIMITE DISPONÍVEL",Math.max(lim-due,0)]];
 metrics.forEach((m,i)=>{const x=16+(i%2)*92;if(i===4)y+=31;doc.setDrawColor(225,234,243);doc.roundedRect(x,y,84,23,4,4);doc.setFontSize(8);doc.setTextColor(113,128,150);doc.text(m[0],x+6,y+8);doc.setFontSize(14);doc.setTextColor(16,33,59);doc.text(moneyBR(m[1]),x+6,y+17);if(i%2===1)y+=31;});
 y+=39;doc.setFontSize(13);doc.setTextColor(16,43,89);doc.text("Gráfico de receitas x despesas",16,y);y+=9;
 const max=Math.max(inc,exp,1);[["Receitas",inc,23,78,166],["Despesas",exp,239,71,111]].forEach((v,i)=>{const bw=115*v[1]/max;doc.setFillColor(v[2],v[3],v[4]);doc.roundedRect(28,y+i*16,Math.max(bw,2),9,2,2,"F");doc.setTextColor(70,85,105);doc.setFontSize(9);doc.text(v[0]+"  "+moneyBR(v[1]),148,y+6+i*16);});
 y+=51;doc.setTextColor(16,43,89);doc.setFontSize(13);doc.text("Cartões de crédito",16,y);y+=9;doc.setFontSize(9);doc.setTextColor(70,85,105);
 ca.slice(0,9).forEach(c=>{doc.text(c.name||"Cartão",18,y);doc.text("Limite: "+moneyBR(c.limit_amount??c.limit??0),85,y);y+=7;if(y>275){doc.addPage();y=20;}});
 doc.setFontSize(8);doc.setTextColor(120,135,150);doc.text("Gerado pelo Meu Financeiro",16,289);doc.save("resumo-financeiro.pdf");
}
window.updateCreditSummary=updateCreditSummary;window.renderPremiumReport=renderPremiumReport;window.generatePremiumPDF=generatePremiumPDF;
setTimeout(()=>{updateCreditSummary();renderPremiumReport();},900);


/* =========================================================
   RELUZ FINANCEIRO — MÓDULOS AVANÇADOS
   Dashboard, contas a pagar/receber, cartões/faturas,
   projeções, calendário e busca global.
   ========================================================= */
function advDate(v){return v?new Date(v+"T12:00:00"):null}
function advISO(d){return d.toISOString().slice(0,10)}
function advDaysFromNow(n){const d=new Date();d.setDate(d.getDate()+n);return advISO(d)}
function advMonth(v){return (v||"").slice(0,7)}
function advNum(v){return Number(v)||0}
function advTypeIncome(t){return t.type==="entrada"||t.type==="income"||t.type==="receita"}
function advTypeExpense(t){return t.type==="saida"||t.type==="expense"||t.type==="despesa"}
function advStatusPaid(t){return t.status==="pago"||t.status==="paid"||t.status==="recebido"}
function advCategory(t){return t.categories?.name||categories.find(c=>c.id===t.category_id)?.name||"Outros"}
function advAccount(t){return t.accounts?.name||accounts.find(a=>a.id===t.account_id)?.name||"—"}
function advCard(t){return t.cards?.name||cards.find(c=>c.id===t.card_id)?.name||"—"}
function advCurrentBalance(){return accounts.reduce((s,a)=>s+advNum(a.initial_balance),0)+txs.reduce((s,t)=>s+(advTypeIncome(t)?advNum(t.amount):-advNum(t.amount)),0)}
function advMonthTotals(month){const r=txs.filter(t=>advMonth(t.transaction_date)===month);return {rows:r,income:r.filter(advTypeIncome).reduce((s,t)=>s+advNum(t.amount),0),expense:r.filter(advTypeExpense).reduce((s,t)=>s+advNum(t.amount),0)}}
function advPending(){return txs.filter(t=>!advStatusPaid(t)&&t.status!=="cancelado")}
function advPayables(){return advPending().filter(advTypeExpense)}
function advReceivables(){return advPending().filter(advTypeIncome)}
function advInvoiceTotal(month=thisMonth){return txs.filter(t=>advTypeExpense(t)&&t.card_id&&advMonth(t.transaction_date)===month).reduce((s,t)=>s+advNum(t.amount),0)}
function advNextMonth(){const d=new Date();d.setMonth(d.getMonth()+1);return advISO(d).slice(0,7)}
function advCardUsage(cardId,month=thisMonth){return txs.filter(t=>t.card_id===cardId&&advTypeExpense(t)&&advMonth(t.transaction_date)===month).reduce((s,t)=>s+advNum(t.amount),0)}
function advRenderBusiness(){
 const now=today, in7=advDaysFromNow(7), in30=advDaysFromNow(30), in60=advDaysFromNow(60), in90=advDaysFromNow(90);
 const pay=advPayables(),rec=advReceivables(),overdue=pay.filter(t=>t.transaction_date<now).reduce((s,t)=>s+advNum(t.amount),0);
 const sum=(arr,a,b)=>arr.filter(t=>t.transaction_date>=a&&t.transaction_date<=b).reduce((s,t)=>s+(advTypeIncome(t)?advNum(t.amount):-advNum(t.amount)),0);
 const projected=(n)=>advCurrentBalance()+sum(advPending(),now,advDaysFromNow(n));
 const set=(id,v)=>{const e=$(id);if(e)e.textContent=money(v)};
 set("payableTotal",pay.filter(t=>t.transaction_date>=now).reduce((s,t)=>s+advNum(t.amount),0));set("receivableTotal",rec.filter(t=>t.transaction_date>=now).reduce((s,t)=>s+advNum(t.amount),0));set("invoiceTotal",advInvoiceTotal());
 const cur=advMonthTotals(thisMonth), prevDate=new Date();prevDate.setMonth(prevDate.getMonth()-1);const prev=advMonthTotals(advISO(prevDate).slice(0,7));const prevResult=prev.income-prev.expense, curResult=cur.income-cur.expense;const pct=prevResult?((curResult-prevResult)/Math.abs(prevResult))*100:curResult?100:0;const mc=$("monthCompare");if(mc)mc.textContent=(pct>=0?"+":"")+pct.toFixed(1)+"%";
 set("forecast30",projected(30));set("forecast60",projected(60));set("forecast90",projected(90));set("bizPayable",pay.reduce((s,t)=>s+advNum(t.amount),0));set("bizReceivable",rec.reduce((s,t)=>s+advNum(t.amount),0));set("bizOverdue",overdue);set("bizProjected",projected(90));set("bizMonthIncome",cur.income);set("bizMonthExpense",cur.expense);const bm=$("bizMargin");if(bm)bm.textContent=(cur.income?(curResult/cur.income*100):0).toFixed(1)+"%";set("bizRecurring",recurring.reduce((s,r)=>s+advNum(r.amount),0));
 const row=t=>`<div class="adv-row"><div><b>${esc(t.description||"Sem descrição")}</b><small>${t.transaction_date} · ${esc(advCategory(t))} · ${esc(advAccount(t))}</small></div><strong>${money(t.amount)}</strong></div>`;
 const pl=$("payableList"),rl=$("receivableList");if(pl)pl.innerHTML=pay.sort((a,b)=>(a.transaction_date||"").localeCompare(b.transaction_date||"")).slice(0,10).map(row).join("")||"Nenhuma conta a pagar.";if(rl)rl.innerHTML=rec.sort((a,b)=>(a.transaction_date||"").localeCompare(b.transaction_date||"")).slice(0,10).map(row).join("")||"Nenhuma conta a receber.";
}
function advRenderCards(){
 const body=$("cardBody");if(!body)return;body.innerHTML=cards.map(c=>{const used=advCardUsage(c.id),limit=advNum(c.limit_amount),available=Math.max(0,limit-used);const next=advCardUsage(c.id,advNextMonth());return `<tr><td>${esc(c.name)}</td><td>${money(limit)}</td><td>${money(used)}</td><td>${money(next)}</td><td>${money(available)}</td><td>${c.closing_day||"—"}</td><td>${c.due_day||"—"}</td></tr>`}).join("");
 const dash=$("cardDash");if(dash)dash.innerHTML=cards.map(c=>{const used=advCardUsage(c.id);return `<p><b>${esc(c.name)}</b> · ${money(used)} / ${money(c.limit_amount)}<br><small>Disponível: ${money(Math.max(0,advNum(c.limit_amount)-used))} · Fechamento ${c.closing_day||"—"} · Vencimento ${c.due_day||"—"}</small></p>`}).join("")||"Nenhum cartão.";
}
function advCalendar(){
 const el=$("calendarGrid");
 if(!el)return;
 const month=$("calendarMonth").value||thisMonth;
 const [y,m]=month.split("-").map(Number);
 const first=new Date(y,m-1,1),last=new Date(y,m,0);
 const start=(first.getDay()+6)%7,days=last.getDate();
 const normalizeDate=v=>{
   if(v===null||v===undefined||v==="")return "";
   const s=String(v).trim();
   let mt=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
   if(mt)return `${mt[1]}-${mt[2]}-${mt[3]}`;
   mt=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
   if(mt)return `${mt[3]}-${mt[2]}-${mt[1]}`;
   const d=new Date(s);
   if(!Number.isNaN(d.getTime()))return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
   return s.slice(0,10);
 };
 const txDate=t=>normalizeDate(t.transaction_date||t.competence_date||t.paid_date);
 const itemsByDay={};
 txs.forEach(t=>{const ds=txDate(t);if(!ds)return;(itemsByDay[ds]??=[]).push(t)});
 let html="<div class='cal-head'>"+["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(x=>`<b>${x}</b>`).join("")+"</div><div class='cal-body'>";
 for(let i=0;i<start;i++)html+="<div class='cal-day empty-day'></div>";
 for(let d=1;d<=days;d++){
   const ds=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
   const items=itemsByDay[ds]||[];
   const hasIn=items.some(advTypeIncome),hasOut=items.some(advTypeExpense),hasCard=items.some(t=>t.card_id);
   const totalIn=items.filter(advTypeIncome).reduce((s,t)=>s+advNum(t.amount),0);
   const totalOut=items.filter(advTypeExpense).reduce((s,t)=>s+advNum(t.amount),0);
   const pendingOut=items.some(t=>advTypeExpense(t)&&!advStatusPaid(t));
   html+=`<div class='cal-day${ds===today?" today": ""}'><span>${d}</span><div>${hasIn?"<i class='income-dot' title='Recebimento'>●</i>":""}${hasOut?"<i class='expense-dot' title='Pagamento'>●</i>":""}${pendingOut?"<i class='due-dot' title='Vencimento pendente'>●</i>":""}${hasCard?"<i class='invoice-dot' title='Cartão'>●</i>":""}</div>${totalIn?`<small class='income-dot'>+ ${money(totalIn)}</small>`:""}${totalOut?`<small class='expense-dot'>− ${money(totalOut)}</small>`:""}${items.slice(0,2).map(t=>`<small>${esc(t.name||t.description||"Sem nome")} · ${money(t.amount)}</small>`).join("")}${items.length>2?`<small>+ ${items.length-2} lançamento(s)</small>`:""}</div>`;
 }
 html+="</div>";
 el.innerHTML=html;
}
function advGlobalSearch(q){
 const box=$("searchResults");if(!box)return;if(!q||q.length<2){box.classList.add("hidden");return}q=q.toLowerCase();const results=[];txs.forEach(t=>{const hay=`${t.name||""} ${t.description||""} ${t.notes||""} ${t.subcategory||""} ${advCategory(t)} ${advAccount(t)} ${advCard(t)}`.toLowerCase();if(hay.includes(q))results.push({type:"Lançamento",title:t.name||t.description||"Sem nome",meta:`${t.transaction_date} · ${money(t.amount)} · ${advCategory(t)}`})});categories.forEach(c=>{if(c.name.toLowerCase().includes(q))results.push({type:"Categoria",title:c.name,meta:c.type})});accounts.forEach(a=>{if(a.name.toLowerCase().includes(q))results.push({type:"Conta",title:a.name,meta:money(a.initial_balance)})});cards.forEach(c=>{if(c.name.toLowerCase().includes(q))results.push({type:"Cartão",title:c.name,meta:`Limite ${money(c.limit_amount)}`})});box.innerHTML=results.slice(0,12).map(r=>`<div class='search-item'><b>${esc(r.title)}</b><small>${esc(r.type)} · ${esc(r.meta)}</small></div>`).join("")||"<div class='search-item'>Nenhum resultado.</div>";box.classList.remove("hidden");}
function advReports(){
 const dre=$("dreReport"), annual=$("annualReport"); if(!dre||!annual)return;
 const month=$('reportMonth')?.value||thisMonth;
 const rows=txs.filter(t=>String(t.transaction_date||'').startsWith(month));
 const income=rows.filter(t=>t.type==='entrada').reduce((s,t)=>s+advNum(t.original_amount??t.amount),0);
 const custos=rows.filter(t=>t.type==='saida'&&t.dre_class==='custo').reduce((s,t)=>s+advNum(t.amount),0);
 const deducoes=rows.filter(t=>t.dre_class==='deducao_receita').reduce((s,t)=>s+advNum(t.amount),0);
 const op=rows.filter(t=>t.type==='saida'&&(t.dre_class==='despesa_operacional'||!t.dre_class)).reduce((s,t)=>s+advNum(t.amount),0);
 const fin=rows.filter(t=>t.type==='saida'&&t.dre_class==='despesa_financeira').reduce((s,t)=>s+advNum(t.amount),0);
 const invest=rows.filter(t=>t.type==='saida'&&t.dre_class==='investimento').reduce((s,t)=>s+advNum(t.amount),0);
 const receitaLiquida=income-deducoes; const resultadoOperacional=receitaLiquida-custos-op; const resultadoLiquido=resultadoOperacional-fin;
 const line=(label,value,cls='')=>`<div class="dre-line ${cls}"><span>${label}</span><b>${money(value)}</b></div>`;
 dre.innerHTML=line('RECEITA BRUTA',income,'section')+line('(-) Deduções da receita',-deducoes)+line('= RECEITA LÍQUIDA',receitaLiquida,'subtotal')+line('(-) Custos',-custos)+line('(-) Despesas operacionais',-op)+line('= RESULTADO OPERACIONAL',resultadoOperacional,'total')+line('(-) Despesas financeiras',-fin)+line('= RESULTADO LÍQUIDO',resultadoLiquido,'total')+line('Investimentos (fora da DRE)',invest,'muted');
 const months=[];for(let i=11;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);const key=advISO(d).slice(0,7),v=advMonthTotals(key);months.push({key,...v})} annual.innerHTML=months.map(x=>`<div class='annual-row'><span>${x.key}</span><b>${money(x.income-x.expense)}</b><small>${money(x.income)} / ${money(x.expense)}</small></div>`).join("");
}
function advAnnualPdf(){const old=$('reportMonth')?.value;const data=[];for(let i=0;i<12;i++){const d=new Date(new Date().getFullYear(),i,1),k=advISO(d).slice(0,7),v=advMonthTotals(k);data.push([k,v.income,v.expense,v.income-v.expense])}const D=window.jspdf.jsPDF,d=new D();d.setFontSize(18);d.text("Relatório Financeiro Anual",14,18);d.setFontSize(10);d.text("Mês | Entradas | Saídas | Resultado",14,28);let y=36;data.forEach(r=>{d.text(`${r[0]} | ${money(r[1])} | ${money(r[2])} | ${money(r[3])}`,14,y);y+=7;if(y>280){d.addPage();y=18}});d.save(`financeiro-anual-${new Date().getFullYear()}.pdf`)}
async function advGenerateRecurring(){
 if(!recurring.length)return;
 const base=new Date();
 for(let offset=0;offset<3;offset++){
  const target=new Date(base.getFullYear(),base.getMonth()+offset,1),month=`${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,"0")}`;
  for(const r of recurring){
   if(r.end_date&&r.end_date<`${month}-01`)continue;
   const day=Math.min(Number(r.due_day)||1,new Date(target.getFullYear(),target.getMonth()+1,0).getDate()),date=`${month}-${String(day).padStart(2,"0")}`;
   if(date<r.start_date)continue;
   const exists=txs.some(t=>t.recurring_id===r.id&&t.transaction_date===date);
   if(exists)continue;
   await sb.from("transactions").insert({user_id:user.uid,type:r.type||"saida",amount:advNum(r.amount),transaction_date:date,competence_date:date,category_id:r.category_id||null,status:"pendente",description:r.description,notes:"Gerado automaticamente pela recorrência",recurring_id:r.id,recurrence:"monthly"});
  }
 }
}
function advInit(){
 const cal=$("calendarMonth");if(cal){cal.value=thisMonth;cal.onchange=advCalendar}
 const gs=$("globalSearch");if(gs){gs.addEventListener("input",e=>advGlobalSearch(e.target.value));document.addEventListener("click",e=>{if(!e.target.closest(".global-search"))$("searchResults")?.classList.add("hidden")})}
 $("annualPdf")?.addEventListener("click",advAnnualPdf);
 const oldTxForm=$("txForm");if(oldTxForm){/* campos adicionais já são persistidos pelo saveTx */}
 advCalendar();advRenderBusiness();advRenderCards();advReports();
}
let advReady=false;const advTimer=setInterval(async()=>{if(user&&window.__reluzLoaded&&!advReady){advReady=true;clearInterval(advTimer);await advGenerateRecurring();await load();advInit();}},400);
setInterval(()=>{if(user){advRenderBusiness();advRenderCards();advCalendar();advReports();}},5000);
