import React, { useEffect, useState } from 'react';
import { RefreshCw, Search, Monitor, Smartphone, Tablet, Globe, X, MapPin, Megaphone, Key, Trash2, Pause, Play, Pencil, Check, XCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { accountsApi } from '../services/api';
import { useToast } from '../context/ToastContext';

const ACC_PAGE_SIZE = 15;
const CAMP_PAGE_SIZE = 20;

const GEO_NAMES = {
  '2840': 'United States', '2356': 'India', '2826': 'United Kingdom', '2784': 'UAE',
  '2682': 'Saudi Arabia', '2276': 'Germany', '2250': 'France', '2036': 'Australia',
  '2124': 'Canada', '2702': 'Singapore', '2392': 'Japan', '2076': 'Brazil',
  '2586': 'Pakistan', '2818': 'Egypt', '2634': 'Qatar', '2048': 'Bahrain',
  '2414': 'Kuwait', '2512': 'Oman', '2710': 'South Africa', '2458': 'Malaysia',
  '2380': 'Italy', '2724': 'Spain', '2528': 'Netherlands', '2756': 'Switzerland',
  '2792': 'Turkey', '2764': 'Thailand', '2360': 'Indonesia', '2704': 'Vietnam',
  '2608': 'Philippines', '2410': 'South Korea', '2158': 'Taiwan', '2344': 'Hong Kong',
  '2484': 'Mexico', '2032': 'Argentina', '2170': 'Colombia', '2152': 'Chile',
  '2604': 'Peru', '2862': 'Venezuela', '2218': 'Ecuador', '2858': 'Uruguay',
  '2068': 'Bolivia', '2600': 'Paraguay', '2188': 'Costa Rica', '2591': 'Panama',
  '2320': 'Guatemala', '2340': 'Honduras', '2222': 'El Salvador', '2558': 'Nicaragua',
  '2214': 'Dominican Rep.', '2630': 'Puerto Rico', '2388': 'Jamaica',
  '2643': 'Russia', '2804': 'Ukraine', '2616': 'Poland', '2203': 'Czech Rep.',
  '2642': 'Romania', '2348': 'Hungary', '2100': 'Bulgaria', '2191': 'Croatia',
  '2688': 'Serbia', '2703': 'Slovakia', '2705': 'Slovenia', '2008': 'Albania',
  '2807': 'N. Macedonia', '2070': 'Bosnia', '2499': 'Montenegro',
  '2578': 'Norway', '2752': 'Sweden', '2208': 'Denmark', '2246': 'Finland',
  '2352': 'Iceland', '2372': 'Ireland', '2620': 'Portugal', '2040': 'Austria',
  '2056': 'Belgium', '2442': 'Luxembourg', '2300': 'Greece', '2196': 'Cyprus',
  '2470': 'Malta',
  '2376': 'Israel', '2364': 'Iran', '2368': 'Iraq', '2400': 'Jordan',
  '2422': 'Lebanon', '2760': 'Syria', '2887': 'Yemen', '2275': 'Palestine',
  '2404': 'Kenya', '2566': 'Nigeria', '2288': 'Ghana', '2800': 'Uganda',
  '2834': 'Tanzania', '2231': 'Ethiopia', '2894': 'Zambia', '2716': 'Zimbabwe',
  '2508': 'Mozambique', '2024': 'Angola', '2180': 'DR Congo', '2120': 'Cameroon',
  '2384': 'Ivory Coast', '2686': 'Senegal',
  '2156': 'China', '2356': 'India', '2050': 'Bangladesh', '2144': 'Sri Lanka',
  '2524': 'Nepal', '2104': 'Myanmar', '2116': 'Cambodia', '2418': 'Laos',
  '2496': 'Mongolia', '2398': 'Kazakhstan', '2860': 'Uzbekistan',
  '2554': 'New Zealand', '2242': 'Fiji', '2598': 'Papua New Guinea',
  '21177': 'New York', '200770': 'Los Angeles', '21167': 'Chicago',
  '21176': 'Houston', '21174': 'Phoenix', '21175': 'Philadelphia',
  '21171': 'San Antonio', '21172': 'San Diego', '21173': 'Dallas',
  '21168': 'San Jose', '21169': 'Austin', '21170': 'Jacksonville',
  '1014895': 'San Francisco', '1014221': 'Seattle', '1014226': 'Denver',
  '1014129': 'Boston', '1014127': 'Atlanta', '1014212': 'Miami',
  '1014051': 'Washington DC', '1014093': 'Detroit', '1014191': 'Minneapolis',
};

const DEVICE_ICONS = {
  DESKTOP: <Monitor size={13} />,
  MOBILE: <Smartphone size={13} />,
  TABLET: <Tablet size={13} />,
  CONNECTED_TV: <Monitor size={13} />,
  OTHER: <Monitor size={13} />,
  UNKNOWN: <Monitor size={13} />,
};

const DEVICE_LABELS = {
  DESKTOP: 'Desktop',
  MOBILE: 'Mobile',
  TABLET: 'Tablet',
  CONNECTED_TV: 'TV',
  OTHER: 'Other',
  UNKNOWN: 'Unknown',
};

const DEVICE_COLORS = {
  DESKTOP: '#4f46e5', MOBILE: '#10b981', TABLET: '#f59e0b',
  CONNECTED_TV: '#8b5cf6', OTHER: '#6b7280', UNKNOWN: '#6b7280',
};

const GEO_OPTIONS = Object.entries(GEO_NAMES)
  .filter(([id]) => id.length === 4)
  .map(([id, label]) => ({ id, label }))
  .sort((a, b) => a.label.localeCompare(b.label));

function CountryModal({ geo, campaignName, onClose, onSave }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState(() => new Set((geo || []).map((g) => g.countryId)));
  const hasGeo = geo && geo.length > 0;

  const filtered = GEO_OPTIONS.filter((g) =>
    g.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleCountry = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const geoMap = {};
  (geo || []).forEach((g) => { geoMap[g.countryId] = g; });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}><X size={18} /></button>
        <div className="camp-modal-header">
          <div className="camp-modal-icon camp-modal-icon-geo"><Globe size={20} /></div>
          <div>
            <h3 className="camp-modal-title">Country / Locations</h3>
            <p className="camp-modal-sub">{campaignName}</p>
          </div>
        </div>

        {hasGeo && (
          <div className="camp-modal-section">
            <div className="camp-modal-section-title">Active Locations ({geo.length})</div>
            <div className="camp-modal-geo-list">
              {geo.map((g, i) => (
                <div key={g.countryId || i} className="camp-modal-geo-item camp-modal-geo-active">
                  <MapPin size={14} className="camp-modal-geo-pin" />
                  <span className="camp-modal-geo-name">{GEO_NAMES[g.countryId] || `ID: ${g.countryId}`}</span>
                  {(g.clicks > 0 || g.impressions > 0) && (
                    <div className="camp-modal-geo-stats">
                      {g.clicks > 0 && <span>{g.clicks} clicks</span>}
                      {g.impressions > 0 && <span>{g.impressions} imp</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="camp-modal-section">
          <div className="camp-modal-section-title">
            {hasGeo ? 'All Countries' : 'Select Countries'}
            {selected.size > 0 && <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 700, fontSize: 11 }}>({selected.size} selected)</span>}
          </div>
          <input
            type="text"
            placeholder="Search country..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="camp-modal-search"
            autoFocus
          />
          <div className="camp-modal-geo-grid">
            {filtered.map((g) => (
              <span
                key={g.id}
                className={`camp-modal-geo-chip ${selected.has(g.id) ? 'active' : ''}`}
                onClick={() => toggleCountry(g.id)}
              >
                {selected.has(g.id) && <span className="camp-modal-geo-check">✓</span>}
                {g.label}
              </span>
            ))}
            {filtered.length === 0 && <span className="camp-modal-empty">No country found</span>}
          </div>
        </div>

        <div className="camp-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={() => { onSave(Array.from(selected)); onClose(); }}>
            Save ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}

const DEVICE_TYPES = ['DESKTOP', 'MOBILE', 'TABLET'];

function DeviceModal({ devices, campaignName, onClose, customerId, campaignId, mccId, onMutate, onOptimistic }) {
  const totalClicks = (devices || []).reduce((s, d) => s + (d.clicks || 0), 0);
  const totalImpressions = (devices || []).reduce((s, d) => s + (d.impressions || 0), 0);

  const [bidModifiers, setBidModifiers] = useState(() => {
    const init = {};
    DEVICE_TYPES.forEach((dt) => {
      const found = (devices || []).find((d) => d.device === dt);
      init[dt] = found?.bidModifier != null ? Math.round((found.bidModifier - 1) * 100) : 0;
    });
    return init;
  });
  const [busy, setBusy] = useState(null);
  const [saved, setSaved] = useState({});

  const handleBidChange = (deviceType, value) => {
    const num = Math.max(-100, Math.min(900, parseInt(value, 10) || 0));
    setBidModifiers((prev) => ({ ...prev, [deviceType]: num }));
  };

  const handleApply = async (deviceType) => {
    setBusy(deviceType);
    try {
      const modifier = 1 + bidModifiers[deviceType] / 100;
      await accountsApi.mutateDeviceBid(customerId, campaignId, deviceType, modifier, mccId);
      onOptimistic((prev) => {
        const exists = prev.find((d) => d.device === deviceType);
        if (exists) return prev.map((d) => d.device === deviceType ? { ...d, bidModifier: modifier } : d);
        return [...prev, { device: deviceType, clicks: 0, impressions: 0, spend: 0, conversions: 0, ctr: 0, bidModifier: modifier }];
      });
      setSaved((prev) => ({ ...prev, [deviceType]: 'saved' }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [deviceType]: false })), 2000);
    } catch (e) { console.error(e); }
    setBusy(null);
  };

  const handleRemove = async (deviceType) => {
    setBusy(deviceType + '-rm');
    try {
      await accountsApi.mutateDeviceBid(customerId, campaignId, deviceType, null, mccId, 'remove');
      setBidModifiers((prev) => ({ ...prev, [deviceType]: 0 }));
      onOptimistic((prev) => prev.map((d) => d.device === deviceType ? { ...d, bidModifier: 1.0 } : d));
      setSaved((prev) => ({ ...prev, [deviceType]: 'removed' }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [deviceType]: false })), 2000);
    } catch (e) { console.error(e); }
    setBusy(null);
  };

  const hasModifier = (dt) => {
    const found = (devices || []).find((d) => d.device === dt);
    return found?.bidModifier != null && Math.abs(found.bidModifier - 1.0) > 0.001;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}><X size={18} /></button>
        <div className="camp-modal-header">
          <div className="camp-modal-icon camp-modal-icon-device"><Monitor size={20} /></div>
          <div>
            <h3 className="camp-modal-title">Device Breakdown</h3>
            <p className="camp-modal-sub">{campaignName}</p>
          </div>
        </div>

        {(() => {
          const activeDevices = (devices || []).filter((d) => (d.clicks || 0) > 0 || (d.impressions || 0) > 0 || (d.bidModifier != null && Math.abs(d.bidModifier - 1.0) > 0.001));
          return activeDevices.length === 0 ? (
            <div className="camp-modal-empty-state">No device data or bid adjustments for this campaign.</div>
          ) : (
            <div className="camp-modal-section">
              <div className="camp-modal-section-title">Performance by Device</div>
              <div className="device-modal-cards">
                {activeDevices.map((d) => {
                  const clickPct = totalClicks ? ((d.clicks / totalClicks) * 100).toFixed(1) : '0.0';
                  const bidPct = d.bidModifier != null ? Math.round((d.bidModifier - 1) * 100) : 0;
                  const hasBid = d.bidModifier != null && Math.abs(d.bidModifier - 1.0) > 0.001;
                  return (
                    <div key={d.device} className="device-modal-card">
                      <div className="device-modal-card-icon" style={{ color: DEVICE_COLORS[d.device] || '#6b7280', background: (DEVICE_COLORS[d.device] || '#6b7280') + '18' }}>
                        {DEVICE_ICONS[d.device]}
                      </div>
                      <div className="device-modal-card-info">
                        <div className="device-modal-card-name">{DEVICE_LABELS[d.device] || d.device}</div>
                        <div className="device-modal-card-stats">
                          <span><strong>{d.clicks || 0}</strong> clicks</span>
                          <span>{d.impressions || 0} imp</span>
                          {hasBid && <span className="device-bid-tag" style={{ color: bidPct >= 0 ? '#10b981' : '#ef4444' }}>Bid: {bidPct > 0 ? '+' : ''}{bidPct}%</span>}
                        </div>
                      </div>
                      <div className="device-modal-card-bar-wrap">
                        <div className="device-modal-card-bar" style={{ width: `${clickPct}%`, background: DEVICE_COLORS[d.device] || '#6b7280' }} />
                      </div>
                      <div className="device-modal-card-pct">{clickPct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <div className="camp-modal-section">
          <div className="camp-modal-section-title">Device Bid Adjustments</div>
          <div className="device-bid-grid">
            {DEVICE_TYPES.map((dt) => (
              <div key={dt} className="device-bid-row">
                <div className="device-bid-icon" style={{ color: DEVICE_COLORS[dt], background: DEVICE_COLORS[dt] + '18' }}>
                  {DEVICE_ICONS[dt]}
                </div>
                <span className="device-bid-label">{DEVICE_LABELS[dt]}</span>
                <div className="device-bid-slider-wrap">
                  <input
                    type="range"
                    min={-100}
                    max={900}
                    value={bidModifiers[dt]}
                    onChange={(e) => handleBidChange(dt, e.target.value)}
                    className="device-bid-slider"
                  />
                </div>
                <div className="device-bid-input-wrap">
                  <input
                    type="number"
                    min={-100}
                    max={900}
                    value={bidModifiers[dt]}
                    onChange={(e) => handleBidChange(dt, e.target.value)}
                    className="device-bid-input"
                  />
                  <span className="device-bid-pct">%</span>
                </div>
                <button
                  className={`device-bid-apply ${saved[dt] === 'saved' ? 'saved' : ''}`}
                  disabled={!!busy}
                  onClick={() => handleApply(dt)}
                >
                  {busy === dt ? '...' : saved[dt] === 'saved' ? '✓' : 'Apply'}
                </button>
                {hasModifier(dt) && (
                  <button
                    className="device-bid-apply device-bid-remove"
                    disabled={!!busy}
                    onClick={() => handleRemove(dt)}
                    title="Reset to default (0%)"
                  >
                    {busy === dt + '-rm' ? '...' : saved[dt] === 'removed' ? '✓' : 'Reset'}
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="device-bid-hint">
            Set to 0% for default. Use -100% to exclude a device. Positive values increase bids.
          </p>
        </div>

        <div className="camp-modal-section">
          <div className="camp-modal-section-title">Summary</div>
          <div className="device-modal-summary">
            <div className="device-modal-summary-item">
              <span className="device-modal-summary-label">Total Clicks</span>
              <span className="device-modal-summary-val">{totalClicks.toLocaleString()}</span>
            </div>
            <div className="device-modal-summary-item">
              <span className="device-modal-summary-label">Total Impressions</span>
              <span className="device-modal-summary-val">{totalImpressions.toLocaleString()}</span>
            </div>
            <div className="device-modal-summary-item">
              <span className="device-modal-summary-label">Devices</span>
              <span className="device-modal-summary-val">{(devices || []).filter((d) => (d.clicks || 0) > 0 || (d.impressions || 0) > 0 || (d.bidModifier != null && Math.abs(d.bidModifier - 1.0) > 0.001)).length}</span>
            </div>
            <div className="device-modal-summary-item">
              <span className="device-modal-summary-label">Bid Adjustments</span>
              <span className="device-modal-summary-val">{(devices || []).filter((d) => d.bidModifier != null && Math.abs(d.bidModifier - 1.0) > 0.001).length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdsModal({ ads, campaignName, onClose, customerId, mccId, onMutate, onOptimistic }) {
  const [busy, setBusy] = useState(null);
  const [editingAd, setEditingAd] = useState(null);
  const [editHeadlines, setEditHeadlines] = useState([]);
  const [editDescriptions, setEditDescriptions] = useState([]);

  const handleAction = async (ad, action) => {
    if (!ad.adGroupId || !ad.adId) return;
    setBusy(`${ad.adId}-${action}`);
    try {
      await accountsApi.mutateAd(customerId, ad.adGroupId, ad.adId, action, mccId);
      if (action === 'remove') {
        onOptimistic((prev) => prev.filter((a) => a.adId !== ad.adId));
      } else {
        onOptimistic((prev) => prev.map((a) => a.adId === ad.adId ? { ...a, status: action === 'pause' ? 'PAUSED' : 'ENABLED' } : a));
      }
    } catch (e) { console.error(e); }
    setBusy(null);
  };

  const startEdit = (ad) => {
    setEditingAd(ad.adId);
    setEditHeadlines([...(ad.headlines || [])]);
    setEditDescriptions([...(ad.descriptions || [])]);
  };

  const cancelEdit = () => { setEditingAd(null); setEditHeadlines([]); setEditDescriptions([]); };

  const saveEdit = async (ad) => {
    if (!ad.adGroupId || !ad.adId) return;
    const hl = editHeadlines.filter((h) => h.trim());
    const desc = editDescriptions.filter((d) => d.trim());
    if (hl.length < 3) return alert('At least 3 headlines required');
    if (desc.length < 2) return alert('At least 2 descriptions required');
    setBusy(`${ad.adId}-edit`);
    try {
      await accountsApi.mutateAd(customerId, ad.adGroupId, ad.adId, 'edit', mccId, { headlines: hl, descriptions: desc, finalUrls: ad.finalUrls || ['https://example.com'] });
      onOptimistic((prev) => prev.map((a) => a.adId === ad.adId ? { ...a, headlines: hl, descriptions: desc } : a));
      setEditingAd(null);
    } catch (e) { console.error(e); }
    setBusy(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}><X size={18} /></button>
        <div className="camp-modal-header">
          <div className="camp-modal-icon camp-modal-icon-ads"><Megaphone size={20} /></div>
          <div>
            <h3 className="camp-modal-title">Ads ({ads ? ads.length : 0})</h3>
            <p className="camp-modal-sub">{campaignName}</p>
          </div>
        </div>
        {(!ads || !ads.length) ? (
          <div className="camp-modal-empty-state">No ads found for this campaign.</div>
        ) : (
          <div className="camp-modal-ads-list">
            {ads.map((ad, i) => (
              <div key={ad.adId || i} className="camp-modal-ad-card">
                <div className="camp-modal-ad-top">
                  <span className={`status-badge status-${ad.status === 'ENABLED' ? 'healthy' : 'neutral'}`}>
                    {ad.status === 'ENABLED' ? 'Active' : 'Paused'}
                  </span>
                  <span className="camp-modal-ad-clicks">{ad.clicks} clicks</span>
                  {ad.impressions > 0 && <span className="camp-modal-ad-imp">{ad.impressions} imp</span>}
                  <div className="camp-modal-actions">
                    <button className="camp-action-btn camp-action-edit" title="Edit" disabled={!!busy} onClick={() => startEdit(ad)}>
                      <Pencil size={13} />
                    </button>
                    {ad.status === 'ENABLED' ? (
                      <button className="camp-action-btn camp-action-pause" title="Pause" disabled={!!busy} onClick={() => handleAction(ad, 'pause')}>
                        <Pause size={13} />
                      </button>
                    ) : (
                      <button className="camp-action-btn camp-action-enable" title="Enable" disabled={!!busy} onClick={() => handleAction(ad, 'enable')}>
                        <Play size={13} />
                      </button>
                    )}
                    <button className="camp-action-btn camp-action-delete" title="Remove" disabled={!!busy} onClick={() => handleAction(ad, 'remove')}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {editingAd === ad.adId ? (
                  <div className="camp-modal-edit-form">
                    <div className="camp-modal-edit-label">Headlines (min 3, max 15)</div>
                    {editHeadlines.map((h, j) => (
                      <div key={j} className="camp-modal-edit-row">
                        <input type="text" value={h} maxLength={30} onChange={(e) => { const arr = [...editHeadlines]; arr[j] = e.target.value; setEditHeadlines(arr); }} className="camp-modal-edit-input" placeholder={`Headline ${j + 1}`} />
                        {editHeadlines.length > 3 && <button className="camp-action-btn camp-action-delete" onClick={() => setEditHeadlines(editHeadlines.filter((_, k) => k !== j))}><XCircle size={13} /></button>}
                      </div>
                    ))}
                    {editHeadlines.length < 15 && <button className="camp-modal-edit-add" onClick={() => setEditHeadlines([...editHeadlines, ''])}>+ Add Headline</button>}
                    <div className="camp-modal-edit-label" style={{ marginTop: 10 }}>Descriptions (min 2, max 4)</div>
                    {editDescriptions.map((d, j) => (
                      <div key={j} className="camp-modal-edit-row">
                        <input type="text" value={d} maxLength={90} onChange={(e) => { const arr = [...editDescriptions]; arr[j] = e.target.value; setEditDescriptions(arr); }} className="camp-modal-edit-input" placeholder={`Description ${j + 1}`} />
                        {editDescriptions.length > 2 && <button className="camp-action-btn camp-action-delete" onClick={() => setEditDescriptions(editDescriptions.filter((_, k) => k !== j))}><XCircle size={13} /></button>}
                      </div>
                    ))}
                    {editDescriptions.length < 4 && <button className="camp-modal-edit-add" onClick={() => setEditDescriptions([...editDescriptions, ''])}>+ Add Description</button>}
                    <div className="camp-modal-edit-actions">
                      <button className="camp-modal-edit-save" disabled={!!busy} onClick={() => saveEdit(ad)}>{busy === `${ad.adId}-edit` ? 'Saving...' : 'Save'}</button>
                      <button className="camp-modal-edit-cancel" onClick={cancelEdit}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {ad.headlines && ad.headlines.length > 0 && (
                      <div className="camp-modal-ad-headlines">
                        {ad.headlines.map((h, j) => (
                          <span key={j} className="camp-modal-ad-headline">{h}</span>
                        ))}
                      </div>
                    )}
                    {ad.descriptions && ad.descriptions.length > 0 && (
                      <div className="camp-modal-ad-descs">
                        {ad.descriptions.map((d, j) => (
                          <p key={j} className="camp-modal-ad-desc">{d}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KeywordsModal({ keywords, campaignName, onClose, customerId, mccId, onOptimistic }) {
  const [busy, setBusy] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingKw, setEditingKw] = useState(null);
  const [editText, setEditText] = useState('');
  const [editMatch, setEditMatch] = useState('BROAD');

  const filtered = (keywords || []).filter((k) =>
    !searchTerm.trim() || k.keyword?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAction = async (kw, action) => {
    if (!kw.adGroupId || !kw.criterionId) return;
    setBusy(`${kw.criterionId}-${action}`);
    try {
      await accountsApi.mutateKeyword(customerId, kw.adGroupId, kw.criterionId, action, mccId);
      if (action === 'remove') {
        onOptimistic((prev) => prev.filter((k) => k.criterionId !== kw.criterionId));
      } else {
        onOptimistic((prev) => prev.map((k) => k.criterionId === kw.criterionId ? { ...k, status: action === 'pause' ? 'PAUSED' : 'ENABLED' } : k));
      }
    } catch (e) { console.error(e); }
    setBusy(null);
  };

  const startEdit = (kw) => {
    setEditingKw(kw.criterionId);
    setEditText(kw.keyword || '');
    setEditMatch(kw.matchType || 'BROAD');
  };

  const cancelEdit = () => { setEditingKw(null); setEditText(''); setEditMatch('BROAD'); };

  const saveEdit = async (kw) => {
    if (!editText.trim()) return;
    if (!kw.adGroupId || !kw.criterionId) return;
    setBusy(`${kw.criterionId}-edit`);
    try {
      await accountsApi.mutateKeyword(customerId, kw.adGroupId, kw.criterionId, 'edit', mccId, { keyword: editText.trim(), matchType: editMatch });
      onOptimistic((prev) => prev.map((k) => k.criterionId === kw.criterionId ? { ...k, keyword: editText.trim(), matchType: editMatch } : k));
      setEditingKw(null);
    } catch (e) { console.error(e); }
    setBusy(null);
  };

  const MATCH_LABELS = { BROAD: 'Broad', PHRASE: 'Phrase', EXACT: 'Exact' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 750 }}>
        <button className="modal-close-btn" onClick={onClose}><X size={18} /></button>
        <div className="camp-modal-header">
          <div className="camp-modal-icon camp-modal-icon-keyword"><Key size={20} /></div>
          <div>
            <h3 className="camp-modal-title">Keywords ({keywords ? keywords.length : 0})</h3>
            <p className="camp-modal-sub">{campaignName}</p>
          </div>
        </div>

        {keywords && keywords.length > 5 && (
          <input
            type="text"
            placeholder="Search keywords..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="camp-modal-search"
          />
        )}

        {(!keywords || !keywords.length) ? (
          <div className="camp-modal-empty-state">No keywords found for this campaign.</div>
        ) : (
          <div className="table-wrapper" style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Match</th>
                  <th>Ad Group</th>
                  <th>Status</th>
                  <th>Clicks</th>
                  <th>Impr.</th>
                  <th>Cost</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((kw, i) => (
                  <tr key={kw.criterionId || i}>
                    <td style={{ fontWeight: 600 }}>
                      {editingKw === kw.criterionId ? (
                        <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)} className="camp-modal-edit-input" style={{ width: '100%', minWidth: 120 }} />
                      ) : (kw.keyword || '—')}
                    </td>
                    <td>
                      {editingKw === kw.criterionId ? (
                        <select value={editMatch} onChange={(e) => setEditMatch(e.target.value)} className="camp-modal-edit-input" style={{ padding: '3px 6px' }}>
                          <option value="BROAD">Broad</option>
                          <option value="PHRASE">Phrase</option>
                          <option value="EXACT">Exact</option>
                        </select>
                      ) : (
                        <span className={`match-badge match-${(kw.matchType || '').toLowerCase()}`}>
                          {MATCH_LABELS[kw.matchType] || kw.matchType || '—'}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{kw.adGroupName || '—'}</td>
                    <td>
                      <span className={`status-badge status-${kw.status === 'ENABLED' ? 'healthy' : 'warning'}`}>
                        {kw.status === 'ENABLED' ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td>{kw.clicks || 0}</td>
                    <td>{kw.impressions || 0}</td>
                    <td>${(kw.spend || 0).toFixed(2)}</td>
                    <td>
                      <div className="camp-modal-actions">
                        {editingKw === kw.criterionId ? (
                          <>
                            <button className="camp-action-btn camp-action-enable" title="Save" disabled={!!busy} onClick={() => saveEdit(kw)}>
                              {busy === `${kw.criterionId}-edit` ? '...' : <Check size={13} />}
                            </button>
                            <button className="camp-action-btn camp-action-pause" title="Cancel" onClick={cancelEdit}>
                              <XCircle size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="camp-action-btn camp-action-edit" title="Edit" disabled={!!busy} onClick={() => startEdit(kw)}>
                              <Pencil size={13} />
                            </button>
                            {kw.status === 'ENABLED' ? (
                              <button className="camp-action-btn camp-action-pause" title="Pause" disabled={!!busy} onClick={() => handleAction(kw, 'pause')}>
                                <Pause size={13} />
                              </button>
                            ) : (
                              <button className="camp-action-btn camp-action-enable" title="Enable" disabled={!!busy} onClick={() => handleAction(kw, 'enable')}>
                                <Play size={13} />
                              </button>
                            )}
                            <button className="camp-action-btn camp-action-delete" title="Remove" disabled={!!busy} onClick={() => handleAction(kw, 'remove')}>
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="empty-row">No keywords match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GoogleAdsCampaignsPage() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [accPage, setAccPage] = useState(1);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campPage, setCampPage] = useState(1);
  const [error, setError] = useState(null);
  const [extraData, setExtraData] = useState({});
  const [countryModal, setCountryModal] = useState(null);
  const [adsModal, setAdsModal] = useState(null);
  const [deviceModal, setDeviceModal] = useState(null);
  const [keywordsModal, setKeywordsModal] = useState(null);

  useEffect(() => {
    accountsApi
      .googleAds()
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
        setAccounts(data);
      })
      .catch(() => setAccounts([]))
      .finally(() => setAccountsLoading(false));
  }, []);

  const fetchCampaigns = (account) => {
    setSelectedAccount(account);
    setCampaignsLoading(true);
    setError(null);
    setCampaigns([]);
    setCampPage(1);
    setExtraData({});
    accountsApi
      .googleAdsCampaigns(account.customerId, account.managerAccountId)
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setCampaigns(list);
        list.forEach((c) => loadCampaignExtras(account.customerId, c.campaignId, account.managerAccountId));
      })
      .catch((err) => setError(err.response?.data?.message || err.message))
      .finally(() => setCampaignsLoading(false));
  };

  const loadCampaignExtras = async (customerId, campaignId, mccId) => {
    const [devices, ads, geo, keywords] = await Promise.all([
      accountsApi.campaignDevices(customerId, campaignId, mccId).catch(() => []),
      accountsApi.campaignAds(customerId, campaignId, mccId).catch(() => []),
      accountsApi.campaignGeo(customerId, campaignId, mccId).catch(() => []),
      accountsApi.campaignKeywords(customerId, campaignId, mccId).catch(() => []),
    ]);
    setExtraData((prev) => ({ ...prev, [campaignId]: { devices, ads, geo, keywords } }));
  };

  const formatCurrency = (val) => '$' + (val || 0).toFixed(2);

  const filteredAccounts = accounts.filter((acc) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return acc.name?.toLowerCase().includes(term) || acc.customerId?.includes(term);
  });

  const accTotalPages = Math.max(1, Math.ceil(filteredAccounts.length / ACC_PAGE_SIZE));
  const accSafePage = Math.min(accPage, accTotalPages);
  const pagedAccounts = filteredAccounts.slice((accSafePage - 1) * ACC_PAGE_SIZE, accSafePage * ACC_PAGE_SIZE);

  const campTotalPages = Math.max(1, Math.ceil(campaigns.length / CAMP_PAGE_SIZE));
  const campSafePage = Math.min(campPage, campTotalPages);
  const pagedCampaigns = campaigns.slice((campSafePage - 1) * CAMP_PAGE_SIZE, campSafePage * CAMP_PAGE_SIZE);

  return (
    <div className="page">
      <PageHeader
        title="Google Ads Campaigns"
        subtitle={selectedAccount ? `Campaigns for ${selectedAccount.name} (${selectedAccount.customerId})` : 'Select an account to view campaigns'}
      />

      {!selectedAccount ? (
        <>
          <div className="filter-bar">
            <label className="field field-search" style={{ flex: 1 }}>
              <span>Search Account</span>
              <input
                type="text"
                placeholder="Type account name or ID..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setAccPage(1); }}
                autoFocus
              />
            </label>
          </div>

          {accountsLoading ? (
            <LoadingSpinner label="Loading accounts..." />
          ) : (
            <>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Account Name</th>
                      <th>Customer ID</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedAccounts.map((acc, i) => (
                      <tr key={acc.customerId}>
                        <td>{(accSafePage - 1) * ACC_PAGE_SIZE + i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{acc.name || '-'}</td>
                        <td className="info-value mono">{acc.customerId}</td>
                        <td>
                          <button className="refresh-btn" onClick={() => fetchCampaigns(acc)}>
                            <Search size={14} />
                            View Campaigns
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredAccounts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="empty-row">
                          {accounts.length === 0
                            ? 'No accounts found. Sync from Accounts page first.'
                            : 'No accounts match your search.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination page={accSafePage} totalPages={accTotalPages} onPageChange={setAccPage} />
            </>
          )}
        </>
      ) : (
        <>
          <div className="header-btn-group" style={{ marginBottom: 16 }}>
            <button className="refresh-btn" onClick={() => { setSelectedAccount(null); setCampPage(1); }}>
              ← Back to Accounts
            </button>
            <button className="refresh-btn" onClick={() => fetchCampaigns(selectedAccount)} disabled={campaignsLoading}>
              <RefreshCw size={14} className={campaignsLoading ? 'spin' : ''} />
              Refresh
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {campaignsLoading ? (
            <LoadingSpinner label={`Fetching campaigns for ${selectedAccount.name}...`} />
          ) : (
            <>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Campaign Name</th>
                      <th>Status</th>
                      <th>Clicks</th>
                      <th>Impressions</th>
                      <th>CTR</th>
                      <th>Spend</th>
                      <th>CPC</th>
                      <th>Conversions</th>
                      <th>Device</th>
                      <th>Ads</th>
                      <th>Keywords</th>
                      <th>Country</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCampaigns.map((c, i) => {
                      const ext = extraData[c.campaignId];
                      return (
                        <tr key={c.campaignId || i}>
                          <td>{(campSafePage - 1) * CAMP_PAGE_SIZE + i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{c.campaignName}</td>
                          <td>
                            <span className={`status-badge status-${c.status === 'ENABLED' ? 'healthy' : c.status === 'PAUSED' ? 'warning' : 'neutral'}`}>
                              {c.status}
                            </span>
                          </td>
                          <td>{c.clicks || 0}</td>
                          <td>{c.impressions || 0}</td>
                          <td style={{ fontWeight: 600 }}>{(Number(c.ctr || 0) * 100).toFixed(2)}%</td>
                          <td style={{ fontWeight: 600 }}>{formatCurrency(c.spend)}</td>
                          <td>{formatCurrency(c.cpc)}</td>
                          <td>{c.conversions || 0}</td>
                          <td>
                            <button
                              type="button"
                              className="camp-cell-btn camp-cell-btn-device"
                              onClick={() => setDeviceModal({ name: c.campaignName, campaignId: c.campaignId })}
                            >
                              <Monitor size={13} />
                              <span>{(() => { if (!ext?.devices?.length) return '—'; const active = ext.devices.filter((d) => (d.clicks || 0) > 0 || (d.impressions || 0) > 0 || (d.bidModifier != null && Math.abs(d.bidModifier - 1.0) > 0.001)); return active.length ? `${active.length} Devices` : '0 Devices'; })()}</span>
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="camp-cell-btn camp-cell-btn-ads"
                              onClick={() => setAdsModal({ name: c.campaignName, campaignId: c.campaignId })}
                            >
                              <Megaphone size={13} />
                              <span>{ext?.ads ? `${ext.ads.length} Ads` : '—'}</span>
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="camp-cell-btn camp-cell-btn-keyword"
                              onClick={() => setKeywordsModal({ name: c.campaignName, campaignId: c.campaignId })}
                            >
                              <Key size={13} />
                              <span>{ext?.keywords?.length ? `${ext.keywords.length} Keywords` : '—'}</span>
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="camp-cell-btn camp-cell-btn-geo"
                              onClick={() => setCountryModal({ geo: ext?.geo, name: c.campaignName, campaignId: c.campaignId })}
                            >
                              <Globe size={13} />
                              <span>{ext?.geo?.length ? `${ext.geo.length} Locations` : 'Select'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {campaigns.length === 0 && (
                      <tr>
                        <td colSpan={13} className="empty-row">
                          No campaigns found for this account.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination page={campSafePage} totalPages={campTotalPages} onPageChange={setCampPage} />
            </>
          )}
        </>
      )}

      {countryModal && (
        <CountryModal
          geo={countryModal.geo}
          campaignName={countryModal.name}
          onClose={() => setCountryModal(null)}
          onSave={(ids) => {
            const campId = countryModal.campaignId;
            setExtraData((prev) => {
              const existing = prev[campId] || {};
              const oldGeoMap = {};
              (existing.geo || []).forEach((g) => { oldGeoMap[g.countryId] = g; });
              const newGeo = ids.map((id) => oldGeoMap[id] || { countryId: id, clicks: 0, impressions: 0 });
              return { ...prev, [campId]: { ...existing, geo: newGeo } };
            });
            showToast(`${ids.length} countries saved for ${countryModal.name}`, 'success');
          }}
        />
      )}
      {adsModal && (
        <AdsModal
          ads={extraData[adsModal.campaignId]?.ads}
          campaignName={adsModal.name}
          customerId={selectedAccount?.customerId}
          mccId={selectedAccount?.managerAccountId}
          onClose={() => setAdsModal(null)}
          onOptimistic={(updater) => setExtraData((prev) => {
            const old = prev[adsModal.campaignId] || {};
            return { ...prev, [adsModal.campaignId]: { ...old, ads: updater(old.ads || []) } };
          })}
        />
      )}
      {deviceModal && (
        <DeviceModal
          devices={extraData[deviceModal.campaignId]?.devices}
          campaignName={deviceModal.name}
          customerId={selectedAccount?.customerId}
          campaignId={deviceModal.campaignId}
          mccId={selectedAccount?.managerAccountId}
          onClose={() => setDeviceModal(null)}
          onOptimistic={(updater) => setExtraData((prev) => {
            const old = prev[deviceModal.campaignId] || {};
            return { ...prev, [deviceModal.campaignId]: { ...old, devices: updater(old.devices || []) } };
          })}
        />
      )}
      {keywordsModal && (
        <KeywordsModal
          keywords={extraData[keywordsModal.campaignId]?.keywords}
          campaignName={keywordsModal.name}
          customerId={selectedAccount?.customerId}
          mccId={selectedAccount?.managerAccountId}
          onClose={() => setKeywordsModal(null)}
          onOptimistic={(updater) => setExtraData((prev) => {
            const old = prev[keywordsModal.campaignId] || {};
            return { ...prev, [keywordsModal.campaignId]: { ...old, keywords: updater(old.keywords || []) } };
          })}
        />
      )}
    </div>
  );
}
