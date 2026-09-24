import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {Plus, LayoutDashboard, ShoppingBag, UsersRound, Layers3, Wallet, Boxes, UserRoundCheck, Store, ChartNoAxesCombined, Settings2, Search, Bell, ChevronDown, ArrowUpRight, ArrowRight, CalendarDays, Wifi, WifiOff, CloudUpload, Menu, Scissors, ExternalLink, X, CircleAlert, RotateCcw, Check, LogOut, Zap, Command as CommandIcon, ChevronRight, MonitorSmartphone, Sparkles} from 'lucide-react';
import {getSnapshot,saveSnapshot,clearSnapshot,getQueue,enqueue,removeQueued,clearQueue} from './offline.js';
import {Avatar,Badge,Button,IconButton,Modal,SearchInput,Toasts,Loading} from './components.jsx';
import {dateLong,orgPublicPath,orderState,fmt,uuid} from './utils.js';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Orders,{OrderDetail} from './pages/Orders.jsx';
import Production from './pages/Production.jsx';
import Payments from './pages/Payments.jsx';
import Stock from './pages/Stock.jsx';
import Team from './pages/Team.jsx';
import Showcase from './pages/Showcase.jsx';
import Stats from './pages/Stats.jsx';
import Settings from './pages/Settings.jsx';
import PublicSite from './pages/PublicSite.jsx';
import Auth from './pages/Auth.jsx';
import MerchantPortal,{ManualPaymentPage} from './pages/MerchantPortal.jsx';

const Context=createContext(null);
export const useApp=()=>useContext(Context);
export async function apiRequest(path,{method='GET',body,headers,...opts}={}){
 let response;
 try{response=await fetch(path,{method,credentials:'same-origin',headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),'X-Requested-With':'KouturePro',...headers},body:body instanceof FormData?body:body!==undefined?JSON.stringify(body):undefined,...opts});}
 catch(e){e.network=true;throw e;}
 const type=response.headers.get('content-type')||'';
 const result=type.includes('json')?await response.json():await response.text();
 if(!response.ok){const error=new Error(result?.error||'Impossible de terminer cette action.');error.status=response.status;error.current=result?.current;throw error;}
 return result;
}

const navGroups=[
 {label:'PRINCIPAL',items:[['/app','Tableau de bord',LayoutDashboard],['/app/clients','Clients',UsersRound],['/app/orders','Commandes',ShoppingBag],['/app/production','Production',Layers3]]},
 {label:'GESTION',items:[['/app/payments','Paiements & caisse',Wallet],['/app/stock','Stock & fournisseurs',Boxes],['/app/team','Équipe & succursales',UserRoundCheck]]},
 {label:'DÉVELOPPEMENT',items:[['/app/showcase','Vitrine (gestion)',Store],['/app/stats','Statistiques',ChartNoAxesCombined],['/app/settings','Paramètres',Settings2]]}
];
const pathname=route=>route.split('?')[0];
function useRoute(){const [route,setRoute]=useState(window.location.pathname+window.location.search);useEffect(()=>{const fn=()=>setRoute(location.pathname+location.search);window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);},[]);const navigate=useCallback((url,replace=false)=>{if(replace)history.replaceState({},'',url);else history.pushState({},'',url);setRoute(url);window.scrollTo({top:0,behavior:'instant'});},[]);return [route,navigate];}

export default function App(){
 const [route,navigate]=useRoute(),path=pathname(route);
 const [data,setData]=useState(null),[ready,setReady]=useState(false),[bootError,setBootError]=useState(''),[online,setOnline]=useState(navigator.onLine),[forcedOffline,setForcedOffline]=useState(localStorage.getItem('kp-offline-sim')==='yes');
 const [pending,setPending]=useState(0),[syncing,setSyncing]=useState(false),[conflict,setConflict]=useState(null),[branch,setBranch]=useState('all'),[quick,setQuick]=useState(false),[searchOpen,setSearchOpen]=useState(false),[alertsOpen,setAlertsOpen]=useState(false),[mobileMore,setMobileMore]=useState(false);
 const [toasts,setToasts]=useState([]);const syncRef=useRef(false);const activeOnline=online&&!forcedOffline;
 const notify=useCallback((message,type='success')=>{const id=uuid();setToasts(ts=>[...ts.slice(-3),{id,message,type}]);setTimeout(()=>setToasts(ts=>ts.filter(t=>t.id!==id)),4400);},[]);
 const refresh=useCallback(async()=>{const snapshot=await apiRequest('/api/bootstrap');const cached=await getSnapshot();if(cached?.user?.id&&cached.user.id!==snapshot.user.id){await clearQueue();setPending(0);}setData(snapshot);await saveSnapshot(snapshot);return snapshot;},[]);
 const boot=useCallback(async()=>{
  setReady(false);setBootError('');
  if(sessionStorage.getItem('kp-logged-out')==='yes'||localStorage.getItem('kp-logout-pending')==='yes'){
   setData(null);navigate('/auth',true);
   if(navigator.onLine&&localStorage.getItem('kp-logout-pending')==='yes')try{await apiRequest('/api/auth/logout',{method:'POST'});localStorage.removeItem('kp-logout-pending');}catch{}
   setReady(true);return;
  }
  const cached=await getSnapshot();
  if(!navigator.onLine||localStorage.getItem('kp-offline-sim')==='yes'){
   if(cached)setData(cached);else{setData(null);navigate('/auth',true);}setReady(true);return;
  }
  try{await refresh();}catch(e){
   if(e.status===401){setData(null);navigate('/auth',true);}
   else if(e.status===403){
    try{
     const me=await apiRequest('/api/auth/me');setData(null);
     if(!me.user.org_id)navigate('/onboarding',true);
     else setBootError(e.message);
    }catch(check){setData(null);if(check.status===401)navigate('/auth',true);else setBootError(check.message||e.message);}
   }else if(cached){setData(cached);notify('Impossible de joindre le serveur. Vos données locales restent disponibles.','error');}
   else{setData(null);setBootError(e.network?'Connexion au serveur impossible. Vérifiez Internet et réessayez.':e.message);}
  }finally{setReady(true);}
 },[navigate,notify,refresh]);
 useEffect(()=>{const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);getQueue().then(q=>setPending(q.length));return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);};},[]);
 const inApp=path==='/app'||path.startsWith('/app/');
 useEffect(()=>{if(!inApp)return;const onKey=e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSearchOpen(true);}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[inApp]);
 useEffect(()=>{if(inApp&&!data&&!ready)boot();else if(inApp&&!data&&ready)boot();else if(!inApp)setReady(true);},[inApp]); // Boot once on entrance; mutations refresh in place.
 useEffect(()=>{if(path==='/'&&ready)navigate('/auth',true);},[path,ready,navigate]);
 const mutate=useCallback(async(method,url,body={},optimistic,options={})=>{
  const queueable=options.queueable!==false;
  async function queue(){if(!queueable)throw new Error('Cette action nécessite une connexion internet.');
   await enqueue({id:uuid(),method,url,body,at:Date.now()});const q=await getQueue();setPending(q.length);
   if(optimistic)setData(old=>{const next=optimistic(old);saveSnapshot(next);return next;});notify('Enregistré sur cet appareil. Synchronisation à la reconnexion.');return {offline:true};}
  if(!navigator.onLine||localStorage.getItem('kp-offline-sim')==='yes')return queue();
  try{let result;
   if(method==='VOICE_MEASURE'){
    const form=new FormData();form.append('audio',body.audio,'note-vocale.webm');form.append('client_id',body.client_id);
    const upload=await apiRequest('/api/uploads/voice',{method:'POST',body:form});
    const {audio,...measure}=body;result=await apiRequest(measure.version?url:'/api/measurements',{method:measure.version?'PATCH':'POST',body:{...measure,voice_id:upload.voice_id}});
   }else result=await apiRequest(url,{method,body});
   await refresh();return result;
  }catch(e){if(e.network)return queue();throw e;}
 },[notify,refresh]);
 const syncQueue=useCallback(async()=>{
  if(syncRef.current||!navigator.onLine||localStorage.getItem('kp-offline-sim')==='yes')return;
  syncRef.current=true;setSyncing(true);let synced=0;
  try{const q=await getQueue();for(const entry of q){
   try{
    if(entry.method==='VOICE_MEASURE'){
     const form=new FormData();form.append('audio',entry.body.audio,'note-vocale.webm');form.append('client_id',entry.body.client_id);
     const upload=await apiRequest('/api/uploads/voice',{method:'POST',body:form});
     const {audio,...measure}=entry.body;await apiRequest(measure.version?entry.url:'/api/measurements',{method:measure.version?'PATCH':'POST',body:{...measure,voice_id:upload.voice_id}});
    }else await apiRequest(entry.url,{method:entry.method,body:entry.body});
    await removeQueued(entry.id);synced++;setPending(p=>Math.max(0,p-1));}
   catch(e){if(e.network)break;setConflict({entry,message:e.message,current:e.current||null});break;}
  }
  const remaining=await getQueue();setPending(remaining.length);if(!remaining.length){try{await refresh();}catch{}}if(synced)notify(`${synced} modification${synced>1?'s':''} synchronisée${synced>1?'s':''}.`);
  }finally{syncRef.current=false;setSyncing(false);}
 },[notify,refresh]);
 useEffect(()=>{if(activeOnline&&ready&&data&&pending>0&&!conflict)syncQueue();},[activeOnline,ready,Boolean(data),pending,conflict,syncQueue]);
 const retryConflict=async(overwrite=false)=>{if(!conflict)return;let next=conflict.entry;
  if(overwrite&&conflict.current?.version){next={...next,body:{...next.body,version:conflict.current.version}};await enqueue(next);}
  else await removeQueued(next.id);setConflict(null);setPending((await getQueue()).length);if(!overwrite)notify('Modification locale retirée.');else syncQueue();};
 const logout=async()=>{
  if(activeOnline){try{await apiRequest('/api/auth/logout',{method:'POST'});}catch{localStorage.setItem('kp-logout-pending','yes');}}
  else localStorage.setItem('kp-logout-pending','yes');
  sessionStorage.setItem('kp-logged-out','yes');await clearSnapshot();await clearQueue();setData(null);setPending(0);navigate('/auth');
 };
 const simulateOffline=(value)=>{localStorage.setItem('kp-offline-sim',value?'yes':'no');setForcedOffline(value);notify(value?'Mode hors ligne de test activé.':'Connexion rétablie.');};
 const values=useMemo(()=>({data,setData,ready,online:activeOnline,forcedOffline,simulateOffline,branch,setBranch,route,path,navigate,refresh,mutate,notify,pending,syncing,syncQueue,searchOpen,setSearchOpen,alertsOpen,setAlertsOpen,logout,quick,setQuick,mobileMore,setMobileMore,request:apiRequest}),[data,ready,activeOnline,forcedOffline,branch,route,navigate,refresh,mutate,notify,pending,syncing,syncQueue,searchOpen,alertsOpen,quick,mobileMore]);
 if(path==='/marchands'||path.startsWith('/marchands/'))return <MerchantPortal/>;
 if(/^\/pay\/[^/]+$/.test(path))return <ManualPaymentPage token={decodeURIComponent(path.split('/')[2])}/>;
 if(path!=='/'&&!inApp&&path!=='/auth'&&path!=='/onboarding')return <Context.Provider value={values}><PublicSite slug={path.split('/')[1]}/><Toasts toasts={toasts} remove={id=>setToasts(ts=>ts.filter(t=>t.id!==id))}/></Context.Provider>;
 if(path==='/auth'||path==='/onboarding')return <Context.Provider value={values}><Auth onboarding={path==='/onboarding'} onAuthenticated={async(result,mode)=>{
  try{sessionStorage.removeItem('kp-logged-out');localStorage.removeItem('kp-logout-pending');}catch{}
  const cached=await getSnapshot();
  if(cached?.user?.id&&cached.user.id!==result.user.id){
   await Promise.allSettled([clearSnapshot(),clearQueue()]);setPending(0);setData(null);
  }
  if(result.needs_onboarding){
   navigate('/onboarding',true);
   if(mode==='signup')notify('Compte créé ! Indiquez le nom et la ville de votre atelier pour ouvrir votre tableau de bord.');
  }else{await refresh();navigate('/app',true);}
 }}/><Toasts toasts={toasts} remove={id=>setToasts(ts=>ts.filter(t=>t.id!==id))}/></Context.Provider>;
 if(inApp&&ready&&!data&&bootError)return <div className="loading-state" role="alert" style={{padding:'32px',textAlign:'center',gap:'14px'}}><CircleAlert size={30}/><h1 style={{fontSize:'1.4rem'}}>Impossible d’ouvrir le tableau de bord</h1><p style={{maxWidth:440}}>{bootError}</p><div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center'}}><Button type="button" onClick={boot}>Réessayer</Button><Button type="button" variant="soft" onClick={()=>navigate('/auth',true)}>Se connecter</Button></div></div>;
 if(!ready||!data)return <Loading/>;
 const content=path==='/app'?<Dashboard/>:path==='/app/clients'?<Clients/>:path==='/app/orders'?<Orders/>:path.startsWith('/app/orders/')?<OrderDetail id={decodeURIComponent(path.split('/')[3])}/>:path==='/app/production'?<Production/>:path==='/app/payments'?<Payments/>:path==='/app/stock'?<Stock/>:path==='/app/team'?<Team/>:path==='/app/showcase'?<Showcase/>:path==='/app/stats'?<Stats/>:path==='/app/settings'?<Settings/>:<Dashboard/>;
 return <Context.Provider value={values}><div className="app-shell"><Sidebar/><div className="main-area"><Topbar/><main className="app-content">{content}</main></div><BottomNav/></div>
 <Toasts toasts={toasts} remove={id=>setToasts(ts=>ts.filter(t=>t.id!==id))}/>
 {quick&&<QuickModal onClose={()=>setQuick(false)}/>}{searchOpen&&<GlobalSearch onClose={()=>setSearchOpen(false)}/>}{alertsOpen&&<AlertPopover onClose={()=>setAlertsOpen(false)}/>}{mobileMore&&<MoreSheet onClose={()=>setMobileMore(false)}/>}
 {conflict&&<Modal title="Modification à vérifier" subtitle="Une autre personne a modifié cet élément pendant votre absence." onClose={()=>setConflict(null)}><div className="conflict-note"><CircleAlert size={20}/><div>{conflict.message}<p>Choisissez quelle version garder. Vos autres modifications restent enregistrées.</p></div></div><div className="form-actions"><Button variant="soft" onClick={()=>retryConflict(false)}>Garder la version en ligne</Button>{conflict.current&&<Button onClick={()=>retryConflict(true)}>Garder ma modification</Button>}</div></Modal>}
 </Context.Provider>;
}
function Sidebar(){const {data,path,navigate,branch,setBranch,setQuick,online,pending,logout}=useApp();const org=data.organization;return <aside className="sidebar"><div className="sidebar-top"><button className="brand" onClick={()=>navigate('/app')}><span className="brand-mark"><Scissors size={22} strokeWidth={2}/></span><span className="brand-type"><strong>Kouture<span>Pro</span></strong><small>ENTERPRISE</small></span></button>
 <div className="workspace-select"><span className="workspace-avatar">{org.logo_url?<img src={org.logo_url} alt="Logo de l’atelier"/>:org.name.slice(0,1)}</span><span><strong>{org.name}</strong><small>{org.city} · Plan {org.plan==='business'?'Business':org.plan==='pro'?'Pro':'Starter'}</small></span><ChevronDown size={15}/></div>
 <div className="nav-scroll">{navGroups.map(group=>{const visible=group.items.filter(([href])=>data.user.role!=='apprentice'||['/app','/app/orders','/app/production','/app/clients','/app/settings'].includes(href));return visible.length?<div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{visible.map(([href,label,Icon])=><button className={'nav-item '+(path===href||href!=='/app'&&path.startsWith(href+'/')?'active':'')} key={href} onClick={()=>navigate(href)}><Icon size={19} strokeWidth={1.85}/><span>{label}</span>{href==='/app/orders'&&data.orders.filter(o=>o.status==='active'&&o.due_date<new Date().toISOString().slice(0,10)).length>0&&<i className="nav-alert-dot"/>}</button>)}</div>:null})}</div></div>
 <div className="sidebar-bottom"><div className="sidebar-promo"><div className="promo-spark"><Sparkles size={17}/></div><strong>Votre vitrine est prête</strong><p>Partagez votre savoir-faire avec de nouveaux clients.</p><a href={orgPublicPath(data)} target="_blank" rel="noreferrer">Voir ma vitrine <ArrowUpRight size={14}/></a></div>
 <div className="sidebar-user"><Avatar name={data.user.name} size="sm"/><span><strong>{data.user.name}</strong><small>{data.user.role==='owner'?'Propriétaire':data.user.role==='tailor'?'Couturier':data.user.role==='accountant'?'Comptable':'Apprenti'}</small></span><button aria-label="Se déconnecter" title="Se déconnecter" onClick={logout}><LogOut size={17}/></button></div></div>
 </aside>}
function Topbar(){const {data,branch,setBranch,online,pending,syncing,syncQueue,setSearchOpen,setAlertsOpen,setQuick,navigate}=useApp();const today=new Date().toISOString().slice(0,10);const urgent=data.orders.filter(o=>o.status==='active'&&o.due_date<=today);const newAppointments=data.appointments.filter(a=>a.status==='new');return <header className="topbar"><div className="topbar-left"><span className="topbar-ham-logo"><Scissors size={20}/></span><span className="topbar-mobile-brand">Kouture<span>Pro</span></span><span className="topbar-date">{dateLong(today)}</span>{data.branches.length>1&&<select className="branch-select" aria-label="Choisir une boutique" value={branch} onChange={e=>setBranch(e.target.value)}><option value="all">Toutes les succursales</option>{data.branches.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select>}</div><div className="topbar-right"><button className="topbar-search" onClick={()=>setSearchOpen(true)}><Search size={17}/><span>Rechercher...</span><kbd>⌘ K</kbd></button><button className={'sync-indicator '+(!online?'offline':syncing?'syncing':'')} onClick={syncQueue} title="Synchroniser les données">{!online?<WifiOff size={15}/>:pending||syncing?<CloudUpload size={15}/>:<Wifi size={15}/>}<span>{!online?'Hors ligne':syncing?'Synchro...':pending?`${pending} en attente`:'Synchronisé'}</span></button><button className="topbar-bell" aria-label="Notifications" onClick={()=>setAlertsOpen(true)}><Bell size={19}/>{urgent.length+newAppointments.length>0&&<i/>}</button><span className="topbar-divider"/><Avatar name={data.user.name} size="sm"/>{data.user.role!=='apprentice'&&<Button icon={Plus} className="topbar-create" onClick={()=>setQuick(true)}>Créer</Button>}</div></header>}
function BottomNav(){const {data,path,navigate,setQuick,setMobileMore,mobileMore}=useApp();const items=[['/app','Accueil',LayoutDashboard],['/app/clients','Clients',UsersRound],data.user.role==='apprentice'?['/app/production','Tâches',Layers3]:['quick','Créer',Plus],['/app/orders','Commandes',ShoppingBag],['more','Plus',Menu]];return <nav className="bottom-nav" aria-label="Navigation mobile">{items.map(([href,label,Icon])=><button key={label} className={'bottom-item '+(href==='quick'?'bottom-create ':'')+(href===path||href==='more'&&mobileMore?'selected':'')} onClick={()=>href==='quick'?setQuick(true):href==='more'?setMobileMore(true):navigate(href)}><span className="bottom-icon"><Icon size={href==='quick'?24:21} strokeWidth={href==='quick'?2.5:2}/></span><span>{label}</span></button>)}</nav>}
function QuickModal({onClose}){const {data,navigate}=useApp();const actions=[['Nouvelle commande','Créez une pièce pour un client',ShoppingBag,'/app/orders?new=1'],['Nouveau client','Ajoutez une fiche et ses mesures',UsersRound,'/app/clients?new=1'],['Nouvelle dépense','Enregistrez une sortie de caisse',Wallet,'/app/payments?expense=1']].filter((_,index)=>data.user.role==='owner'||data.user.role==='tailor'&&index<2||data.user.role==='accountant'&&index!==0);return <Modal title="Créer rapidement" subtitle="Que souhaitez-vous ajouter à votre atelier ?" onClose={onClose}><div className="quick-options">{actions.map(([title,sub,Icon,url])=><button key={title} className="quick-option" onClick={()=>{onClose();navigate(url);}}><span><Icon size={21}/></span><div><strong>{title}</strong><small>{sub}</small></div><ChevronRight size={18}/></button>)}</div></Modal>}
function GlobalSearch({onClose}){const {data,navigate}=useApp();const [term,setTerm]=useState('');const q=term.toLowerCase();const clients=data.clients.filter(c=>c.name.toLowerCase().includes(q)||c.phone.includes(term)).slice(0,5);const orders=data.orders.filter(o=>o.model.toLowerCase().includes(q)||o.reference.toLowerCase().includes(q)||data.clients.find(c=>c.id===o.client_id)?.name.toLowerCase().includes(q)).slice(0,5);useEffect(()=>{document.querySelector('.global-search-input input')?.focus()},[]);return <Modal title="Recherche rapide" onClose={onClose}><SearchInput className="global-search-input" value={term} onChange={setTerm} placeholder="Client, téléphone, commande..."/>{term?<div className="search-results"><span className="mini-label">CLIENTS</span>{clients.map(c=><button key={c.id} onClick={()=>{navigate('/app/clients?client='+c.id);onClose()}}><Avatar name={c.name} size="sm"/><span>{c.name}<small>{c.phone}</small></span><ChevronRight size={16}/></button>)}<span className="mini-label">COMMANDES</span>{orders.map(o=><button key={o.id} onClick={()=>{navigate('/app/orders/'+o.id);onClose()}}><span className="search-result-icon"><ShoppingBag size={17}/></span><span>{o.model}<small>{o.reference} · {data.clients.find(c=>c.id===o.client_id)?.name}</small></span><ChevronRight size={16}/></button>)}{clients.length+orders.length===0&&<p className="search-empty">Aucun résultat trouvé.</p>}</div>:<div className="search-hint"><Search size={25}/><p>Trouvez une commande ou un client en quelques secondes.</p></div>}</Modal>}
function AlertPopover({onClose}){const {data,navigate}=useApp();const today=new Date().toISOString().slice(0,10);const orders=data.orders.filter(o=>o.status==='active'&&o.due_date<=today).sort((a,b)=>a.due_date.localeCompare(b.due_date)).slice(0,6);const appointments=data.appointments.filter(a=>a.status==='new').slice(0,4);return <Modal title="À ne pas manquer" subtitle="Votre atelier a besoin de votre attention" onClose={onClose}><div className="alert-list">{orders.map(o=><button className="alert-list-item" key={o.id} onClick={()=>{navigate('/app/orders/'+o.id);onClose()}}><span className="alert-list-symbol">{o.due_date<today?<CircleAlert size={19}/>:<CalendarDays size={19}/>}</span><span><strong>{o.due_date<today?'Commande en retard':'Livraison aujourd’hui'}</strong><small>{o.model} · {data.clients.find(c=>c.id===o.client_id)?.name}</small></span><ChevronRight size={16}/></button>)}{appointments.map(a=><button className="alert-list-item" key={a.id} onClick={()=>{navigate('/app/showcase');onClose()}}><span className="alert-list-symbol"><CalendarDays size={19}/></span><span><strong>Nouvelle demande de RDV</strong><small>{a.name} · {a.preferred_date}</small></span><ChevronRight size={16}/></button>)}{!orders.length&&!appointments.length&&<div className="search-hint"><Check size={24}/><p>Tout est à jour. Beau travail !</p></div>}</div></Modal>}
function MoreSheet({onClose}){const {navigate,data,logout}=useApp();const links=navGroups.flatMap(g=>g.items).filter(([url])=>!['/app','/app/orders','/app/clients'].includes(url)&&(data.user.role!=='apprentice'||['/app/production','/app/settings'].includes(url)));return <div className="mobile-sheet-backdrop" onClick={onClose}><div className="mobile-sheet" onClick={e=>e.stopPropagation()}><div className="mobile-sheet-handle"/><div className="mobile-sheet-title"><h3>Tout votre atelier</h3><IconButton icon={X} label="Fermer" onClick={onClose}/></div><div className="mobile-sheet-links">{links.map(([href,title,Icon])=><button key={href} onClick={()=>{onClose();navigate(href)}}><Icon size={20}/><span>{title}</span><ChevronRight size={16}/></button>)}<a href={orgPublicPath(data)} target="_blank" rel="noreferrer"><ExternalLink size={20}/><span>Voir ma vitrine</span><ChevronRight size={16}/></a><button onClick={()=>{onClose();logout();}}><LogOut size={20}/><span>Se déconnecter</span><ChevronRight size={16}/></button></div></div></div>}
