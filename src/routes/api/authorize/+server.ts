import { PUBLIC_SLACK_CLIENT_ID } from '$env/static/public';
import { redirect, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';

export const GET: RequestHandler = async ({ url }) => {
  // Server-side: pick ORIGIN env if set, otherwise derive from request and force https
  const redirectUriBase = process.env.ORIGIN || url.origin.replace('http://', 'https://');
  const redirectUri = `${redirectUriBase}/api/slack-callback`;

  const isDev = process.env.NODE_ENV === 'development';
  console.log('Development mode (forced):', isDev);

  if (isDev) {
    // Local development: Redirect directly to mock Slack callback
    throw redirect(302, '/api/slack-callback?mock_user=bort-the-fargler');
  }

  const clientId = encodeURIComponent(PUBLIC_SLACK_CLIENT_ID || '');
  const scope = 'openid profile email';
  const authorizeUrl = `https://slack.com/openid/connect/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(
    scope
  )}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  throw redirect(302, authorizeUrl);
};
