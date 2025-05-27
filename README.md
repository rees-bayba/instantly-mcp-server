# Enhanced Instantly MCP Server

MCP (Model Context Protocol) server for Instantly.ai that enables Claude Desktop to interact with your Instantly campaigns, leads, analytics, email accounts, and more.

## Features

- 📊 **Analytics**: Get warmup analytics, campaign performance, and email metrics
- 📧 **Email Account Management**: Create, update, pause/resume email accounts
- 🚀 **Campaign Management**: Create, update, activate/pause campaigns
- 💌 **Email Management**: Send replies, manage threads, count unread emails
- 👥 **Lead Management**: Create, update, merge leads and manage lead lists
- ✅ **Email Verification**: Verify email addresses
- 📈 **Comprehensive Reporting**: Access detailed analytics and performance data

## Deployment

This server is designed to be deployed on Railway and accessed via Claude Desktop.

### Railway Deployment

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

1. Click the button above or deploy manually
2. Set the `INSTANTLY_API_KEY` environment variable in Railway
3. Wait for deployment to complete
4. Copy your Railway URL

### Claude Desktop Setup

1. Open Claude Desktop
2. Go to Settings → Profile → Integrations
3. Click "Add more"
4. Enter your Railway URL with `/sse` endpoint: `https://your-app.up.railway.app/sse`
   - ⚠️ **Important**: You MUST include `/sse` at the end of the URL
5. Click "Add"
6. Restart Claude Desktop if needed

## Available Tools

### Analytics
- `get_warmup_analytics` - Get warmup analytics for email accounts
- `test_account_vitals` - Test account vitals and connection status
- `get_campaign_analytics` - Get analytics for campaigns
- `get_campaign_analytics_overview` - Get analytics overview
- `get_daily_campaign_analytics` - Get daily campaign metrics
- `get_campaign_steps_analytics` - Get analytics by campaign steps

### Account Management
- `create_account` - Create new email account
- `list_accounts` - List all email accounts
- `get_account` - Get account details
- `update_account` - Update account settings
- `delete_account` - Delete an account
- `pause_account` - Pause account sending
- `resume_account` - Resume paused account
- `mark_account_fixed` - Mark account as fixed
- `get_tracking_domain_status` - Check tracking domain status

### Campaign Management
- `create_campaign` - Create new campaign
- `list_campaigns` - List all campaigns
- `activate_campaign` - Start or resume campaign
- `pause_campaign` - Pause campaign
- `get_campaign` - Get campaign details
- `update_campaign` - Update campaign settings
- `delete_campaign` - Delete campaign
- `share_campaign` - Share campaign for 7 days

### Email Management
- `reply_to_email` - Send reply to an email
- `list_emails` - List emails with filters
- `get_email` - Get email details
- `update_email` - Update email properties
- `delete_email` - Delete an email
- `count_unread_emails` - Get unread email count
- `mark_thread_as_read` - Mark email thread as read

### Email Verification
- `verify_email` - Verify email address validity
- `get_email_verification` - Get verification status

### Lead Management
- `create_lead` - Create new lead
- `list_leads` - List leads with filters
- `get_lead` - Get lead details
- `update_lead` - Update lead information
- `delete_lead` - Delete a lead
- `merge_leads` - Merge duplicate leads
- `update_lead_interest_status` - Update lead interest

### Lead Lists
- `create_lead_list` - Create new lead list
- `list_lead_lists` - List all lead lists
- `get_lead_list` - Get list details
- `update_lead_list` - Update list information
- `delete_lead_list` - Delete a lead list

## Environment Variables

- `INSTANTLY_API_KEY` (required) - Your Instantly.ai API key
- `INSTANTLY_API_URL` (optional) - Custom API URL (defaults to https://api.instantly.ai/api/v2)
- `INSTANTLY_RETRY_MAX_ATTEMPTS` (optional) - Max retry attempts (default: 3)
- `INSTANTLY_RETRY_INITIAL_DELAY` (optional) - Initial retry delay in ms (default: 1000)
- `INSTANTLY_RETRY_MAX_DELAY` (optional) - Max retry delay in ms (default: 10000)
- `INSTANTLY_RETRY_BACKOFF_FACTOR` (optional) - Retry backoff factor (default: 2)

## Getting Your API Key

1. Log into your Instantly.ai account
2. Navigate to Settings → API
3. Generate or copy your API key
4. Add it as `INSTANTLY_API_KEY` in Railway environment variables

## Rate Limits

Instantly.ai has rate limits on their API. This MCP server includes automatic retry logic with exponential backoff to handle rate limiting gracefully.

## License

MIT
