const PDFDocument = require('pdfkit');
const GoogleAdsCache = require('../models/GoogleAdsCache');
const User = require('../models/User');

// Two-role model: admin reports span every CONNECTED user's synced Google
// Ads cache, a user's reports only cover their own (and only while
// connected - a stale cache left by a disconnect must not surface).
async function getCacheData(reqUser, type) {
  if (reqUser.role === 'admin') {
    const connected = await User.find({ 'googleAdsConfig.refreshToken': { $nin: [null, ''] } }).select('_id');
    const caches = await GoogleAdsCache.find({ type, userId: { $in: connected.map((u) => u._id) } });
    return caches.flatMap((c) => c.data || []);
  }
  const me = await User.findById(reqUser.id).select('googleAdsConfig');
  if (!me?.googleAdsConfig?.refreshToken) return [];
  const cached = await GoogleAdsCache.findOne({ userId: reqUser.id, type });
  return cached?.data || [];
}

function buildAccountReports(accounts, campaigns) {
  const campaignsByAccount = {};
  for (const c of campaigns) {
    if (!c.customerId) continue;
    if (!campaignsByAccount[c.customerId]) campaignsByAccount[c.customerId] = [];
    campaignsByAccount[c.customerId].push(c);
  }

  const reports = [];
  const clientAccounts = accounts.filter((a) => !a.isManager);

  for (const acc of clientAccounts) {
    const camps = campaignsByAccount[acc.customerId] || [];
    if (camps.length === 0) continue;

    const totalImpressions = camps.reduce((s, c) => s + (Number(c.impressions) || 0), 0);
    const totalClicks = camps.reduce((s, c) => s + (Number(c.clicks) || 0), 0);
    const totalSpend = camps.reduce((s, c) => s + (Number(c.spend) || 0), 0);
    const totalConversions = camps.reduce((s, c) => s + (Number(c.conversions) || 0), 0);
    const avgCtr = totalImpressions > 0 ? +((totalClicks / totalImpressions) * 100).toFixed(2) : 0;
    const avgCpc = totalClicks > 0 ? +(totalSpend / totalClicks).toFixed(2) : 0;
    const enabledCount = camps.filter((c) => c.status === 'ENABLED').length;

    reports.push({
      _id: acc.customerId,
      account: { accountName: acc.name, clientName: acc.customerId },
      reportType: 'last_30d',
      dateFrom: new Date(Date.now() - 30 * 86400000),
      dateTo: new Date(),
      metrics: { totalImpressions, totalClicks, totalSpend: +totalSpend.toFixed(2), totalConversions, avgCtr, avgCpc },
      status: enabledCount > 0 ? 'active' : 'paused',
      generatedBy: 'auto',
      campaignCount: camps.length,
      enabledCount,
      createdAt: new Date(),
    });
  }

  reports.sort((a, b) => b.metrics.totalSpend - a.metrics.totalSpend);
  return reports;
}

exports.generateReport = async (req, res, next) => {
  try {
    res.status(400).json({ message: 'Reports are auto-generated from synced Google Ads data.' });
  } catch (error) {
    next(error);
  }
};

exports.getReportsByAccount = async (req, res, next) => {
  try {
    const campaignData = await getCacheData(req.user, 'campaigns');
    const campaigns = campaignData.filter((c) => c.customerId === req.params.accountId);
    if (campaigns.length === 0) return res.json([]);

    const accountData = await getCacheData(req.user, 'accounts');
    const accounts = accountData.filter((a) => a.customerId === req.params.accountId);
    res.json(buildAccountReports(accounts.length ? accounts : [{ customerId: req.params.accountId, name: req.params.accountId }], campaigns));
  } catch (error) {
    next(error);
  }
};

exports.getAllReports = async (req, res, next) => {
  try {
    const [accounts, campaigns] = await Promise.all([
      getCacheData(req.user, 'accounts'),
      getCacheData(req.user, 'campaigns'),
    ]);

    if (accounts.length === 0) {
      return res.json([]);
    }

    res.json(buildAccountReports(accounts, campaigns));
  } catch (error) {
    next(error);
  }
};

exports.getReport = async (req, res, next) => {
  try {
    const [accountData, campaignData] = await Promise.all([
      getCacheData(req.user, 'accounts'),
      getCacheData(req.user, 'campaigns'),
    ]);

    const accounts = accountData.filter((a) => a.customerId === req.params.id);
    const campaigns = campaignData.filter((c) => c.customerId === req.params.id);
    const reports = buildAccountReports(accounts, campaigns);

    if (reports.length === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }
    res.json(reports[0]);
  } catch (error) {
    next(error);
  }
};

exports.exportCSV = async (req, res, next) => {
  try {
    const [accounts, campaigns] = await Promise.all([
      getCacheData(req.user, 'accounts'),
      getCacheData(req.user, 'campaigns'),
    ]);
    const reports = buildAccountReports(accounts, campaigns);

    const header = 'Account,Customer ID,Campaigns,Enabled,Impressions,Clicks,Spend,CTR,CPC,Conversions,Status\n';
    const rows = reports.map((r) =>
      `"${r.account?.accountName || ''}","${r.account?.clientName || ''}",${r.campaignCount},${r.enabledCount},${r.metrics.totalImpressions},${r.metrics.totalClicks},${r.metrics.totalSpend.toFixed(2)},${r.metrics.avgCtr.toFixed(2)}%,${r.metrics.avgCpc.toFixed(2)},${r.metrics.totalConversions},"${r.status}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=reports.csv');
    res.send(header + rows);
  } catch (error) {
    next(error);
  }
};

exports.exportPDF = async (req, res, next) => {
  try {
    const [accounts, campaigns] = await Promise.all([
      getCacheData(req.user, 'accounts'),
      getCacheData(req.user, 'campaigns'),
    ]);
    const reports = buildAccountReports(accounts, campaigns);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reports.pdf');

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    doc.on('error', next);
    doc.pipe(res);

    const pageW = doc.page.width - 60;
    const cols = [
      { label: 'Account',   width: pageW * 0.22, align: 'left' },
      { label: 'ID',        width: pageW * 0.10, align: 'left' },
      { label: 'Campaigns', width: pageW * 0.07, align: 'center' },
      { label: 'Impr.',     width: pageW * 0.09, align: 'right' },
      { label: 'Clicks',    width: pageW * 0.08, align: 'right' },
      { label: 'Spend',     width: pageW * 0.09, align: 'right' },
      { label: 'CTR',       width: pageW * 0.07, align: 'right' },
      { label: 'CPC',       width: pageW * 0.07, align: 'right' },
      { label: 'Conv.',     width: pageW * 0.07, align: 'center' },
      { label: 'Status',    width: pageW * 0.07, align: 'center' },
    ];
    const ROW_H = 18;
    const HEADER_H = 22;
    const startX = 30;
    const headerBg = '#2c3e50';
    const headerColor = '#ffffff';
    const altRowBg = '#f0f4f8';
    const borderColor = '#dce1e6';
    const accentGreen = '#27ae60';
    const accentRed = '#e74c3c';

    // Title
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#2c3e50')
      .text('Google Ads Account Reports', startX, 30, { align: 'center', width: pageW });
    doc.fontSize(10).font('Helvetica').fillColor('#7f8c8d')
      .text(`Last 30 Days  •  ${reports.length} accounts  •  Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, startX, 52, { align: 'center', width: pageW });

    // Summary bar
    const totalSpend = reports.reduce((s, r) => s + r.metrics.totalSpend, 0);
    const totalClicks = reports.reduce((s, r) => s + r.metrics.totalClicks, 0);
    const totalImpr = reports.reduce((s, r) => s + r.metrics.totalImpressions, 0);
    const totalConv = reports.reduce((s, r) => s + r.metrics.totalConversions, 0);

    const summaryY = 72;
    const cardW = pageW / 4;
    const summaryItems = [
      { label: 'Total Spend', value: `$${totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
      { label: 'Total Clicks', value: totalClicks.toLocaleString() },
      { label: 'Total Impressions', value: totalImpr.toLocaleString() },
      { label: 'Total Conversions', value: totalConv.toLocaleString() },
    ];
    summaryItems.forEach((item, i) => {
      const cx = startX + i * cardW;
      doc.save();
      doc.roundedRect(cx + 4, summaryY, cardW - 8, 36, 4).fill('#eaf2f8');
      doc.restore();
      doc.fontSize(8).font('Helvetica').fillColor('#7f8c8d')
        .text(item.label, cx + 10, summaryY + 6, { width: cardW - 20 });
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#2c3e50')
        .text(item.value, cx + 10, summaryY + 18, { width: cardW - 20 });
    });

    let y = summaryY + 48;

    function drawTableHeader() {
      doc.save();
      doc.roundedRect(startX, y, pageW, HEADER_H, 3).fill(headerBg);
      doc.restore();
      let x = startX;
      cols.forEach((col) => {
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(headerColor)
          .text(col.label, x + 4, y + 6, { width: col.width - 8, align: col.align });
        x += col.width;
      });
      y += HEADER_H;
    }

    function drawRow(r, idx) {
      if (y + ROW_H > doc.page.height - 40) {
        doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
        y = 30;
        drawTableHeader();
      }

      if (idx % 2 === 0) {
        doc.save();
        doc.rect(startX, y, pageW, ROW_H).fill(altRowBg);
        doc.restore();
      }

      doc.save();
      doc.rect(startX, y, pageW, ROW_H).stroke(borderColor);
      doc.restore();

      const values = [
        r.account?.accountName || '-',
        r.account?.clientName || '-',
        String(r.campaignCount),
        r.metrics.totalImpressions.toLocaleString(),
        r.metrics.totalClicks.toLocaleString(),
        `$${r.metrics.totalSpend.toFixed(2)}`,
        `${r.metrics.avgCtr.toFixed(2)}%`,
        `$${r.metrics.avgCpc.toFixed(2)}`,
        String(r.metrics.totalConversions),
        r.status,
      ];

      let x = startX;
      values.forEach((val, ci) => {
        let color = '#2c3e50';
        if (ci === 9) color = val === 'active' ? accentGreen : accentRed;
        if (ci === 5 && parseFloat(val.replace('$', '')) > 500) color = '#e67e22';

        const fontName = ci === 0 ? 'Helvetica-Bold' : 'Helvetica';
        doc.fontSize(7).font(fontName).fillColor(color)
          .text(val, x + 4, y + 5, { width: cols[ci].width - 8, align: cols[ci].align, ellipsis: true });
        x += cols[ci].width;
      });

      y += ROW_H;
    }

    drawTableHeader();

    if (reports.length === 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#7f8c8d')
        .text('No data available. Sync accounts from Google Ads first.', startX, y + 20, { align: 'center', width: pageW });
    }

    reports.forEach((r, i) => drawRow(r, i));

    // Footer on last page
    doc.fontSize(7).font('Helvetica').fillColor('#bdc3c7')
      .text('Generated by Google Ads Automation Dashboard', startX, doc.page.height - 30, { align: 'center', width: pageW });

    doc.end();
  } catch (error) {
    next(error);
  }
};
