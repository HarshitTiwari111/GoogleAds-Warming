import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import AlertHistoryTable from '../components/AlertHistoryTable';
import ExportButtons from '../components/ExportButtons';
import Pagination from '../components/Pagination';
import { alertsApi, rulesApi, unwrap } from '../services/api';

const PAGE_SIZE = 20;

const emptyFilters = { campaignName: '', ruleType: '', dateFrom: '', dateTo: '' };

const EXPORT_COLUMNS = [
  { label: 'Time', value: (a) => new Date(a.sentAt).toLocaleString() },
  { label: 'Campaign', value: (a) => a.campaignName },
  { label: 'Rule', value: (a) => a.ruleName || a.ruleType },
  { label: 'Recommendation', value: (a) => a.recommendation },
  { label: 'Status', value: (a) => a.status },
];

export default function AlertHistoryPage() {
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [rules, setRules] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadAlerts = () => {
    setLoading(true);
    const params = {
      page,
      limit: PAGE_SIZE,
      ...(filters.campaignName && { campaignName: filters.campaignName }),
      ...(filters.ruleType && { ruleType: filters.ruleType }),
      ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
      ...(filters.dateTo && { dateTo: filters.dateTo }),
    };
    return alertsApi
      .list(params)
      .then((res) => {
        const list = Array.isArray(res) ? res : (res?.data || []);
        setAlerts(list);
        setTotal(res?.pagination?.total ?? list.length);
        setError(null);
        setLastUpdated(new Date());
      })
      .catch(setError)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters]);

  useEffect(() => {
    rulesApi
      .list()
      .then((res) => setRules(unwrap(res) || []))
      .catch(() => setRules([]));
  }, []);

  const handleFilterChange = (field) => (e) => {
    setPage(1);
    setFilters((f) => ({ ...f, [field]: e.target.value }));
  };

  const handleClearFilters = () => {
    setPage(1);
    setFilters(emptyFilters);
  };

  const hasFilters = Object.values(filters).some(Boolean);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchAllForExport = async () => {
    const params = {
      limit: 10000,
      ...(filters.campaignName && { campaignName: filters.campaignName }),
      ...(filters.ruleType && { ruleType: filters.ruleType }),
      ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
      ...(filters.dateTo && { dateTo: filters.dateTo }),
    };
    const data = unwrap(await alertsApi.list(params));
    return Array.isArray(data) ? data : data?.alerts || [];
  };

  return (
    <div className="page">
      <PageHeader title="Alert History" subtitle="Telegram alerts sent for monitored campaigns" lastUpdated={lastUpdated} onRefresh={loadAlerts} />

      {error && (
        <div className="error-banner">
          Could not load alert history. ({error.message})
        </div>
      )}

      <div className="filter-bar">
        <label className="field field-search">
          <span>Campaign</span>
          <input
            type="text"
            placeholder="Filter by campaign name"
            value={filters.campaignName}
            onChange={handleFilterChange('campaignName')}
          />
        </label>

        <label className="field">
          <span>Rule Type</span>
          <select value={filters.ruleType} onChange={handleFilterChange('ruleType')}>
            <option value="">All rules</option>
            {rules.map((r) => (
              <option key={r._id} value={r.type}>
                {r.name || r.type}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>From</span>
          <input type="date" value={filters.dateFrom} onChange={handleFilterChange('dateFrom')} />
        </label>

        <label className="field">
          <span>To</span>
          <input type="date" value={filters.dateTo} onChange={handleFilterChange('dateTo')} />
        </label>

        {hasFilters && (
          <button className="filter-clear-btn" onClick={handleClearFilters}>
            Clear
          </button>
        )}

        <div className="field export-field">
          <span>&nbsp;</span>
          <ExportButtons
            columns={EXPORT_COLUMNS}
            rows={alerts}
            fetchAll={fetchAllForExport}
            filename="alert-history"
            title="Alert History"
          />
        </div>
      </div>

      {loading ? <LoadingSpinner label="Loading alerts…" /> : <AlertHistoryTable alerts={alerts} />}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
