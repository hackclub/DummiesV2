import { PUBLIC_SLACK_CLIENT_ID } from '$env/static/public';
import { redirect, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
  // Server-side: pick ORIGIN env if set, otherwise derive from request and force https
  const redirectUriBase = process.env.ORIGIN || url.origin.replace('http://', 'https://');
  const redirectUri = `${redirectUriBase}/api/slack-callback`;



  // Only use the mock_user shortcut when the request is actually coming from localhost.
  // Using the `dev` flag can be unreliable in hosted environments where dev=true might still occur.
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    // when in local, redirect to mock user flow
    throw redirect(302, '/api/slack-callback?mock_user=bort-the-fargler');
  }

  const clientId = encodeURIComponent(PUBLIC_SLACK_CLIENT_ID || '');
  const scope = 'openid profile email';
  const authorizeUrl = `https://slack.com/openid/connect/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(
    scope
  )}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  throw redirect(302, authorizeUrl);
};
