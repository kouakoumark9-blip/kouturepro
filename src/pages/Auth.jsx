import React,{useEffect,useState} from 'react';
import {Scissors,ArrowRight,Check,Sparkles,ShoppingBag,UsersRound,Building2,ShieldCheck,Camera,Eye,EyeOff} from 'lucide-react';
import {useApp} from '../App.jsx';
import {Button,Input} from '../components.jsx';

export default function Auth({onboarding,onAuthenticated}){
 const {navigate,request,refresh,notify}=useApp();
 const [mode,setMode]=useState('login');
 const [credentials,setCredentials]=useState({name:'',identifier:'',password:'',confirmation:''});
 const [showPassword,setShowPassword]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [step,setStep]=useState(1),[logoFile,setLogoFile]=useState(null),[logoPreview,setLogoPreview]=useState('');
 const [form,setForm]=useState({name:'',owner_name:'',city:'Abidjan',address:'',whatsapp_phone:'',specialties:[],plan:'starter'});
 useEffect(()=>()=>{if(logoPreview)URL.revokeObjectURL(logoPreview);},[logoPreview]);
 useEffect(()=>{
  if(!onboarding)return;
  request('/api/auth/me').then(r=>{
   if(!r.user.org_id)setForm(f=>({...f,owner_name:r.user.name,whatsapp_phone:r.user.phone||''}));
   else navigate('/app');
  }).catch(()=>navigate('/auth'));
 },[onboarding,request,navigate]);
 const change=e=>{setCredentials({...credentials,[e.target.name]:e.target.value});setError('');};
 const switchMode=next=>{setMode(next);setCredentials(c=>({...c,password:'',confirmation:''}));setError('');setShowPassword(false);};
 const submitAuth=async e=>{
  e.preventDefault();setError('');
  if(mode==='signup'&&credentials.password!==credentials.confirmation){setError('Les mots de passe ne correspondent pas.');return;}
  setBusy(true);
  try{
   // A previously requested offline logout must finish before issuing a new cookie.
   if(localStorage.getItem('kp-logout-pending')==='yes'){
    await request('/api/auth/logout',{method:'POST'});localStorage.removeItem('kp-logout-pending');
   }
   const result=await request(mode==='signup'?'/api/auth/signup':'/api/auth/login',{
    method:'POST',body:{identifier:credentials.identifier,password:credentials.password,...(mode==='signup'?{name:credentials.name}:{})}
   });
   await onAuthenticated(result,mode);
  }catch(e){setError(e.network?'Connexion Internet nécessaire pour accéder à votre compte.':e.message);}
  finally{setBusy(false);}
 };
 const finish=async e=>{
  e.preventDefault();
  if(step<4){
   if(step===1&&!form.name.trim())return notify('Donnez un nom à votre atelier.','error');
   if(step===2&&!form.city.trim())return notify('Indiquez votre ville.','error');
   setStep(step+1);return;
  }
  setBusy(true);
  try{
   await request('/api/onboarding',{method:'POST',body:form});
   if(logoFile){try{
    const fd=new FormData();fd.append('image',logoFile);
    const uploaded=await request('/api/uploads/image',{method:'POST',body:fd});
    await request('/api/organization',{method:'PATCH',body:{logo_url:uploaded.url}});
   }catch{notify('Atelier créé. Vous pourrez ajouter votre logo plus tard dans Ma vitrine.','error');}}
   await refresh();navigate('/app');notify('Bienvenue dans votre atelier KouturePro !');
  }catch(err){notify(err.message,'error');}finally{setBusy(false);}
 };
 const specs=['Tenues de cérémonie','Robes sur mesure','Boubous & ensembles','Mariages','Tenues traditionnelles','Retouches','Mode homme','Mode enfant'];
 return <div className="auth-layout">
  <div className="auth-visual"><img src="/assets/atelier-hero.jpg" alt="Atelier de couture en Afrique de l’Ouest"/><div className="auth-visual-shade"/>
   <div className="auth-brand"><span><Scissors size={22}/></span><strong>Kouture<span>Pro</span></strong><small>ENTERPRISE</small></div>
   <div className="auth-visual-content"><span className="auth-kicker"><Sparkles size={16}/> PENSÉ POUR LES ATELIERS D’ICI</span><h1>Tout votre atelier.<br/><em>À portée de main.</em></h1><p>Clients, mesures, commandes, paiements : retrouvez le plaisir de créer. On s’occupe du reste.</p>
    <div className="auth-perks"><span><Check size={16}/> Simple sur téléphone</span><span><Check size={16}/> Fonctionne hors ligne</span><span><Check size={16}/> Vitrine en ligne incluse</span></div>
   </div><div className="auth-visual-bottom">Conçu avec soin pour les créateurs d’Afrique de l’Ouest.</div>
  </div>
  <div className="auth-main"><div className="auth-mobile-brand"><span><Scissors size={20}/></span><strong>Kouture<span>Pro</span></strong></div>
   <div className="auth-form-shell">
    {!onboarding?<>
     <div className="auth-overline">{mode==='login'?'VOTRE ESPACE ATELIER':'INSCRIPTION · ÉTAPE 1 SUR 5'}</div>
     <h2>{mode==='login'?'Bon retour à l’atelier.':'Créons votre espace.'}</h2>
     <p className="auth-subtitle">{mode==='login'?'Entrez vos identifiants pour ouvrir directement votre tableau de bord.':'Créez vos accès, puis complétez les informations de votre atelier.'}</p>
     <div className="auth-tabs" role="tablist" aria-label="Accès à l’atelier">
      <button type="button" role="tab" aria-selected={mode==='login'} className={mode==='login'?'active':''} onClick={()=>switchMode('login')}>Connexion</button>
      <button type="button" role="tab" aria-selected={mode==='signup'} className={mode==='signup'?'active':''} onClick={()=>switchMode('signup')}>Inscription</button>
     </div>
     <form className="auth-form" onSubmit={submitAuth} autoComplete="on">
      {mode==='signup'&&<Input label="Votre nom" name="name" value={credentials.name} onChange={change} autoComplete="name" placeholder="Ex. Awa Koné" required/>}
      <Input label="E-mail ou numéro de téléphone" name="identifier" value={credentials.identifier} onChange={change} autoComplete="username" placeholder="nom@atelier.ci ou +225 07…" required/>
      <div className="auth-password-field"><Input label="Mot de passe" name="password" type={showPassword?'text':'password'} value={credentials.password} onChange={change} autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='signup'?10:undefined} maxLength={72} required hint={mode==='signup'?'10 caractères minimum':''}/>
       <button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Masquer le mot de passe':'Afficher le mot de passe'} title={showPassword?'Masquer le mot de passe':'Afficher le mot de passe'}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
      {mode==='signup'&&<Input label="Confirmer le mot de passe" name="confirmation" type={showPassword?'text':'password'} value={credentials.confirmation} onChange={change} autoComplete="new-password" minLength={10} maxLength={72} required/>}
      {error&&<div className="auth-error" role="alert">{error}</div>}
      <Button type="submit" loading={busy} className="auth-submit">{mode==='login'?'Se connecter':'Créer mon compte'} <ArrowRight size={17}/></Button>
     </form>
     <div className="auth-switch-line">{mode==='login'?<>Vous êtes nouveau ? <button type="button" onClick={()=>switchMode('signup')}>Créer un compte</button></>:<>Vous avez déjà un compte ? <button type="button" onClick={()=>switchMode('login')}>Se connecter</button></>}</div>
     <div className="auth-footnote"><ShieldCheck size={16}/> Vos données clients restent privées et protégées.</div>
    </>:<>
     <div className="onboarding-top"><div className="auth-overline">INSCRIPTION · VOTRE ATELIER</div><span>Étape {step+1} sur 5</span></div>
     <div className="onboarding-progress">{[1,2,3,4,5].map(i=><span key={i} className={i<=step+1?'active':''}/>)}</div>
     <h2>{['Comment s’appelle votre atelier ?','Où vous trouve-t-on ?','Que créez-vous ?','Un plan pour commencer.'][step-1]}</h2>
     <p className="auth-subtitle">{['Le début d’une belle histoire.','Aidez les clients près de chez vous à vous découvrir.','Choisissez ce qui vous ressemble le plus.','Vous pourrez changer de formule plus tard. Aucun paiement maintenant.'][step-1]}</p>
     <form onSubmit={finish} className="auth-form onboarding-form">
      {step===1&&<><Input label="Nom de votre atelier" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex. Atelier Koné" required autoFocus/><Input label="Votre nom" value={form.owner_name} onChange={e=>setForm({...form,owner_name:e.target.value})} placeholder="Ex. Awa Koné"/>
       <label className="onboarding-logo-picker"><span>{logoFile?<img src={logoPreview} alt="Aperçu du logo"/>:<Camera size={21}/>}</span><span><strong>{logoFile?'Logo choisi':'Ajouter un logo'}</strong><small>Facultatif · vous pourrez le changer plus tard</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0]||null;setLogoFile(file);setLogoPreview(file?URL.createObjectURL(file):'');}}/></label></>}
      {step===2&&<><Input label="Ville" value={form.city} onChange={e=>setForm({...form,city:e.target.value})} required/><Input label="Adresse / quartier" value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Ex. Cocody Deux Plateaux"/><Input label="WhatsApp professionnel" type="tel" value={form.whatsapp_phone} onChange={e=>setForm({...form,whatsapp_phone:e.target.value})} required placeholder="+225 ..."/></>}
      {step===3&&<div className="specialty-choices">{specs.map(s=><button key={s} type="button" className={form.specialties.includes(s)?'selected':''} onClick={()=>setForm({...form,specialties:form.specialties.includes(s)?form.specialties.filter(x=>x!==s):[...form.specialties,s]})}>{form.specialties.includes(s)&&<Check size={15}/>} {s}</button>)}</div>}
      {step===4&&<div className="plan-choices">{[['starter','Starter','Pour démarrer seul',ShoppingBag],['pro','Pro','Pour un atelier avec équipe',UsersRound],['business','Business','Pour plusieurs boutiques',Building2]].map(([id,label,desc,Icon])=><button key={id} type="button" className={form.plan===id?'selected':''} onClick={()=>setForm({...form,plan:id})}><span><Icon size={21}/></span><span><strong>{label}</strong><small>{desc}</small></span><i>{form.plan===id&&<Check size={16}/>}</i></button>)}</div>}
      <div className="onboarding-actions">{step>1&&<Button variant="soft" type="button" onClick={()=>setStep(step-1)}>Retour</Button>}<Button type="submit" loading={busy} className="auth-submit">{step===4?'Ouvrir mon tableau de bord':'Continuer'} <ArrowRight size={17}/></Button></div>
     </form>
    </>}
   </div><div className="auth-main-bottom">KouturePro Enterprise · Fait pour les mains qui créent.</div>
  </div>
 </div>;
}
