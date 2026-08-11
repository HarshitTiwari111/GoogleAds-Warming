import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, Pause } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import LoadingSpinner from '../components/LoadingSpinner';
import CampaignCard from '../components/CampaignCard';
import { campaignsApi } from '../services/api';
import { useToast } from '../context/ToastContext';

function CampaignTableRow({ campaign, idx, onWarningUpdate }) {
  const { showToast } = useToast();
  const [resuming, setResuming] = useState(false);
  const warning = campaign.noClicksWarning;
  const isAutoPaused = warning?.isAutoPaused;

  const handleResume = async () => {
    setResuming(true);
    try {
      await campaignsApi.resumeCampaign(campaign.campaignId);
      showToast('Campaign resumed!', 'success');
      onWarningUpdate();
    } catch (err) {
      showToast('Failed to resume', 'error');
    } finally {
      setResuming(false);
    }
  };

  return (
    <tr style={{
      borderBottom: '1px solid var(--color-border)',
      backgroundColor: idx % 2 === 0 ? 'transparent' : '#fafafa',
      transition: 'background-color 0.2s',
    }}>
      <td style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--color-text-primary)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {campaign.campaignName}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
        <span style={{
          display: 'inline-block',
          padding: '4px 10px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: '700',
          backgroundColor: campaign.status === 'HEALTHY' ? '#d1fae5' : campaign.status === 'WARNING' ? '#fef3c7' : '#fee2e2',
          color: campaign.status === 'HEALTHY' ? '#065f46' : campaign.status === 'WARNING' ? '#92400e' : '#991b1b',
        }}>
          {campaign.status || 'UNKNOWN'}
        </span>
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--color-text-primary)', fontWeight: '600' }}>
        {campaign.clicks ?? 0}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--color-text-primary)', fontWeight: '600' }}>
        ${Number(campaign.spend || 0).toFixed(2)}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
        {warning && warning.count > 0 ? (
          <span style={{
            display: 'inline-block',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '700',
            backgroundColor: '#fef3c7',
            color: '#92400e',
          }}>
            ⚠️ {warning.count}/{warning.warningLimit}
          </span>
        ) : (
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>—</span>
        )}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
        {isAutoPaused ? (
          <span style={{
            display: 'inline-block',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '700',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
          }}>
            🛑 Yes
          </span>
        ) : (
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>No</span>
        )}
      </td>
      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
        {isAutoPaused ? (
          <button
            onClick={handleResume}
            disabled={resuming}
            style={{
              padding: '6px 12px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: resuming ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              opacity: resuming ? 0.7 : 1,
            }}
          >
            {resuming ? 'Resuming...' : 'Resume'}
          </button>
        ) : (
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>—</span>
        )}
      </td>
    </tr>
  );
}

const ITEMS_PER_PAGE = 10;

export default function MonitoringPage() {
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all, warnings, paused
  const [currentPage, setCurrentPage] = useState(1);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const { data } = await campaignsApi.getMonitoring();
      console.log('[MonitoringPage] Loaded campaigns:', data);
      if (data && data.length > 0) {
        console.log('[MonitoringPage] First campaign noClicksWarning:', data[0].noClicksWarning);
      }
      setCampaigns(data || []);
    } catch (err) {
      showToast('Failed to load campaigns', 'error');
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCampaigns();
    setRefreshing(false);
    showToast('Campaigns refreshed!', 'success');
  };

  const handleWarningUpdate = () => {
    loadCampaigns();
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const getFilteredCampaigns = () => {
    switch (filter) {
      case 'warnings':
        return campaigns.filter((c) => c.status === 'WARNING' || c.status === 'CRITICAL');
      case 'paused':
        return campaigns.filter((c) => c.noClicksWarning?.isAutoPaused);
      default:
        return campaigns;
    }
  };

  const filteredCampaigns = getFilteredCampaigns();
  const warningCount = campaigns.filter((c) => c.status === 'WARNING' || c.status === 'CRITICAL').length;
  const pausedCount = campaigns.filter((c) => c.noClicksWarning?.isAutoPaused).length;

  // Pagination logic
  const totalPages = Math.ceil(filteredCampaigns.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedCampaigns = filteredCampaigns.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  // Reset to page 1 when filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  return (
    <div className="page">
      <PageHeader
        title="Campaign Monitoring"
        subtitle="Real-time campaign performance with no-clicks auto-warning system"
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            padding: '16px',
            backgroundColor: 'var(--color-card-bg)',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Total Campaigns
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '4px' }}>
            {campaigns.length}
          </div>
        </div>

        <div
          style={{
            padding: '16px',
            backgroundColor: 'var(--color-card-bg)',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            borderLeft: '3px solid #f59e0b',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            <AlertTriangle size={14} style={{ display: 'inline', marginRight: '4px' }} />
            With Warnings
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '4px', color: '#f59e0b' }}>
            {warningCount}
          </div>
        </div>

        <div
          style={{
            padding: '16px',
            backgroundColor: 'var(--color-card-bg)',
            borderRadius: '8px',
            border: '1px solid var(--color-border)',
            borderLeft: '3px solid #ef4444',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            <Pause size={14} style={{ display: 'inline', marginRight: '4px' }} />
            Auto-Paused
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '4px', color: '#ef4444' }}>
            {pausedCount}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 18px',
            backgroundColor: '#1e40af',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '700',
            opacity: refreshing ? 0.7 : 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            transition: 'all 0.2s',
          }}
        >
          <RefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>

        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          {[
            { value: 'all', label: 'All', count: campaigns.length, color: '#6366f1' },
            { value: 'warnings', label: 'Warnings', count: warningCount, color: '#f59e0b' },
            { value: 'paused', label: 'Paused', count: pausedCount, color: '#ef4444' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              style={{
                padding: '8px 14px',
                backgroundColor: filter === f.value ? f.color : '#f3f4f6',
                color: filter === f.value ? 'white' : '#1f2937',
                border: `2px solid ${filter === f.value ? f.color : '#d1d5db'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '700',
                transition: 'all 0.2s',
                boxShadow: filter === f.value ? `0 2px 8px ${f.color}40` : 'none',
              }}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filteredCampaigns.length === 0 ? (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
          }}
        >
          <p>No campaigns found in this view</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: 'var(--color-card-bg)',
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            <thead>
              <tr style={{
                backgroundColor: '#f3f4f6',
                borderBottom: '2px solid var(--color-border)',
              }}>
                <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Campaign</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Status</th>
                <th style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '700', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Clicks</th>
                <th style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '700', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Spend</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Warnings</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Auto-Paused</th>
                <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', fontSize: '13px', color: 'var(--color-text-secondary)' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCampaigns.map((campaign, idx) => (
                <CampaignTableRow
                  key={campaign.campaignId}
                  campaign={campaign}
                  idx={idx}
                  onWarningUpdate={handleWarningUpdate}
                />
              ))}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: '24px',
              gap: '12px',
              padding: '16px',
            }}>
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                style={{
                  padding: '8px 14px',
                  backgroundColor: currentPage === 1 ? '#e5e7eb' : '#1e40af',
                  color: currentPage === 1 ? '#9ca3af' : 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                }}
              >
                ← Previous
              </button>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {(() => {
                  const pages = [];
                  const maxVisible = 5;
                  const halfVisible = Math.floor(maxVisible / 2);

                  let startPage = Math.max(1, currentPage - halfVisible);
                  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

                  if (endPage - startPage + 1 < maxVisible) {
                    startPage = Math.max(1, endPage - maxVisible + 1);
                  }

                  if (startPage > 1) {
                    pages.push(
                      <button
                        key={1}
                        onClick={() => setCurrentPage(1)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#f3f4f6',
                          color: '#1f2937',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                          minWidth: '36px',
                        }}
                      >
                        1
                      </button>
                    );
                    if (startPage > 2) {
                      pages.push(
                        <span key="dots1" style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                          ...
                        </span>
                      );
                    }
                  }

                  for (let page = startPage; page <= endPage; page++) {
                    pages.push(
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: currentPage === page ? '#1e40af' : '#f3f4f6',
                          color: currentPage === page ? 'white' : '#1f2937',
                          border: `1px solid ${currentPage === page ? '#1e40af' : '#d1d5db'}`,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                          minWidth: '36px',
                          transition: 'all 0.2s',
                        }}
                      >
                        {page}
                      </button>
                    );
                  }

                  if (endPage < totalPages) {
                    if (endPage < totalPages - 1) {
                      pages.push(
                        <span key="dots2" style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                          ...
                        </span>
                      );
                    }
                    pages.push(
                      <button
                        key={totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: '#f3f4f6',
                          color: '#1f2937',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                          minWidth: '36px',
                        }}
                      >
                        {totalPages}
                      </button>
                    );
                  }

                  return pages;
                })()}
              </div>

              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                style={{
                  padding: '8px 14px',
                  backgroundColor: currentPage === totalPages ? '#e5e7eb' : '#1e40af',
                  color: currentPage === totalPages ? '#9ca3af' : 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                }}
              >
                Next →
              </button>

              <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginLeft: '12px' }}>
                Page {currentPage} of {totalPages}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
