import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilePlus2, FolderOpen, ChevronRight, BookOpen } from "lucide-react";

export default function Home() {
  const navigate = useNavigate();
  const [registers, setRegisters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/registers")
      .then((r) => setRegisters(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto min-h-screen max-w-lg px-5 pb-16 pt-10">
      <div className="mb-10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
          <BookOpen className="h-3.5 w-3.5" /> REGISTRO CORRISPETTIVI
        </div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900">
          I tuoi registri
        </h1>
        <p className="mt-2 text-base text-slate-500">
          Fotografa azzeramento e reparti, l'app compila e quadra la giornata.
        </p>
      </div>

      <div className="space-y-3">
        <Button
          onClick={() => navigate("/new")}
          data-testid="create-register-btn"
          className="flex h-16 w-full items-center justify-between rounded-2xl bg-slate-900 px-5 text-left text-base font-semibold text-white transition-transform duration-200 hover:bg-slate-800 active:scale-[0.98]"
        >
          <span className="flex items-center gap-3">
            <FilePlus2 className="h-5 w-5" /> Crea nuovo registro
          </span>
          <ChevronRight className="h-5 w-5 opacity-70" />
        </Button>

        <Button
          variant="outline"
          onClick={() => {
            const el = document.getElementById("registers-list");
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}
          data-testid="open-register-btn"
          className="flex h-16 w-full items-center justify-between rounded-2xl border-slate-300 px-5 text-left text-base font-semibold text-slate-900 transition-transform duration-200 hover:bg-slate-100 active:scale-[0.98]"
        >
          <span className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5" /> Apri registro esistente
          </span>
          <ChevronRight className="h-5 w-5 opacity-70" />
        </Button>
      </div>

      <div id="registers-list" className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.05em] text-slate-500">
          Registri salvati
        </h2>
        {loading ? (
          <p className="text-sm text-slate-400">Caricamento…</p>
        ) : registers.length === 0 ? (
          <Card className="rounded-2xl border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            Nessun registro. Creane uno per iniziare.
          </Card>
        ) : (
          <div className="space-y-2">
            {registers.map((r) => (
              <Card
                key={r.id}
                onClick={() => navigate(`/register/${r.id}`)}
                data-testid={`register-item-${r.id}`}
                className="flex cursor-pointer items-center justify-between rounded-2xl border-slate-200 p-4 shadow-sm transition-transform duration-200 hover:shadow-md active:scale-[0.99]"
              >
                <div>
                  <div className="font-semibold text-slate-900">{r.name}</div>
                  <div className="text-sm text-slate-500">
                    {r.business_name ? `${r.business_name} · ` : ""}
                    {r.year || ""} · {r.entries_count} giornate
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
