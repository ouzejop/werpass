const url = 'https://rvpsnmegvjjopujgntqj.supabase.co';
const key = 'sb_publishable_kMo78Sl-m5d-Of82Uw1dYA_SbZnt_2a';

async function checkSessions() {
  console.log('Checking active share_sessions in Supabase...');
  const res = await fetch(`${url}/rest/v1/share_sessions?select=id,opaque_token,state,expires_at,created_at&order=created_at.desc&limit=5`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Active Sessions:', JSON.stringify(data, null, 2));
}

checkSessions().catch(console.error);
