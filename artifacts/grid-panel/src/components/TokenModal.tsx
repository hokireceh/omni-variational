import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, X, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "/api";

export function TokenModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [vrToken, setVrToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vrToken.trim()) {
      toast({ title: "Kosong", description: "Masukkan VR_TOKEN terlebih dahulu.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/cookies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vrToken: vrToken.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Gagal update token");
      }
      // Simpan ke localStorage agar tersedia untuk future use
      localStorage.setItem("vr_token", vrToken.trim());
      toast({ title: "Token Diperbarui", description: "VR_TOKEN berhasil disimpan. Bot akan mencoba menempatkan order pada sesi berikutnya." });
      setVrToken("");
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
              style={{ pointerEvents: "auto", width: "100%", maxWidth: "32rem", background: "#0f1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "1rem", boxShadow: "0 25px 50px rgba(0,0,0,0.6)", maxHeight: "90vh", overflowY: "auto" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 1.5rem 1rem" }}>
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-bold">Update VR_TOKEN</h2>
                </div>
                <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div style={{ padding: "0 1.5rem 1.5rem" }} className="space-y-4">

                {/* Info box */}
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-2 text-sm text-blue-200/90">
                  <p className="font-semibold text-blue-300">Apa itu VR_TOKEN?</p>
                  <p className="text-xs leading-relaxed">
                    Ini adalah session token Variational yang digunakan bot untuk menempatkan order di mode Live.
                    Token berlaku sekitar <strong>7 hari</strong>. Data harga (bid/ask, OI) diambil langsung dari browser kamu, 
                    tidak memerlukan token ini.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      VR_TOKEN — Cara mendapatkan:
                    </label>
                    <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside mb-3 bg-white/3 rounded-lg p-3 border border-white/5">
                      <li>Buka <a href="https://omni.variational.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">omni.variational.io <ExternalLink className="w-3 h-3" /></a> dan login dengan wallet</li>
                      <li>Tekan <kbd className="bg-white/10 px-1 rounded text-xs">F12</kbd> → tab <strong>Application</strong></li>
                      <li>Klik <strong>Cookies</strong> → <code className="bg-black/30 px-1 rounded">https://omni.variational.io</code></li>
                      <li>Cari baris <code className="bg-black/30 px-1 rounded">vr-token</code> dan copy nilainya</li>
                    </ol>
                    <textarea
                      rows={3}
                      value={vrToken}
                      onChange={(e) => setVrToken(e.target.value)}
                      placeholder="Paste nilai vr-token dari browser DevTools..."
                      className={inputClass}
                    />
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
                      {isLoading ? "Menyimpan..." : "Simpan Token"}
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
        title="Update VR_TOKEN untuk mode Live"
      >
        <KeyRound className="w-4 h-4" />
        Token
      </button>
      {createPortal(modal, document.body)}
    </>
  );
}
