"use client";
import { useEffect, useState } from "react";
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export default function PwaRegister() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  }
  return (
    <>
      {!online && (
        <div className="networkStatus" role="status">
          Mode hors connexion · les visites seront synchronisées au retour du
          réseau
        </div>
      )}
      {prompt && (
        <button className="installCrm" onClick={install}>
          Installer le CRM
        </button>
      )}
      <style>
        {
          ".networkStatus{position:fixed;top:0;left:238px;right:0;z-index:100;padding:7px 12px;background:#9b5b14;color:#fff;text-align:center;font-size:10px}.installCrm{position:fixed;right:18px;bottom:18px;z-index:80;border:0;border-radius:12px;padding:11px 15px;background:#111827;color:#fff;box-shadow:0 10px 28px #11182745}@media(max-width:850px){.networkStatus{left:0}.installCrm{bottom:82px}}"
        }
      </style>
    </>
  );
}
