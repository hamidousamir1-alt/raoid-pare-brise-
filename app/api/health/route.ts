import {NextResponse} from 'next/server';
import {databaseConfigured,db} from '../../../lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){if(!databaseConfigured())return NextResponse.json({ok:true,persistence:'local-demo',database:false,message:'Base PostgreSQL non configurée : le CRM reste en mode local de démonstration.'},{headers:{'Cache-Control':'no-store'}});try{await db()`select 1`;return NextResponse.json({ok:true,persistence:'postgresql',database:true,message:'Persistance serveur active.'},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({ok:false,persistence:'unavailable',database:true,message:'La base est configurée mais indisponible.'},{status:503,headers:{'Cache-Control':'no-store'}})}}