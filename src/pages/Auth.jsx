import React,{useEffect,useState} from 'react';
import {Scissors,ArrowRight,Check,Sparkles,ShieldCheck,Eye,EyeOff} from 'lucide-react';
import {useApp} from '../App.jsx';
import {Button,Input} from '../components.jsx';

export default function Auth({onboarding,onAuthenticated}){
 const {navigate,request,refresh,notify}=useApp();
 const [mode,setMode]=useState('login');
 const [credentials,setCredentials]=useState({name:'',identifier:'',password:'',confirmation:''});
 const [showPassword,setShowPassword]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [form,setForm]=useState({name:'',city:'Abidjan',whatsapp_phone:''});
 useEffect(()=>{
  if(!onboarding)return;
  let active=true;
  request('/api/auth/me').then(r=>{
   if(!active)return;
   if(r.user.org_id){navigate('/app',true);return;}
   setForm(f=>({...f,whatsapp_phone:f.whatsapp_phone||r.user.phone||''}));
  }).catch(err=>{
   if(!active)return;
   if(err.status===401)navigate('/auth',true);
   else setError('Impossible de vérifier votre session. Vérifiez la connexion et réessayez.');
  });
  return()=>{active=false;};
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
   let result,authMode=mode;
   try{
    result=await request(mode==='signup'?'/api/auth/signup':'/api/auth/login',{
     method:'POST',body:{identifier:credentials.identifier,password:credentials.password,...(mode==='signup'?{name:credentials.name}:{})}
    });
   }catch(err){
    if(mode!=='signup'||err.status!==409)throw err;
    // Reprendre un compte déjà créé si la navigation vers l'étape suivante a échoué.
    try{result=await request('/api/auth/login',{method:'POST',body:{identifier:credentials.identifier,password:credentials.password}});authMode='login';}
    catch{throw new Error('Ce compte existe déjà. Ouvrez « Connexion » avec son mot de passe pour continuer.');}
   }
   if(result.needs_onboarding&&result.user?.phone)setForm(f=>({...f,whatsapp_phone:result.user.phone}));
   await onAuthenticated(result,authMode);
  }catch(e){setError(e.network?'Connexion Internet nécessaire pour accéder à votre compte.':e.message);}
  finally{setBusy(false);}
 };
 const finish=async e=>{
  e.preventDefault();setError('');
  if(!form.name.trim()||!form.city.trim()){setError('Indiquez le nom de votre atelier et sa ville.');return;}
  setBusy(true);
  try{
   try{await request('/api/onboarding',{method:'POST',body:form});}
   catch(err){
    if(err.status!==409)throw err;
    // Si l'atelier a été créé mais la page n'a pas changé, reprendre sans doublon.
    const me=await request('/api/auth/me');
    if(!me.user.org_id)throw err;
   }
   try{await refresh();}catch{notify('Atelier créé. Chargement de vos données en cours...','error');}
   navigate('/app',true);notify('Bienvenue dans votre atelier KouturePro !');
  }catch(err){setError(err.network?'Connexion Internet nécessaire pour créer votre atelier.':err.message);}
  finally{setBusy(false);}
 };
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
     <div className="auth-overline">{mode==='login'?'VOTRE ESPACE ATELIER':'INSCRIPTION · ÉTAPE 1 SUR 2'}</div>
     <h2>{mode==='login'?'Bon retour à l’atelier.':'Créons votre espace.'}</h2>
     <p className="auth-subtitle">{mode==='login'?'Entrez vos identifiants pour ouvrir directement votre tableau de bord.':'Créez votre compte. À l’étape suivante, indiquez le nom et la ville de votre atelier pour accéder au tableau de bord.'}</p>
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
     <div className="onboarding-top"><div className="auth-overline">INSCRIPTION · VOTRE ATELIER</div><span>Étape 2 sur 2</span></div>
     <div className="onboarding-progress"><span className="active"/><span className="active"/></div>
     <h2>Préparons votre atelier.</h2>
     <p className="auth-subtitle">Deux informations suffisent pour commencer. Vous ajouterez votre logo, vos spécialités et WhatsApp plus tard dans la vitrine.</p>
     <form onSubmit={finish} className="auth-form onboarding-form">
      <Input label="Nom de votre atelier" value={form.name} onChange={e=>{setForm({...form,name:e.target.value});setError('');}} placeholder="Ex. Atelier Koné" required autoFocus/>
      <Input label="Ville" value={form.city} onChange={e=>{setForm({...form,city:e.target.value});setError('');}} placeholder="Ex. Abidjan" required/>
      <Input label="WhatsApp professionnel (facultatif)" type="tel" value={form.whatsapp_phone} onChange={e=>{setForm({...form,whatsapp_phone:e.target.value});setError('');}} placeholder="+225 ..." hint="Vous pourrez l’ajouter ou le modifier dans Vitrine (gestion)."/>
      {error&&<div className="auth-error" role="alert">{error}</div>}
      <div className="onboarding-actions"><Button type="submit" loading={busy} className="auth-submit">Ouvrir mon tableau de bord <ArrowRight size={17}/></Button></div>
     </form>
    </>}
   </div><div className="auth-main-bottom">KouturePro Enterprise · Fait pour les mains qui créent.</div>
  </div>
 </div>;
}
