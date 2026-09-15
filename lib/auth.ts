import 'server-only';import{createHmac,timingSafeEqual}from'node:crypto';import{cookies}from'next/headers';
export const SESSION_COOKIE='rapid_crm_session';const MAX_AGE=60*60*12;
export function authConfigured(){return Boolean(process.env.CRM_ACCESS_PASSWORD&&process.env.CRM_SESSION_SECRET&&process.env.CRM_SESSION_SECRET.length>=32)}
function sign(value:string){return createHmac('sha256',process.env.CRM_SESSION_SECRET!).update(value).digest('hex')}
export function passwordValid(value:string){const expected=process.env.CRM_ACCESS_PASSWORD;if(!expected)return false;const a=Buffer.from(value),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}
export function createSession(){const exp=Math.floor(Date.now()/1000)+MAX_AGE;const value=`${exp}.${sign(String(exp))}`;return{value,maxAge:MAX_AGE}}
export async function sessionValid(){if(!authConfigured())return false;const raw=(await cookies()).get(SESSION_COOKIE)?.value;if(!raw)return false;const[exp,sig]=raw.split('.');if(!exp||!sig||Number(exp)<Math.floor(Date.now()/1000))return false;const expected=sign(exp);const a=Buffer.from(sig),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}
