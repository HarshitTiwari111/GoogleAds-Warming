import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, Ban, RefreshCw } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { accountsApi } from '../services/api';
import { useToast } from '../context/ToastContext';

const WINDOWS = [
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
];

const MATCH_TYPES = ['EXACT', 'PHRASE', 'BROAD'];

/**
 * The search terms an account actually served against, and the one action
 * that matters on them: excluding the wasteful ones.
 *
 * Terms are excluded at campaign level, so one exclusion covers every ad
 * group in that campaign. A term whose campaign isn't known (Google omits it
 * on some rows) can't be excluded and is shown as such rather than silently
 * failing.
 */
export default function SearchTermsModal({ customerId, mccId, campaignId, campaignName, onClose }) {
  const { showToast } = useToast();

  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState('');
  const [matchType, setMatchType] = useState('EXACT');
  const [selected, setSelected] = useState([]);
  const [excluding, setExcluding] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return accountsApi
      .searchTerms(customerId, { mccId, campaignId, days })
      .then((data) => {
        setTerms(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch((err) => setError(err.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }, [customerId, mccId, campaignId, days]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? terms.filter((t) => t.searchTerm.toLowerCase().includes(q)) : terms;
  }, [terms, search]);

  const toggle = (term) =>
    setSelected((prev) => (prev.includes(term) ? prev.filter((t) => t !== term) : [...prev, term]));

  const handleExclude = async () => {
    // Group by campaign: each mutate call targets one campaign's criteria.
    const byCampaign = new Map();
    for (const row of terms) {
      if (!selected.includes(row.searchTerm)) continue;
      const cid = row.campaignId || campaignId;
      if (!cid) continue;
      if (!byCampaign.has(cid)) byCampaign.set(cid, new Set());
      byCampaign.get(cid).add(row.searchTerm);
    }

    if (!byCampaign.size) {
      showToast('None of the selected terms have a known campaign to exclude them from', 'error');
      return;
    }

    setExcluding(true);
    let added = 0;
    const failures = [];

    for (const [cid, termSet] of byCampaign) {
      const keywords = [...termSet].map((text) => ({ text, matchType }));
      try {
        await accountsApi.addNegativeKeywords(customerId, cid, keywords, mccId);
        added += keywords.length;
      } catch (err) {
        failures.push(err.response?.data?.message || err.message);
      }
    }

    if (added) showToast(`${added} negative keyword(s) added`);
    if (failures.length) showToast(failures[0], 'error');

    setSelected([]);
    setExcluding(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card af-modal st-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        <div className="af-head">
          <div className="af-head-icon">
            <Search size={20} />
          </div>
          <div>
            <h3>Search Terms</h3>
            <p>{campaignName ? `${campaignName} · ` : ''}What people actually searched before clicking</p>
          </div>
        </div>

        <div className="af-divider" />

        <div className="dt-toolbar">
          <div className="dt-filter-search">
            <Search size={15} />
            <input
              type="search"
              placeholder="Filter terms…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select className="dt-filter-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {WINDOWS.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>

          <select className="dt-filter-select" value={matchType} onChange={(e) => setMatchType(e.target.value)}>
            {MATCH_TYPES.map((m) => (
              <option key={m} value={m}>Exclude as {m}</option>
            ))}
          </select>

          <div className="dt-actions">
            <button className="btn-secondary" onClick={load} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'set-spin' : undefined} /> Refresh
            </button>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {selected.length > 0 && (
          <div className="bulk-bar">
            <span className="bulk-bar-count">{selected.length} term{selected.length > 1 ? 's' : ''} selected</span>
            <button className="btn-primary" onClick={handleExclude} disabled={excluding}>
              <Ban size={15} /> {excluding ? 'Excluding…' : 'Add as negative keyword'}
            </button>
            <button className="btn-secondary" onClick={() => setSelected([])}>
              <X size={15} /> Clear
            </button>
          </div>
        )}

        {loading ? (
          <LoadingSpinner label="Loading search terms…" />
        ) : (
          <div className="table-wrapper st-table">
            <table>
              <thead>
                <tr>
                  <th className="dt-select-cell" />
                  <th>Search term</th>
                  {!campaignId && <th>Campaign</th>}
                  <th>Clicks</th>
                  <th>Impr.</th>
                  <th>Cost</th>
                  <th>Conv.</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td className="empty-row" colSpan={campaignId ? 6 : 7}>
                      No search terms in this window.
                    </td>
                  </tr>
                ) : (
                  visible.map((t, i) => {
                    const excludable = !!(t.campaignId || campaignId);
                    return (
                      <tr key={`${t.searchTerm}-${i}`} className={selected.includes(t.searchTerm) ? 'dt-row-selected' : undefined}>
                        <td className="dt-select-cell">
                          <input
                            type="checkbox"
                            checked={selected.includes(t.searchTerm)}
                            onChange={() => toggle(t.searchTerm)}
                            disabled={!excludable}
                            title={excludable ? 'Select to exclude' : 'No campaign on this row — cannot exclude'}
                          />
                        </td>
                        <td>{t.searchTerm}</td>
                        {!campaignId && <td className="cell-muted">{t.campaignName || '—'}</td>}
                        <td>{t.clicks}</td>
                        <td>{t.impressions}</td>
                        <td>${t.cost.toFixed(2)}</td>
                        <td>{t.conversions}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
