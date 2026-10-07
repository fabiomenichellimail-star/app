import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { fileToBase64Downscaled } from "@/lib/image";
import { formatCents, formatEuro, parseToCents, todayISO } from "@/lib/format";
import { CameraCapture } from "@/components/CameraCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Camera, Receipt, ListChecks, Loader2, AlertTriangle, CheckCircle2,
  XCircle, Save, PencilLine, Plus, Trash2,
} from "lucide-react";

function MoneyField({ label, value, onChange, warn, testid }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-slate-700">{label}</Label>
        {warn && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" /> Controllare
          </span>
        )}
      </div>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">€</span>
        <Input inputMode="decimal"
          className={`h-12 pl-8 text-right text-base font-semibold ${warn ? "border-amber-400 bg-amber-50" : ""}`}
          value={value} onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => { const c = parseToCents(e.target.value); onChange(c === null ? "" : formatCents(c)); }}
          placeholder="0,00" data-testid={testid} />
      </div>
    </div>
  );
}

export default function NewDay() {
  const { id, entryId } = useParams();
  const navigate = useNavigate();
  const editing = !!entryId;

  const [register, setRegister] = useState(null);
  const [columns, setColumns] = useState([]);
  const [step, setStep] = useState("intro");
  const [date, setDate] = useState(todayISO());
  const [zReports, setZReports] = useState([]); // [{id?, amountStr, confidence, detected_date}]
  const [valuesStr, setValuesStr] = useState({});
  const [printedTotalCents, setPrintedTotalCents] = useState(null);
  const [linesSumCents, setLinesSumCents] = useState(null);
  const [lowConf, setLowConf] = useState({});
  const [unmatched, setUnmatched] = useState([]);
  const [repRaw, setRepRaw] = useState(null);
  const [repDone, setRepDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [capture, setCapture] = useState(null); // 'azz' | 'rep' | null
  const [dupExisting, setDupExisting] = useState(null);
  const [dupOpen, setDupOpen] = useState(false);

  useEffect(() => {
    api.get(`/registers/${id}`).then((r) => {
      setRegister(r.data);
      setColumns(r.data.columns || []);
    });
  }, [id]);

  useEffect(() => {
    if (!editing) return;
    api.get(`/registers/${id}/entries`).then((r) => {
      const e = r.data.find((x) => x.id === entryId);
      if (!e) return;
      setDate(e.business_date);
      const zr = (e.z_reports || []).map((z) => ({
        id: z.id, amountStr: z.amount_cents != null ? formatCents(z.amount_cents) : "",
        confidence: z.confidence, detected_date: z.detected_date,
      }));
      setZReports(zr.length ? zr : (e.total_receipts_cents != null
        ? [{ amountStr: formatCents(e.total_receipts_cents), confidence: 1, detected_date: e.business_date }] : []));
      const vs = {};
      Object.entries(e.values || {}).forEach(([k, v]) => { vs[k] = v != null ? formatCents(v) : ""; });
      setValuesStr(vs);
      setPrintedTotalCents(e.printed_total_cents ?? null);
      setStep("confirm");
    });
  }, [editing, entryId, id]);

  const activeCols = columns.filter((c) => c.active);

  // ----- OCR handlers -----
  const runAzz = async (imageB64) => {
    setOcrLoading(true);
    try {
      const res = await api.post(`/registers/${id}/ocr/azzeramento`, { image_base64: imageB64 });
      const d = res.data;
      setZReports((p) => {
        if (d.date && p.length === 0) setDate(d.date);
        return [...p, {
          amountStr: d.total_daily_receipts_cents != null ? formatCents(d.total_daily_receipts_cents) : "",
          confidence: d.confidence, detected_date: d.date,
        }];
      });
      if (d.total_daily_receipts_cents == null) toast.warning("Totale azzeramento non riconosciuto, inseriscilo a mano");
      else toast.success(`Azzeramento letto (${d.model}${d.fallback ? " • fallback" : ""}, ${d.elapsed_ms}ms)`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore lettura azzeramento");
    } finally { setOcrLoading(false); }
  };

  const runRep = async (imageB64) => {
    setOcrLoading(true);
    try {
      const res = await api.post(`/registers/${id}/ocr/reparti`, { image_base64: imageB64 });
      const d = res.data;
      const vs = { ...valuesStr }; const lc = { ...lowConf };
      (d.mapping || []).forEach((m) => {
        if (m.amount_cents != null) vs[m.column_id] = formatCents(m.amount_cents);
        lc[`col_${m.column_id}`] = (m.confidence || 0) < 0.7;
      });
      setValuesStr(vs); setLowConf(lc);
      setPrintedTotalCents(d.printed_total_cents ?? null);
      setLinesSumCents(d.lines_sum_cents ?? null);
      setUnmatched(d.unmatched || []);
      setRepRaw(d); setRepDone(true);
      toast.success(`Reparti letti: ${(d.lines || []).length} righe (${d.model}${d.fallback ? " • fallback" : ""}, ${d.elapsed_ms}ms)`);
      if ((d.unmatched || []).length > 0) toast.warning(`${d.unmatched.length} righe non associate a una colonna`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore lettura reparti");
    } finally { setOcrLoading(false); }
  };

  const onCapture = (dataUrl) => {
    const kind = capture; setCapture(null);
    if (kind === "azz") runAzz(dataUrl); else if (kind === "rep") runRep(dataUrl);
  };
  const onFile = async (file) => {
    const kind = capture; setCapture(null);
    const b64 = await fileToBase64Downscaled(file);
    if (kind === "azz") runAzz(b64); else if (kind === "rep") runRep(b64);
  };

  // ----- reconciliation preview -----
  const zTotal = zReports.reduce((s, z) => s + (parseToCents(z.amountStr) || 0), 0);
  const totalCents = zReports.length ? zTotal : null;
  const valuesCents = {};
  activeCols.forEach((c) => { valuesCents[c.id] = parseToCents(valuesStr[c.id] ?? ""); });
  const deptTotal = activeCols.filter((c) => c.include_in_reconciliation)
    .reduce((s, c) => s + (valuesCents[c.id] || 0), 0);
  const difference = totalCents == null ? null : totalCents - deptTotal;
  const status = totalCents == null ? "DA_CONTROLLARE" : difference === 0 ? "VERIFICATO" : "NON_QUADRATO";
  const checkA = printedTotalCents != null ? printedTotalCents - deptTotal : null;

  const zPayload = () => zReports.map((z) => ({
    id: z.id, amount_cents: parseToCents(z.amountStr),
    detected_date: z.detected_date, confidence: z.confidence,
  }));
  const buildPayload = (replaceId = null) => ({
    business_date: date, z_reports: zPayload(), values: valuesCents,
    printed_total_cents: printedTotalCents, status_hint: null, replace_id: replaceId,
  });

  const doSave = async (replaceId = null) => {
    setSaving(true);
    try {
      if (editing) await api.put(`/entries/${entryId}`, buildPayload());
      else await api.post(`/registers/${id}/entries`, buildPayload(replaceId));
      toast.success("Giornata salvata");
      navigate(`/register/${id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore salvataggio");
    } finally { setSaving(false); }
  };

  const onSaveClick = async () => {
    if (!date) { toast.error("Inserisci la data"); return; }
    try {
      const chk = await api.get(`/registers/${id}/entries/check`, { params: { date } });
      if (chk.data.exists && (!editing || chk.data.entry.id !== entryId)) {
        setDupExisting(chk.data.entry); setDupOpen(true); return;
      }
    } catch (e) { /* ignore */ }
    doSave();
  };

  const handleReplace = async () => {
    setDupOpen(false);
    if (editing) { await api.delete(`/entries/${dupExisting.id}`); await doSave(); }
    else await doSave(dupExisting.id);
  };

  const handleAddToExisting = async () => {
    setDupOpen(false);
    const ex = dupExisting;
    const merged = [...(ex.z_reports || []), ...zPayload()];
    await api.put(`/entries/${ex.id}`, {
      business_date: ex.business_date, z_reports: merged, values: ex.values || {},
      printed_total_cents: ex.printed_total_cents ?? null,
    });
    toast.success("Azzeramento aggiunto alla giornata esistente");
    navigate(`/register/${id}/entry/${ex.id}`);
  };

  if (!register) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">Caricamento…</div>;
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-28">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-xl">
        <Button variant="ghost" size="icon"
          onClick={() => (step === "confirm" && !editing ? setStep("intro") : navigate(`/register/${id}`))}
          data-testid="back-btn">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-heading text-lg font-bold leading-tight text-slate-900">
            {editing ? "Modifica giornata" : "Nuova giornata"}
          </h1>
          <p className="text-xs text-slate-500">{register.name}</p>
        </div>
      </header>

      {step === "intro" && (
        <div className="space-y-4 px-5 py-6">
          <Card className="rounded-2xl border-slate-200 p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-slate-900">
              <Receipt className="h-5 w-5" /><span className="font-semibold">1. Azzeramenti</span>
              {zReports.length > 0 && <span className="ml-auto text-sm font-semibold text-emerald-600">{zReports.length} letti</span>}
            </div>
            <p className="mb-3 text-sm text-slate-500">
              Fotografa la chiusura giornaliera. Puoi aggiungere più azzeramenti per lo stesso giorno.
            </p>
            {zReports.length > 0 && (
              <div className="mb-3 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                {zReports.map((z, i) => (
                  <div key={i} className="flex justify-between">
                    <span>Azzeramento {i + 1}</span>
                    <b>{z.amountStr ? "€ " + z.amountStr : "—"}</b>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                  <span>Totale</span><span>{formatEuro(zTotal)}</span>
                </div>
              </div>
            )}
            <Button onClick={() => setCapture("azz")}
              className="h-12 w-full rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98]"
              data-testid="read-azzeramento-btn">
              <Camera className="mr-2 h-5 w-5" />
              {zReports.length === 0 ? "Leggi azzeramento" : "+ Aggiungi azzeramento"}
            </Button>
          </Card>

          <Card className="rounded-2xl border-slate-200 p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-slate-900">
              <ListChecks className="h-5 w-5" /><span className="font-semibold">2. Venduto per reparto</span>
              {repDone && <CheckCircle2 className="ml-auto h-5 w-5 text-emerald-600" />}
            </div>
            <p className="mb-3 text-sm text-slate-500">
              Fotografa lo scarico reparti: gli importi verranno associati alle colonne.
            </p>
            <Button onClick={() => setCapture("rep")} variant="outline"
              className="h-12 w-full rounded-xl border-slate-300 active:scale-[0.98]"
              data-testid="read-reparti-btn">
              <Camera className="mr-2 h-5 w-5" />{repDone ? "Rifotografa reparti" : "Leggi reparti"}
            </Button>
          </Card>

          <Button onClick={() => setStep("confirm")}
            className="h-14 w-full rounded-xl bg-slate-900 text-base font-semibold hover:bg-slate-800 active:scale-[0.98]"
            data-testid="go-confirm-btn">
            Prosegui alla conferma
          </Button>
          <Button onClick={() => setStep("confirm")} variant="ghost"
            className="h-11 w-full text-slate-600" data-testid="manual-entry-btn">
            <PencilLine className="mr-2 h-4 w-4" /> Inserimento manuale
          </Button>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-4 px-5 py-6">
          <QuadraturaCard status={status} totalCents={totalCents} deptTotal={deptTotal}
            difference={difference} printedTotalCents={printedTotalCents} checkA={checkA} />

          <Card className="space-y-3 rounded-2xl border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-base font-bold text-slate-900">Azzeramenti</h3>
              <span className="text-sm font-semibold text-slate-900" data-testid="z-total">{formatEuro(zTotal)}</span>
            </div>
            {zReports.length === 0 && <p className="text-sm text-slate-400">Nessun azzeramento. Aggiungine uno.</p>}
            {zReports.map((z, i) => (
              <div key={i} className="flex items-end gap-2" data-testid={`z-report-${i}`}>
                <div className="flex-1">
                  <MoneyField label={`Azzeramento ${i + 1}`} value={z.amountStr}
                    onChange={(v) => setZReports((p) => p.map((x, j) => j === i ? { ...x, amountStr: v } : x))}
                    warn={(z.confidence ?? 1) < 0.7} testid={`z-report-input-${i}`} />
                </div>
                <Button variant="ghost" size="icon" className="mb-1 h-10 w-10 text-red-600"
                  onClick={() => setZReports((p) => p.filter((_, j) => j !== i))}
                  data-testid={`z-report-delete-${i}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 flex-1 rounded-xl border-slate-300"
                onClick={() => setCapture("azz")} data-testid="confirm-add-azz-photo">
                <Camera className="mr-2 h-4 w-4" /> Foto
              </Button>
              <Button variant="outline" className="h-11 flex-1 rounded-xl border-dashed"
                onClick={() => setZReports((p) => [...p, { amountStr: "", confidence: 1, detected_date: date }])}
                data-testid="confirm-add-azz-manual">
                <Plus className="mr-2 h-4 w-4" /> Manuale
              </Button>
            </div>
          </Card>

          <Card className="space-y-4 rounded-2xl border-slate-200 p-5 shadow-sm">
            <div>
              <Label className="text-sm font-medium text-slate-700">Data</Label>
              <Input type="date" className="mt-1 h-12" value={date}
                onChange={(e) => setDate(e.target.value)} data-testid="entry-date-input" />
            </div>
          </Card>

          <Card className="space-y-4 rounded-2xl border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-base font-bold text-slate-900">Reparti / Colonne</h3>
              <Button variant="ghost" size="sm" className="text-slate-600"
                onClick={() => setCapture("rep")} data-testid="confirm-read-reparti">
                <Camera className="mr-1 h-4 w-4" /> Leggi
              </Button>
            </div>
            {activeCols.length === 0 && <p className="text-sm text-slate-400">Nessuna colonna configurata.</p>}
            {activeCols.map((c) => (
              <MoneyField key={c.id} label={c.display_name} value={valuesStr[c.id] ?? ""}
                onChange={(v) => setValuesStr((p) => ({ ...p, [c.id]: v }))}
                warn={lowConf[`col_${c.id}`]} testid={`entry-col-input-${c.id}`} />
            ))}
          </Card>

          {unmatched.length > 0 && (
            <Card className="rounded-2xl border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" /> Righe non associate
              </div>
              {unmatched.map((u, i) => (<div key={i}>{u.label} — {formatEuro(u.amount_cents)}</div>))}
              <div className="mt-1 text-xs">Assegnale manualmente o aggiungi gli alias nella configurazione colonne.</div>
            </Card>
          )}
        </div>
      )}

      {step === "confirm" && (
        <div className="fixed bottom-0 left-1/2 w-full max-w-lg -translate-x-1/2 border-t border-slate-200 bg-white/90 p-4 backdrop-blur-xl">
          <Button onClick={onSaveClick} disabled={saving}
            className="h-14 w-full rounded-xl bg-slate-900 text-base font-semibold hover:bg-slate-800 active:scale-[0.98]"
            data-testid="save-entry-btn">
            <Save className="mr-2 h-5 w-5" /> {saving ? "Salvataggio…" : "Salva giornata"}
          </Button>
        </div>
      )}

      <CameraCapture open={capture === "azz"} title="Leggi azzeramento"
        onCapture={onCapture} onFile={onFile} onClose={() => setCapture(null)}
        captureTestId="azz-capture-btn" fileTestId="z-file-input" />
      <CameraCapture open={capture === "rep"} title="Leggi reparti"
        onCapture={onCapture} onFile={onFile} onClose={() => setCapture(null)}
        captureTestId="rep-capture-btn" fileTestId="rep-file-input" />

      {ocrLoading && (
        <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center gap-3 bg-black/70 text-white"
          data-testid="ocr-loading">
          <Loader2 className="h-10 w-10 animate-spin" />
          <p className="text-base font-semibold">Lettura in corso…</p>
        </div>
      )}

      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent className="rounded-2xl" data-testid="duplicate-dialog">
          <DialogHeader>
            <DialogTitle>Giornata già esistente</DialogTitle>
            <DialogDescription>
              Esiste già la giornata {date}. Vuoi aggiungere questo azzeramento alla giornata esistente?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="h-12 w-full rounded-xl bg-slate-900 hover:bg-slate-800"
              onClick={handleAddToExisting} data-testid="dup-add-azz-btn">
              Aggiungi azzeramento
            </Button>
            <Button variant="outline" className="h-12 w-full rounded-xl"
              onClick={() => { setDupOpen(false); navigate(`/register/${id}/entry/${dupExisting.id}`); }}
              data-testid="dup-open-existing-btn">
              Apri giornata
            </Button>
            {!editing && (
              <Button variant="outline" className="h-11 w-full rounded-xl"
                onClick={handleReplace} data-testid="dup-replace-btn">
                Sostituisci completamente
              </Button>
            )}
            <Button variant="ghost" className="h-11 w-full"
              onClick={() => setDupOpen(false)} data-testid="dup-cancel-btn">
              Annulla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuadraturaCard({ status, totalCents, deptTotal, difference, printedTotalCents, checkA }) {
  const cfg = {
    VERIFICATO: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800", Icon: CheckCircle2, title: "Quadratura corretta" },
    NON_QUADRATO: { bg: "bg-red-50 border-red-200", text: "text-red-800", Icon: XCircle, title: "Importi non corrispondenti" },
    DA_CONTROLLARE: { bg: "bg-amber-50 border-amber-200", text: "text-amber-800", Icon: AlertTriangle, title: "Da controllare" },
  }[status];
  const { Icon } = cfg;
  const row = (l, v) => (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-sm text-slate-600">{l}</span>
      <span className="font-semibold text-slate-900">{v}</span>
    </div>
  );
  return (
    <Card className={`rounded-2xl border p-5 shadow-sm ${cfg.bg}`} data-testid="quadratura-card">
      <div className={`mb-3 flex items-center gap-2 font-heading text-lg font-bold ${cfg.text}`}>
        <Icon className="h-6 w-6" /> {cfg.title}
      </div>
      {row("Totale corrispettivi (azzeramenti)", totalCents == null ? "—" : formatEuro(totalCents))}
      {row("Somma reparti", formatEuro(deptTotal))}
      <div className="my-1 h-px bg-slate-200/70" />
      <div className="flex items-center justify-between py-0.5">
        <span className="text-sm font-medium text-slate-700">Differenza (Controllo B)</span>
        <span className={`font-bold ${difference === 0 ? "text-emerald-700" : "text-red-700"}`} data-testid="quadratura-difference">
          {difference == null ? "—" : formatEuro(difference)}
        </span>
      </div>
      {printedTotalCents != null && (
        <div className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-xs text-slate-600">
          <div className="flex justify-between">
            <span>TOT EUR documento reparti</span><span className="font-semibold">{formatEuro(printedTotalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span>Controllo A (TOT EUR − somma reparti)</span>
            <span className={`font-semibold ${checkA === 0 ? "text-emerald-700" : "text-red-700"}`}>
              {checkA == null ? "—" : formatEuro(checkA)}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
