import type { Metadata, Viewport } from 'next';
import {Geist,Geist_Mono} from 'next/font/google';
import './globals.css';import PwaRegister from './pwa-register';import AppShell from './AppShell';
const geist=Geist({subsets:['latin'],variable:'--font-geist',display:'swap'});const mono=Geist_Mono({subsets:['latin'],variable:'--font-geist-mono',display:'swap'});
export const metadata:Metadata={title:'Rapid Pare-Brise CRM',description:'Pilotage commercial B2B Rapid Pare-Brise',applicationName:'Rapid PB CRM',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg',apple:'/icon.svg'},appleWebApp:{capable:true,title:'Rapid PB CRM',statusBarStyle:'black-translucent'}};export const viewport:Viewport={themeColor:'#07111f',width:'device-width',initialScale:1};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="fr" className={`${geist.variable} ${mono.variable}`}><body><PwaRegister/><AppShell>{children}</AppShell></body></html>}
