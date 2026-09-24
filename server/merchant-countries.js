// Initial reference data only. All operational reads use the database tables;
// editing a country/provider there does not require a frontend redeployment.
const countries=[
 ['CI','Côte d’Ivoire','Ivory Coast','🇨🇮','+225','XOF',0],
 ['SN','Sénégal','Senegal','🇸🇳','+221','XOF',0],
 ['ML','Mali','Mali','🇲🇱','+223','XOF',0],
 ['BF','Burkina Faso','Burkina Faso','🇧🇫','+226','XOF',0],
 ['BJ','Bénin','Benin','🇧🇯','+229','XOF',0],
 ['TG','Togo','Togo','🇹🇬','+228','XOF',0],
 ['NE','Niger','Niger','🇳🇪','+227','XOF',0],
 ['GW','Guinée-Bissau','Guinea-Bissau','🇬🇼','+245','XOF',0],
 ['GH','Ghana','Ghana','🇬🇭','+233','GHS',2],
 ['NG','Nigeria','Nigeria','🇳🇬','+234','NGN',2],
 ['GN','Guinée','Guinea','🇬🇳','+224','GNF',0],
 ['LR','Liberia','Liberia','🇱🇷','+231','LRD',2],
 ['SL','Sierra Leone','Sierra Leone','🇸🇱','+232','SLE',2],
 ['GM','Gambie','Gambia','🇬🇲','+220','GMD',2],
 ['CV','Cap-Vert','Cape Verde','🇨🇻','+238','CVE',2],
 ['MR','Mauritanie','Mauritania','🇲🇷','+222','MRU',2]
];
const operators=[
 ['orange_money','Orange Money','mobile_money'],
 ['moov_money','Moov Money','mobile_money'],
 ['mtn_momo','MTN MoMo','mobile_money'],
 ['wave','Wave','mobile_money'],
 ['telecel_cash','Telecel Cash','mobile_money'],
 ['airteltigo_money','AirtelTigo Money','mobile_money'],
 ['opay','OPay','mobile_money'],
 ['palmpay','PalmPay','mobile_money'],
 ['bank_transfer','Virement bancaire','bank_transfer']
];
const suggested=[
 ['CI','orange_money'],['CI','moov_money'],['CI','mtn_momo'],['CI','wave'],
 ['SN','orange_money'],['SN','wave'],['ML','orange_money'],['ML','moov_money'],
 ['BF','orange_money'],['BF','moov_money'],['BF','telecel_cash'],
 ['BJ','moov_money'],['BJ','mtn_momo'],['TG','moov_money'],
 ['GW','orange_money'],['GH','mtn_momo'],['GH','telecel_cash'],['GH','airteltigo_money'],
 ['NG','opay'],['NG','palmpay'],['GN','orange_money'],
 ['LR','orange_money'],['SL','orange_money'],['GM','wave']
];
export function seedCountryConfiguration(db){
 const run=db.transaction(()=>{
  for(const row of countries)db.prepare('INSERT OR IGNORE INTO mp_countries(code,name_fr,name_en,flag,dial_code,currency,decimals) VALUES (?,?,?,?,?,?,?)').run(...row);
  for(const row of operators)db.prepare('INSERT OR IGNORE INTO mp_operators(code,name,kind) VALUES (?,?,?)').run(...row);
  for(const [code] of countries)db.prepare('INSERT OR IGNORE INTO mp_country_operators(country_code,operator_code) VALUES (?,?)').run(code,'bank_transfer');
  for(const row of suggested)db.prepare('INSERT OR IGNORE INTO mp_country_operators(country_code,operator_code) VALUES (?,?)').run(...row);
 });run();
}
export function publicCountryConfiguration(db){
 const rows=db.prepare('SELECT code,name_fr,name_en,flag,dial_code,currency,decimals FROM mp_countries WHERE active=1 ORDER BY name_fr').all();
 const providers=db.prepare('SELECT co.country_code,o.code,o.name,o.kind FROM mp_country_operators co JOIN mp_operators o ON co.operator_code=o.code ORDER BY o.name').all();
 return rows.map(country=>({...country,operators:providers.filter(provider=>provider.country_code===country.code).map(({code,name,kind})=>({code,name,kind}))}));
}
