import 'server-only';

// NOTE: Edge middleware must NOT import this barrel — it pulls in
// `password.ts` (`node:crypto`, Node-only). Middleware imports
// `./session` and `./cookie` directly instead. This barrel is for
// Node-runtime consumers only (route handlers, server components).
export { issueSession, verifySession } from './session';
export { verifyPassword } from './password';
export {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_COOKIE_OPTIONS,
  setSessionCookieHeader,
  clearSessionCookieHeader,
} from './cookie';
