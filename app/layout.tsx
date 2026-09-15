import type { Metadata, Viewport } from 'next';
import {Manrope,Space_Grotesk} from 'next/font/google';
import './globals.css';import './premium-polish.css';import PwaRegister from './pwa-register';import AppShell from './AppShell';
const manrope=Manrope({subsets:['latin'],variable:'--font-body',display:'swap'});const display=Space_Grotesk({subsets:['latin'],variable:'--font-display',display:'swap'});
export const metadata:Metadata={title:'Rapid Pare-Brise CRM',description:'Pilotage commercial B2B Rapid Pare-Brise',applicationName:'Rapid PB CRM',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg',apple:'/icon.svg'},appleWebApp:{capable:true,title:'Rapid PB CRM',statusBarStyle:'black-translucent'}};export const viewport:Viewport={themeColor:'#07111f',width:'device-width',initialScale:1};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="fr" className={`${manrope.variable} ${display.variable}`}><body><PwaRegister/><AppShell>{children}</AppShell></body></html>}
