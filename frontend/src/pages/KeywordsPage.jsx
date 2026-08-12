import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, ArrowLeft, X, UploadCloud } from 'lucide-react';
import SyncBadge from '../components/SyncBadge';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import { keywordsApi, campaignsApi, unwrap } from '../services/api';
import { useToast } from '../context/ToastContext';

const MATCH_TYPES = [
  { value: 'broad', label: 'Broad' },
  { value: 'phrase', label: 'Phrase' },
  { value: 'exact', label: 'Exact' },
];

const EMPTY_FORM = { keyword: '', matchType: 'broad', isNegative: false };

/**
 * Keywords for one campaign — a sub-page of Campaigns, reached from a
 * campaign row, with a back arrow to return. Matches how the Warming-Farming
 * project scoped keyword management.
 */
export default function KeywordsPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [campaign, setCampaign] = useState(null);
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pushing, setPushing] = useState(false);

  // Anything not yet live in Google Ads, so the retry button can say how much
  // it will actually send.
  const unsynced = keywords.filter((k) => k.syncState !== 'synced').length;

  const handlePush = async () => {
    setPushing(true);
    try {
      const res = await campaignsApi.pushContent(campaignId);
      showToast(res.message || 'Pushed to Google Ads', res.success ? 'success' : 'error');
      loadKeywords();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to push to Google Ads', 'error');
    } finally {
      setPushing(false);
    }
  };

  const loadKeywords = useCallback(() => {
    setLoading(true);
    return keywordsApi
      .list(campaignId, { limit: 200 })
      .then((res) => {
        setKeywords(unwrap(res) || []);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [campaignId]);

  useEffect(() => {
    loadKeywords();
    campaignsApi
      .get(campaignId)
      .then((res) => setCampaign(unwrap(res)))
      .catch(() => setCampaign(null));
  }, [campaignId, loadKeywords]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (kw) => {
    setEditing(kw);
    setForm({ keyword: kw.keyword, matchType: kw.matchType, isNegative: kw.isNegative });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await keywordsApi.update(editing._id, form);
        showToast('Keyword updated');
      } else {
        const res = await keywordsApi.create(campaignId, form);
        const synced = unwrap(res)?.syncState === 'synced';
        showToast(res.message || 'Keyword added', synced ? 'success' : 'error');
      }
      setShowModal(false);
      setForm(EMPTY_FORM);
      setEditing(null);
      loadKeywords();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save keyword', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await keywordsApi.remove(pendingDelete._id);
      showToast('Keyword deleted');
      loadKeywords();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete keyword', 'error');
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Keywords"
        subtitle={campaign?.campaignName || 'Campaign keywords'}
        actions={
          <div className="header-btn-group">
            <button className="btn-secondary" onClick={() => navigate('/campaigns')}>
              <ArrowLeft size={15} /> Back
            </button>
            {unsynced > 0 && (
              <button className="btn-secondary" onClick={handlePush} disabled={pushing}>
                <UploadCloud size={15} />
                {pushing ? 'Pushing…' : `Push ${unsynced} to Google Ads`}
              </button>
            )}
            <button className="refresh-btn" onClick={openAdd}>
              <Plus size={15} /> Add Keyword
            </button>
          </div>
        }
      />

      {error && <div className="error-banner">Could not load keywords. ({error.message})</div>}

      {loading ? (
        <LoadingSpinner label="Loading keywords…" />
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Match Type</th>
                <th>Type</th>
                <th>Status</th>
                <th>Google Ads</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keywords.length === 0 ? (
                <tr>
                  <td className="empty-row" colSpan={6}>
                    No keywords found. Click &quot;Add Keyword&quot; to get started.
                  </td>
                </tr>
              ) : (
                keywords.map((kw) => (
                  <tr key={kw._id}>
                    <td style={{ fontWeight: 600 }}>{kw.keyword}</td>
                    <td><span className={`match-badge match-${kw.matchType}`}>{kw.matchType}</span></td>
                    <td>
                      <span className={`pill ${kw.isNegative ? 'pill-error' : 'pill-success'}`}>
                        {kw.isNegative ? 'Negative' : 'Positive'}
                      </span>
                    </td>
                    <td><span className={`pill ${kw.status === 'active' ? 'pill-success' : 'pill-neutral'}`}>{kw.status}</span></td>
                    {/* Saved here and live in Google Ads are different things. */}
                    <td><SyncBadge state={kw.syncState} error={kw.syncError} compact /></td>
                    <td>
                      <div className="cell-actions">
                        <button className="camp-action-btn camp-action-edit" onClick={() => openEdit(kw)} aria-label="Edit keyword">
                          <Pencil size={15} />
                        </button>
                        <button className="camp-action-btn camp-action-delete" onClick={() => setPendingDelete(kw)} aria-label="Delete keyword">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={() => setShowModal(false)} aria-label="Close">
              <X size={16} />
            </button>
            <h3>{editing ? 'Edit Keyword' : 'Add Keyword'}</h3>

            <form onSubmit={handleSubmit}>
              <label className="field">
                <span>Keyword</span>
                <input
                  type="text"
                  value={form.keyword}
                  onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
                  autoFocus
                  required
                />
              </label>

              <label className="field">
                <span>Match Type</span>
                <select value={form.matchType} onChange={(e) => setForm((f) => ({ ...f, matchType: e.target.value }))}>
                  {MATCH_TYPES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>

              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.isNegative}
                  onChange={(e) => setForm((f) => ({ ...f, isNegative: e.target.checked }))}
                />
                <span>Negative keyword — exclude this term</span>
              </label>

              <div className="modal-actions">
                <button type="button" className="modal-btn-cancel" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="refresh-btn" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete Keyword"
          message={`Delete "${pendingDelete.keyword}"?`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
