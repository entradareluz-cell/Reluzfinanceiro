import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, getDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let state={user:null, transactions:[], accounts:[], cards:[], recurring:[], goals:[], categories:[], chart:null, currentView:"dashboard"};
const money = v => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(v)||0);
const dateFmt = v => { if(!v)return "—"; const d=v?.toDate?v.toDate():new Date(v+"T12:00:00"); return isNaN(d)?"—":d.toLocaleDateString("pt-BR"); };
const todayISO=()=>new Date().toISOString().slice(0,10);
const uid=()=>auth.currentUser?.uid;
const toast=(msg,type="ok")=>{const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=msg;document.getElementById("toast").appendChild(el);setTimeout(()=>el.remove(),3500)};
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const coll= name=>collection(db,name);

function friendlyError(e){const map={"auth/invalid-credential":"E-mail ou senha incorretos.","auth/email-already-in-use":"Este e-mail já está cadastrado.","auth/invalid-email":"E-mail inválido.","auth/weak-password":"A senha precisa ter pelo menos 6 caracteres.","auth/network-request-failed":"Falha de conexão. Verifique a internet.","permission-denied":"O Firestore bloqueou o acesso. Verifique as regras.","failed-precondition":"O banco ainda não está configurado corretamente."}; return map[e.code]||e.message||"Não foi possível concluir a operação."}

async function loadAll(){
  if(!uid())return;
  const names=["transactions","accounts","cards","recurring","goals","categories"];
  for(const n of names){
    try{
      const snap=await getDocs(query(coll(n),where("uid","==",uid())));
      state[n]=snap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(e){console.error(n,e);toast(`Erro ao carregar ${n}: ${friendlyError(e)}`,"err")}
  }
  if(!state.categories.length) await seedCategories();
  renderAll();
}
async function seedCategories(){
  const cats=[["Salário","income"],["Outras entradas","income"],["Alimentação","expense"],["Moradia","expense"],["Transporte","expense"],["Saúde","expense"],["Educação","expense"],["Lazer","expense"],["Compras","expense"],["Assinaturas","expense"],["Impostos","expense"],["Outros","expense"]];
  for(const [name,type] of cats){const ref=await addDoc(coll("categories"),{uid:uid(),name,type,createdAt:serverTimestamp()});state.categories.push({id:ref.id,name,type})}
}
function periodRange(type){
 const now=new Date(), y=now.getFullYear(), m=now.getMonth();
 if(type==="year")return [`${y}-01-01`,`${y}-12-31`];
 if(type==="last"){const d=new Date(y,m-1,1),e=new Date(y,m,0);return [iso(d),iso(e)]}
 if(type==="all")return ["0000-01-01","9999-12-31"];
 return [`${y}-${String(m+1).padStart(2,"0")}-01`,`${y}-${String(m+1).padStart(2,"0")}-31`];
}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function filteredTx(){
 const [a,b]=periodRange(document.getElementById("dashPeriod")?.value||"month");
 return state.transactions.filter(t=>(t.date||"")>=a&&(t.date||"")<=b);
}
function renderAll(){renderDashboard();renderTransactions();renderAccounts();renderCards();renderRecurring();renderGoals();renderCategories();renderReports()}
function renderDashboard(){
 const tx=filteredTx(), income=tx.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount||0),0), expense=tx.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount||0),0);
 const balance=state.accounts.reduce((s,a)=>s+Number(a.balance||0),0);
 setText("balance",money(balance));setText("income",money(income));setText("expense",money(expense));setText("result",money(income-expense));
 const today=todayISO(), next=new Date();next.setDate(next.getDate()+7);const end=iso(next);
 const due=state.transactions.filter(t=>t.type==="expense"&&t.status!=="paid"&&t.date>=today&&t.date<=end).reduce((s,t)=>s+Number(t.amount||0),0);setText("dueSoon",money(due));
 const cats={};tx.filter(t=>t.type==="expense").forEach(t=>{cats[t.category||"Outros"]=(cats[t.category||"Outros"]||0)+Number(t.amount||0)});const top=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,6);const max=top[0]?.[1]||1;
 document.getElementById("categoryBars").innerHTML=top.length?top.map(([n,v])=>`<div class="bar-line"><div class="bar-meta"><span>${esc(n)}</span><b>${money(v)}</b></div><div class="bar-track"><div class="bar-fill" style="width:${v/max*100}%"></div></div></div>`).join(""):`<div class="empty">Ainda não há saídas no período.</div>`;
 const upcoming=[...state.transactions].filter(t=>t.date>=today&&t.status!=="paid").sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
 document.getElementById("upcomingList").innerHTML=upcoming.length?upcoming.map(t=>listRow(t)).join(""):`<div class="empty">Nenhum vencimento próximo.</div>`;
 const recent=[...state.transactions].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,5);
 document.getElementById("recentList").innerHTML=recent.length?recent.map(t=>listRow(t)).join(""):`<div class="empty">Nenhum lançamento cadastrado.</div>`;
 drawChart(tx);
}
function listRow(t){return `<div class="list-row"><div class="list-main"><i class="dot ${t.type==="expense"?"red":""}"></i><div><b>${esc(t.description||"Sem descrição")}</b><small>${dateFmt(t.date)} · ${esc(t.category||"Sem categoria")}</small></div></div><b class="amount ${t.type}">${t.type==="expense"?"-":"+"}${money(t.amount)}</b></div>`}
function drawChart(tx){
 const c=document.getElementById("cashflowChart"); if(!c)return; if(state.chart)state.chart.destroy();
 const by={};tx.forEach(t=>{const k=(t.date||"").slice(0,7);if(!by[k])by[k]={i:0,e:0};by[k][t.type==="income"?"i":"e"]+=Number(t.amount||0)});
 const labels=Object.keys(by).sort(); const canvas=window.Chart;
 if(!canvas){c.parentElement.innerHTML='<div class="empty">Gráfico carregando...</div>';return}
 state.chart=new canvas(c,{type:"line",data:{labels,datasets:[{label:"Entradas",data:labels.map(k=>by[k].i),borderColor:"#55e6b5",backgroundColor:"rgba(85,230,181,.08)",tension:.35,fill:true},{label:"Saídas",data:labels.map(k=>by[k].e),borderColor:"#ff6b7a",backgroundColor:"rgba(255,107,122,.05)",tension:.35,fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:"#9fb0c5",font:{size:11}}}},scales:{x:{ticks:{color:"#71839a"},grid:{color:"#17263a"}},y:{ticks:{color:"#71839a",callback:v=>"R$ "+v},grid:{color:"#17263a"}}}}});
}
function renderTransactions(){
 const q=(document.getElementById("txSearch")?.value||"").toLowerCase(), type=document.getElementById("txType")?.value||"", status=document.getElementById("txStatus")?.value||"";
 let tx=state.transactions.filter(t=>(`${t.description||""} ${t.category||""}`).toLowerCase().includes(q)&&(type?t.type===type:true)&&(status?t.status===status:true)).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
 setText("txCount",`${tx.length} lançamento(s)`);
 document.getElementById("txTable").innerHTML=tx.length?tx.map(t=>`<tr><td>${dateFmt(t.date)}</td><td><b>${esc(t.description)}</b></td><td>${esc(t.category||"—")}</td><td>${esc(t.account||"—")}</td><td><span class="status ${t.status||"pending"}">${t.status==="paid"?"Concluído":"Pendente"}</span></td><td class="amount ${t.type}">${t.type==="expense"?"-":"+"}${money(t.amount)}</td><td><button class="icon-btn" onclick="editTx('${t.id}')">✎</button> <button class="icon-btn" onclick="removeItem('transactions','${t.id}')">×</button></td></tr>`).join(""):`<tr><td colspan="7"><div class="empty">Nenhum lançamento encontrado.</div></td></tr>`;
}
function renderAccounts(){document.getElementById("accountsGrid").innerHTML=state.accounts.length?state.accounts.map(a=>`<div class="entity-card"><div class="entity-top"><div><span class="eyebrow">${esc(a.type||"CONTA")}</span><h3>${esc(a.name)}</h3></div><button class="icon-btn" onclick="removeItem('accounts','${a.id}')">×</button></div><div class="entity-value">${money(a.balance)}</div><p>${esc(a.bank||"Saldo atual")}</p></div>`).join(""):`<div class="empty">Cadastre sua primeira conta ou carteira.</div>`}
function renderCards(){document.getElementById("cardsGrid").innerHTML=state.cards.length?state.cards.map(c=>`<div class="entity-card"><div class="entity-top"><div><span class="eyebrow">CARTÃO</span><h3>${esc(c.name)}</h3></div><button class="icon-btn" onclick="removeItem('cards','${c.id}')">×</button></div><p class="card-number">•••• •••• •••• ${esc(c.last4||"0000")}</p><div class="entity-value">${money(c.limit)}</div><p>Fechamento dia ${esc(c.closingDay||"—")} · vencimento dia ${esc(c.dueDay||"—")}</p></div>`).join(""):`<div class="empty">Cadastre seu primeiro cartão.</div>`}
function renderRecurring(){document.getElementById("recurringGrid").innerHTML=state.recurring.length?state.recurring.map(r=>`<div class="entity-card"><div class="entity-top"><div><span class="eyebrow">RECORRENTE</span><h3>${esc(r.description)}</h3></div><button class="icon-btn" onclick="removeItem('recurring','${r.id}')">×</button></div><div class="entity-value">${money(r.amount)}</div><p>${r.type==="income"?"Entrada":"Saída"} · todo dia ${esc(r.day||"—")} · ${esc(r.frequency||"mensal")}</p></div>`).join(""):`<div class="empty">Crie aluguel, salários, assinaturas e outras recorrências.</div>`}
function renderGoals(){document.getElementById("goalsGrid").innerHTML=state.goals.length?state.goals.map(g=>{const p=Math.min(100,(Number(g.current)||0)/(Number(g.target)||1)*100);return `<div class="entity-card"><div class="entity-top"><div><span class="eyebrow">META</span><h3>${esc(g.name)}</h3></div><button class="icon-btn" onclick="removeItem('goals','${g.id}')">×</button></div><div class="entity-value">${money(g.current)} <small class="muted">/ ${money(g.target)}</small></div><div class="progress"><i style="width:${p}%"></i></div><p>${p.toFixed(0)}% concluído · prazo ${dateFmt(g.deadline)}</p></div>`}).join(""):`<div class="empty">Defina uma meta para transformar planos em números.</div>`}
function renderCategories(){document.getElementById("categoriesGrid").innerHTML=state.categories.length?state.categories.map(c=>`<div class="entity-card"><div class="entity-top"><div><span class="eyebrow">${c.type==="income"?"ENTRADA":"SAÍDA"}</span><h3>${esc(c.name)}</h3></div>${c.uid===uid()?`<button class="icon-btn" onclick="removeItem('categories','${c.id}')">×</button>`:""}</div></div>`).join(""):`<div class="empty">Nenhuma categoria.</div>`}
function renderReports(){
 const map={};state.transactions.forEach(t=>{const k=t.category||"Outros";if(!map[k])map[k]={type:t.type,n:0,v:0};map[k].n++;map[k].v+=Number(t.amount||0)});
 const arr=Object.entries(map).sort((a,b)=>b[1].v-a[1].v), inc=state.transactions.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount||0),0), exp=state.transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount||0),0);
 setText("avgIncome",money(inc));setText("avgExpense",money(exp));setText("topCategory",arr[0]?.[0]||"—");setText("savingRate",inc?((inc-exp)/inc*100).toFixed(1)+"%":"0%");
 document.getElementById("reportTable").innerHTML=arr.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v.type==="income"?"Entrada":"Saída"}</td><td>${v.n}</td><td>${money(v.v)}</td></tr>`).join("")||`<tr><td colspan="4"><div class="empty">Sem dados.</div></td></tr>`;
}
function setText(id,v){const e=document.getElementById(id);if(e)e.textContent=v}
function showView(view){state.currentView=view;document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));document.getElementById(`view-${view}`).classList.remove("hidden");document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.view===view));const titles={dashboard:["VISÃO GERAL","Dashboard"],transactions:["MOVIMENTAÇÃO","Lançamentos"],accounts:["PATRIMÔNIO","Contas"],cards:["CRÉDITO","Cartões"],recurring:["AUTOMAÇÃO","Recorrentes"],goals:["PLANEJAMENTO","Metas"],categories:["ORGANIZAÇÃO","Categorias"],reports:["ANÁLISE","Relatórios"]};setText("pageEyebrow",titles[view][0]);setText("pageTitle",titles[view][1]);}
document.querySelectorAll(".nav").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));document.querySelectorAll("[data-view-jump]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.viewJump)));
document.getElementById("dashPeriod").addEventListener("change",renderDashboard);["txSearch","txType","txStatus"].forEach(id=>document.getElementById(id).addEventListener("input",renderTransactions));
document.getElementById("refreshBtn").onclick=async()=>{await loadAll();toast("Dados atualizados.")};
document.getElementById("logoutBtn").onclick=()=>signOut(auth);
document.getElementById("quickAdd").onclick=()=>openModal("transactions");
document.getElementById("newTx").onclick=()=>openModal("transactions");document.getElementById("newAccount").onclick=()=>openModal("accounts");document.getElementById("newCard").onclick=()=>openModal("cards");document.getElementById("newRecurring").onclick=()=>openModal("recurring");document.getElementById("newGoal").onclick=()=>openModal("goals");document.getElementById("newCategory").onclick=()=>openModal("categories");document.getElementById("exportCsv").onclick=exportCsv;
document.getElementById("modalClose").onclick=closeModal;document.getElementById("modalCancel").onclick=closeModal;document.querySelector(".modal-backdrop").onclick=closeModal;

let modalType=null, editingId=null;
function openModal(type,id=null){modalType=type;editingId=id;const item=id?state[type].find(x=>x.id===id):{};setText("modalTitle",id?"Editar":"Novo "+({transactions:"lançamento",accounts:"conta",cards:"cartão",recurring:"recorrente",goals:"meta",categories:"categoria"}[type]));const f=document.getElementById("modalFields");
 const common={transactions:[["description","Descrição","text",true],["amount","Valor","number",true],["date","Data","date",true],["type","Tipo","select",true, [["expense","Saída"],["income","Entrada"]]],["category","Categoria","select",false,state.categories.map(c=>[c.name,c.name])],["account","Conta","text"],["status","Status","select",false,[["pending","Pendente"],["paid","Concluído"]]],["notes","Observação","text"]],accounts:[["name","Nome","text",true],["balance","Saldo inicial","number",true],["type","Tipo","select",true,[["Conta corrente","Conta corrente"],["Poupança","Poupança"],["Carteira","Carteira"],["Dinheiro","Dinheiro"]]],["bank","Banco/Instituição","text"]],cards:[["name","Nome do cartão","text",true],["limit","Limite","number",true],["last4","Últimos 4 dígitos","text"],["closingDay","Dia de fechamento","number"],["dueDay","Dia de vencimento","number"]],recurring:[["description","Descrição","text",true],["amount","Valor","number",true],["type","Tipo","select",true,[["expense","Saída"],["income","Entrada"]]],["day","Dia do mês","number",true],["frequency","Frequência","select",true,[["mensal","Mensal"],["semanal","Semanal"],["anual","Anual"]]],["category","Categoria","select",false,state.categories.map(c=>[c.name,c.name])]],goals:[["name","Nome da meta","text",true],["target","Valor da meta","number",true],["current","Valor já guardado","number"],["deadline","Prazo","date"],["notes","Observação","text"]],categories:[["name","Nome","text",true],["type","Tipo","select",true,[["expense","Saída"],["income","Entrada"]]]]}[type];
 f.innerHTML=common.map(x=>{const [name,label,input,req,opts]=x;const val=item[name]??(name==="date"?todayISO():name==="type"?(type==="transactions"?"expense":"expense"):name==="status"?"pending":"");if(input==="select")return `<label>${label}<select name="${name}" ${req?"required":""}>${opts.map(o=>`<option value="${esc(o[0])}" ${String(val)===String(o[0])?"selected":""}>${esc(o[1])}</option>`).join("")}</select></label>`;return `<label class="${name==="notes"?"full":""}">${label}<input name="${name}" type="${input}" value="${esc(val)}" ${req?"required":""} step="${input==="number"?"0.01":"1"}"></label>`}).join("");document.getElementById("modal").classList.remove("hidden")}
function closeModal(){document.getElementById("modal").classList.add("hidden")}
document.getElementById("modalForm").onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());if(data.amount)data.amount=Number(data.amount);if(data.balance)data.balance=Number(data.balance);if(data.limit)data.limit=Number(data.limit);if(data.target)data.target=Number(data.target);if(data.current)data.current=Number(data.current);if(data.day)data.day=Number(data.day);if(data.closingDay)data.closingDay=Number(data.closingDay);if(data.dueDay)data.dueDay=Number(data.dueDay);
 try{if(editingId){await updateDoc(doc(db,modalType,editingId),data);const i=state[modalType].findIndex(x=>x.id===editingId);state[modalType][i]={...state[modalType][i],...data}}else{const ref=await addDoc(coll(modalType),{...data,uid:uid(),createdAt:serverTimestamp()});state[modalType].push({id:ref.id,...data,uid:uid()})}closeModal();renderAll();toast("Salvo com sucesso.")}catch(e){toast(friendlyError(e),"err")}};
window.removeItem=async(type,id)=>{if(!confirm("Excluir este item?"))return;try{await deleteDoc(doc(db,type,id));state[type]=state[type].filter(x=>x.id!==id);renderAll();toast("Excluído.")}catch(e){toast(friendlyError(e),"err")}};
window.editTx=id=>openModal("transactions",id);

async function exportCsv(){const rows=[["Data","Descrição","Tipo","Categoria","Conta","Status","Valor"],...state.transactions.map(t=>[t.date,t.description,t.type,t.category,t.account,t.status,t.amount])];const csv=rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(";")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download="reluz-financeiro.csv";a.click();URL.revokeObjectURL(a.href)}

document.getElementById("loginForm").onsubmit=async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,loginEmail.value.trim(),loginPassword.value);toast("Login realizado.")}catch(err){toast(friendlyError(err),"err")}};
document.getElementById("signupForm").onsubmit=async e=>{e.preventDefault();try{const cred=await createUserWithEmailAndPassword(auth,signupEmail.value.trim(),signupPassword.value);await updateProfile(cred.user,{displayName:signupName.value.trim()});await setDoc(doc(db,"users",cred.user.uid),{uid:cred.user.uid,name:signupName.value.trim(),email:cred.user.email,createdAt:serverTimestamp()},{merge:true});toast("Conta criada com sucesso.")}catch(err){toast(friendlyError(err),"err")}};
onAuthStateChanged(auth,async user=>{state.user=user;if(user){document.getElementById("authScreen").classList.add("hidden");document.getElementById("appScreen").classList.remove("hidden");setText("userName",user.displayName||"Usuário");setText("userEmail",user.email);setText("avatar",(user.displayName||user.email||"U").slice(0,1).toUpperCase());await loadAll()}else{document.getElementById("authScreen").classList.remove("hidden");document.getElementById("appScreen").classList.add("hidden")}});
const chartScript=document.createElement("script");chartScript.src="https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js";document.head.appendChild(chartScript);
