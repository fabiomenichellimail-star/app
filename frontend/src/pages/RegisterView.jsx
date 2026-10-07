import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { formatCents, formatEuro, formatDateIT, MONTHS_IT } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/StatusBadge";
import { ColumnsEditor } from "@/components/ColumnsEditor";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Plus, FileSpreadsheet, FileText, Printer, MoreVertical,
  Settings2, Copy, Trash2, Pencil,
} from "lucide-react";

async function syncColumns(registerId, edited) {
  for (const col of edited) {
    if (col.id) {
      await api.put(`/columns/${col.id}`, {
        display_name: col.display_name, ocr_label: col.ocr_label,
        aliases: col.aliases, include_in_reconciliation: col.include_in_reconciliation,
        active: col.active,
      });
    } else {
      const res = await api.post(`/registers/${registerId}/columns`, col);
      col.id = res.data.id;
    }
  }
  await api.put(`/registers/${registerId}/columns/reorder`, {
    column_ids: edited.map((c) => c.id),
  });
}

export default function RegisterView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [register, setRegister] = useState(null);
  const [columns, setColumns] = useState([]);
  const [entries, setEntries] = useState([]);
  const [selMonth, setSelMonth] = useState(null); // 1..12 or 0 = all
  const [year, setYear] = useState(null);

  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgCols, setCfgCols] = useState([]);
  const [cfgOriginalIds, setCfgOriginalIds] = useState([]);
  const [cfgSaving, setCfgSaving] = useState(false);

  const [dupOpen, setDupOpen] = useState(false);
  const [dupName, setDupName] = useState("");
  const [dupYear, setDupYear] = useState("");

  const [delRegOpen, setDelRegOpen] = useState(false);
  const [delEntry, setDelEntry] = useState(null);

  const load = async () => {
    const r = await api.get(`/registers/${id}`);
    setRegister(r.data);
    setColumns(r.data.columns || []);
    const yr = r.data.year || new Date().getFullYear();
    setYear(yr);
    const e = await api.get(`/registers/${id}/entries`);
    setEntries(e.data);
    if (selMonth === null) {
      const last = e.data[e.data.length - 1];
      setSelMonth(last ? parseInt(last.business_date.slice(5, 7), 10) : new Date().getMonth() + 1);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const activeCols = columns.filter((c) => c.active);

  const monthKey = selMonth && selMonth > 0
    ? `${year}-${String(selMonth).padStart(2, "0")}`
    : null;

  const visibleEntries = useMemo(() => {
    if (!monthKey) return entries;
    return entries.filter((e) => (e.business_date || "").startsWith(monthKey));
  }, [entries, monthKey]);

  const totals = useMemo(() => {
    const t = { total: 0 };
    activeCols.forEach((c) => { t[c.id] = 0; });
    visibleEntries.forEach((e) => {
      t.total += e.total_receipts_cents || 0;
      activeCols.forEach((c) => { t[c.id] += (e.values || {})[c.id] || 0; });
    });
    return t;
  }, [visibleEntries, activeCols]);

  const exportUrl = (kind) =>
    `${API}/registers/${id}/export/${kind}` + (monthKey ? `?month=${monthKey}` : "");

  const openConfig = () => {
    setCfgCols(columns.map((c) => ({ ...c, aliases: [...(c.aliases || [])] })));
    setCfgOriginalIds(columns.map((c) => c.id));
    setCfgOpen(true);
  };

  const saveConfig = async () => {
    const bad = cfgCols.find((c) => !c.display_name.trim());
    if (bad) { toast.error("Ogni colonna deve avere un nome"); return; }
    setCfgSaving(true);
    try {
      const editedIds = cfgCols.filter((c) => c.id).map((c) => c.id);
      const removed = cfgOriginalIds.filter((oid) => !editedIds.includes(oid));
      for (const rid of removed) await api.delete(`/columns/${rid}`);
      await syncColumns(id, cfgCols);
      toast.success("Colonne aggiornate");
      setCfgOpen(false);
      await load();
    } catch (e) {
      toast.error("Errore salvataggio colonne");
    } finally {
      setCfgSaving(false);
    }
  };

  const doDuplicate = async () => {
    try {
      const res = await api.post(`/registers/${id}/duplicate`, {
        name: dupName || `${register.name} (copia)`,
        year: dupYear ? parseInt(dupYear, 10) : null,
      });
      toast.success("Registro duplicato");
      setDupOpen(false);
      navigate(`/register/${res.data.id}`);
    } catch (e) {
      toast.error("Errore duplicazione");
    }
  };

  const deleteRegister = async () => {
    await api.delete(`/registers/${id}`);
    toast.success("Registro eliminato");
    navigate("/");
  };

  const deleteEntry = async () => {
    await api.delete(`/entries/${delEntry.id}`);
    setDelEntry(null);
    toast.success("Giornata eliminata");
    await load();
  };

  if (!register) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Caricamento…</div>;
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl pb-28">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-xl">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="back-btn">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-lg font-bold leading-tight text-slate-900">{register.name}</h1>
          <p className="truncate text-xs text-slate-500">
            {register.business_name ? `${register.business_name} · ` : ""}{year}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="register-menu-btn">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl">
            <DropdownMenuItem onClick={openConfig} data-testid="menu-config-columns">
              <Settings2 className="mr-2 h-4 w-4" /> Configura colonne
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setDupName(`${register.name} (copia)`); setDupYear(""); setDupOpen(true); }}
              data-testid="menu-duplicate">
              <Copy className="mr-2 h-4 w-4" /> Duplica registro
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDelRegOpen(true)} className="text-red-600"
              data-testid="menu-delete-register">
              <Trash2 className="mr-2 h-4 w-4" /> Elimina registro
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="px-4 py-4">
        <Button onClick={() => navigate(`/register/${id}/new`)}
          className="mb-4 flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 text-base font-semibold text-white hover:bg-slate-800 active:scale-[0.98]"
          data-testid="new-day-btn">
          <Plus className="h-5 w-5" /> Nuova giornata · leggi documenti
        </Button>

        {/* month tabs */}
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
          <MonthTab label="Anno" active={selMonth === 0} onClick={() => setSelMonth(0)} testid="month-tab-all" />
          {MONTHS_IT.map((m, i) => (
            <MonthTab key={i} label={m.slice(0, 3)} active={selMonth === i + 1}
              onClick={() => setSelMonth(i + 1)} testid={`month-tab-${i + 1}`} />
          ))}
        </div>

        {/* export actions */}
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="outline" className="h-11 rounded-xl border-slate-300"
            onClick={() => window.open(exportUrl("pdf"), "_blank")} data-testid="export-pdf-btn">
            <FileText className="mr-2 h-4 w-4" /> Esporta PDF
          </Button>
          <Button variant="outline" className="h-11 rounded-xl border-slate-300"
            onClick={() => window.open(exportUrl("excel"), "_blank")} data-testid="export-excel-btn">
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Esporta Excel
          </Button>
          <Button variant="outline" className="h-11 rounded-xl border-slate-300"
            onClick={() => window.open(exportUrl("pdf"), "_blank")} data-testid="print-btn">
            <Printer className="mr-2 h-4 w-4" /> Stampa
          </Button>
        </div>

        {/* table */}
        <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" data-testid="register-table">
              <thead>
                <tr className="bg-slate-900 text-left text-white">
                  <th className="sticky left-0 z-10 bg-slate-900 px-3 py-3 font-semibold">Data</th>
                  <th className="px-3 py-3 text-right font-semibold">Totale Corrisp.</th>
                  {activeCols.map((c) => (
                    <th key={c.id} className="px-3 py-3 text-right font-semibold">
                      <div className="max-w-[140px] whitespace-normal leading-tight">{c.display_name}</div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-semibold">Stato</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.length === 0 ? (
                  <tr>
                    <td colSpan={activeCols.length + 4} className="px-4 py-10 text-center text-slate-400">
                      Nessuna giornata in questo periodo.
                    </td>
                  </tr>
                ) : (
                  visibleEntries.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50"
                      data-testid={`entry-row-${e.id}`}>
                      <td className="sticky left-0 z-10 bg-white px-3 py-3 font-medium text-slate-900">
                        {formatDateIT(e.business_date)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">
                        {formatCents(e.total_receipts_cents)}
                      </td>
                      {activeCols.map((c) => (
                        <td key={c.id} className="px-3 py-3 text-right text-slate-700">
                          {(e.values || {})[c.id] != null ? formatCents((e.values || {})[c.id]) : ""}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center">
                        <StatusBadge status={e.reconciliation_status} />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => navigate(`/register/${id}/entry/${e.id}`)}
                            data-testid={`edit-entry-${e.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600"
                            onClick={() => setDelEntry(e)} data-testid={`delete-entry-${e.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {visibleEntries.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-900 bg-slate-100 font-bold text-slate-900">
                    <td className="sticky left-0 z-10 bg-slate-100 px-3 py-3" data-testid="totals-label">
                      {monthKey ? `Totali ${MONTHS_IT[selMonth - 1]}` : "Totali anno"}
                    </td>
                    <td className="px-3 py-3 text-right" data-testid="totals-total">{formatCents(totals.total)}</td>
                    {activeCols.map((c) => (
                      <td key={c.id} className="px-3 py-3 text-right">{formatCents(totals[c.id])}</td>
                    ))}
                    <td></td><td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>

      {/* Config columns dialog */}
      <Dialog open={cfgOpen} onOpenChange={setCfgOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg" data-testid="config-dialog">
          <DialogHeader>
            <DialogTitle>Configura colonne</DialogTitle>
            <DialogDescription>Modifica, riordina o aggiungi colonne del registro.</DialogDescription>
          </DialogHeader>
          <ColumnsEditor value={cfgCols} onChange={setCfgCols} />
          <DialogFooter>
            <Button onClick={saveConfig} disabled={cfgSaving}
              className="h-12 w-full rounded-xl bg-slate-900 hover:bg-slate-800" data-testid="save-config-btn">
              {cfgSaving ? "Salvataggio…" : "Salva colonne"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate dialog */}
      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent className="rounded-2xl" data-testid="duplicate-register-dialog">
          <DialogHeader>
            <DialogTitle>Duplica registro</DialogTitle>
            <DialogDescription>
              Crea un nuovo registro con le stesse colonne, alias e ordine. Le giornate NON vengono copiate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600">Nome nuovo registro</Label>
              <Input className="mt-1 h-12" value={dupName} onChange={(e) => setDupName(e.target.value)}
                data-testid="dup-name-input" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600">Anno</Label>
              <Input type="number" className="mt-1 h-12" value={dupYear}
                onChange={(e) => setDupYear(e.target.value)} placeholder="2027" data-testid="dup-year-input" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={doDuplicate} className="h-12 w-full rounded-xl bg-slate-900 hover:bg-slate-800"
              data-testid="confirm-duplicate-btn">Duplica</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete register */}
      <AlertDialog open={delRegOpen} onOpenChange={setDelRegOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminate tutte le {entries.length} giornate e la configurazione. Operazione irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-register">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={deleteRegister} className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-register">Elimina definitivamente</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete entry */}
      <AlertDialog open={!!delEntry} onOpenChange={(o) => !o && setDelEntry(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la giornata?</AlertDialogTitle>
            <AlertDialogDescription>
              {delEntry && `Giornata del ${formatDateIT(delEntry.business_date)}.`} Operazione irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-entry">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={deleteEntry} className="bg-red-600 hover:bg-red-700"
              data-testid="confirm-delete-entry">Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MonthTab({ label, active, onClick, testid }) {
  return (
    <button onClick={onClick} data-testid={testid}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        active ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
      }`}>
      {label}
    </button>
  );
}
