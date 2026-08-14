import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
 getAuth, onAuthStateChanged, signInWithEmailAndPassword,
 createUserWithEmailAndPassword, updateProfile, signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
 getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc,
 deleteDoc, query, where, orderBy, limit, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const cfg=window.FIREBASE_CONFIG||{};
const firebaseReady=cfg.apiKey&&!String(cfg.apiKey).includes("COLE_AQUI")&&cfg.projectId&&cfg.projectId!=="SEU-PROJETO";
let firebaseApp,auth,db;
if(firebaseReady){firebaseApp=initializeApp(cfg);auth=getAuth(firebaseApp);db=getFirestore(firebaseApp);}

const defaults=[['Salário','entrada'],['Extra','entrada'],['Reembolso','entrada'],['Outros recebimentos','entrada'],['Casa','saida'],['Mercado','saida'],['Alimentação','saida'],['Carro','saida'],['Combustível','saida'],['Contas','saida'],['Celular/Internet','saida'],['Cartão','saida'],['Lazer','saida'],['Compras','saida'],['Pets','saida'],['Família','saida'],['Investimentos','saida'],['Outros','saida']];

function firebaseErrorMessage(err){
 const m=err?.message||String(err||"");
 if(m.includes("auth/invalid-credential")||m.includes("auth/invalid-login-credentials")) return "E-mail ou senha incorretos.";
 if(m.includes("auth/email-already-in-use")) return "Este e-mail já está cadastrado.";
 if(m.includes("auth/weak-password")) return "A senha precisa ter pelo menos 6 caracteres.";
 if(m.includes("auth/invalid-email")) return "E-mail inválido.";
 if(m.includes("permission-denied")) return "Acesso negado pelo Firestore. Verifique as Rules.";
 if(m.includes("failed-precondition")) return "O Firestore recusou a consulta. Verifique as Rules/índices.";
 if(m.includes("network-request-failed")||m.includes("Failed to fetch")) return "Não foi possível conectar ao Firebase.";
 return m;
}
function joinRelations(table,row){
 if(table==="transactions"){
  row.categories=categoriesCache.find(x=>x.id===row.category_id)||null;
  row.accounts=accountsCache.find(x=>x.id===row.account_id)||null;
  row.cards=cardsCache.find(x=>x.id===row.card_id)||null;
 }
 if(table==="recurring") row.categories=categoriesCache.find(x=>x.id===row.category_id)||null;
 return row;
}
let categoriesCache=[],accountsCache=[],cardsCache=[];

function collectionRef(name){return collection(db,name)}
function builder(table){
 let filters=[],sort=null,maxRows=null,mode="select",insertData=null;
 const api={
  select(_fields="*"){mode="select";return api},
  eq(field,value){filters.push([field,value]);return api},
  order(field,opts={}){sort=[field,!!opts.ascending];return api},
  limit(n){maxRows=n;return api},
  insert(data){mode="insert";insertData=data;return api},
  delete(){mode="delete";return api},
  then(resolve,reject){execute().then(resolve,reject)}
 };
 async function execute(){
  try{
   if(mode==="insert"){
    const rows=Array.isArray(insertData)?insertData:[insertData],batch=writeBatch(db);
    for(const row of rows) batch.set(doc(collectionRef(table)),{...row,created_at:row.created_at||serverTimestamp()});
    await batch.commit(); return {data:rows,error:null};
   }
   if(mode==="delete"){
    const snap=await getDocs(query(collectionRef(table),...filters.map(([f,v])=>where(f,"==",v))));
    const batch=writeBatch(db);snap.docs.forEach(d=>batch.delete(d.ref));await batch.commit();return {data:null,error:null};
   }
   let clauses=filters.map(([f,v])=>where(f,"==",v));
   if(sort) clauses.push(orderBy(sort[0],sort[1]?"asc":"desc"));
   if(maxRows) clauses.push(limit(maxRows));
   const snap=await getDocs(query(collectionRef(table),...clauses));
   let data=snap.docs.map(d=>({id:d.id,...d.data()}));
   if(sort && !clauses.length) data.sort(()=>0);
   data.forEach(r=>joinRelations(table,r));
   return {data,error:null};
  }catch(error){console.error("Firestore",table,error);return {data:null,error}}
 }
 return api;
}
const sb={
 from:builder,
 auth:{
  getSession:async()=>({data:{session:auth?.currentUser?{user:auth.currentUser}:null},error:null}),
  signInWithPassword:async({email,password})=>{try{const r=await signInWithEmailAndPassword(auth,email,password);return {data:{user:r.user},error:null}}catch(error){return {data:null,error}}},
  signUp:async({email,password,options})=>{
   try{
    const r=await createUserWithEmailAndPassword(auth,email,password);
    const name=options?.data?.name||email.split("@")[0];
    await updateProfile(r.user,{displayName:name});
    await setDoc(doc(db,"users",r.user.uid),{name,email,created_at:serverTimestamp()});
    const batch=writeBatch(db);
    defaults.forEach(([n,t])=>batch.set(doc(collectionRef("categories")),{user_id:r.user.uid,name:n,type:t,created_at:serverTimestamp()}));
    await batch.commit();
    return {data:{user:r.user,session:{user:r.user}},error:null};
   }catch(error){return {data:null,error}}
  },
  signOut:()=>signOut(auth),
  onAuthStateChange:(callback)=>onAuthStateChanged(auth,(u)=>callback(u?"SIGNED_IN":"SIGNED_OUT",u?{user:u}:null))
 }
};

let user,categories=[],accounts=[],cards=[],recurring=[],goalsList=[],txs=[],flowChart,catChart;
const $=x=>document.getElementById(x),today=new Date().toISOString().slice(0,10),thisMonth=today.slice(0,7);
const money=n=>Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function msg(id,t){$(id).textContent=t||""}
function friendlyError(err){const m=err?.message||String(err||"");if(m.includes("Invalid login credentials"))return "E-mail ou senha incorretos.";if(m.includes("Email not confirmed"))return "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.";if(m.includes("Failed to fetch")||m.includes("NetworkError"))return "Não foi possível conectar ao Firebase. Verifique sua internet e a configuração.";return m;}
document.addEventListener("DOMContentLoaded",async()=>{
  $("dashMonth").value=thisMonth;$("reportMonth").value=thisMonth;$("txDate").value=today;
  $("loginForm").onsubmit=login;$("signupForm").onsubmit=signup;$("logout").onclick=()=>sb.auth.signOut();
  $("txForm").onsubmit=saveTx;$("catForm").onsubmit=saveCategory;$("cardForm").onsubmit=saveCard;$("recForm").onsubmit=saveRec;$("goalForm").onsubmit=saveGoal;$("accountForm").onsubmit=saveAccount;$("txType").onchange=fillCategorySelects;
  $("dashMonth").onchange=dashboard;$("reportMonth").onchange=report;$("excel").onclick=excel;$("pdf").onclick=pdf;
  document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>page(b.dataset.page));
  try{
    if(!firebaseReady) throw new Error("Configuração do Firebase não carregada. Verifique o arquivo config.js.");
    const {data,error}=await sb.auth.getSession();
    if(error) throw error;
    if(data.session) await start(data.session.user); else loginView();
    sb.auth.onAuthStateChange(async(e,s)=>{if(s) await start(s.user); else loginView()});
  }catch(err){console.error(err);loginView();msg("authMsg",friendlyError(err))}
});
function loginView(){$("loginView").classList.remove("hidden");$("app").classList.add("hidden")}
async function start(u){user=u;const r=await getDoc(doc(db,"users",u.id));$("userName").textContent=r.exists()?r.data().name:(u.displayName||u.email);$("loginView").classList.add("hidden");$("app").classList.remove("hidden");await load();page("dashboard")}
async function login(e){e.preventDefault();msg("authMsg","");const r=await sb.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});if(r.error)msg("authMsg",friendlyError(r.error));}
async function signup(e){e.preventDefault();msg("authMsg","");const r=await sb.auth.signUp({email:$("signupEmail").value.trim(),password:$("signupPassword").value,options:{data:{name:$("signupName").value.trim()}}});if(r.error){msg("authMsg",friendlyError(r.error));return}msg("authMsg",r.data.session?"Conta criada e acesso liberado.":"Conta criada. Se a confirmação de e-mail estiver ativa, verifique sua caixa de entrada.");}
async function load(){let [a,b,c,d,e,f]=await Promise.all([sb.from("categories").select("*").order("name"),sb.from("accounts").select("*").order("name"),sb.from("cards").select("*").order("name"),sb.from("recurring").select("*,categories(name)").order("description"),sb.from("goals").select("*").order("created_at",{ascending:false}),sb.from("transactions").select("*,categories(name),accounts(name),cards(name)").order("transaction_date",{ascending:false}).limit(3000)]);categories=a.data||[];categoriesCache=categories;accounts=b.data||[];accountsCache=accounts;cards=c.data||[];cardsCache=cards;if(!categories.length){const defaults=[['Salário','entrada'],['Extra','entrada'],['Reembolso','entrada'],['Outros recebimentos','entrada'],['Casa','saida'],['Mercado','saida'],['Alimentação','saida'],['Carro','saida'],['Combustível','saida'],['Contas','saida'],['Celular/Internet','saida'],['Cartão','saida'],['Lazer','saida'],['Compras','saida'],['Pets','saida'],['Família','saida'],['Investimentos','saida'],['Outros','saida']];const seed=await sb.from("categories").insert(defaults.map(([name,type])=>({user_id:user.id,name,type})));if(!seed.error){const fresh=await sb.from("categories").select("*").order("name");categories=fresh.data||[];categoriesCache=categories}}accounts=b.data||accountsCache;cards=c.data||cardsCache;recurring=d.data||[];goalsList=e.data||[];txs=f.data||[];txs.forEach(t=>joinRelations("transactions",t));recurring.forEach(r=>joinRelations("recurring",r));fill();render()}
function fill(){fillCategorySelects();$("txAccount").innerHTML=accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("");$("txCard").innerHTML='<option value="">Nenhum</option>'+cards.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");$("catBody").innerHTML=categories.map(c=>`<tr><td>${esc(c.name)}</td><td>${c.type==="saida"?"Saída":c.type==="entrada"?"Entrada":"Ambos"}</td><td><button type="button" class="danger" onclick="deleteCategory('${c.id}')">Excluir</button></td></tr>`).join("")||'<tr><td colspan="3">Nenhuma categoria cadastrada.</td></tr>'}
function fillCategorySelects(){const type=$("txType")?.value||"saida";const available=categories.filter(c=>c.type==="ambos"||c.type===type);$("txCat").innerHTML=available.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")||'<option value="">Cadastre uma categoria primeiro</option>';const recurringCats=categories.filter(c=>c.type!=="entrada");$("recCat").innerHTML=recurringCats.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")||'<option value="">Cadastre uma categoria primeiro</option>'}
async function saveCategory(e){e.preventDefault();msg("catMsg","");const name=$("catName").value.trim();const type=$("catType").value;if(!name)return msg("catMsg","Informe o nome da categoria.");if(categories.some(c=>c.name.toLowerCase()===name.toLowerCase()&&c.type===type))return msg("catMsg","Essa categoria já existe.");const r=await sb.from("categories").insert({user_id:user.id,name,type});msg("catMsg",r.error?.message||"Categoria cadastrada com sucesso.");if(!r.error){$("catForm").reset();await load();page("categorias")}}
async function deleteCategory(id){if(!confirm("Excluir esta categoria? Os lançamentos existentes serão mantidos sem categoria."))return;const r=await sb.from("categories").delete().eq("id",id);if(r.error)return msg("catMsg",r.error.message);await load();page("categorias")}
async function saveTx(e){e.preventDefault();let n=+$("txInstall").value||1,g=crypto.randomUUID(),base={user_id:user.id,type:$("txType").value,amount:+$("txAmount").value,transaction_date:$("txDate").value,category_id:$("txCat").value,account_id:$("txAccount").value||null,card_id:$("txCard").value||null,status:$("txStatus").value,description:$("txDesc").value,notes:$("txNotes").value||null,group_id:g};let rows=[];for(let i=0;i<n;i++){let d=new Date($("txDate").value+"T12:00:00");d.setMonth(d.getMonth()+i);rows.push({...base,transaction_date:d.toISOString().slice(0,10),installment_number:i+1,installment_total:n})}let r=await sb.from("transactions").insert(rows);msg("txMsg",r.error?.message||"Lançamento salvo.");if(!r.error){$("txForm").reset();$("txDate").value=today;await load()}}
async function saveCard(e){e.preventDefault();let r=await sb.from("cards").insert({user_id:user.id,name:$("cardName").value,limit_amount:+$("cardLimit").value,closing_day:+$("cardClose").value,due_day:+$("cardDue").value});msg("cardMsg",r.error?.message||"Cartão cadastrado.");if(!r.error){$("cardForm").reset();await load()}}
async function saveRec(e){e.preventDefault();let r=await sb.from("recurring").insert({user_id:user.id,description:$("recDesc").value,amount:+$("recAmount").value,category_id:$("recCat").value,due_day:+$("recDay").value,start_date:$("recStart").value,end_date:$("recEnd").value||null});msg("recMsg",r.error?.message||"Cadastrado.");if(!r.error){$("recForm").reset();await load()}}
async function saveGoal(e){e.preventDefault();let r=await sb.from("goals").insert({user_id:user.id,name:$("goalName").value,target_amount:+$("goalTarget").value,current_amount:+$("goalCurrent").value||0,deadline:$("goalDate").value||null});msg("goalMsg",r.error?.message||"Meta cadastrada.");if(!r.error){$("goalForm").reset();await load()}}
async function saveAccount(e){e.preventDefault();let r=await sb.from("accounts").insert({user_id:user.id,name:$("accountName").value,type:$("accountType").value,initial_balance:+$("accountInitial").value||0});msg("accountMsg",r.error?.message||"Conta cadastrada.");if(!r.error){$("accountForm").reset();await load()}}
function render(){$("txBody").innerHTML=txs.slice(0,200).map(t=>`<tr><td>${t.transaction_date}</td><td>${t.type}</td><td>${esc(t.description)}</td><td>${esc(t.categories?.name||"-")}</td><td>${money(t.amount)}</td><td>${t.status}</td><td>${t.installment_total>1?t.installment_number+"/"+t.installment_total:"-"}</td></tr>`).join("");$("cardBody").innerHTML=cards.map(c=>{let u=txs.filter(t=>t.card_id===c.id&&t.type==="saida"&&t.transaction_date.startsWith(thisMonth)).reduce((a,t)=>a+ +t.amount,0);return`<tr><td>${esc(c.name)}</td><td>${money(c.limit_amount)}</td><td>${money(u)}</td><td>${money(Math.max(0,c.limit_amount-u))}</td><td>${c.closing_day}</td><td>${c.due_day}</td></tr>`}).join("");$("recBody").innerHTML=recurring.map(r=>`<tr><td>${esc(r.description)}</td><td>${money(r.amount)}</td><td>${esc(r.categories?.name||"-")}</td><td>${r.due_day}</td><td>${r.start_date}</td><td>${r.end_date||"-"}</td></tr>`).join("");$("goals").innerHTML=goalsData();$("accountBody").innerHTML=accounts.map(a=>{let m=txs.filter(t=>t.account_id===a.id).reduce((s,t)=>s+(t.type==="entrada"?1:-1)*+t.amount,0);return`<tr><td>${esc(a.name)}</td><td>${esc(a.type)}</td><td>${money(a.initial_balance)}</td><td>${money(m)}</td><td>${money(+a.initial_balance+m)}</td></tr>`}).join("");dashboard();report()}
function goalsData(){return goalsList.map(g=>{let p=Math.min(100,+g.current_amount/+g.target_amount*100);return`<div class="goal"><h3>${esc(g.name)}</h3><b>${money(g.current_amount)} / ${money(g.target_amount)}</b><div class="progress"><div style="width:${p}%"></div></div>${p.toFixed(1)}%${g.deadline?" · prazo "+g.deadline:""}</div>`}).join("")}
function dashboard(){let m=$("dashMonth").value||thisMonth,r=txs.filter(t=>t.transaction_date.startsWith(m)),ins=r.filter(t=>t.type==="entrada").reduce((s,t)=>s+ +t.amount,0),out=r.filter(t=>t.type==="saida").reduce((s,t)=>s+ +t.amount,0),pending=txs.filter(t=>t.type==="saida"&&t.status==="pendente"&&t.transaction_date>=today).reduce((s,t)=>s+ +t.amount,0);$("inTotal").textContent=money(ins);$("outTotal").textContent=money(out);$("result").textContent=money(ins-out);$("available").textContent=money(ins-out-pending);let daily={};r.forEach(t=>daily[t.transaction_date]=(daily[t.transaction_date]||0)+(t.type==="entrada"?+t.amount:-+t.amount));let cc={};r.filter(t=>t.type==="saida").forEach(t=>cc[t.categories?.name||"Outros"]=(cc[t.categories?.name||"Outros"]||0)+ +t.amount);flowChart?.destroy();catChart?.destroy();flowChart=new Chart($("flow"),{type:"line",data:{labels:Object.keys(daily),datasets:[{label:"Resultado",data:Object.values(daily)}]}});catChart=new Chart($("cats"),{type:"doughnut",data:{labels:Object.keys(cc),datasets:[{data:Object.values(cc)}]}});$("due").innerHTML=txs.filter(t=>t.type==="saida"&&t.status==="pendente").slice(0,5).map(t=>`<p>${t.transaction_date} · ${esc(t.description)}<br><b>${money(t.amount)}</b></p>`).join("")||"Nenhuma.";$("cardDash").innerHTML=cards.map(c=>`<p>${esc(c.name)} · ${money(txs.filter(t=>t.card_id===c.id&&t.type==="saida"&&t.transaction_date.startsWith(m)).reduce((s,t)=>s+ +t.amount,0))}</p>`).join("")||"Nenhum.";$("goalDash").innerHTML=goalsList.slice(0,5).map(g=>`<p>${esc(g.name)} · ${(g.current_amount/g.target_amount*100).toFixed(0)}%</p>`).join("")||"Nenhuma."}
function report(){let m=$("reportMonth").value||thisMonth,r=txs.filter(t=>t.transaction_date.startsWith(m)),i=r.filter(t=>t.type==="entrada").reduce((s,t)=>s+ +t.amount,0),o=r.filter(t=>t.type==="saida").reduce((s,t)=>s+ +t.amount,0);$("summary").innerHTML=`<p>Entradas <b>${money(i)}</b> · Saídas <b>${money(o)}</b> · Resultado <b>${money(i-o)}</b></p>`;$("reportBody").innerHTML=r.map(t=>`<tr><td>${t.transaction_date}</td><td>${t.type}</td><td>${esc(t.description)}</td><td>${esc(t.categories?.name||"-")}</td><td>${money(t.amount)}</td><td>${t.status}</td></tr>`).join("")}
function excel(){let m=$("reportMonth").value||thisMonth,r=txs.filter(t=>t.transaction_date.startsWith(m)).map(t=>({Data:t.transaction_date,Tipo:t.type,Descrição:t.description,Categoria:t.categories?.name||"",Conta:t.accounts?.name||"",Cartão:t.cards?.name||"",Valor:+t.amount,Status:t.status,Parcela:t.installment_total>1?`${t.installment_number}/${t.installment_total}`:""}));let ws=XLSX.utils.json_to_sheet(r),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Financeiro");XLSX.writeFile(wb,`financeiro-${m}.xlsx`)}
function pdf(){let m=$("reportMonth").value||thisMonth,r=txs.filter(t=>t.transaction_date.startsWith(m)),i=r.filter(t=>t.type==="entrada").reduce((s,t)=>s+ +t.amount,0),o=r.filter(t=>t.type==="saida").reduce((s,t)=>s+ +t.amount,0),D=window.jspdf.jsPDF,d=new D();d.text("Relatório Financeiro Pessoal",14,18);d.setFontSize(10);d.text(`Mês: ${m}`,14,27);d.text(`Entradas: ${money(i)}  Saídas: ${money(o)}  Resultado: ${money(i-o)}`,14,36);let y=47;r.forEach(t=>{if(y>285){d.addPage();y=15}d.text(`${t.transaction_date} | ${t.type} | ${String(t.description).slice(0,25)} | ${money(t.amount)}`,14,y);y+=6});d.save(`financeiro-${m}.pdf`)}
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
