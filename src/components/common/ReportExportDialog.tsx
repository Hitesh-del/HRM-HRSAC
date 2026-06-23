/**
 * ReportExportDialog
 * Universal "Generate Report" popup used by every module that needs
 * PDF / CSV / Print with a date-range filter.
 *
 * Usage:
 *   <ReportExportDialog
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     reportTitle="Employee Management Report"
 *     columns={[{ header: 'Name', key: 'full_name' }, ...]}
 *     rows={employees}          // full unfiltered dataset
 *     dateKey="date_of_joining" // column used for date filtering
 *   />
 */
import { useState } from 'react';
import { FileText, FileDown, Printer, X, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import {
  generatePDF,
  generateCSV,
  printReport,
  resolveDateRange,
  inRange,
  type ReportColumn,
  type DateRange,
} from '@/lib/reportExport';
import { useAuth } from '@/contexts/AuthContext';

interface ReportExportDialogProps {
  open: boolean;
  onClose: () => void;
  reportTitle: string;
  columns: ReportColumn[];
  /** Full, unfiltered dataset rows */
  rows: Record<string, unknown>[];
  /** Key in each row that contains the ISO date string used for range filtering */
  dateKey: string;
}

const RANGE_OPTIONS: { value: DateRange['type']; label: string }[] = [
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'last3m', label: 'Last 3 Months' },
  { value: 'last6m', label: 'Last 6 Months' },
  { value: 'last1y', label: 'Last 1 Year' },
  { value: 'custom', label: 'Custom Date Range' },
];

export function ReportExportDialog({
  open, onClose, reportTitle, columns, rows, dateKey,
}: ReportExportDialogProps) {
  const { companySettings } = useAuth();
  const companyName = companySettings?.company_name || 'Company';

  const [rangeType, setRangeType] = useState<DateRange['type']>('last30');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const validate = (): boolean => {
    if (rangeType === 'custom') {
      if (!fromDate || !toDate) {
        toast.error('Please select both From Date and To Date');
        return false;
      }
      if (new Date(fromDate) > new Date(toDate)) {
        toast.error('From Date cannot be later than To Date');
        return false;
      }
    }
    return true;
  };

  const buildRangeLabel = (): string => {
    if (rangeType === 'custom') return `${fromDate} to ${toDate}`;
    return RANGE_OPTIONS.find(o => o.value === rangeType)?.label ?? '';
  };

  const getFilteredRows = (): Record<string, unknown>[] => {
    const range: DateRange = rangeType === 'custom'
      ? { type: 'custom', from: fromDate, to: toDate }
      : { type: rangeType };
    const { from, to } = resolveDateRange(range);
    const filtered = rows.filter(r => inRange(r[dateKey] as string, from, to));
    if (filtered.length === 0) {
      toast.error('No records found for the selected date range');
      return [];
    }
    return filtered;
  };

  const buildMeta = () => ({
    companyName,
    reportTitle,
    subtitle: `Date Range: ${buildRangeLabel()}`,
  });

  const handlePDF = () => {
    if (!validate()) return;
    const filtered = getFilteredRows();
    if (!filtered.length) return;
    generatePDF(buildMeta(), columns, filtered);
    toast.success('PDF exported');
    onClose();
  };

  const handleCSV = () => {
    if (!validate()) return;
    const filtered = getFilteredRows();
    if (!filtered.length) return;
    generateCSV(buildMeta(), columns, filtered);
    toast.success('CSV exported');
    onClose();
  };

  const handlePrint = () => {
    if (!validate()) return;
    const filtered = getFilteredRows();
    if (!filtered.length) return;
    printReport(buildMeta(), columns, filtered);
    onClose();
  };

  const reset = () => {
    setRangeType('last30');
    setFromDate('');
    setToDate('');
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Generate Report
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{reportTitle}</span>
          </p>

          {/* Date range selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Download Range</Label>
            <RadioGroup
              value={rangeType}
              onValueChange={v => setRangeType(v as DateRange['type'])}
              className="space-y-2"
            >
              {RANGE_OPTIONS.map(opt => (
                <div key={opt.value} className="flex items-center gap-2">
                  <RadioGroupItem value={opt.value} id={`range-${opt.value}`} />
                  <Label htmlFor={`range-${opt.value}`} className="text-sm font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Custom date pickers */}
          {rangeType === 'custom' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <Label className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> From Date
                </Label>
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> To Date
                </Label>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex gap-2">
              <Button className="flex-1 min-w-0 gap-1.5" onClick={handlePDF}>
                <FileText className="w-3.5 h-3.5" /> Generate PDF
              </Button>
              <Button variant="secondary" className="flex-1 min-w-0 gap-1.5" onClick={handleCSV}>
                <FileDown className="w-3.5 h-3.5" /> Generate CSV
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 min-w-0 gap-1.5" onClick={handlePrint}>
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
              <Button variant="ghost" className="flex-1 min-w-0 gap-1.5 text-muted-foreground" onClick={() => { reset(); onClose(); }}>
                <X className="w-3.5 h-3.5" /> Cancel
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
