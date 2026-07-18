import { mkdir, readFile, writeFile } from 'node:fs/promises';

const env = {};
try {
  for (const line of (await readFile('../mobile/.env.local', 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
} catch { /* CI fournit les valeurs publiques par variables d’environnement. */ }
const supabaseUrl = process.env.VITE_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '';
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const config = JSON.stringify({ supabaseUrl, publishableKey }).replace(/</g, '\\u003c');

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WérPass — portail professionnel</title><style>
body{margin:0;background:#f2f7f5;color:#15332e;font:16px system-ui,sans-serif}.wrap{max-width:720px;margin:40px auto;padding:20px}.card{background:#fff;border-radius:18px;padding:24px;box-shadow:0 8px 30px #075b4c18}.brand{color:#075b4c;font-size:32px;font-weight:800}.prototype{color:#8b4513;font-weight:700}.grid{display:grid;gap:14px}label{font-weight:700}input,button{font:inherit;padding:12px;border-radius:10px}input{border:1px solid #9ab7b0}button{border:0;background:#075b4c;color:#fff;font-weight:700;cursor:pointer}button:disabled{opacity:.5}.notice{padding:12px;border-radius:10px;background:#dff3ec}.error{background:#ffe3e3;color:#8e1d1d}.envelope{overflow-wrap:anywhere;background:#edf2f0;padding:14px;border-radius:10px}small{color:#526762}
</style></head><body><main class="wrap"><section class="card grid"><div class="brand">WérPass</div><div class="prototype">Prototype professionnel — données synthétiques</div>
<p>Ce portail valide une autorisation temporaire et reçoit uniquement un paquet déjà chiffré. Il ne prétend pas déchiffrer le document dans ce prototype.</p>
<label>Identifiant QR opaque<input id="token" autocomplete="off" placeholder="xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx"></label>
<label>Code médical<input id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 chiffres"></label>
<button id="access">Accéder au paquet autorisé</button><div id="status" role="status"></div><div id="result"></div>
<small>L’OTP patient et le PIN local ne doivent jamais être saisis ici. Le code est temporaire, limité en tentatives et à usage unique.</small>
</section></main><script>const config=${config};const token=document.querySelector('#token'),code=document.querySelector('#code'),button=document.querySelector('#access'),status=document.querySelector('#status'),result=document.querySelector('#result');
button.onclick=async()=>{status.className='notice';status.textContent='Vérification…';result.textContent='';button.disabled=true;try{if(!config.supabaseUrl||!config.publishableKey)throw new Error('Portail non configuré');const response=await fetch(config.supabaseUrl.replace(/\\/$/,'')+'/functions/v1/share-demo',{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({action:'access',opaqueToken:token.value.trim(),code:code.value.trim()})});if(!response.ok)throw new Error('Accès refusé, expiré, consommé ou révoqué.');const body=await response.json();status.textContent='Accès autorisé une seule fois.';const envelope=body.encryptedEnvelope||{};result.innerHTML='<div class="envelope"><strong>Paquet chiffré autorisé</strong><p>Document : '+String(envelope.document_id||'')+'</p><p>Version : '+String(envelope.version||'')+'</p><p>Type : '+String(envelope.mime_type||'')+'</p><p>Taille claire déclarée : '+String(envelope.size_bytes||'')+' octets</p><p>Empreinte ciphertext : '+String(envelope.ciphertext_hash||'')+'</p><small>Le contenu et les métadonnées sensibles restent chiffrés.</small></div>';}catch(error){status.className='notice error';status.textContent=error instanceof Error?error.message:'Accès refusé.';}finally{button.disabled=false;code.value='';}};</script></body></html>`;

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
console.log('clinician portal built');
