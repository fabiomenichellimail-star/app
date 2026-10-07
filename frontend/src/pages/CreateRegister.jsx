import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ColumnsEditor } from "@/components/ColumnsEditor";
import { ArrowLeft, Save } from "lucide-react";

export default function CreateRegister() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [columns, setColumns] = useState([]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Inserisci il nome del registro");
      return;
    }
    const bad = columns.find((c) => !c.display_name.trim());
    if (bad) {
      toast.error("Ogni colonna deve avere un nome visualizzato");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/registers", {
        name: name.trim(),
        business_name: businessName.trim(),
        year: year ? parseInt(year, 10) : null,
        start_date: startDate || null,
        end_date: endDate || null,
        columns,
      });
      toast.success("Registro creato");
      navigate(`/register/${res.data.id}`);
    } catch (e) {
      toast.error("Errore nella creazione del registro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-28">
      <header className="sticky top-0 z-50 flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-xl">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} data-testid="back-btn">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-heading text-lg font-bold text-slate-900">Nuovo registro</h1>
      </header>

      <div className="space-y-5 px-5 py-6">
        <Card className="space-y-4 rounded-2xl border-slate-200 p-5 shadow-sm">
          <div>
            <Label className="text-xs font-semibold text-slate-600">Nome registro *</Label>
            <Input className="mt-1 h-12" placeholder="Registro Corrispettivi 2026"
              value={name} onChange={(e) => setName(e.target.value)} data-testid="register-name-input" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600">Nome attività / intestazione</Label>
            <Input className="mt-1 h-12" placeholder="Bar Centrale di Rossi Mario"
              value={businessName} onChange={(e) => setBusinessName(e.target.value)} data-testid="register-business-input" />
          </div>
          <div>
            <Label className="text-xs font-semibold text-slate-600">Anno</Label>
            <Input type="number" className="mt-1 h-12" value={year}
              onChange={(e) => setYear(e.target.value)} data-testid="register-year-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600">Data inizio</Label>
              <Input type="date" className="mt-1 h-12" value={startDate}
                onChange={(e) => setStartDate(e.target.value)} data-testid="register-start-input" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600">Data fine</Label>
              <Input type="date" className="mt-1 h-12" value={endDate}
                onChange={(e) => setEndDate(e.target.value)} data-testid="register-end-input" />
            </div>
          </div>
        </Card>

        <div>
          <h2 className="mb-3 font-heading text-xl font-bold text-slate-900">Colonne del registro</h2>
          <ColumnsEditor value={columns} onChange={setColumns} />
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 w-full max-w-lg -translate-x-1/2 border-t border-slate-200 bg-white/90 p-4 backdrop-blur-xl">
        <Button onClick={submit} disabled={saving}
          className="h-14 w-full rounded-xl bg-slate-900 text-base font-semibold hover:bg-slate-800 active:scale-[0.98]"
          data-testid="save-register-btn">
          <Save className="mr-2 h-5 w-5" /> {saving ? "Salvataggio…" : "Crea registro"}
        </Button>
      </div>
    </div>
  );
}
