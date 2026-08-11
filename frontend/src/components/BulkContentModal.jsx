import { useState } from 'react';
import { Layers, X, Plus, Trash2 } from 'lucide-react';

const MATCH_TYPES = [
  { value: 'broad', label: 'Broad' },
  { value: 'phrase', label: 'Phrase' },
  { value: 'exact', label: 'Exact' },
];

// Google Ads enforces these server-side; mirroring them catches the problem
// while typing rather than after submitting to every campaign.
const LIMITS = { headline: 30, description: 90 };

const emptyAd = () => ({
  headline1: '',
  headline2: '',
  headline3: '',
  description1: '',
  description2: '',
  finalUrl: '',
});

/**
 * Add the same keywords and ad copies to every selected campaign in one pass.
 *
 * Both halves are optional — filling in only keywords, or only an ad copy, is
 * a valid submission. Keywords are entered one per line so a pasted list works
 * without any per-row UI.
 */
export default function BulkContentModal({ campaigns, onSubmit, onCancel, submitting }) {
  const [keywordText, setKeywordText] = useState('');
  const [matchType, setMatchType] = useState('broad');
  const [isNegative, setIsNegative] = useState(false);
  const [ads, setAds] = useState([emptyAd()]);
  const [error, setError] = useState('');

  const keywordLines = keywordText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // An ad counts only once its required fields are filled, so a blank starter
  // row never blocks a keywords-only submission.
  const filledAds = ads.filter(
    (a) => a.headline1.trim() && a.headline2.trim() && a.description1.trim() && a.finalUrl.trim()
  );

  const setAdField = (i, field) => (e) =>
    setAds((prev) => prev.map((a, idx) => (idx === i ? { ...a, [field]: e.target.value } : a)));

  const addAd = () => setAds((prev) => [...prev, emptyAd()]);
  const removeAd = (i) => setAds((prev) => prev.filter((_, idx) => idx !== i));

  const partiallyFilled = ads.some(
    (a) =>
      Object.values(a).some((v) => v.trim()) &&
      !(a.headline1.trim() && a.headline2.trim() && a.description1.trim() && a.finalUrl.trim())
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!keywordLines.length && !filledAds.length) {
      setError('Enter at least one keyword or a complete ad copy.');
      return;
    }
    if (partiallyFilled) {
      setError('An ad copy needs Headline 1, Headline 2, Description 1 and a Final URL — or leave it empty.');
      return;
    }

    try {
      await onSubmit({
        keywords: keywordLines.map((keyword) => ({ keyword, matchType, isNegative })),
        ads: filledAds,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to apply to the selected campaigns');
    }
  };

  const totalKeywords = keywordLines.length * campaigns.length;
  const totalAds = filledAds.length * campaigns.length;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card af-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" onClick={onCancel} aria-label="Close">
          <X size={16} />
        </button>

        <div className="af-head">
          <div className="af-head-icon">
            <Layers size={20} />
          </div>
          <div>
            <h3>Add Keywords &amp; Ad Copies</h3>
            <p>Applied to all {campaigns.length} selected campaign{campaigns.length > 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="af-divider" />

        {error && <div className="error-banner">{error}</div>}

        <div className="bulk-targets">
          {campaigns.slice(0, 6).map((c) => (
            <span key={c._id} className="bulk-target-chip">{c.campaignName}</span>
          ))}
          {campaigns.length > 6 && <span className="bulk-target-chip">+{campaigns.length - 6} more</span>}
        </div>

        <form onSubmit={handleSubmit}>
          <section className="bulk-section">
            <h4>Keywords</h4>
            <textarea
              className="bulk-textarea"
              rows={5}
              placeholder={'One per line:\nbrand awareness\ndigital marketing\nonline advertising'}
              value={keywordText}
              onChange={(e) => setKeywordText(e.target.value)}
            />

            <div className="af-row">
              <label className="field">
                <span>Match Type</span>
                <select value={matchType} onChange={(e) => setMatchType(e.target.value)}>
                  {MATCH_TYPES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Keyword Type</span>
                <select value={isNegative ? 'yes' : 'no'} onChange={(e) => setIsNegative(e.target.value === 'yes')}>
                  <option value="no">Positive — target these terms</option>
                  <option value="yes">Negative — exclude these terms</option>
                </select>
              </label>
            </div>
          </section>

          <div className="af-divider bulk-inner-divider" />

          <section className="bulk-section">
            <div className="bulk-section-head">
              <h4>Ad Copies</h4>
              <button type="button" className="btn-secondary bulk-add-ad" onClick={addAd}>
                <Plus size={14} /> Add another
              </button>
            </div>

            {ads.map((ad, i) => (
              <div key={i} className="bulk-ad-card">
                {ads.length > 1 && (
                  <button
                    type="button"
                    className="camp-action-btn camp-action-delete bulk-ad-remove"
                    onClick={() => removeAd(i)}
                    aria-label={`Remove ad copy ${i + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}

                <div className="af-row">
                  <label className="field">
                    <span>Headline 1</span>
                    <input value={ad.headline1} onChange={setAdField(i, 'headline1')} maxLength={LIMITS.headline} />
                  </label>
                  <label className="field">
                    <span>Headline 2</span>
                    <input value={ad.headline2} onChange={setAdField(i, 'headline2')} maxLength={LIMITS.headline} />
                  </label>
                </div>

                <div className="af-row">
                  <label className="field">
                    <span>Headline 3</span>
                    <input value={ad.headline3} onChange={setAdField(i, 'headline3')} maxLength={LIMITS.headline} />
                  </label>
                  <label className="field">
                    <span>Final URL</span>
                    <input
                      type="url"
                      value={ad.finalUrl}
                      onChange={setAdField(i, 'finalUrl')}
                      placeholder="https://example.com"
                    />
                  </label>
                </div>

                <div className="af-row">
                  <label className="field">
                    <span>Description 1</span>
                    <textarea rows={2} value={ad.description1} onChange={setAdField(i, 'description1')} maxLength={LIMITS.description} />
                  </label>
                  <label className="field">
                    <span>Description 2</span>
                    <textarea rows={2} value={ad.description2} onChange={setAdField(i, 'description2')} maxLength={LIMITS.description} />
                  </label>
                </div>
              </div>
            ))}
          </section>

          <div className="af-preview">
            <span className="af-preview-icon">
              <Plus size={14} />
            </span>
            <span>
              <strong>{totalKeywords}</strong> keyword{totalKeywords === 1 ? '' : 's'} and{' '}
              <strong>{totalAds}</strong> ad cop{totalAds === 1 ? 'y' : 'ies'} across{' '}
              <strong>{campaigns.length}</strong> campaign{campaigns.length > 1 ? 's' : ''}
              <span className="af-preview-dim">
                {' '}({keywordLines.length} keyword{keywordLines.length === 1 ? '' : 's'} &times;{' '}
                {filledAds.length} ad{filledAds.length === 1 ? '' : 's'} each)
              </span>
            </span>
          </div>

          <div className="af-divider af-divider-bottom" />

          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="refresh-btn af-submit" disabled={submitting}>
              {submitting ? 'Applying…' : `Apply to ${campaigns.length} Campaign${campaigns.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
