import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Trash2, Plus, GripVertical } from "lucide-react";

const emptyCol = () => ({
  display_name: "",
  ocr_label: "",
  aliases: [],
  include_in_reconciliation: true,
  active: true,
});

// Presentational configurable-columns editor. Works on an in-memory array.
// Data and Totale Corrispettivi are fixed/implicit and NOT part of this list.
export function ColumnsEditor({ value, onChange }) {
  const cols = value || [];

  const update = (idx, patch) => {
    const next = cols.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange(next);
  };
  const add = () => onChange([...cols, emptyCol()]);
  const remove = (idx) => onChange(cols.filter((_, i) => i !== idx));
  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= cols.length) return;
    const next = [...cols];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-3" data-testid="columns-editor">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Le prime due colonne <b>Data</b> e <b>Totale Corrispettivi</b> sono sempre
        presenti e fisse. Aggiungi qui i reparti/colonne che vuoi, in ordine da
        sinistra verso destra.
      </div>

      {cols.map((col, idx) => (
        <Card key={idx} className="rounded-2xl border-slate-200 p-4 shadow-sm" data-testid={`column-card-${idx}`}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-400">
              <GripVertical className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Colonna {idx + 1}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => move(idx, -1)} disabled={idx === 0}
                data-testid={`column-up-${idx}`}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => move(idx, 1)} disabled={idx === cols.length - 1}
                data-testid={`column-down-${idx}`}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon"
                className="h-8 w-8 text-red-600 hover:text-red-700"
                onClick={() => remove(idx)} data-testid={`column-delete-${idx}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600">Nome visualizzato</Label>
              <Input className="mt-1 h-11" placeholder="es. IVA 10% Ristorante"
                value={col.display_name}
                onChange={(e) => update(idx, { display_name: e.target.value })}
                data-testid={`column-name-${idx}`} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600">Testo stampato sullo scontrino (alias principale)</Label>
              <Input className="mt-1 h-11" placeholder="es. RISTORANTE"
                value={col.ocr_label}
                onChange={(e) => update(idx, { ocr_label: e.target.value })}
                data-testid={`column-ocrlabel-${idx}`} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600">Alias aggiuntivi (separati da virgola)</Label>
              <Input className="mt-1 h-11" placeholder="es. RIST., RISTORANTE 10"
                value={(col.aliases || []).join(", ")}
                onChange={(e) => update(idx, {
                  aliases: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })}
                data-testid={`column-aliases-${idx}`} />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm font-medium text-slate-700">Inclusa nella quadratura</span>
              <Switch checked={col.include_in_reconciliation}
                onCheckedChange={(v) => update(idx, { include_in_reconciliation: v })}
                data-testid={`column-reconc-${idx}`} />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm font-medium text-slate-700">Attiva</span>
              <Switch checked={col.active}
                onCheckedChange={(v) => update(idx, { active: v })}
                data-testid={`column-active-${idx}`} />
            </div>
          </div>
        </Card>
      ))}

      <Button type="button" variant="outline"
        className="h-12 w-full rounded-xl border-dashed"
        onClick={add} data-testid="add-column-btn">
        <Plus className="mr-2 h-4 w-4" /> Aggiungi colonna
      </Button>
    </div>
  );
}
