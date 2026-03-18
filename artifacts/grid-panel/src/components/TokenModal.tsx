import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, X, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "/api";

export function TokenModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [vrToken, setVrToken] = useState("");
  const [cfClearance, setCfClearance] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showCfGuide, setShowCfGuide] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vrToken.trim() && !cfClearance.trim()) {
      toast({ title: "Kosong", description: "Isi minimal salah satu field.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/cookies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(vrToken.trim() ? { vrToken: vrToken.trim() } : {}),
          ...(cfClearance.trim() ? { cfClearance: cfClearance.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Gagal update token");
      }
      toast({ title: "Token Diperbarui", description: "Bot akan mencoba sinkronisasi saldo pada poll berikutnya." });
      setVrToken("");
      setCfClearance("");
      setIsOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal update token";
      toast({ title: "Gagal", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    "w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 font-mono text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none";

  const modal = (
    <AnimatePresence>
      {isOpen && (
        <div key="token-modal-root">
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          />
          <div key="centering" style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", pointerEvents: "none" }}>
            <motion.div
              key="panel"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              style={{ pointerEvents: "auto", width: "100%", maxWidth: "34rem", background: "#0f1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1rem", boxShadow: "0 25px 50px rgba(0,0,0,0.6)", maxHeight: "90vh", overflowY: "auto" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 1.5rem 1rem" }}>
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-bold">Update Token</h2>
                </div>
                <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div style={{ padding: "0 1.5rem 1.5rem" }} className="space-y-4">

                {/* Penjelasan masalah */}
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-2 text-sm text-blue-200/90">
                  <p className="font-semibold text-blue-300">Kenapa saldo menampilkan "—"?</p>
                  <p>Cloudflare memproteksi <code className="bg-black/30 px-1 rounded text-xs">omni.variational.io</code>. Server kamu butuh <strong>dua cookie</strong> untuk akses:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li><code className="bg-black/30 px-1 rounded">vr-token</code> — session token Variational (expire ~7 hari)</li>
                    <li><code className="bg-black/30 px-1 rounded">cf_clearance</code> — Cloudflare clearance, <strong>terikat ke IP</strong>, expire ~1 hari</li>
                  </ul>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* VR_TOKEN */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      VR_TOKEN — Cara dapat:
                    </label>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside mb-2 bg-white/3 rounded-lg p-3 border border-white/5">
                      <li>Buka <a href="https://omni.variational.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">omni.variational.io <ExternalLink className="w-3 h-3" /></a> (sudah login)</li>
                      <li>Tekan <kbd className="bg-white/10 px-1 rounded text-xs">F12</kbd> → tab <strong>Application</strong></li>
                      <li>Cookies → <code className="bg-black/30 px-1 rounded">https://omni.variational.io</code></li>
                      <li>Copy nilai dari kolom <code className="bg-black/30 px-1 rounded">vr-token</code></li>
                    </ol>
                    <textarea
                      rows={2}
                      value={vrToken}
                      onChange={(e) => setVrToken(e.target.value)}
                      placeholder="Paste nilai vr-token dari browser..."
                      className={inputClass}
                    />
                  </div>

                  {/* CF_CLEARANCE — collapsible */}
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setShowCfGuide(!showCfGuide)}
                      className="flex items-center gap-2 text-xs font-semibold text-amber-400/80 hover:text-amber-400 uppercase tracking-wider transition-colors"
                    >
                      {showCfGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      CF_CLEARANCE (Opsional — untuk enable re-login dari server)
                    </button>

                    <AnimatePresence>
                      {showCfGuide && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-lg text-xs text-amber-200/80 space-y-2 mb-2">
                            <p className="font-semibold text-amber-300">⚠️ CF_CLEARANCE harus dari IP server (bukan browser)</p>
                            <p>Jalankan perintah ini <strong>di terminal server kamu</strong>:</p>
                            <pre className="bg-black/40 rounded p-2 text-green-300/80 font-mono overflow-x-auto text-xs whitespace-pre-wrap">
{`curl -si "https://omni.variational.io" \\
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \\
  -H "accept: text/html" \\
  --http2 --tlsv1.2 \\
  -L --cookie-jar /tmp/cf.txt 2>&1 | grep -i "set-cookie: cf_clearance"
cat /tmp/cf.txt`}
                            </pre>
                            <p>Atau gunakan browser headless (Puppeteer/Playwright) di server untuk solve Cloudflare challenge, lalu copy nilai <code className="bg-black/30 px-1 rounded">cf_clearance</code>.</p>
                          </div>
                          <textarea
                            rows={2}
                            value={cfClearance}
                            onChange={(e) => setCfClearance(e.target.value)}
                            placeholder="Paste nilai cf_clearance dari server (bukan browser)..."
                            className={inputClass}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="pt-1 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:shadow-none"
                    >
                      {isLoading ? "Mengupdate..." : "Update Token"}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 text-amber-400 rounded-lg text-sm font-medium transition-all"
        title="Update VR_TOKEN / CF_CLEARANCE"
      >
        <KeyRound className="w-4 h-4" />
        Token
      </button>
      {createPortal(modal, document.body)}
    </>
  );
}
