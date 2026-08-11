import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Search, UsersRound, Eye, MousePointerClick, DollarSign, TrendingUp, ArrowLeft, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import Pagination from '../components/Pagination';
import { accountsApi } from '../services/api';
import { useToast } from '../context/ToastContext';

const ACC_PAGE_SIZE = 15;

const GEO_NAMES = {
  2004:'Afghanistan',2008:'Albania',2012:'Algeria',2020:'Andorra',2024:'Angola',2032:'Argentina',2036:'Australia',
  2040:'Austria',2031:'Azerbaijan',2048:'Bahrain',2050:'Bangladesh',2052:'Barbados',2056:'Belgium',2068:'Bolivia',
  2070:'Bosnia and Herzegovina',2076:'Brazil',2096:'Brunei',2100:'Bulgaria',2116:'Cambodia',2120:'Cameroon',
  2124:'Canada',2152:'Chile',2156:'China',2170:'Colombia',2188:'Costa Rica',2191:'Croatia',2196:'Cyprus',
  2203:'Czech Republic',2208:'Denmark',2214:'Dominican Republic',2218:'Ecuador',2818:'Egypt',2222:'El Salvador',
  2233:'Estonia',2231:'Ethiopia',2246:'Finland',2250:'France',2268:'Georgia',2276:'Germany',2288:'Ghana',
  2300:'Greece',2320:'Guatemala',2332:'Haiti',2340:'Honduras',2344:'Hong Kong',2348:'Hungary',2356:'India',
  2360:'Indonesia',2364:'Iran',2368:'Iraq',2372:'Ireland',2376:'Israel',2380:'Italy',2388:'Jamaica',2392:'Japan',
  2400:'Jordan',2398:'Kazakhstan',2404:'Kenya',2410:'South Korea',2414:'Kuwait',2428:'Latvia',2422:'Lebanon',
  2434:'Libya',2440:'Lithuania',2442:'Luxembourg',2446:'Macao',2458:'Malaysia',2470:'Malta',2484:'Mexico',
  2498:'Moldova',2504:'Morocco',2508:'Mozambique',2104:'Myanmar',2524:'Nepal',2528:'Netherlands',2554:'New Zealand',
  2558:'Nicaragua',2566:'Nigeria',2578:'Norway',2512:'Oman',2586:'Pakistan',2591:'Panama',2600:'Paraguay',
  2604:'Peru',2608:'Philippines',2616:'Poland',2620:'Portugal',2630:'Puerto Rico',2634:'Qatar',2642:'Romania',
  2643:'Russia',2682:'Saudi Arabia',2688:'Serbia',2702:'Singapore',2703:'Slovakia',2705:'Slovenia',2710:'South Africa',
  2724:'Spain',2144:'Sri Lanka',2736:'Sudan',2752:'Sweden',2756:'Switzerland',2158:'Taiwan',2764:'Thailand',
  2780:'Trinidad and Tobago',2788:'Tunisia',2792:'Turkey',2804:'Ukraine',2784:'UAE',2826:'United Kingdom',
  2840:'United States',2858:'Uruguay',2860:'Uzbekistan',2862:'Venezuela',2704:'Vietnam',
  21177:'New York',200770:'Los Angeles',1026920:'Chicago',1026990:'Houston',9254395:'San Francisco',
  1014221:'Miami',1014895:'Dallas',1017031:'Seattle',1017646:'Boston',1018127:'Atlanta',1022471:'Washington DC',
  1023191:'Denver',1025197:'Philadelphia',1013962:'Phoenix',1016367:'San Diego',
};

function resolveExclusionName(raw) {
  const match = raw.match(/geoTargetConstants\/(\d+)/);
  if (match) {
    const id = Number(match[1]);
    return GEO_NAMES[id] || `Location #${id}`;
  }
  return raw;
}

const AGE_LABELS = {
  AGE_RANGE_18_24: '18–24',
  AGE_RANGE_25_34: '25–34',
  AGE_RANGE_35_44: '35–44',
  AGE_RANGE_45_54: '45–54',
  AGE_RANGE_55_64: '55–64',
  AGE_RANGE_65_UP: '65+',
  AGE_RANGE_UNDETERMINED: 'Unknown',
};
const AGE_ORDER = ['AGE_RANGE_18_24', 'AGE_RANGE_25_34', 'AGE_RANGE_35_44', 'AGE_RANGE_45_54', 'AGE_RANGE_55_64', 'AGE_RANGE_65_UP', 'AGE_RANGE_UNDETERMINED'];

const GENDER_LABELS = {
  MALE: 'Male',
  FEMALE: 'Female',
  UNDETERMINED: 'Unknown',
};
const GENDER_ORDER = ['MALE', 'FEMALE', 'UNDETERMINED'];

function DemoBarChart({ items, labels, order, metric, secondMetric }) {
  const sorted = order.map((key) => items.find((i) => i.type === key)).filter(Boolean);
  const maxVal = Math.max(...sorted.map((d) => d[metric] || 0), 1);
  const maxVal2 = secondMetric ? Math.max(...sorted.map((d) => d[secondMetric] || 0), 1) : 0;

  return (
    <div className="gads-bar-chart">
      <div className="gads-bar-y-axis">
        <span>{maxVal.toLocaleString()}</span>
        <span>{Math.round(maxVal / 2).toLocaleString()}</span>
        <span>0</span>
      </div>
      <div className="gads-bar-area">
        <div className="gads-bar-grid">
          <div className="gads-bar-gridline" />
          <div className="gads-bar-gridline" />
          <div className="gads-bar-gridline" />
        </div>
        <div className="gads-bar-columns">
          {sorted.map((d, i) => {
            const pct = ((d[metric] || 0) / maxVal) * 100;
            const pct2 = secondMetric ? ((d[secondMetric] || 0) / maxVal2) * 100 : 0;
            return (
              <div key={i} className="gads-bar-col">
                <div className="gads-bar-col-bars">
                  <div className="gads-bar-fill gads-bar-primary" style={{ height: `${pct}%` }} title={`${labels[d.type] || d.type}: ${(d[metric] || 0).toLocaleString()}`} />
                  {secondMetric && (
                    <div className="gads-bar-fill gads-bar-secondary" style={{ height: `${pct2}%` }} title={`${labels[d.type] || d.type}: ${(d[secondMetric] || 0).toLocaleString()}`} />
                  )}
                </div>
                <div className="gads-bar-label">{labels[d.type] || d.type}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CollapsibleTable({ items, labels, order }) {
  const [open, setOpen] = useState(false);
  const sorted = order.map((key) => items.find((i) => i.type === key)).filter(Boolean);

  return (
    <div className="gads-collapsible">
      <button className="gads-collapsible-toggle" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {open ? 'Hide table' : 'Show table'}
      </button>
      {open && (
        <div className="table-wrapper" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Segment</th>
                <th>Clicks</th>
                <th>Impressions</th>
                <th>CTR</th>
                <th>Cost</th>
                <th>Conversions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{labels[d.type] || d.type}</td>
                  <td>{(d.clicks || 0).toLocaleString()}</td>
                  <td>{(d.impressions || 0).toLocaleString()}</td>
                  <td>{(Number(d.ctr || 0) * 100).toFixed(2)}%</td>
                  <td>${(d.spend || 0).toFixed(2)}</td>
                  <td>{d.conversions || 0}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={6} className="empty-row">No data available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AudiencePage() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [accPage, setAccPage] = useState(1);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [audience, setAudience] = useState([]);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [demographics, setDemographics] = useState({ age: [], gender: [] });
  const [demoLoading, setDemoLoading] = useState(false);
  const [exclusions, setExclusions] = useState([]);
  const [excLoading, setExcLoading] = useState(false);
  const [error, setError] = useState(null);

  const [demoTab, setDemoTab] = useState('age');
  const [demoMetric, setDemoMetric] = useState('clicks');
  const [demoMetric2, setDemoMetric2] = useState('none');

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
    setSelectedCampaign(null);
    setAudience([]);
    setDemographics({ age: [], gender: [] });
    accountsApi
      .googleAdsCampaigns(account.customerId, account.managerAccountId)
      .then((data) => setCampaigns(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.response?.data?.message || err.message))
      .finally(() => setCampaignsLoading(false));
  };

  const fetchAudience = (campaign) => {
    setSelectedCampaign(campaign);
    setAudienceLoading(true);
    setDemoLoading(true);
    setError(null);
    setAudience([]);
    setDemographics({ age: [], gender: [] });
    setExclusions([]);

    const mccId = selectedAccount.managerAccountId;

    setExcLoading(true);

    accountsApi
      .campaignAudience(selectedAccount.customerId, campaign.campaignId, mccId)
      .then((data) => setAudience(Array.isArray(data) ? data : []))
      .catch((err) => { setError(err.response?.data?.message || err.message); setAudience([]); })
      .finally(() => setAudienceLoading(false));

    accountsApi
      .campaignDemographics(selectedAccount.customerId, campaign.campaignId, mccId)
      .then((data) => setDemographics(data || { age: [], gender: [] }))
      .catch(() => setDemographics({ age: [], gender: [] }))
      .finally(() => setDemoLoading(false));

    accountsApi
      .campaignExclusions(selectedAccount.customerId, campaign.campaignId, mccId)
      .then((data) => setExclusions(Array.isArray(data) ? data : []))
      .catch(() => setExclusions([]))
      .finally(() => setExcLoading(false));
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

  const totalClicks = audience.reduce((s, a) => s + (a.clicks || 0), 0);
  const totalImpressions = audience.reduce((s, a) => s + (a.impressions || 0), 0);
  const totalSpend = audience.reduce((s, a) => s + (a.spend || 0), 0);

  const METRIC_OPTIONS = [
    { value: 'clicks', label: 'Clicks', color: '#4285f4' },
    { value: 'impressions', label: 'Impressions', color: '#4285f4' },
    { value: 'spend', label: 'Cost', color: '#4285f4' },
    { value: 'conversions', label: 'Conversions', color: '#4285f4' },
  ];
  const METRIC2_OPTIONS = [
    { value: 'none', label: 'None', color: '#ea4335' },
    { value: 'clicks', label: 'Clicks', color: '#ea4335' },
    { value: 'impressions', label: 'Impressions', color: '#ea4335' },
    { value: 'spend', label: 'Cost', color: '#ea4335' },
    { value: 'conversions', label: 'Conversions', color: '#ea4335' },
  ];

  const demoItems = demoTab === 'age' ? demographics.age : demographics.gender;
  const demoLabels = demoTab === 'age' ? AGE_LABELS : GENDER_LABELS;
  const demoOrder = demoTab === 'age' ? AGE_ORDER : GENDER_ORDER;

  return (
    <div className="page">
      <PageHeader
        title="Audiences"
        subtitle={
          selectedCampaign
            ? selectedCampaign.campaignName
            : selectedAccount
            ? `Select a campaign — ${selectedAccount.name}`
            : 'Select an account to view audience data'
        }
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
                            View Audience
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
      ) : !selectedCampaign ? (
        <>
          <div className="header-btn-group" style={{ marginBottom: 16 }}>
            <button className="refresh-btn" onClick={() => { setSelectedAccount(null); }}>
              <ArrowLeft size={14} /> Back to Accounts
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {campaignsLoading ? (
            <LoadingSpinner label={`Fetching campaigns for ${selectedAccount.name}...`} />
          ) : (
            <div className="audience-campaign-grid">
              {campaigns.map((c) => (
                <div
                  key={c.campaignId}
                  className="audience-campaign-card"
                  onClick={() => fetchAudience(c)}
                >
                  <div className="audience-campaign-card-top">
                    <span className={`status-badge status-${c.status === 'ENABLED' ? 'healthy' : c.status === 'PAUSED' ? 'warning' : 'neutral'}`}>
                      {c.status}
                    </span>
                  </div>
                  <h3 className="audience-campaign-name">{c.campaignName}</h3>
                  <div className="audience-campaign-stats">
                    <span><MousePointerClick size={13} /> {c.clicks || 0} clicks</span>
                    <span><Eye size={13} /> {c.impressions || 0} imp</span>
                  </div>
                </div>
              ))}
              {campaigns.length === 0 && (
                <div className="empty-state-card">No campaigns found for this account.</div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="header-btn-group" style={{ marginBottom: 16 }}>
            <button className="refresh-btn" onClick={() => { setSelectedCampaign(null); setAudience([]); setDemographics({ age: [], gender: [] }); setExclusions([]); }}>
              <ArrowLeft size={14} /> Back to Campaigns
            </button>
            <button className="refresh-btn" onClick={() => fetchAudience(selectedCampaign)} disabled={audienceLoading || demoLoading || excLoading}>
              <RefreshCw size={14} className={(audienceLoading || demoLoading || excLoading) ? 'spin' : ''} />
              Refresh
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {(audienceLoading || demoLoading || excLoading) ? (
            <LoadingSpinner label="Fetching audience data..." />
          ) : (
            <>
              {/* Demographics Section - Google Ads Style */}
              <div className="gads-section-card">
                <div className="gads-section-header">
                  <h2>Demographics</h2>
                </div>
                <div className="gads-tabs">
                  <button className={`gads-tab ${demoTab === 'age' ? 'active' : ''}`} onClick={() => setDemoTab('age')}>Age</button>
                  <button className={`gads-tab ${demoTab === 'gender' ? 'active' : ''}`} onClick={() => setDemoTab('gender')}>Gender</button>
                </div>

                <div className="gads-chart-controls">
                  <div className="gads-metric-selector">
                    <span className="gads-metric-dot" style={{ background: '#4285f4' }} />
                    <select value={demoMetric} onChange={(e) => setDemoMetric(e.target.value)}>
                      {METRIC_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="gads-metric-selector">
                    <span className="gads-metric-dot" style={{ background: '#ea4335' }} />
                    <select value={demoMetric2} onChange={(e) => setDemoMetric2(e.target.value)}>
                      {METRIC2_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="gads-chart-type">
                    <BarChart3 size={18} />
                    <span>Chart type</span>
                  </div>
                </div>

                {demoItems.length > 0 ? (
                  <DemoBarChart
                    items={demoItems}
                    labels={demoLabels}
                    order={demoOrder}
                    metric={demoMetric}
                    secondMetric={demoMetric2 !== 'none' ? demoMetric2 : null}
                  />
                ) : (
                  <div className="gads-empty-chart">
                    <UsersRound size={40} />
                    <p>No demographic data available for this campaign.</p>
                  </div>
                )}

                <CollapsibleTable items={demoItems} labels={demoLabels} order={demoOrder} />
              </div>

              {/* Audience Segments Section */}
              <div className="gads-section-card">
                <div className="gads-section-header">
                  <h2>Audience Segments</h2>
                </div>

                {audience.length > 0 ? (
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Audience Name</th>
                          <th>Clicks</th>
                          <th>Impressions</th>
                          <th>CTR</th>
                          <th>Spend</th>
                          <th>Conversions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audience.map((a, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="audience-name-icon"><UsersRound size={14} /></div>
                                <span style={{ fontWeight: 600 }}>{a.name}</span>
                              </div>
                            </td>
                            <td>{(a.clicks || 0).toLocaleString()}</td>
                            <td>{(a.impressions || 0).toLocaleString()}</td>
                            <td style={{ fontWeight: 600 }}>{(Number(a.ctr || 0) * 100).toFixed(2)}%</td>
                            <td style={{ fontWeight: 600 }}>{formatCurrency(a.spend)}</td>
                            <td>{a.conversions || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="gads-empty-chart">
                    <UsersRound size={40} />
                    <p>No audience segment data found for this campaign.</p>
                  </div>
                )}
              </div>

              {/* Exclusions Section */}
              <div className="gads-section-card">
                <div className="gads-section-header">
                  <h2>Exclusions</h2>
                </div>
                {exclusions.length > 0 ? (
                  <div className="table-wrapper gads-table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Level</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exclusions.map((e, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td style={{ fontWeight: 600 }}>{resolveExclusionName(e.name)}</td>
                            <td><span className="status-badge status-neutral">{e.type}</span></td>
                            <td>{e.level}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="gads-empty-chart" style={{ padding: '24px' }}>
                    <p>No exclusions found for this campaign.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
