import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
 getAuth, onAuthStateChanged, signInWithEmailAndPassword,
 createUserWithEmailAndPassword, updateProfile, signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
 getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc,
 deleteDoc, query, where, orderBy, limit, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

const cfg=window.FIREBASE_CONFIG||{};
const firebaseReady=cfg.apiKey&&!String(cfg.apiKey).includes("COLE_AQUI")&&cfg.projectId&&cfg.projectId!=="SEU-PROJETO";
let firebaseApp,auth,db,storage;
if(firebaseReady){firebaseApp=initializeApp(cfg);auth=getAuth(firebaseApp);db=getFirestore(firebaseApp);storage=getStorage(firebaseApp);}

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
function friendlyError(err){const code=err?.code||"";const m=err?.message||String(err||"");if(code.includes("auth/invalid-credential")||code.includes("auth/invalid-login-credentials")||m.includes("Invalid login credentials"))return "E-mail ou senha incorretos.";if(code.includes("auth/unauthorized-domain"))return "Este endereço do GitHub não está autorizado no Firebase Authentication. Adicione entradareluz-cell.github.io em Authentication → Settings → Authorized domains.";if(code.includes("auth/email-already-in-use"))return "Este e-mail já está cadastrado. Use Entrar.";if(code.includes("auth/weak-password"))return "A senha precisa ter pelo menos 6 caracteres.";if(code.includes("auth/invalid-email"))return "E-mail inválido.";if(code.includes("auth/network-request-failed")||m.includes("Failed to fetch")||m.includes("NetworkError"))return "Não foi possível conectar ao Firebase. Verifique sua internet e a configuração.";if(m.includes("permission-denied"))return "Login feito, mas o Firestore bloqueou o acesso. Verifique as Rules.";return m;}
document.addEventListener("DOMContentLoaded",async()=>{
  $("dashMonth").value=thisMonth;$("reportMonth").value=thisMonth;$("txDate").value=today;
  $("loginForm").onsubmit=login;$("signupForm").onsubmit=signup;$("logout").onclick=()=>sb.auth.signOut();
  $("txForm").onsubmit=saveTx;$("catForm").onsubmit=saveCategory;$("cardForm").onsubmit=saveCard;$("recForm").onsubmit=saveRec;$("goalForm").onsubmit=saveGoal;$("accountForm").onsubmit=saveAccount;$("txType").onchange=()=>{fillCategorySelects();toggleSplitPayment();toggleDreClass()};$("txCat").onchange=togglePedidoFields;$("txSplitEnabled")?.addEventListener("change",toggleSplitPayment);$("txStatus")?.addEventListener("change",toggleSplitPayment);$("txMethod")?.addEventListener("change",updateInstallmentPreview);$("txCard")?.addEventListener("change",updateInstallmentPreview);$("txAmount")?.addEventListener("input",updateInstallmentPreview);$("txInstall")?.addEventListener("input",updateInstallmentPreview);["txPay1Method","txPay1Amount","txPay1Installments","txPay1Card","txPay2Method","txPay2Amount","txPay2Installments","txPay2Card"].forEach(id=>$(id)?.addEventListener("input",updateSplitPreview));["txPay1Method","txPay1Card","txPay2Method","txPay2Card"].forEach(id=>$(id)?.addEventListener("change",updateSplitPreview));$("recType")?.addEventListener("change",fillCategorySelects);
  $("dashMonth").onchange=dashboard;$("reportMonth").onchange=report;$("transferForm")?.addEventListener("submit",saveTransfer);$("excel").onclick=excel;$("pdf").onclick=pdf;
  document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>page(b.dataset.page));
  try{
    if(!firebaseReady) throw new Error("Configuração do Firebase não carregada. Verifique o arquivo config.js.");
    const {data,error}=await sb.auth.getSession();
    if(error) throw error;
    if(data.session) await start(data.session.user); else loginView();
    sb.auth.onAuthStateChange(async(e,s)=>{try{if(s) await start(s.user); else loginView()}catch(err){console.error("Falha ao abrir a sessão",err);loginView();msg("authMsg",friendlyError(err))}});
  }catch(err){console.error(err);loginView();msg("authMsg",friendlyError(err))}
});
function loginView(){$("loginView").classList.remove("hidden");$("app").classList.add("hidden")}
async function start(u){user=u;const r=await getDoc(doc(db,"users",u.uid));$("userName").textContent=r.exists()?r.data().name:(u.displayName||u.email);$("loginView").classList.add("hidden");$("app").classList.remove("hidden");await load();page("dashboard")}
async function login(e){e.preventDefault();msg("authMsg","");const r=await sb.auth.signInWithPassword({email:$("loginEmail").value.trim(),password:$("loginPassword").value});if(r.error)msg("authMsg",friendlyError(r.error));}
async function signup(e){e.preventDefault();msg("authMsg","");const r=await sb.auth.signUp({email:$("signupEmail").value.trim(),password:$("signupPassword").value,options:{data:{name:$("signupName").value.trim()}}});if(r.error){msg("authMsg",friendlyError(r.error));return}msg("authMsg",r.data.session?"Conta criada e acesso liberado.":"Conta criada. Se a confirmação de e-mail estiver ativa, verifique sua caixa de entrada.");}
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
      try{ await deleteDoc(doc(db,"categories",c.id)); }
      catch(err){ console.warn("Não foi possível remover categoria duplicada",c.id,err); }
    }
  }
  return Array.from(seen.values());
}

async function load(){
  if(!user?.uid) return;
  // Toda consulta é filtrada pelo UID. As Firestore Rules não permitem
  // consultar uma coleção inteira e depois filtrar no navegador.
  const uid=user.uid;
  let [a,b,c,d,e,f]=await Promise.all([
    sb.from("categories").select("*").eq("user_id",uid),
    sb.from("accounts").select("*").eq("user_id",uid),
    sb.from("cards").select("*").eq("user_id",uid),
    sb.from("recurring").select("*,categories(name)").eq("user_id",uid),
    sb.from("goals").select("*").eq("user_id",uid),
    sb.from("transactions").select("*,categories(name),accounts(name),cards(name)").eq("user_id",uid).limit(3000)
  ]);
  const names=["categories","accounts","cards","recurring","goals","transactions"];
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
  txs.sort((x,y)=>String(y.transaction_date||"").localeCompare(String(x.transaction_date||"")));
  txs.forEach(t=>joinRelations("transactions",t));
  recurring.forEach(r=>joinRelations("recurring",r));
  fill();render();window.__reluzLoaded=true
}
function fill(){fillCategorySelects();if($("transferFrom"))$("transferFrom").innerHTML=accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("");if($("transferTo"))$("transferTo").innerHTML=accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("");if($("transferDate"))$("transferDate").value=today;$("txAccount").innerHTML=accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("");$("txCard").innerHTML='<option value="">Nenhum</option>'+cards.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");$("catBody").innerHTML=categories.map(c=>`<tr><td>${esc(c.name)}</td><td>${c.type==="saida"?"Saída":c.type==="entrada"?"Entrada":"Ambos"}</td><td><button type="button" class="danger" onclick="deleteCategory('${c.id}')">Excluir</button></td></tr>`).join("")||'<tr><td colspan="3">Nenhuma categoria cadastrada.</td></tr>'}
function isPedidoCategory(){const id=$("txCat")?.value;const c=categories.find(x=>x.id===id);return String(c?.name||"").trim().toLowerCase()==="pedido";}
function togglePedidoFields(){const box=$("pedidoFields");if(!box)return;const show=isPedidoCategory();box.classList.toggle("hidden",!show);if(!show){["txMetalValue","txInitialKg","txFinalKg"].forEach(id=>{if($(id))$(id).value=""});}}
function fillCategorySelects(){const type=$("txType")?.value||"saida";const available=categories.filter(c=>c.type==="ambos"||c.type===type);$("txCat").innerHTML=available.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")||'<option value="">Cadastre uma categoria primeiro</option>';const recurringType=$("recType")?.value||"saida";const recurringCats=categories.filter(c=>c.type==="ambos"||c.type===recurringType);$("recCat").innerHTML=recurringCats.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("")||'<option value="">Cadastre uma categoria primeiro</option>';togglePedidoFields();}
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
    // Grava diretamente no Firestore com o UID do usuário.
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
    const ref=doc(db,"categories",id);
    const snap=await getDoc(ref);
    if(!snap.exists() || snap.data().user_id!==user.uid) return msg("catMsg","Categoria não encontrada ou sem permissão.");
    await deleteDoc(ref);
    await load();
    page("categorias");
  }catch(err){console.error(err);msg("catMsg","Não foi possível excluir: "+friendlyError(err))}
}
function toggleSplitPayment(){const box=$("splitPaymentBox"),partial=$("txStatus")?.value==="parcial",enabled=($("txType")?.value==="entrada"&&$("txSplitEnabled")?.checked)||partial;if(box)box.classList.toggle("hidden",!enabled);const title=box?.querySelector(".split-payment-title");if(title)title.textContent=partial?"Pagamento parcial":"Recebimento dividido";const hint=box?.querySelector(".split-payment-hint");if(hint)hint.textContent=partial?"Informe as formas usadas neste pagamento parcial.":"Use até 2 formas para uma entrada. Ex.: PIX + crédito.";const sw=$("txSplitEnabled")?.closest(".switch-line");if(sw)sw.classList.toggle("hidden",partial);const wrap=$("partialAmountWrap");if(wrap)wrap.classList.toggle("hidden",!partial);fillPaymentCardSelects();updateSplitPreview();updateInstallmentPreview()}
function fillPaymentCardSelects(){const opts='<option value="">Cartão</option>'+cards.map(c=>`<option value="${c.id}">${esc(c.name)}${Number(c.fee_percent||0)>0?` · taxa ${Number(c.fee_percent).toFixed(2)}%`:""}</option>`).join("");["txPay1Card","txPay2Card"].forEach(id=>{const el=$(id);if(el){const old=el.value;el.innerHTML=opts;el.value=old;}})}
function getCardFee(cardId){const c=cards.find(x=>x.id===cardId);return Math.max(0,Number(c?.fee_percent||0));}
function buildInstallmentPlan(grossTotal,installments,feePercent){const n=Math.max(1,Number(installments)||1),gross=Number(grossTotal)||0,feeRate=Math.max(0,Number(feePercent)||0),grossBase=Math.round((gross/n)*100)/100,feeTotal=Math.round(gross*feeRate)/100,rows=[];let grossAccum=0,feeAccum=0;for(let i=1;i<=n;i++){const g=i===n?Math.round((gross-grossAccum)*100)/100:grossBase;const f=i===n?Math.round((feeTotal-feeAccum)*100)/100:Math.round(g*feeRate)/100;grossAccum+=g;feeAccum+=f;rows.push({gross_amount:g,fee_amount:f,net_amount:Math.round((g-f)*100)/100,installment_number:i,installment_total:n,fee_percent:feeRate})}return rows}
function updateInstallmentPreview(){const el=$("installmentPreview");if(!el)return;const method=$("txMethod")?.value,cardId=$("txCard")?.value,n=Number($("txInstall")?.value||1),gross=Number($("txAmount")?.value||0);if(method!=="credit"||!cardId||gross<=0||n<1){el.classList.add("hidden");return}const fee=getCardFee(cardId),plan=buildInstallmentPlan(gross,n,fee),totalFee=plan.reduce((s,x)=>s+x.fee_amount,0),totalNet=plan.reduce((s,x)=>s+x.net_amount,0);el.innerHTML=`<b>Parcelamento com taxa</b><br>Taxa cadastrada: <b>${fee.toFixed(2)}%</b> · Total da taxa: <b>${money(totalFee)}</b> · Líquido a receber: <b>${money(totalNet)}</b><div class="installment-preview-list">${plan.map(x=>`<span>${x.installment_number}/${x.installment_total}: ${money(x.gross_amount)} − ${money(x.fee_amount)} = <b>${money(x.net_amount)}</b></span>`).join("")}</div>`;el.classList.remove("hidden")}
function updateSplitPreview(){const el=$("splitPaymentMsg");if(!el)return;const enabled=( $("txType")?.value==="entrada"&&$("txSplitEnabled")?.checked)||$("txStatus")?.value==="parcial";if(!enabled){el.textContent="";return}const parts=getPaymentParts();const grossSum=parts.reduce((s,p)=>s+p.amount,0),total=Number($("txStatus")?.value==="parcial"?$("txPartialAmount")?.value:$("txAmount")?.value)||0;const fee=parts.reduce((s,p)=>s+p.fee_amount,0),net=parts.reduce((s,p)=>s+p.net_amount,0);el.innerHTML=`Bruto informado: <b>${money(grossSum)}</b> · Líquido após taxas: <b>${money(net)}</b> · Taxas: <b>${money(fee)}</b>${total?` · Alvo: <b>${money(total)}</b>`:""}`;el.classList.toggle("ok",Math.abs(grossSum-total)<0.01)}
function toggleDreClass(){const type=$("txType")?.value||"saida",el=$("txDreClass");if(!el)return;const values=type==="entrada"?[['receita_bruta','Receita bruta'],['outras_receitas','Outras receitas'],['nao_dre','Não considerar na DRE']]:[['custo','Custo'],['despesa_operacional','Despesa operacional'],['despesa_financeira','Despesa financeira'],['investimento','Investimento (fora da DRE)'],['nao_dre','Não considerar na DRE']];el.innerHTML=values.map(([v,t])=>`<option value="${v}">${t}</option>`).join("");}
function paymentLabel(v){return ({pix:'PIX',credit:'Cartão de crédito',boleto:'Boleto',cash:'Dinheiro',debit:'Débito',transfer:'Transferência',other:'Outro',multiple:'Múltiplas formas'})[v]||v||"—"}
function getPaymentParts(){const enabled=($("txType")?.value==="entrada"&&$("txSplitEnabled")?.checked)||$("txStatus")?.value==="parcial";if(!enabled)return null;return [1,2].map(i=>{const method=$(`txPay${i}Method`)?.value,amount=Number($(`txPay${i}Amount`)?.value||0),installments=Math.max(1,Number($(`txPay${i}Installments`)?.value||1)),card_id=$(`txPay${i}Card`)?.value||null,fee_percent=method==="credit"?getCardFee(card_id):0,plan=buildInstallmentPlan(amount,installments,fee_percent);return {method,amount,installments,card_id,fee_percent,fee_amount:plan.reduce((s,x)=>s+x.fee_amount,0),net_amount:plan.reduce((s,x)=>s+x.net_amount,0),installment_plan:plan}}).filter(x=>x.amount>0);}
function paymentSummary(t){if(Array.isArray(t.payment_parts)&&t.payment_parts.length)return t.payment_parts.map(p=>`${paymentLabel(p.method)} ${money(p.amount)}${p.method==='credit'&&Number(p.installments)>1?` em ${p.installments}x`:''}${Number(p.fee_amount)>0?` · taxa ${money(p.fee_amount)}`:''}`).join(' + ');const fee=Number(t.fee_amount||0);return paymentLabel(t.payment_method)+(fee>0?` · taxa ${money(fee)} · líquido ${money(t.net_amount!=null?t.net_amount:t.amount)}`:'')} 
async function saveTx(e){
 e.preventDefault();
 const installments=Math.max(1,+$("txInstall").value||1),groupId=crypto.randomUUID(),pedido=isPedidoCategory(),isEntrada=$("txType").value==="entrada",status=$("txStatus").value,splitEnabled=(isEntrada&&$("txSplitEnabled")?.checked)||status==="parcial";
 const totalGross=Number($("txAmount").value||0); if(totalGross<=0)return msg("txMsg","Informe um valor maior que zero.");
 const partialGross=status==="parcial"?Number($("txPartialAmount")?.value||0):totalGross;
 if(status==="parcial"&&(partialGross<=0||partialGross>totalGross))return msg("txMsg","No pagamento parcial, informe um valor maior que zero e menor ou igual ao valor total.");
 let attachmentUrl=null;const file=$("txAttachmentFile")?.files?.[0];
 if(file){try{const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const rr=storageRef(storage,`users/${user.uid}/comprovantes/${groupId}-${safe}`);await uploadBytes(rr,file);attachmentUrl=await getDownloadURL(rr)}catch(err){return msg("txMsg","Não foi possível enviar o comprovante: "+friendlyError(err))}}
 let paymentParts=getPaymentParts();
 if(splitEnabled){
   if(!paymentParts?.length)return msg("txMsg","Informe pelo menos uma forma de pagamento/recebimento.");
   const sum=paymentParts.reduce((s,p)=>s+p.amount,0),target=partialGross;
   if(Math.abs(sum-target)>0.01)return msg("txMsg",`As formas informadas somam ${money(sum)}, mas o valor a receber/pagar agora é ${money(target)}.`);
 }
 let method=$("txMethod").value;
 if(paymentParts?.length)method=paymentParts.length>1?'multiple':paymentParts[0].method;
 let feeTotal=paymentParts?.reduce((s,p)=>s+p.fee_amount,0)||0;
 let netTotal=splitEnabled?paymentParts.reduce((s,p)=>s+p.net_amount,0):totalGross;
 const directCredit=isEntrada&&method==="credit"&&!splitEnabled&&$("txCard").value;
 let directPlan=directCredit?buildInstallmentPlan(totalGross,installments,getCardFee($("txCard").value)):null;
 if(directPlan){feeTotal=directPlan.reduce((s,p)=>s+p.fee_amount,0);netTotal=directPlan.reduce((s,p)=>s+p.net_amount,0)}
 let base={user_id:user.uid,type:$("txType").value,amount:netTotal,gross_amount:status==="parcial"?partialGross:totalGross,original_amount:totalGross,net_amount:netTotal,fee_amount:feeTotal,fee_percent:directCredit?getCardFee($("txCard").value):null,transaction_date:$("txDate").value,competence_date:$("txDate").value,paid_date:$("txPaidDate").value||null,category_id:$("txCat").value,subcategory:$("txSubcategory").value||null,account_id:$("txAccount").value||null,card_id:$("txCard").value||null,payment_method:method,status,name:$("txName").value.trim(),description:$("txDesc").value.trim()||null,notes:$("txNotes").value||null,attachment_url:attachmentUrl,recurrence:$("txRecurring").value,group_id:groupId,dre_class:$("txDreClass")?.value||(isEntrada?'receita_bruta':'despesa_operacional')};
 if(status==="parcial")base.partial_paid_amount=partialGross;
 if(pedido){base.metal_value=$("txMetalValue").value===""?null:+$("txMetalValue").value;base.initial_kg=$("txInitialKg").value===""?null:+$("txInitialKg").value;base.final_kg=$("txFinalKg").value===""?null:+$("txFinalKg").value;}
 let rows=[];
 if(directPlan){
   for(const part of directPlan){let d=new Date($("txDate").value+"T12:00:00");d.setMonth(d.getMonth()+part.installment_number-1);let pd=base.paid_date;if(pd&&part.installment_number>1){let x=new Date(pd+"T12:00:00");x.setMonth(x.getMonth()+part.installment_number-1);pd=x.toISOString().slice(0,10)}rows.push({...base,amount:part.net_amount,gross_amount:part.gross_amount,net_amount:part.net_amount,fee_amount:part.fee_amount,status:part.installment_number>1&&base.status==="pago"?"pendente":base.status,transaction_date:d.toISOString().slice(0,10),competence_date:d.toISOString().slice(0,10),paid_date:pd,installment_number:part.installment_number,installment_total:part.installment_total});}
 }else if(splitEnabled){
   const maxParts=Math.max(...paymentParts.map(p=>p.installment_plan.length),1);
   for(let i=1;i<=maxParts;i++){
     const current=paymentParts.map(p=>p.installment_plan[i-1]).filter(Boolean);
     const gross=current.reduce((s,p)=>s+p.gross_amount,0),fee=current.reduce((s,p)=>s+p.fee_amount,0),net=current.reduce((s,p)=>s+p.net_amount,0);
     if(gross<=0)continue;
     let d=new Date($("txDate").value+"T12:00:00");d.setMonth(d.getMonth()+i-1);let pd=base.paid_date;if(pd&&i>1){let x=new Date(pd+"T12:00:00");x.setMonth(x.getMonth()+i-1);pd=x.toISOString().slice(0,10)}
     const currentParts=paymentParts.map((p,idx)=>p.installment_plan[i-1]?({...p,amount:p.installment_plan[i-1].gross_amount,fee_amount:p.installment_plan[i-1].fee_amount,net_amount:p.installment_plan[i-1].net_amount,installment_number:i,installment_total:p.installment_plan.length}):null).filter(Boolean);
     rows.push({...base,amount:net,gross_amount:gross,net_amount:net,fee_amount:fee,payment_parts:currentParts,status:i>1&&base.status==="pago"?"pendente":base.status,transaction_date:d.toISOString().slice(0,10),competence_date:d.toISOString().slice(0,10),paid_date:pd,installment_number:i,installment_total:maxParts});
   }
 }else{
   rows=[{...base,installment_number:1,installment_total:1}];
 }
 const r=await sb.from("transactions").insert(rows);msg("txMsg",r.error?.message||`Lançamento salvo. Líquido: ${money(netTotal)}${feeTotal?` · Taxas: ${money(feeTotal)}`:""}`);
 if(!r.error){$("txForm").reset();$("txDate").value=today;$("txPaidDate").value="";togglePedidoFields();toggleSplitPayment();toggleDreClass();await load()}
}
async function saveCard(e){e.preventDefault();let r=await sb.from("cards").insert({user_id:user.uid,name:$("cardName").value,limit_amount:+$("cardLimit").value,closing_day:+$("cardClose").value,due_day:+$("cardDue").value,last4:$("cardLast4")?.value||null,fee_percent:Math.max(0,+$("cardFee")?.value||0),active:true});msg("cardMsg",r.error?.message||"Cartão cadastrado.");if(!r.error){$("cardForm").reset();await load()}}
async function saveRec(e){e.preventDefault();let r=await sb.from("recurring").insert({user_id:user.uid,type:$("recType")?.value||"saida",description:$("recDesc").value,amount:+$("recAmount").value,category_id:$("recCat").value,due_day:+$("recDay").value,start_date:$("recStart").value,end_date:$("recEnd").value||null});msg("recMsg",r.error?.message||"Cadastrado.");if(!r.error){$("recForm").reset();await load()}}
async function saveGoal(e){e.preventDefault();let r=await sb.from("goals").insert({user_id:user.uid,name:$("goalName").value,target_amount:+$("goalTarget").value,current_amount:+$("goalCurrent").value||0,deadline:$("goalDate").value||null});msg("goalMsg",r.error?.message||"Meta cadastrada.");if(!r.error){$("goalForm").reset();await load()}}
async function saveTransfer(e){e.preventDefault();const from=$("transferFrom").value,to=$("transferTo").value,amount=+$("transferAmount").value;if(!from||!to||from===to||!amount)return msg("transferMsg","Escolha contas diferentes e informe um valor.");const group=crypto.randomUUID(),date=$("transferDate").value||today,desc=$("transferDesc").value||"Transferência entre contas";const rows=[{user_id:user.uid,type:"saida",amount,transaction_date:date,competence_date:date,paid_date:date,account_id:from,status:"pago",description:desc,notes:"Transferência - origem",payment_method:"transfer",transfer_group_id:group},{user_id:user.uid,type:"entrada",amount,transaction_date:date,competence_date:date,paid_date:date,account_id:to,status:"pago",description:desc,notes:"Transferência - destino",payment_method:"transfer",transfer_group_id:group}];const r=await sb.from("transactions").insert(rows);msg("transferMsg",r.error?.message||"Transferência realizada.");if(!r.error){$("transferForm").reset();$("transferDate").value=today;await load()}}
async function saveAccount(e){e.preventDefault();let r=await sb.from("accounts").insert({user_id:user.uid,name:$("accountName").value,type:$("accountType").value,initial_balance:+$("accountInitial").value||0});msg("accountMsg",r.error?.message||"Conta cadastrada.");if(!r.error){$("accountForm").reset();await load()}}
function render(){$("txBody").innerHTML=txs.slice(0,200).map(t=>`<tr><td>${t.transaction_date}</td><td>${t.type}</td><td>${esc(t.name||t.description||"Sem nome")}</td><td>${esc(t.categories?.name||"-")}</td><td>${money(t.amount)}</td><td>${t.status}</td><td>${t.installment_total>1?t.installment_number+"/"+t.installment_total:"-"}</td></tr>`).join("");$("cardBody").innerHTML=cards.map(c=>{let u=txs.filter(t=>t.card_id===c.id&&t.type==="saida"&&t.transaction_date.startsWith(thisMonth)).reduce((a,t)=>a+ +t.amount,0);return`<tr><td>${esc(c.name)}</td><td>${money(c.limit_amount)}</td><td>${money(u)}</td><td>${money(Math.max(0,c.limit_amount-u))}</td><td>${Number(c.fee_percent||0).toFixed(2)}%</td><td>${c.closing_day}</td><td>${c.due_day}</td></tr>`}).join("");$("recBody").innerHTML=recurring.map(r=>`<tr><td>${esc(r.description)}</td><td>${money(r.amount)}</td><td>${esc(r.categories?.name||"-")}</td><td>${r.due_day}</td><td>${r.start_date}</td><td>${r.end_date||"-"}</td></tr>`).join("");$("goals").innerHTML=goalsData();$("accountBody").innerHTML=accounts.map(a=>{let m=txs.filter(t=>t.account_id===a.id).reduce((s,t)=>s+(t.type==="entrada"?1:-1)*+t.amount,0);return`<tr><td>${esc(a.name)}</td><td>${esc(a.type)}</td><td>${money(a.initial_balance)}</td><td>${money(m)}</td><td>${money(+a.initial_balance+m)}</td></tr>`}).join("");dashboard();report()}
function goalsData(){return goalsList.map(g=>{let p=Math.min(100,+g.current_amount/+g.target_amount*100);return`<div class="goal"><h3>${esc(g.name)}</h3><b>${money(g.current_amount)} / ${money(g.target_amount)}</b><div class="progress"><div style="width:${p}%"></div></div>${p.toFixed(1)}%${g.deadline?" · prazo "+g.deadline:""}</div>`}).join("")}
function dashboard(){let m=$("dashMonth").value||thisMonth,r=txs.filter(t=>t.transaction_date.startsWith(m)),ins=r.filter(t=>t.type==="entrada").reduce((s,t)=>s+ +t.amount,0),out=r.filter(t=>t.type==="saida").reduce((s,t)=>s+ +t.amount,0),pending=txs.filter(t=>t.type==="saida"&&t.status==="pendente"&&t.transaction_date>=today).reduce((s,t)=>s+ +t.amount,0);$("inTotal").textContent=money(ins);$("outTotal").textContent=money(out);$("result").textContent=money(ins-out);$("available").textContent=money(ins-out-pending);let daily={};r.forEach(t=>daily[t.transaction_date]=(daily[t.transaction_date]||0)+(t.type==="entrada"?+t.amount:-+t.amount));let cc={};r.filter(t=>t.type==="saida").forEach(t=>cc[t.categories?.name||"Outros"]=(cc[t.categories?.name||"Outros"]||0)+ +t.amount);flowChart?.destroy();catChart?.destroy();flowChart=new Chart($("flow"),{type:"line",data:{labels:Object.keys(daily),datasets:[{label:"Resultado",data:Object.values(daily)}]}});catChart=new Chart($("cats"),{type:"doughnut",data:{labels:Object.keys(cc),datasets:[{data:Object.values(cc)}]}});$("due").innerHTML=txs.filter(t=>t.type==="saida"&&t.status==="pendente").slice(0,5).map(t=>`<p>${t.transaction_date} · ${esc(t.description)}<br><b>${money(t.amount)}</b></p>`).join("")||"Nenhuma.";$("cardDash").innerHTML=cards.map(c=>`<p>${esc(c.name)} · ${money(txs.filter(t=>t.card_id===c.id&&t.type==="saida"&&t.transaction_date.startsWith(m)).reduce((s,t)=>s+ +t.amount,0))}</p>`).join("")||"Nenhum.";$("goalDash").innerHTML=goalsList.slice(0,5).map(g=>`<p>${esc(g.name)} · ${(g.current_amount/g.target_amount*100).toFixed(0)}%</p>`).join("")||"Nenhuma."}
function report(){let m=$("reportMonth").value||thisMonth,r=txs.filter(t=>t.transaction_date.startsWith(m)),i=r.filter(t=>t.type==="entrada").reduce((s,t)=>s+ +t.amount,0),o=r.filter(t=>t.type==="saida").reduce((s,t)=>s+ +t.amount,0);$("summary").innerHTML=`<p>Entradas <b>${money(i)}</b> · Saídas <b>${money(o)}</b> · Resultado <b>${money(i-o)}</b> · Pedidos <b>${r.filter(t=>(t.categories?.name||"").toLowerCase()==="pedido").length}</b></p>`;$("reportBody").innerHTML=r.map(t=>`<tr><td>${t.transaction_date}</td><td>${t.type}</td><td>${esc(t.name||t.description||"")}</td><td>${esc(t.categories?.name||"-")}</td><td>${money(t.amount)}</td><td>${t.metal_value!=null?money(t.metal_value):"-"}</td><td>${t.initial_kg!=null?Number(t.initial_kg).toFixed(3):"-"}</td><td>${t.final_kg!=null?Number(t.final_kg).toFixed(3):"-"}</td><td>${money(t.gross_amount!=null?t.gross_amount:t.amount)}</td><td>${Number(t.fee_amount||0)>0?money(t.fee_amount):"-"}</td><td>${money(t.net_amount!=null?t.net_amount:t.amount)}</td><td>${esc(paymentSummary(t))}</td><td>${t.status}</td></tr>`).join("")||'<tr><td colspan="13">Nenhum lançamento no período.</td></tr>'}

function excel(){let m=$("reportMonth").value||thisMonth,r=txs.filter(t=>t.transaction_date.startsWith(m)).map(t=>({Data:t.transaction_date,Tipo:t.type,Nome:t.name||t.description||"",Descrição:t.description||"",Categoria:t.categories?.name||"",Conta:t.accounts?.name||"",Cartão:t.cards?.name||"",Valor:+t.amount,Valor_Bruto:t.gross_amount==null?+t.amount:+t.gross_amount,Taxa_Maquininha:t.fee_amount==null?0:+t.fee_amount,Taxa_Percentual:t.fee_percent==null?0:+t.fee_percent,Valor_Liquido:t.net_amount==null?+t.amount:+t.net_amount,Valor_do_metal:t.metal_value==null?"":+t.metal_value,KG_inicial:t.initial_kg==null?"":+t.initial_kg,KG_final:t.final_kg==null?"":+t.final_kg,Recebimento:paymentSummary(t),Classificacao_DRE:t.dre_class||"",Status:t.status,Parcela:t.installment_total>1?`${t.installment_number}/${t.installment_total}`:""}));let ws=XLSX.utils.json_to_sheet(r),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Financeiro");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(buildDRE(m).rows),"DRE");XLSX.writeFile(wb,`financeiro-${m}.xlsx`)}

function pdf(){let m=$("reportMonth").value||thisMonth,r=txs.filter(t=>t.transaction_date.startsWith(m)),i=r.filter(t=>t.type==="entrada").reduce((s,t)=>s+ +t.amount,0),o=r.filter(t=>t.type==="saida").reduce((s,t)=>s+ +t.amount,0),dre=buildDRE(m),D=window.jspdf.jsPDF,d=new D();d.setFontSize(18);d.text("Relatório Financeiro Empresarial",14,18);d.setFontSize(10);d.text(`Mês: ${m}`,14,27);d.text(`Entradas: ${money(i)}  Saídas: ${money(o)}  Resultado: ${money(i-o)}`,14,36);d.text("DRE",14,48);let y=56;dre.rows.forEach(x=>{d.text(`${x.Linha}: ${money(x.Valor)}`,16,y);y+=6});y+=5;d.text("Pedidos / lançamentos",14,y);y+=8;r.forEach(t=>{if(y>280){d.addPage();y=18}const metal=t.metal_value!=null?` Metal ${money(t.metal_value)}`:"";const kg=t.initial_kg!=null||t.final_kg!=null?` KG ${Number(t.initial_kg||0).toFixed(3)}→${Number(t.final_kg||0).toFixed(3)}`:"";const pay=paymentSummary(t);d.setFontSize(8);d.text(`${t.transaction_date} | ${String(t.name||t.description||"").slice(0,24)} | ${money(t.amount)} | ${pay.slice(0,30)}${metal}${kg}`,14,y);y+=5});d.save(`financeiro-${m}.pdf`)}

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
function advCashAmount(t){return advNum(t.amount)}
function advDreAmount(t){return advNum(t.gross_amount!=null?t.gross_amount:t.amount)}
function advCurrentBalance(){return accounts.reduce((s,a)=>s+advNum(a.initial_balance),0)+txs.reduce((s,t)=>s+(advTypeIncome(t)?advCashAmount(t):-advCashAmount(t)),0)}
function dreClass(t){return t.dre_class||(advTypeIncome(t)?'receita_bruta':'despesa_operacional')}
function buildDRE(month){const r=txs.filter(t=>advMonth(t.transaction_date)===month);const sum=c=>r.filter(t=>dreClass(t)===c).reduce((s,t)=>s+advDreAmount(t),0);const receita=sum('receita_bruta'),outras=sum('outras_receitas'),custos=sum('custo'),op=sum('despesa_operacional'),fin=sum('despesa_financeira'),invest=sum('investimento');const receitaTotal=receita+outras,resultadoOperacional=receitaTotal-custos-op,resultadoLiquido=resultadoOperacional-fin;return {rows:[{Linha:'Receita bruta',Valor:receita},{Linha:'Outras receitas',Valor:outras},{Linha:'Receita total',Valor:receitaTotal},{Linha:'(-) Custos',Valor:custos},{Linha:'(-) Despesas operacionais',Valor:op},{Linha:'Resultado operacional',Valor:resultadoOperacional},{Linha:'(-) Despesas financeiras',Valor:fin},{Linha:'Resultado líquido',Valor:resultadoLiquido},{Linha:'Investimentos (fora da DRE)',Valor:invest}],receita,outras,custos,op,fin,invest,receitaTotal,resultadoOperacional,resultadoLiquido}}
function advMonthTotals(month){const r=txs.filter(t=>advMonth(t.transaction_date)===month);return {rows:r,income:r.filter(advTypeIncome).reduce((s,t)=>s+advNum(t.amount),0),expense:r.filter(advTypeExpense).reduce((s,t)=>s+advNum(t.amount),0)}}
function advPending(){return txs.filter(t=>!advStatusPaid(t)&&t.status!=="cancelado")}
function advPayables(){return advPending().filter(advTypeExpense)}
function advReceivables(){return advPending().filter(advTypeIncome)}
function advCreditAmount(t,cardId=null){if(Array.isArray(t.payment_parts)&&t.payment_parts.length){return t.payment_parts.filter(p=>p.method==="credit"&&(!cardId||p.card_id===cardId)).reduce((s,p)=>s+advNum(p.amount),0)}return (t.payment_method==="credit"||t.card_id)&&(!cardId||t.card_id===cardId)?advNum(t.amount):0}
function advInvoiceTotal(month=thisMonth){return txs.filter(t=>advTypeExpense(t)&&advMonth(t.transaction_date)===month).reduce((s,t)=>s+advCreditAmount(t),0)}
function advNextMonth(){const d=new Date();d.setMonth(d.getMonth()+1);return advISO(d).slice(0,7)}
function advCardUsage(cardId,month=thisMonth){return txs.filter(t=>advTypeExpense(t)&&advMonth(t.transaction_date)===month).reduce((s,t)=>s+advCreditAmount(t,cardId),0)}
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
 const body=$("cardBody");if(!body)return;body.innerHTML=cards.map(c=>{const used=advCardUsage(c.id),limit=advNum(c.limit_amount),available=Math.max(0,limit-used);const next=advCardUsage(c.id,advNextMonth());return `<tr><td>${esc(c.name)}</td><td>${money(limit)}</td><td>${money(used)}</td><td>${money(next)}</td><td>${money(available)}</td><td>${Number(c.fee_percent||0).toFixed(2)}%</td><td>${c.closing_day||"—"}</td><td>${c.due_day||"—"}</td></tr>`}).join("");
 const dash=$("cardDash");if(dash)dash.innerHTML=cards.map(c=>{const used=advCardUsage(c.id);return `<p><b>${esc(c.name)}</b> · ${money(used)} / ${money(c.limit_amount)}<br><small>Disponível: ${money(Math.max(0,advNum(c.limit_amount)-used))} · Fechamento ${c.closing_day||"—"} · Vencimento ${c.due_day||"—"}</small></p>`}).join("")||"Nenhum cartão.";
}
function advCalendar(){
 const el=$("calendarGrid");if(!el)return;const month=$("calendarMonth").value||thisMonth;const [y,m]=month.split("-").map(Number),first=new Date(y,m-1,1),last=new Date(y,m,0),start=(first.getDay()+6)%7,days=last.getDate();let html="<div class='cal-head'>"+["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(x=>`<b>${x}</b>`).join("")+"</div><div class='cal-body'>";for(let i=0;i<start;i++)html+="<div class='cal-day empty-day'></div>";for(let d=1;d<=days;d++){const ds=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`,items=txs.filter(t=>t.transaction_date===ds),hasIn=items.some(advTypeIncome),hasOut=items.some(advTypeExpense),hasCard=items.some(t=>t.card_id);html+=`<div class='cal-day'><span>${d}</span><div>${hasIn?"<i class='income-dot'>●</i>":""}${hasOut?"<i class='expense-dot'>●</i>":""}${hasOut&&!items.every(advStatusPaid)?"<i class='due-dot'>●</i>":""}${hasCard?"<i class='invoice-dot'>●</i>":""}</div>${items.slice(0,2).map(t=>`<small>${esc(t.name||t.description||"")} · ${money(t.amount)}</small>`).join("")}</div>`}html+="</div>";el.innerHTML=html;
}
function advGlobalSearch(q){
 const box=$("searchResults");if(!box)return;if(!q||q.length<2){box.classList.add("hidden");return}q=q.toLowerCase();const results=[];txs.forEach(t=>{const hay=`${t.name||""} ${t.description||""} ${t.notes||""} ${t.subcategory||""} ${advCategory(t)} ${advAccount(t)} ${advCard(t)}`.toLowerCase();if(hay.includes(q))results.push({type:"Lançamento",title:t.name||t.description||"Sem nome",meta:`${t.transaction_date} · ${money(t.amount)} · ${advCategory(t)}`})});categories.forEach(c=>{if(c.name.toLowerCase().includes(q))results.push({type:"Categoria",title:c.name,meta:c.type})});accounts.forEach(a=>{if(a.name.toLowerCase().includes(q))results.push({type:"Conta",title:a.name,meta:money(a.initial_balance)})});cards.forEach(c=>{if(c.name.toLowerCase().includes(q))results.push({type:"Cartão",title:c.name,meta:`Limite ${money(c.limit_amount)}`})});box.innerHTML=results.slice(0,12).map(r=>`<div class='search-item'><b>${esc(r.title)}</b><small>${esc(r.type)} · ${esc(r.meta)}</small></div>`).join("")||"<div class='search-item'>Nenhum resultado.</div>";box.classList.remove("hidden");}
function advReports(){const dre=$("dreReport"),annual=$("annualReport");if(!dre||!annual)return;const m=$("reportMonth")?.value||thisMonth,d=buildDRE(m);dre.innerHTML=`<div class='dre-line'><span>Receita bruta</span><b>${money(d.receita)}</b></div><div class='dre-line'><span>Outras receitas</span><b>${money(d.outras)}</b></div><div class='dre-line subtotal'><span>Receita total</span><b>${money(d.receitaTotal)}</b></div><div class='dre-line'><span>(-) Custos</span><b>${money(d.custos)}</b></div><div class='dre-line'><span>(-) Despesas operacionais</span><b>${money(d.op)}</b></div><div class='dre-line subtotal'><span>Resultado operacional</span><b>${money(d.resultadoOperacional)}</b></div><div class='dre-line'><span>(-) Despesas financeiras</span><b>${money(d.fin)}</b></div><div class='dre-line total'><span>Resultado líquido</span><b>${money(d.resultadoLiquido)}</b></div><div class='dre-line muted'><span>Investimentos fora da DRE</span><b>${money(d.invest)}</b></div>`;const months=[];for(let i=11;i>=0;i--){const dt=new Date();dt.setMonth(dt.getMonth()-i);const key=advISO(dt).slice(0,7),v=buildDRE(key);months.push({key,...v})}annual.innerHTML=months.map(x=>`<div class='annual-row'><span>${x.key}</span><b>${money(x.resultadoLiquido)}</b><small>${money(x.receitaTotal)} / ${money(x.custos+x.op+x.fin)}</small></div>`).join("")}

function advAnnualPdf(){const data=[];for(let i=0;i<12;i++){const d=new Date(new Date().getFullYear(),i,1),k=advISO(d).slice(0,7),v=buildDRE(k);data.push([k,v.receitaTotal,v.custos+v.op+v.fin,v.resultadoLiquido])}const D=window.jspdf.jsPDF,d=new D();d.setFontSize(18);d.text("DRE Financeira Anual",14,18);d.setFontSize(10);d.text("Mês | Receita total | Custos/Despesas | Resultado líquido",14,28);let y=36;data.forEach(r=>{d.text(`${r[0]} | ${money(r[1])} | ${money(r[2])} | ${money(r[3])}`,14,y);y+=7;if(y>280){d.addPage();y=18}});d.save(`dre-anual-${new Date().getFullYear()}.pdf`)}

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
 advCalendar();advRenderBusiness();advRenderCards();advReports();toggleDreClass();toggleSplitPayment();fillPaymentCardSelects();
}
let advReady=false;const advTimer=setInterval(async()=>{if(user&&window.__reluzLoaded&&!advReady){advReady=true;clearInterval(advTimer);await advGenerateRecurring();await load();advInit();}},400);
setInterval(()=>{if(user){advRenderBusiness();advRenderCards();advCalendar();advReports();}},5000);
