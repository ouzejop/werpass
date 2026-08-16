const url = 'https://rvpsnmegvjjopujgntqj.supabase.co';
const key = 'sb_publishable_kMo78Sl-m5d-Of82Uw1dYA_SbZnt_2a';

async function createTestSession() {
  const phone = '+221771234567';
  const testOtp = '123456';
  console.log('1. Signup/Request OTP for phone:', phone);

  await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });

  console.log('2. Verifying OTP (test token 123456)...');
  const verifyRes = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, token: testOtp, type: 'sms' }),
  });
  const verifyData = await verifyRes.json();

  const token = verifyData.access_token;
  const userId = verifyData.user?.id;

  if (!token || !userId) {
    console.error('Verify failed:', verifyData);
    return;
  }

  console.log(' Authenticated User ID:', userId);

  const authHeaders = {
    apikey: key,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };

  // 2. Create Profile
  console.log('3. Creating profile...');
  await fetch(`${url}/rest/v1/profiles`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ id: userId, role: 'patient', demo_label: 'Patient Test' }),
  });

  // 3. Create Document
  const docId = crypto.randomUUID();
  console.log('4. Creating document ID:', docId);
  await fetch(`${url}/rest/v1/documents`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ id: docId, patient_id: userId }),
  });

  // 4. Create Document Version
  console.log('5. Creating document version...');
  const fakeHash = 'a'.repeat(64);
  await fetch(`${url}/rest/v1/document_versions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      document_id: docId,
      version: 1,
      patient_id: userId,
      ciphertext: 'F'.repeat(64),
      ciphertext_hash: fakeHash,
      wrapped_file_key: 'K'.repeat(32),
      encrypted_metadata: 'M'.repeat(32),
      mime_type: 'application/pdf',
      size_bytes: 1024,
      created_at: new Date().toISOString(),
    }),
  });

  // 5. Create Share Session via share-demo edge function!
  console.log('6. Calling share-demo action: create...');
  const shareRes = await fetch(`${url}/functions/v1/share-demo`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'create',
      documentId: docId,
    }),
  });

  const shareData = await shareRes.json();
  console.log('share-demo response:', JSON.stringify(shareData, null, 2));

  if (shareData.opaqueToken) {
    console.log('\n SUCCESS! Copy this active Opaque Token to test in your browser:');
    console.log('👉', shareData.opaqueToken);
  }
}

createTestSession().catch(console.error);
