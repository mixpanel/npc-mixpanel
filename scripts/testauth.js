import {GoogleAuth} from 'google-auth-library';

const audience = '369001918367-t5qrahnqdaasaifvk6akpqkpjk9vli58.apps.googleusercontent.com'; // IAP client ID


const url = 'https://npc-mixpanel-1078767167468.us-central1.run.app/ping';                   // your Cloud Run URL

async function main() {
  // Point to your SA key file OR set GOOGLE_APPLICATION_CREDENTIALS
  const auth = new GoogleAuth({ keyFilename: './service-account.json' });

  // This client automatically obtains and attaches an ID token for the audience
  const client = await auth.getIdTokenClient(audience);

  const res = await client.request({ url, method: 'GET' });
  console.log('Status:', res.status);
  console.log('Body:', res.data);
}

main()
.then(() => {
  console.log('Request completed successfully.');
  process.exit(0);
})
.catch(err => {
  console.error('Request failed:', err.response?.status, err.response?.data || err);
  process.exit(1);
});
