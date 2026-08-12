import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, ArrowLeft, X, ExternalLink, UploadCloud } from 'lucide-react';
import SyncBadge from '../components/SyncBadge';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import { adCopiesApi, campaignsApi, unwrap } from '../services/api';
import { useToast } from '../context/ToastContext';

// Google Ads enforces these server-side; mirroring them shows the problem
// while typing instead of on submit.
const LIMITS = { headline: 30, description: 90 };

/**
 * The domain line a search ad shows, rather than the full destination URL —
 * `https://example.com/summer?x=1` becomes `example.com/summer`. Falls back to
 * the raw value if it isn't parseable as a URL.
 */
function displayUrl(url) {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, '');
    return pathname && pathname !== '/' ? `${host}${pathname}` : host;
  } catch {
    return url;
  }
}

const EMPTY_FORM = {
  headline1: '',
  headline2: '',
  headline3: '',
  description1: '',
  description2: '',
  finalUrl: '',
};

/**
 * Ad copies for one campaign — a sub-page of Campaigns, reached from a
 * campaign row, with a back arrow to return.
 */
export default function AdCopiesPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [campaign, setCampaign] = useState(null);
  const [ads, setAds] = useState([]);
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
  const unsynced = ads.filter((a) => a.syncState !== 'synced').length;

  const handlePush = async () => {
    setPushing(true);
    try {
      const res = await campaignsApi.pushContent(campaignId);
      showToast(res.message || 'Pushed to Google Ads', res.success ? 'success' : 'error');
      loadAds();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to push to Google Ads', 'error');
    } finally {
      setPushing(false);
    }
  };

  const loadAds = useCallback(() => {
    setLoading(true);
    return adCopiesApi
      .list(campaignId, { limit: 100 })
      .then((res) => {
        setAds(unwrap(res) || []);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [campaignId]);

  useEffect(() => {
    loadAds();
    campaignsApi
      .get(campaignId)
      .then((res) => setCampaign(unwrap(res)))
      .catch(() => setCampaign(null));
  }, [campaignId, loadAds]);

  const setField = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (ad) => {
    setEditing(ad);
    setForm({
      headline1: ad.headline1 || '',
      headline2: ad.headline2 || '',
      headline3: ad.headline3 || '',
      description1: ad.description1 || '',
      description2: ad.description2 || '',
      finalUrl: ad.finalUrl || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await adCopiesApi.update(editing._id, form);
        showToast('Ad copy updated');
      } else {
        const res = await adCopiesApi.create(campaignId, form);
        // A local save with a rejected push is a partial success, not a
        // success — it must not read green.
        const synced = unwrap(res)?.syncState === 'synced';
        showToast(res.message || 'Ad copy created', synced ? 'success' : 'error');
      }
      setShowModal(false);
      setForm(EMPTY_FORM);
      setEditing(null);
      loadAds();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save ad copy', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await adCopiesApi.remove(pendingDelete._id);
      showToast('Ad copy deleted');
      loadAds();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete ad copy', 'error');
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Ad Copies"
        subtitle={campaign?.campaignName || 'Campaign ad copies'}
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
              <Plus size={15} /> Add Ad Copy
            </button>
          </div>
        }
      />

      {error && <div className="error-banner">Could not load ad copies. ({error.message})</div>}

      {loading ? (
        <LoadingSpinner label="Loading ad copies…" />
      ) : ads.length === 0 ? (
        <div className="empty-state-card">
          <p>No ad copies found.</p>
          <p className="empty-hint">Click &quot;Add Ad Copy&quot; to get started.</p>
        </div>
      ) : (
        <div className="adcopy-grid">
          {ads.map((ad) => {
            const headlines = [ad.headline1, ad.headline2, ad.headline3].filter(Boolean);
            const descriptions = [ad.description1, ad.description2].filter(Boolean);
            return (
              <article key={ad._id} className="adcopy-card">
                <header className="adcopy-card-head">
                  <span className="adcopy-badge">Ad</span>
                  <span className="adcopy-domain" title={ad.finalUrl}>{displayUrl(ad.finalUrl)}</span>
                  <div className="cell-actions adcopy-actions">
                    <button className="camp-action-btn camp-action-edit" onClick={() => openEdit(ad)} aria-label={`Edit ${ad.headline1}`}>
                      <Pencil size={14} />
                    </button>
                    <button className="camp-action-btn camp-action-delete" onClick={() => setPendingDelete(ad)} aria-label={`Delete ${ad.headline1}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </header>

                {/* Rendered the way Google joins headlines in a live search ad,
                    so the copy can be judged as it will actually appear. */}
                <h3 className="adcopy-headline">
                  {headlines.map((h, i) => (
                    <span key={i}>
                      {i > 0 && <span className="adcopy-sep"> | </span>}
                      {h}
                    </span>
                  ))}
                </h3>

                <p className="adcopy-desc">{descriptions.join(' ')}</p>

                {/* Shown inline, not just on hover: a rejection is only
                    actionable once you can read what Google objected to. */}
                {ad.syncState === 'failed' && ad.syncError && (
                  <p className="adcopy-error">{ad.syncError}</p>
                )}

                <footer className="adcopy-card-foot">
                  {/* Whether Google actually has this ad — saving locally and
                      being live in Google Ads are different things. */}
                  <SyncBadge state={ad.syncState} error={ad.syncError} />
                  <span className="adcopy-meta">
                    {headlines.length} headline{headlines.length > 1 ? 's' : ''} ·{' '}
                    {descriptions.length} description{descriptions.length > 1 ? 's' : ''}
                  </span>
                  <a href={ad.finalUrl} target="_blank" rel="noreferrer noopener" className="adcopy-link">
                    <ExternalLink size={13} /> Open
                  </a>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close-btn" onClick={() => setShowModal(false)} aria-label="Close">
              <X size={16} />
            </button>
            <h3>{editing ? 'Edit Ad Copy' : 'Add Ad Copy'}</h3>

            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <label className="field">
                  <span>Headline 1 *</span>
                  <input value={form.headline1} onChange={setField('headline1')} maxLength={LIMITS.headline} autoFocus required />
                </label>
                <label className="field">
                  <span>Headline 2 *</span>
                  <input value={form.headline2} onChange={setField('headline2')} maxLength={LIMITS.headline} required />
                </label>
              </div>

              {/* Google requires at least 3 headlines and 2 descriptions for a
                  responsive search ad, so all of these are mandatory — an ad
                  short of them saves locally but is rejected by Google Ads. */}
              <label className="field">
                <span>Headline 3 *</span>
                <input value={form.headline3} onChange={setField('headline3')} maxLength={LIMITS.headline} required />
              </label>

              <label className="field">
                <span>Description 1 *</span>
                <textarea rows={2} value={form.description1} onChange={setField('description1')} maxLength={LIMITS.description} required />
              </label>

              <label className="field">
                <span>Description 2 *</span>
                <textarea rows={2} value={form.description2} onChange={setField('description2')} maxLength={LIMITS.description} required />
                <span className="field-hint">Google Ads needs 3 headlines and 2 descriptions to accept the ad.</span>
              </label>

              <label className="field">
                <span>Final URL *</span>
                <input type="url" placeholder="https://example.com/landing" value={form.finalUrl} onChange={setField('finalUrl')} required />
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
          title="Delete Ad Copy"
          message={`Delete the ad copy "${pendingDelete.headline1}"?`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
