export const fmt=(n)=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(Number(n)||0);
export const money=(n)=>fmt(n)+' FCFA';
export const shortMoney=(n)=>{n=Number(n)||0;return n>=1e6?`${(n/1e6).toFixed(1).replace('.',',')} M`:n>=1e3?`${Math.round(n/1e3)} k`:fmt(n)};
export const today=()=>new Date().toISOString().slice(0,10);
// Use day 1 to avoid 31 March rolling forward when subtracting a month.
export const previousMonth=(date=today())=>{
 const [year,month]=date.slice(0,7).split('-').map(Number);
 return new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,7);
};
export const dateFR=(value,options={day:'numeric',month:'short',year:'numeric'})=>{if(!value)return '—';const d=new Date(value.length===10?value+'T12:00:00Z':value);return Number.isNaN(+d)?value:new Intl.DateTimeFormat('fr-FR',{...options,timeZone:'UTC'}).format(d);};
export const dateLong=(value)=>dateFR(value,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
export const stages=['Mesures','Découpe','Assemblage','Essayage','Finition'];
export const stageColors=['#9a7a44','#8185b6','#7597b4','#b88569','#3d9a72'];
export const initials=(name)=>String(name||'').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'KP';
export const orderBalance=(order,payments=[])=>Math.max(0,Number(order?.price||0)-payments.filter(p=>p.order_id===order?.id&&p.status==='paid').reduce((sum,p)=>sum+Number(p.amount),0));
export const orderState=(order)=>{if(order.status==='delivered')return 'Livrée';if(order.status==='cancelled')return 'Annulée';if(order.due_date<today())return 'En retard';if(order.due_date===today())return "Aujourd’hui";if(order.stage===4)return 'Prête';return 'En cours';};
export const stateTone=(state)=>({'Livrée':'green','Annulée':'gray','En retard':'red','Aujourd’hui':'amber','Prête':'mint','En cours':'blue'}[state]||'gray');
export const phoneLink=(phone)=>String(phone||'').replace(/[^0-9]/g,'');
export const waLink=(phone,message='Bonjour !')=>`https://wa.me/${phoneLink(phone)}?text=${encodeURIComponent(message)}`;
export const uuid=()=>crypto.randomUUID();
export const relTime=(value)=>{if(!value)return '';const days=Math.round((Date.now()-new Date(value).getTime())/864e5);return days<1?"Aujourd’hui":days===1?'Hier':`Il y a ${days} j`};
export const orgPublicPath=(data)=>'/'+(data?.organization?.slug||'atelier-kone');
