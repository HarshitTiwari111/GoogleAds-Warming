/**
 * Seed test data for monitoring page.
 * Use this AFTER the backend is running (npm run dev:memory).
 * It will connect to the SAME in-memory MongoDB instance.
 */

require('dotenv').config();

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('../src/models/User');
const Account = require('../src/models/Account');
const Campaign = require('../src/models/Campaign');
const CampaignMetrics = require('../src/models/CampaignMetrics');

async function seedData() {
  try {
    // Read URI that backend wrote to file
    let mongoUri = null;
    const uriFile = path.join(__dirname, '../.mongo-uri');
    if (fs.existsSync(uriFile)) {
      mongoUri = fs.readFileSync(uriFile, 'utf-8').trim();
      console.log(`📄 Found shared URI from backend`);
    } else {
      mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/google-ads-automation';
      console.log(`⚠️  No shared URI file found, using default`);
    }
    console.log(`🔗 Connecting to MongoDB: ${mongoUri}`);

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await Account.deleteMany({});
    await Campaign.deleteMany({});
    await CampaignMetrics.deleteMany({});
    console.log('✅ Cleared existing data');

    // Create admin user
    const adminUser = await User.create({
      email: 'admin@example.com',
      password: 'changeme123',
      name: 'Admin User',
      role: 'admin',
    });
    console.log('✅ Created admin user:', adminUser.email);

    // Create test account
    const account = await Account.create({
      accountName: 'Test Account',
      clientName: 'Test Client',
      clientEmail: 'client@example.com',
      status: 'active',
      createdBy: adminUser._id,
    });
    console.log('✅ Created test account');

    // Create 3 test campaigns
    const campaigns = await Campaign.insertMany([
      {
        account: account._id,
        googleCampaignId: 'camp1',
        campaignName: 'CPS - Finance Leads - CA',
        campaignType: 'warmup',
        dailyBudget: 5.0,
        status: 'active',
        assignedTo: adminUser._id,
        noClicksWarning: {
          count: 0,
          warningLimit: 3,
          lastCheckedAt: null,
          pausedAt: null,
          pauseReason: null,
          isAutoPaused: false,
        },
      },
      {
        account: account._id,
        googleCampaignId: 'camp2',
        campaignName: 'CPS - Skincare - UK',
        campaignType: 'warmup',
        dailyBudget: 5.0,
        status: 'active',
        assignedTo: adminUser._id,
        noClicksWarning: {
          count: 0,
          warningLimit: 3,
          lastCheckedAt: null,
          pausedAt: null,
          pauseReason: null,
          isAutoPaused: false,
        },
      },
      {
        account: account._id,
        googleCampaignId: 'camp3',
        campaignName: 'CPS - Weight Loss - US',
        campaignType: 'warmup',
        dailyBudget: 5.0,
        status: 'active',
        assignedTo: adminUser._id,
        noClicksWarning: {
          count: 0,
          warningLimit: 3,
          lastCheckedAt: null,
          pausedAt: null,
          pauseReason: null,
          isAutoPaused: false,
        },
      },
    ]);
    console.log(`✅ Created ${campaigns.length} campaigns`);

    // Create metrics for each campaign
    const now = new Date();
    const metricsData = [];

    // Campaign 1: 0 clicks (will trigger warning)
    for (let i = 0; i < 6; i++) {
      metricsData.push({
        campaignId: campaigns[0].googleCampaignId,
        campaignName: campaigns[0].campaignName,
        clicks: 0,
        impressions: 100 + i * 10,
        spend: 2.5,
        conversions: 0,
        cpc: 0,
        status: 'ENABLED',
        timestamp: new Date(now - (5 - i) * 60000),
      });
    }

    // Campaign 2: 10 clicks (healthy)
    for (let i = 0; i < 6; i++) {
      metricsData.push({
        campaignId: campaigns[1].googleCampaignId,
        campaignName: campaigns[1].campaignName,
        clicks: 10,
        impressions: 200 + i * 20,
        spend: 3.0,
        conversions: 1,
        cpc: 0.3,
        status: 'ENABLED',
        timestamp: new Date(now - (5 - i) * 60000),
      });
    }

    // Campaign 3: 0 clicks (will trigger warning)
    for (let i = 0; i < 6; i++) {
      metricsData.push({
        campaignId: campaigns[2].googleCampaignId,
        campaignName: campaigns[2].campaignName,
        clicks: 0,
        impressions: 150 + i * 15,
        spend: 2.8,
        conversions: 0,
        cpc: 0,
        status: 'ENABLED',
        timestamp: new Date(now - (5 - i) * 60000),
      });
    }

    await CampaignMetrics.insertMany(metricsData);
    console.log(`✅ Created ${metricsData.length} metrics`);

    console.log('\n✅ Seed complete!');
    console.log('  Campaigns:', campaigns.map(c => c.campaignName).join(', '));
    console.log('  Total Metrics:', metricsData.length);

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    process.exit(1);
  }
}

seedData();
