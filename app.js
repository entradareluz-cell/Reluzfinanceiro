// RELUZ FINANCEIRO — autenticação e banco 100% via Google Sheets + Apps Script.
const API_URL = "https://script.google.com/macros/s/AKfycbzmN3PTZUfie-PvoS1NL8IooXfz3nz57aWHaYDxXCk6ggX0dz98HVasyPeeiwZWlosT/exec";
let editingTxId = null;
let machineRates = [];

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
    options.body=JSON.stringify({action,...payload});
  }
  const res=await fetch(url,options);
  const text=await res.text();
  let data;
  try{data=JSON.parse(text)}catch{throw new Error(text||"Resposta inválida do Apps Script.");}
  if(data?.success===false) throw new Error(data.error||"Erro no Apps Script.");
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
async function updateDoc(ref,data){await api("update",{sheet:ref.sheet,id:ref.id,record:data});}
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
function saveSession(u){localStorage.setItem("reluz_session",JSON.stringify(u));}
function getSessionUser(){try{return JSON.parse(localStorage.getItem("reluz_session")||"null")}catch{return null}}
function clearSession(){localStorage.removeItem("reluz_session");}
const sb={
 from:builder,
 auth:{
  getSession:async()=>{const u=getSessionUser();return {data:{session:u?{user:u}:null},error:null};},
  signInWithPassword:async({email,password})=>{try{
    const r=await api("login",{email:String(email||"").trim().toLowerCase(),password_hash:await sha256(password)});
    if(!r.data?.user) throw new Error("E-mail ou senha incorretos.");
    saveSession(r.data.user); return {data:{user:r.data.user,session:{user:r.data.user}},error:null};
  }catch(error){return {data:null,error}}},
  signUp:async({email,password,options})=>{try{
    const cleanEmail=String(email||"").trim().toLowerCase();
    const name=options?.data?.name||cleanEmail.split("@")[0];
    const r=await api("signup",{email:cleanEmail,name,password_hash:await sha256(password)});
    if(!r.data?.user) throw new Error("Não foi possível criar a conta.");
    saveSession(r.data.user); return {data:{user:r.data.user,session:{user:r.data.user}},error:null};
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
  $("dashMonth").onchange=dashboard;$("reportMonth").onchange=report;$("transferForm")?.addEventListener("submit",saveTransfer);$("excel").onclick=excel;$("pdf").onclick=pdf;
  document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>page(b.dataset.page));
  try{
    const {data,error}=await sb.auth.getSession();
    if(error) throw error;
    if(data.session) await start(data.session.user); else loginView();
  }catch(err){console.error(err);loginView();msg("authMsg",friendlyError(err))}
});
function loginView(){$("loginView").classList.remove("hidden");$("app").classList.add("hidden")}
async function start(u){
  user=u;
  setAuthLoading(true,"Login confirmado...","Mantendo a tela de login enquanto conectamos ao Google Sheets.");

  try{
    // O usuário já veio autenticado do Apps Script. Não fazemos uma segunda
    // consulta obrigatória em USUARIOS, pois ela podia bloquear a entrada.
    $("userName").textContent=String(
      u?.displayName || u?.name || u?.email || "Usuário"
    );

    setAuthLoading(true,"Conectando ao Google Sheets...","Validando a sessão e preparando seus dados.");

    // Carregamento principal. A função load foi preparada para tolerar falhas
    // de tabelas opcionais sem impedir a abertura do sistema.
    await load();

    setAuthLoading(true,"Finalizando...","Dashboard pronto. Abrindo seu financeiro...");

    // Renderiza o dashboard antes de esconder o login.
    try{ page("dashboard"); }catch(err){ console.warn("Falha ao selecionar dashboard:",err); }

    await new Promise(resolve=>setTimeout(resolve,120));

    $("app").classList.remove("hidden");
    $("app").classList.add("app-ready");

    // Transição suave, sem troca seca.
    $("loginView").classList.add("auth-exit");
    await new Promise(resolve=>setTimeout(resolve,420));

    $("loginView").classList.add("hidden");
    $("loginView").classList.remove("auth-exit");
    setAuthLoading(false);
    window.__reluzLoaded=true;
  }catch(err){
    console.error("RELUZ: falha ao iniciar sessão:",err);
    setAuthLoading(false);
    $("app")?.classList.add("hidden");
    $("loginView")?.classList.remove("hidden");
    msg("authMsg","Entrou, mas não foi possível carregar os dados. Verifique a conexão com o Google Sheets.");
    throw err;
  }
}
function setAuthLoading(on,title="Entrando na sua conta...",text="Conectando ao Google Sheets e carregando seus dados."){
  const overlay=$("authLoading");
  if(overlay){
    $("authLoadingTitle").textContent=title;
    $("authLoadingText").textContent=text;
    overlay.classList.toggle("hidden",!on);
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
  setAuthLoading(true,"Entrando na sua conta...","Validando seus dados e carregando seu financeiro.");
  try{
    const r=await sb.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});
    if(r.error) throw r.error;
    setAuthLoading(true,"Login confirmado...","Agora vamos carregar seu financeiro com segurança.");
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
  if(!user?.uid) throw new Error("Sessão sem usuário.");

  const uid=String(user.uid);
  const request=(sheet, extra={})=>api("list",{sheet:sheetName(sheet),...extra});

  const jobs=[
    ["categories","CATEGORIAS"],
    ["accounts","CONTAS"],
    ["cards","CARTOES"],
    ["recurring","RECORRENTES"],
    ["goals","METAS"],
    ["transactions","LANCAMENTOS"],
    ["machine_rates","TAXAS"]
  ];

  const results=await Promise.all(jobs.map(async ([key,sheet])=>{
    try{
      const r=await request(sheet);
      let data=Array.isArray(r.data)?r.data:[];
      // O filtro por usuário é feito no cliente porque o Apps Script já
      // devolve as linhas da planilha.
      if(data.some(x=>Object.prototype.hasOwnProperty.call(x,"user_id"))){
        data=data.filter(x=>String(x.user_id||"")===uid);
      }
      return {key,data,error:null};
    }catch(error){
      console.error(`Erro ao carregar ${key}:`,error);
      return {key,data:[],error};
    }
  }));

  const by=key=>results.find(x=>x.key===key)||{data:[],error:null};

  categories=(by("categories").data||[]);
  categories=await deduplicateCategories(categories);
  categories.sort((x,y)=>String(x.name||"").localeCompare(String(y.name||""),"pt-BR"));
  categoriesCache=categories;

  accounts=(by("accounts").data||[]).sort((x,y)=>String(x.name||"").localeCompare(String(y.name||""),"pt-BR"));
  accountsCache=accounts;

  cards=(by("cards").data||[]).sort((x,y)=>String(x.name||"").localeCompare(String(y.name||""),"pt-BR"));
  cardsCache=cards;

  // Se ainda não houver categorias, cria as padrão. Erro aqui não impede
  // o restante do sistema de abrir.
  if(!categories.length){
    try{
      const seed=await api("create",{sheet:"CATEGORIAS",record:{
        user_id:uid,name:"Outros",type:"saida",active:true
      }});
      if(seed.data) categories=[seed.data];
      categoriesCache=categories;
    }catch(error){
      console.warn("Não foi possível criar categoria padrão:",error);
    }
  }

  recurring=by("recurring").data||[];
  goalsList=by("goals").data||[];
  txs=by("transactions").data||[];
  machineRates=(by("machine_rates").data||[]).sort((x,y)=>String(x.name||"").localeCompare(String(y.name||""),"pt-BR"));

  txs.sort((x,y)=>String(y.transaction_date||"").localeCompare(String(x.transaction_date||"")));
  txs.forEach(t=>joinRelations("transactions",t));
  recurring.forEach(r=>joinRelations("recurring",r));

  // Preenche a interface mesmo que alguma tabela opcional esteja vazia.
  fill();
  render();
  window.__reluzLoaded=true;

  const failed=results.filter(x=>x.error).map(x=>x.key);
  if(failed.length){
    console.warn("RELUZ abriu com tabelas que não puderam ser carregadas:",failed);
  }
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
function clearTxForm(){editingTxId=null;$("txForm")?.reset();$("txDate").value=today;$("txPaidDate").value="";$("txPaidAmount").value="";$("txMetalValue").value="";$("txInitialKg").value="";$("txFinalKg").value="";const submitBtn=$("txForm button[type=submit]");if(submitBtn)submitBtn.textContent="Salvar lançamento";$("txMsg").textContent="";initPaymentBreakdown();updateMetalFields();}
async function editTx(id){
  const t=txs.find(x=>x.id===id);if(!t)return;
  editingTxId=id;page('lancamentos');
  $("txType").value=t.type;fillCategorySelects();$("txCat").value=t.category_id||"";updateMetalFields();
  $("txAmount").value=t.original_amount??t.amount??0;$("txDate").value=t.competence_date||t.transaction_date||today;$("txPaidDate").value=t.paid_date||"";$("txSubcategory").value=t.subcategory||"";$("txAccount").value=t.account_id||"";$("txCard").value=t.card_id||"";$("txMethod").value=t.payment_method||"pix";$("txStatus").value=t.status||"pago";$("txName").value=t.name||"";$("txDesc").value=t.description||"";$("txInstall").value=t.installment_total||1;$("txPaidAmount").value=t.payment_received_amount||t.amount||"";$("txNotes").value=t.notes||"";$("txDreClass").value=t.dre_class||"receita";$("txMetalValue").value=t.metal_value||"";$("txInitialKg").value=t.initial_kg||"";$("txFinalKg").value=t.final_kg||"";
  const wrap=$("paymentParts");wrap.innerHTML="";const parts=Array.isArray(t.payment_parts)&&t.payment_parts.length?t.payment_parts:[{method:t.payment_method||'pix',amount:t.amount,card_id:t.card_id,installments:t.installment_total||1,fee_percent:t.fee_percent||0,rate_id:t.rate_id||null}];parts.forEach(addPaymentPart);updatePaymentParts();$("txForm button[type=submit]").textContent="Salvar alterações";
}
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
   const ref=doc(null,"transactions",editingTxId);const current=txs.find(t=>t.id===editingTxId)||{};
   const fee=parts[0]?.fee_percent||0, net=total-total*fee/100;
   await updateDoc(ref,{...base,amount:net,original_amount:total,fee_percent:fee,edited_at:serverTimestamp(),installment_number:current.installment_number||1,installment_total:current.installment_total||1});
   msg("txMsg","Lançamento atualizado.");clearTxForm();await load();return;
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
 const dedupeKey=await sha256(JSON.stringify({user_id:user.uid,type:base.type,total,transaction_date:base.transaction_date,category_id:base.category_id,name:base.name,description:base.description,payment_method:method,status,payment_parts:parts.map(p=>({method:p.method,amount:+p.amount||0,card_id:p.card_id||null,installments:+p.installments||1,fee_percent:+p.fee_percent||0,rate_id:p.rate_id||null}))}));
 const r=await api("save_transactions",{user_id:user.uid,dedupe_key:dedupeKey,rows});
 if(r.error){msg("txMsg",r.error?.message||"Não foi possível salvar o lançamento.");return;}
 if(r.duplicate){msg("txMsg","Este lançamento já foi salvo. A duplicidade foi bloqueada.");return;}
 msg("txMsg","Lançamento salvo.");clearTxForm();await load()
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
function dashboard(){
  const month=$("dashMonth").value||thisMonth;
  const [yy,mm]=month.split("-").map(Number);
  const daysInMonth=new Date(yy,mm,0).getDate();
  const pad=n=>String(n).padStart(2,"0");
  const dateKey=d=>`${yy}-${pad(mm)}-${pad(d)}`;
  const labels=Array.from({length:daysInMonth},(_,i)=>dateKey(i+1));
  const r=txs.filter(t=>String(t.transaction_date||"").startsWith(month));

  const val=t=>Math.max(0,Number(t.amount)||0);
  const entradas=r.filter(t=>String(t.type||"").toLowerCase()==="entrada");
  const saidas=r.filter(t=>String(t.type||"").toLowerCase()==="saida");
  const ins=entradas.reduce((s,t)=>s+val(t),0);
  const out=saidas.reduce((s,t)=>s+val(t),0);

  // Saldo inicial estimado: saldo inicial das contas + movimentações anteriores ao mês.
  const monthStart=`${month}-01`;
  const opening=accounts.reduce((s,a)=>s+(Number(a.initial_balance)||0),0)
    +txs.filter(t=>String(t.transaction_date||"")<monthStart)
      .reduce((s,t)=>s+(String(t.type||"").toLowerCase()==="entrada"?val(t):-val(t)),0);

  const pending=txs.filter(t=>String(t.type||"").toLowerCase()==="saida"
    &&String(t.status||"").toLowerCase()==="pendente"
    &&String(t.transaction_date||"")>=today)
    .reduce((s,t)=>s+val(t),0);

  $("inTotal").textContent=money(ins);
  $("outTotal").textContent=money(out);
  $("result").textContent=money(ins-out);
  $("available").textContent=money(opening+ins-out-pending);

  const dailyIn=Object.fromEntries(labels.map(d=>[d,0]));
  const dailyOut=Object.fromEntries(labels.map(d=>[d,0]));
  entradas.forEach(t=>{if(dailyIn[t.transaction_date]!==undefined) dailyIn[t.transaction_date]+=val(t)});
  saidas.forEach(t=>{if(dailyOut[t.transaction_date]!==undefined) dailyOut[t.transaction_date]+=val(t)});

  let running=opening;
  const balance=labels.map(d=>{
    running+=(dailyIn[d]||0)-(dailyOut[d]||0);
    return Number(running.toFixed(2));
  });

  // Comparação real com o mês anterior.
  const prevDate=new Date(yy,mm-2,1);
  const prevMonth=`${prevDate.getFullYear()}-${pad(prevDate.getMonth()+1)}`;
  const prevTx=txs.filter(t=>String(t.transaction_date||"").startsWith(prevMonth));
  const prevIn=prevTx.filter(t=>t.type==="entrada").reduce((s,t)=>s+val(t),0);
  const prevOut=prevTx.filter(t=>t.type==="saida").reduce((s,t)=>s+val(t),0);
  const currentResult=ins-out;
  const previousResult=prevIn-prevOut;
  const variation=previousResult===0?(currentResult===0?0:100):((currentResult-previousResult)/Math.abs(previousResult))*100;
  $("monthCompare").textContent=`${variation>=0?"+":""}${variation.toFixed(1)}%`;

  // Gastos por categoria: usa category_id e também suporta categorias embutidas.
  const categoryMap={};
  categories.forEach(c=>categoryMap[String(c.id)]=String(c.name||"Outros"));
  const cc={};
  saidas.forEach(t=>{
    const name=categoryMap[String(t.category_id)]||t.categories?.name||t.category_name||"Outros";
    cc[name]=(cc[name]||0)+val(t);
  });
  const catEntries=Object.entries(cc).sort((a,b)=>b[1]-a[1]);
  const topCats=catEntries.slice(0,7);
  const other=catEntries.slice(7).reduce((s,[,v])=>s+v,0);
  if(other>0) topCats.push(["Outras",other]);

  flowChart?.destroy();
  catChart?.destroy();

  const moneyShort=v=>money(v);
  const gridColor="rgba(100,116,139,.12)";
  const textColor="#64748b";

  flowChart=new Chart($("flow"),{
    type:"bar",
    data:{
      labels:labels.map(d=>d.slice(8)),
      datasets:[
        {
          type:"bar",
          label:"Entradas",
          data:labels.map(d=>dailyIn[d]),
          backgroundColor:"rgba(34,197,94,.65)",
          borderColor:"rgba(22,163,74,1)",
          borderWidth:1,
          borderRadius:5,
          maxBarThickness:18
        },
        {
          type:"bar",
          label:"Saídas",
          data:labels.map(d=>dailyOut[d]),
          backgroundColor:"rgba(239,68,68,.58)",
          borderColor:"rgba(220,38,38,1)",
          borderWidth:1,
          borderRadius:5,
          maxBarThickness:18
        },
        {
          type:"line",
          label:"Saldo acumulado",
          data:balance,
          borderColor:"#2563eb",
          backgroundColor:"rgba(37,99,235,.10)",
          borderWidth:3,
          pointRadius:0,
          pointHoverRadius:5,
          tension:.35,
          fill:true,
          yAxisID:"yBalance"
        }
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:"index",intersect:false},
      animation:{duration:650,easing:"easeOutQuart"},
      plugins:{
        legend:{position:"top",labels:{usePointStyle:true,boxWidth:8,color:textColor}},
        tooltip:{
          callbacks:{
            label:ctx=>`${ctx.dataset.label}: ${moneyShort(ctx.parsed.y)}`
          }
        }
      },
      scales:{
        x:{grid:{display:false},ticks:{color:textColor,maxTicksLimit:12}},
        y:{
          beginAtZero:true,
          grid:{color:gridColor},
          ticks:{color:textColor,callback:v=>moneyShort(v)}
        },
        yBalance:{
          position:"right",
          grid:{drawOnChartArea:false},
          ticks:{color:"#2563eb",callback:v=>moneyShort(v)}
        }
      }
    }
  });

  catChart=new Chart($("cats"),{
    type:"doughnut",
    data:{
      labels:topCats.length?topCats.map(([n])=>n):["Sem despesas"],
      datasets:[{
        data:topCats.length?topCats.map(([,v])=>v):[1],
        backgroundColor:topCats.length
          ?["#2563eb","#7c3aed","#f59e0b","#ef4444","#10b981","#06b6d4","#64748b","#94a3b8"]
          :["#e2e8f0"],
        borderColor:"#ffffff",
        borderWidth:3,
        hoverOffset:7
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      cutout:"66%",
      animation:{duration:700,easing:"easeOutQuart"},
      plugins:{
        legend:{position:"bottom",labels:{usePointStyle:true,padding:14,color:textColor}},
        tooltip:{
          callbacks:{
            label:ctx=>{
              if(!topCats.length)return "Sem despesas";
              const total=topCats.reduce((s,[,v])=>s+v,0);
              const v=Number(ctx.raw)||0;
              return `${ctx.label}: ${money(v)} (${total?((v/total)*100).toFixed(1):0}%)`;
            }
          }
        }
      }
    }
  });

  $("due").innerHTML=txs.filter(t=>t.type==="saida"&&t.status==="pendente").slice(0,5)
    .map(t=>`<p>${t.transaction_date} · ${esc(t.name||t.description||"Sem nome")}<br><b>${money(t.amount)}</b></p>`).join("")||"Nenhuma.";

  $("cardDash").innerHTML=cards.map(c=>{
    const total=txs.filter(t=>t.card_id===c.id&&t.type==="saida"&&String(t.transaction_date||"").startsWith(month))
      .reduce((s,t)=>s+val(t),0);
    return `<p>${esc(c.name)} · ${money(total)}</p>`;
  }).join("")||"Nenhum.";

  $("goalDash").innerHTML=goalsList.slice(0,5).map(g=>{
    const target=Number(g.target_amount)||0,current=Number(g.current_amount)||0;
    const pct=target?Math.min(100,(current/target)*100):0;
    return `<p>${esc(g.name)} · ${pct.toFixed(0)}%</p>`;
  }).join("")||"Nenhuma.";
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
function page(p){document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));$(p).classList.remove("hidden");document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===p));window.scrollTo({top:0,behavior:"smooth"})}

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
 const el=$("calendarGrid");if(!el)return;const month=$("calendarMonth").value||thisMonth;const [y,m]=month.split("-").map(Number),first=new Date(y,m-1,1),last=new Date(y,m,0),start=(first.getDay()+6)%7,days=last.getDate();let html="<div class='cal-head'>"+["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(x=>`<b>${x}</b>`).join("")+"</div><div class='cal-body'>";for(let i=0;i<start;i++)html+="<div class='cal-day empty-day'></div>";for(let d=1;d<=days;d++){const ds=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`,items=txs.filter(t=>t.transaction_date===ds),hasIn=items.some(advTypeIncome),hasOut=items.some(advTypeExpense),hasCard=items.some(t=>t.card_id);html+=`<div class='cal-day'><span>${d}</span><div>${hasIn?"<i class='income-dot'>●</i>":""}${hasOut?"<i class='expense-dot'>●</i>":""}${hasOut&&!items.every(advStatusPaid)?"<i class='due-dot'>●</i>":""}${hasCard?"<i class='invoice-dot'>●</i>":""}</div>${items.slice(0,2).map(t=>`<small>${esc(t.name||t.description||"")} · ${money(t.amount)}</small>`).join("")}</div>`}html+="</div>";el.innerHTML=html;
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
