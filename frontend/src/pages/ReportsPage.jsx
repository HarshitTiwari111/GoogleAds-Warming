import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import ReportTable from '../components/ReportTable';
import ExportButtons from '../components/ExportButtons';
import Pagination from '../components/Pagination';
import { reportsApi, unwrap } from '../services/api';

const PAGE_SIZE = 10;

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [page, setPage] = useState(1);

  const loadReports = () => {
    setLoading(true);
    return reportsApi
      .list()
      .then((res) => {
        setReports(unwrap(res) || []);
        setError(null);
        setLastUpdated(new Date());
      })
      .catch(setError)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReports();
  }, []);

  const totalPages = Math.max(1, Math.ceil(reports.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedReports = reports.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="page">
      <PageHeader
        title="Reports"
        subtitle="Account performance reports (Last 30 days) — sorted by spend"
        lastUpdated={lastUpdated}
        onRefresh={loadReports}
        actions={
          <ExportButtons
            rows={reports}
            columns={[]}
            filename="reports"
            title="Reports"
            serverExport={{ csv: reportsApi.exportCsv, pdf: reportsApi.exportPdf }}
          />
        }
      />

      {error && (
        <div className="error-banner">
          Could not load reports. ({error.message})
        </div>
      )}

      {loading ? (
        <LoadingSpinner label="Loading reports…" />
      ) : (
        <>
          <ReportTable reports={pagedReports} />
          <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
