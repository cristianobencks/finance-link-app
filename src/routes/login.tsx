import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Wallet, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { startDemo, endDemo } from "@/lib/demo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Entrar — EvoluaX" },
      { name: "description", content: "Acesso privado à sua gestão financeira." },
      { property: "og:title", content: "Entrar — EvoluaX" },
      { property: "og:description", content: "Acesso privado à sua gestão financeira." },
    ],
  }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  function applyRemember() {
    if (remember) localStorage.removeItem("mcf-ephemeral");
    else { localStorage.setItem("mcf-ephemeral", "1"); sessionStorage.setItem("mcf-alive", "1"); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    endDemo();
    applyRemember();
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { toast.error("Não foi possível entrar", { description: error.message }); return; }
        nav({ to: "/dashboard" });
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) { toast.error("Não foi possível criar a conta", { description: error.message }); return; }
        if (data.session) nav({ to: "/dashboard" });
        else toast.success("Conta criada", { description: "Confirme o email que lhe enviámos e depois entre." });
      }
    } finally {
      setBusy(false);
    }
  }

  function demoLogin() { startDemo(); nav({ to: "/dashboard" }); }

  async function google() {
    endDemo();
    applyRemember();
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin, extraParams: { prompt: "select_account" } });
    if (r.error) { toast.error("Falha no início de sessão com Google"); return; }
    if (r.redirected) return;
    nav({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Wallet className="h-5 w-5" /></div>
          <div>
            <h1 className="text-lg font-semibold">EvoluaX</h1>
            <p className="text-xs text-muted-foreground">Acesso privado</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pw">Palavra-passe</Label><Input id="pw" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button className="w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{mode === "in" ? "Entrar" : "Criar conta"}</Button>
        </form>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Manter sessão iniciada
        </label>
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />ou<div className="h-px flex-1 bg-border" /></div>
        <Button variant="outline" className="w-full" onClick={google}>Continuar com Google</Button>
        <Button variant="ghost" className="mt-2 w-full" onClick={demoLogin}>Explorar demonstração (sem conta)</Button>
        <button className="mt-5 w-full text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Ainda não tem conta? Criar conta" : "Já tem conta? Entrar"}
        </button>
        <p className="mt-4 text-center text-xs text-muted-foreground">A primeira conta a entrar torna-se a proprietária. Outras contas não terão acesso.</p>
      </div>
    </div>
  );
}
