#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosError } from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate and get API key
function getApiKey(): string {
  const apiKey = process.env.INSTANTLY_API_KEY;
  if (!apiKey) {
    console.error('INSTANTLY_API_KEY environment variable is required');
    process.exit(1);
  }
  return apiKey;
}

// Get the API key once
const INSTANTLY_API_KEY = getApiKey();

// Retry configuration
const retryConfig = {
  maxAttempts: parseInt(process.env.INSTANTLY_RETRY_MAX_ATTEMPTS || '3'),
  initialDelay: parseInt(process.env.INSTANTLY_RETRY_INITIAL_DELAY || '1000'),
  maxDelay: parseInt(process.env.INSTANTLY_RETRY_MAX_DELAY || '10000'),
  backoffFactor: parseInt(process.env.INSTANTLY_RETRY_BACKOFF_FACTOR || '2'),
};

// Instantly API Client
class InstantlyClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = process.env.INSTANTLY_API_URL || 'https://api.instantly.ai/api/v2';
  }

  private async request(endpoint: string, method: string = 'GET', data?: any) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    let attempt = 0;
    let lastError: any;

    while (attempt < retryConfig.maxAttempts) {
      try {
        const response = await axios({
          method,
          url,
          headers,
          data: method !== 'GET' ? data : undefined,
          params: method === 'GET' ? data : undefined,
        });
        return response.data;
      } catch (error: any) {
        lastError = error;
        attempt++;

        // Enhanced error logging
        const errorDetails = {
          endpoint,
          method,
          url,
          attempt,
          status: error.response?.status,
          statusText: error.response?.statusText,
          responseData: error.response?.data,
          message: error.message
        };
        
        console.error('Instantly API Error:', JSON.stringify(errorDetails, null, 2));
        
        if (error.response?.status === 404) {
          throw new Error(`Endpoint not found: ${endpoint}`);
        }

        if (error.response?.status === 401) {
          throw new Error('Invalid API key');
        }

        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60') * 1000;
          if (attempt < retryConfig.maxAttempts) {
            console.log(`Rate limited. Waiting ${retryAfter}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            continue;
          }
        }

        // Only retry on 5xx errors or network errors
        if (error.response && error.response.status < 500) {
          break;
        }

        if (attempt < retryConfig.maxAttempts) {
          const delay = Math.min(
            retryConfig.initialDelay * Math.pow(retryConfig.backoffFactor, attempt - 1),
            retryConfig.maxDelay
          );
          console.log(`Retrying in ${delay}ms... (Attempt ${attempt}/${retryConfig.maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Provide more specific error messages
    const apiError = lastError.response?.data?.error || lastError.response?.data?.message || lastError.message;
    throw new Error(`Instantly API error after ${attempt} attempts: ${apiError}`);
  }

  // Analytics endpoints
  async getWarmupAnalytics(emails: string[]) {
    return this.request('/accounts/warmup-analytics', 'POST', { emails });
  }

  async testAccountVitals(accounts?: string[]) {
    return this.request('/accounts/test/vitals', 'POST', { accounts });
  }

  async getCampaignAnalytics(params: any) {
    return this.request('/campaigns/analytics', 'GET', params);
  }

  async getCampaignAnalyticsOverview(params: any) {
    return this.request('/campaigns/analytics/overview', 'GET', params);
  }

  async getDailyCampaignAnalytics(params: any) {
    return this.request('/campaigns/analytics/daily', 'GET', params);
  }

  async getCampaignStepsAnalytics(params: any) {
    return this.request('/campaigns/analytics/steps', 'GET', params);
  }

  // Account endpoints
  async createAccount(data: any) {
    return this.request('/accounts', 'POST', data);
  }

  async listAccounts(params?: any) {
    return this.request('/accounts', 'GET', params);
  }

  async getAccount(email: string) {
    return this.request(`/accounts/${encodeURIComponent(email)}`);
  }

  async updateAccount(email: string, data: any) {
    return this.request(`/accounts/${encodeURIComponent(email)}`, 'PATCH', data);
  }

  async deleteAccount(email: string) {
    return this.request(`/accounts/${encodeURIComponent(email)}`, 'DELETE');
  }

  async pauseAccount(email: string) {
    return this.request(`/accounts/${encodeURIComponent(email)}/pause`, 'POST');
  }

  async resumeAccount(email: string) {
    return this.request(`/accounts/${encodeURIComponent(email)}/resume`, 'POST');
  }

  async markAccountFixed(email: string) {
    return this.request(`/accounts/${encodeURIComponent(email)}/mark-fixed`, 'POST');
  }

  async getCustomTrackingDomainStatus(host: string) {
    return this.request('/accounts/ctd/status', 'GET', { host });
  }

  // Campaign endpoints
  async createCampaign(data: any) {
    return this.request('/campaigns', 'POST', data);
  }

  async listCampaigns(params?: any) {
    return this.request('/campaigns', 'GET', params);
  }

  async activateCampaign(id: string) {
    return this.request(`/campaigns/${id}/activate`, 'POST');
  }

  async pauseCampaign(id: string) {
    return this.request(`/campaigns/${id}/pause`, 'POST');
  }

  async getCampaign(id: string) {
    return this.request(`/campaigns/${id}`);
  }

  async updateCampaign(id: string, data: any) {
    return this.request(`/campaigns/${id}`, 'PATCH', data);
  }

  async deleteCampaign(id: string) {
    return this.request(`/campaigns/${id}`, 'DELETE');
  }

  async shareCampaign(id: string) {
    return this.request(`/campaigns/${id}/share`, 'POST');
  }

  // Email endpoints
  async replyToEmail(data: any) {
    return this.request('/emails/reply', 'POST', data);
  }

  async listEmails(params?: any) {
    return this.request('/emails', 'GET', params);
  }

  async getEmail(id: string) {
    return this.request(`/emails/${id}`);
  }

  async updateEmail(id: string, data: any) {
    return this.request(`/emails/${id}`, 'PATCH', data);
  }

  async deleteEmail(id: string) {
    return this.request(`/emails/${id}`, 'DELETE');
  }

  async countUnreadEmails() {
    return this.request('/emails/unread/count');
  }

  async markThreadAsRead(threadId: string) {
    return this.request(`/emails/threads/${threadId}/mark-as-read`, 'POST');
  }

  // Email verification endpoints
  async verifyEmail(email: string) {
    return this.request('/email-verification', 'POST', { email });
  }

  async getEmailVerification(email: string) {
    return this.request(`/email-verification/${encodeURIComponent(email)}`);
  }

  // Lead endpoints
  async createLead(data: any) {
    return this.request('/leads', 'POST', data);
  }

  async listLeads(data: any) {
    return this.request('/leads/list', 'POST', data);
  }

  async getLead(id: string) {
    return this.request(`/leads/${id}`);
  }

  async updateLead(id: string, data: any) {
    return this.request(`/leads/${id}`, 'PATCH', data);
  }

  async deleteLead(id: string) {
    return this.request(`/leads/${id}`, 'DELETE');
  }

  async mergeLeads(data: any) {
    return this.request('/leads/merge', 'POST', data);
  }

  async updateLeadInterestStatus(data: any) {
    return this.request('/leads/update-interest-status', 'POST', data);
  }

  async removeLeadFromSubsequence(data: any) {
    return this.request('/leads/subsequence/remove', 'POST', data);
  }

  // Lead list endpoints
  async createLeadList(data: any) {
    return this.request('/lead-lists', 'POST', data);
  }

  async listLeadLists(params?: any) {
    return this.request('/lead-lists', 'GET', params);
  }

  async getLeadList(id: string) {
    return this.request(`/lead-lists/${id}`);
  }

  async updateLeadList(id: string, data: any) {
    return this.request(`/lead-lists/${id}`, 'PATCH', data);
  }

  async deleteLeadList(id: string) {
    return this.request(`/lead-lists/${id}`, 'DELETE');
  }

  // NEW METHODS ADDED BELOW THIS LINE
  // Additional Campaign endpoints
  async getCampaignSchedules(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/schedules`);
  }

  async updateCampaignSchedule(campaignId: string, data: any) {
    return this.request(`/campaigns/${campaignId}/schedule`, 'PATCH', data);
  }

  async updateCampaignSettings(campaignId: string, data: any) {
    return this.request(`/campaigns/${campaignId}/settings`, 'PATCH', data);
  }

  async updateCampaignStatus(campaignId: string, status: string) {
    return this.request(`/campaigns/${campaignId}/status`, 'POST', { status });
  }

  async saveCampaignSequence(campaignId: string, sequences: any[]) {
    return this.request(`/campaigns/${campaignId}/sequences`, 'POST', { sequences });
  }

  async getCampaignSequence(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/sequences`);
  }

  async getCampaignsByLead(leadId: string) {
    return this.request(`/campaigns/by-lead/${leadId}`);
  }

  async exportCampaignData(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/export`);
  }

  async getCampaignAnalyticsByDate(campaignId: string, startDate: string, endDate: string) {
    return this.request(`/campaigns/${campaignId}/analytics/by-date`, 'GET', { start_date: startDate, end_date: endDate });
  }

  async getCampaignStatistics(params: any) {
    return this.request(`/campaigns/${params.campaign_id}/statistics`, 'GET', params);
  }

  async addLeadsToCampaign(campaignId: string, data: any) {
    return this.request(`/campaigns/${campaignId}/leads`, 'POST', data);
  }

  async getLeadsFromCampaign(campaignId: string, params?: any) {
    return this.request(`/campaigns/${campaignId}/leads`, 'GET', params);
  }

  async updateLeadInCampaign(campaignId: string, leadId: string, data: any) {
    return this.request(`/campaigns/${campaignId}/leads/${leadId}`, 'PATCH', data);
  }

  async deleteLeadFromCampaign(campaignId: string, leadId: string) {
    return this.request(`/campaigns/${campaignId}/leads/${leadId}`, 'DELETE');
  }

  async getLeadByEmail(email: string) {
    return this.request(`/leads/by-email/${encodeURIComponent(email)}`);
  }

  async getLeadCategories() {
    return this.request('/lead-categories');
  }

  async updateLeadCategory(data: any) {
    return this.request(`/campaigns/${data.campaign_id}/leads/${data.lead_id}/category`, 'PATCH', {
      category_id: data.category_id,
      pause_lead: data.pause_lead
    });
  }

  async pauseLead(campaignId: string, leadId: string) {
    return this.request(`/campaigns/${campaignId}/leads/${leadId}/pause`, 'POST');
  }

  async resumeLead(campaignId: string, leadId: string, data?: any) {
    return this.request(`/campaigns/${campaignId}/leads/${leadId}/resume`, 'POST', data);
  }

  async unsubscribeLeadFromCampaign(campaignId: string, leadId: string) {
    return this.request(`/campaigns/${campaignId}/leads/${leadId}/unsubscribe`, 'POST');
  }

  async unsubscribeLeadGlobal(leadId: string) {
    return this.request(`/leads/${leadId}/unsubscribe-global`, 'POST');
  }

  async getAllLeads(params?: any) {
    return this.request('/leads/all', 'GET', params);
  }

  async getBlocklist(params?: any) {
    return this.request('/blocklist', 'GET', params);
  }

  async addToBlocklist(data: any) {
    return this.request('/blocklist', 'POST', data);
  }

  async getMessageHistory(campaignId: string, leadId: string) {
    return this.request(`/campaigns/${campaignId}/leads/${leadId}/messages`);
  }

  async replyToLead(data: any) {
    return this.request(`/campaigns/${data.campaign_id}/reply`, 'POST', data);
  }

  async getCampaignAnalytics(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/analytics`);
  }

  async getEmailAccountAnalytics() {
    return this.request('/accounts/analytics');
  }

  async getMasterInboxStats() {
    return this.request('/master-inbox/stats');
  }

  // Email Account Management endpoints
  async getEmailAccounts(params?: any) {
    return this.request('/email-accounts', 'GET', params);
  }

  async getEmailAccount(accountId: string) {
    return this.request(`/email-accounts/${accountId}`);
  }

  async createEmailAccount(data: any) {
    return this.request('/email-accounts', 'POST', data);
  }

  async updateEmailAccount(accountId: string, data: any) {
    return this.request(`/email-accounts/${accountId}`, 'PATCH', data);
  }

  async getCampaignEmailAccounts(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/email-accounts`);
  }

  async addEmailToCampaign(campaignId: string, emailAccountIds: number[]) {
    return this.request(`/campaigns/${campaignId}/email-accounts`, 'POST', { email_account_ids: emailAccountIds });
  }

  async removeEmailFromCampaign(campaignId: string, emailAccountIds: number[]) {
    return this.request(`/campaigns/${campaignId}/email-accounts`, 'DELETE', { email_account_ids: emailAccountIds });
  }

  async updateWarmup(accountId: string, data: any) {
    return this.request(`/email-accounts/${accountId}/warmup`, 'PATCH', data);
  }

  async getWarmupStats(accountId: string) {
    return this.request(`/email-accounts/${accountId}/warmup/stats`);
  }

  async reconnectFailedAccounts() {
    return this.request('/email-accounts/reconnect-failed', 'POST');
  }

  // Additional endpoints
  async sendReply(data: any) {
    return this.request(`/campaigns/${data.campaign_id}/leads/${data.lead_email}/reply`, 'POST', { message: data.message });
  }

  async getConversations(campaignId?: string) {
    const params = campaignId ? { campaign_id: campaignId } : undefined;
    return this.request('/conversations', 'GET', params);
  }

  // Webhook endpoints
  async listWebhooks(campaignId: string) {
    return this.request(`/campaigns/${campaignId}/webhooks`);
  }

  async createWebhook(data: any) {
    return this.request(`/campaigns/${data.campaign_id}/webhooks`, 'POST', {
      name: data.name,
      webhook_url: data.webhook_url,
      event_types: data.event_types,
      categories: data.categories
    });
  }

  async deleteWebhook(campaignId: string, webhookId: string) {
    return this.request(`/campaigns/${campaignId}/webhooks/${webhookId}`, 'DELETE');
  }

  // Client/Whitelabel endpoints
  async createClient(data: any) {
    return this.request('/clients', 'POST', data);
  }

  async listClients() {
    return this.request('/clients');
  }

  // Additional Lead endpoints
  async bulkAssignLeads(data: any) {
    return this.request('/leads/bulk-assign', 'POST', data);
  }

  async moveLeads(data: any) {
    return this.request('/leads/move', 'POST', data);
  }

  async exportLeads(data: any) {
    return this.request('/leads/export', 'POST', data);
  }

  async moveLeadToSubsequence(data: any) {
    return this.request('/leads/subsequence/move', 'POST', data);
  }

  // Inbox Placement Test endpoints
  async createInboxPlacementTest(data: any) {
    return this.request('/inbox-placement-tests', 'POST', data);
  }

  async listInboxPlacementTests(params?: any) {
    return this.request('/inbox-placement-tests', 'GET', params);
  }

  async getInboxPlacementTest(id: string) {
    return this.request(`/inbox-placement-tests/${id}`);
  }

  async deleteInboxPlacementTest(id: string) {
    return this.request(`/inbox-placement-tests/${id}`, 'DELETE');
  }

  async updateInboxPlacementTest(id: string, data: any) {
    return this.request(`/inbox-placement-tests/${id}`, 'PATCH', data);
  }

  async getEmailServiceProviderOptions() {
    return this.request('/inbox-placement-tests/email-service-provider-options');
  }

  // Inbox Placement Analytics endpoints
  async listInboxPlacementAnalytics(params?: any) {
    return this.request('/inbox-placement-analytics', 'GET', params);
  }

  async getInboxPlacementAnalytic(id: string) {
    return this.request(`/inbox-placement-analytics/${id}`);
  }

  async getInboxPlacementStatsByTestId(data: any) {
    return this.request('/inbox-placement-analytics/stats-by-test-id', 'POST', data);
  }

  async getDeliverabilityInsights(data: any) {
    return this.request('/inbox-placement-analytics/deliverability-insights', 'POST', data);
  }

  async getInboxPlacementStatsByDate(data: any) {
    return this.request('/inbox-placement-analytics/stats-by-date', 'POST', data);
  }

  // Inbox Placement Reports endpoints
  async listInboxPlacementReports(params?: any) {
    return this.request('/inbox-placement-reports', 'GET', params);
  }

  async getInboxPlacementReport(id: string) {
    return this.request(`/inbox-placement-reports/${id}`);
  }

  // API Key endpoints
  async createApiKey(data: any) {
    return this.request('/api-keys', 'POST', data);
  }

  async listApiKeys(params?: any) {
    return this.request('/api-keys', 'GET', params);
  }

  async deleteApiKey(id: string) {
    return this.request(`/api-keys/${id}`, 'DELETE');
  }

  // Account Campaign Mapping endpoints
  async getAccountCampaignMappings(email: string) {
    return this.request(`/account-campaign-mappings/${encodeURIComponent(email)}`);
  }

  // Background Job endpoints
  async listBackgroundJobs(params?: any) {
    return this.request('/background-jobs', 'GET', params);
  }

  async getBackgroundJob(id: string) {
    return this.request(`/background-jobs/${id}`);
  }

  // Custom Tag endpoints
  async createCustomTag(data: any) {
    return this.request('/custom-tags', 'POST', data);
  }

  async listCustomTags(params?: any) {
    return this.request('/custom-tags', 'GET', params);
  }

  async getCustomTag(id: string) {
    return this.request(`/custom-tags/${id}`);
  }

  async updateCustomTag(id: string, data: any) {
    return this.request(`/custom-tags/${id}`, 'PATCH', data);
  }

  async deleteCustomTag(id: string) {
    return this.request(`/custom-tags/${id}`, 'DELETE');
  }

  async toggleCustomTagResource(data: any) {
    return this.request('/custom-tags/toggle-resource', 'POST', data);
  }

  // Block List Entry endpoints
  async createBlockListEntry(data: any) {
    return this.request('/block-lists-entries', 'POST', data);
  }

  async listBlockListEntries(params?: any) {
    return this.request('/block-lists-entries', 'GET', params);
  }

  async getBlockListEntry(id: string) {
    return this.request(`/block-lists-entries/${id}`);
  }

  async updateBlockListEntry(id: string, data: any) {
    return this.request(`/block-lists-entries/${id}`, 'PATCH', data);
  }

  async deleteBlockListEntry(id: string) {
    return this.request(`/block-lists-entries/${id}`, 'DELETE');
  }

  // Lead Label endpoints
  async createLeadLabel(data: any) {
    return this.request('/lead-labels', 'POST', data);
  }

  async listLeadLabels(params?: any) {
    return this.request('/lead-labels', 'GET', params);
  }

  async getLeadLabel(id: string) {
    return this.request(`/lead-labels/${id}`);
  }

  async updateLeadLabel(id: string, data: any) {
    return this.request(`/lead-labels/${id}`, 'PATCH', data);
  }

  async deleteLeadLabel(id: string) {
    return this.request(`/lead-labels/${id}`, 'DELETE');
  }

  // Workspace endpoints
  async getCurrentWorkspace() {
    return this.request('/workspaces/current');
  }

  async updateCurrentWorkspace(data: any) {
    return this.request('/workspaces/current', 'PATCH', data);
  }

  // Workspace Group Member endpoints
  async createWorkspaceGroupMember(data: any) {
    return this.request('/workspace-group-members', 'POST', data);
  }

  async listWorkspaceGroupMembers(params?: any) {
    return this.request('/workspace-group-members', 'GET', params);
  }

  async getWorkspaceGroupMember(id: string) {
    return this.request(`/workspace-group-members/${id}`);
  }

  async deleteWorkspaceGroupMember(id: string) {
    return this.request(`/workspace-group-members/${id}`, 'DELETE');
  }

  async getAdminWorkspaceGroupMembers() {
    return this.request('/workspace-group-members/admin');
  }

  // Workspace Member endpoints
  async createWorkspaceMember(data: any) {
    return this.request('/workspace-members', 'POST', data);
  }

  async listWorkspaceMembers(params?: any) {
    return this.request('/workspace-members', 'GET', params);
  }

  async getWorkspaceMember(id: string) {
    return this.request(`/workspace-members/${id}`);
  }

  async updateWorkspaceMember(id: string, data: any) {
    return this.request(`/workspace-members/${id}`, 'PATCH', data);
  }

  async deleteWorkspaceMember(id: string) {
    return this.request(`/workspace-members/${id}`, 'DELETE');
  }

  // Campaign Subsequence endpoints
  async createSubsequence(data: any) {
    return this.request('/subsequences', 'POST', data);
  }

  async listSubsequences(params?: any) {
    return this.request('/subsequences', 'GET', params);
  }

  async duplicateSubsequence(id: string) {
    return this.request(`/subsequences/${id}/duplicate`, 'POST');
  }

  async pauseSubsequence(id: string) {
    return this.request(`/subsequences/${id}/pause`, 'POST');
  }

  async resumeSubsequence(id: string) {
    return this.request(`/subsequences/${id}/resume`, 'POST');
  }

  async getSubsequence(id: string) {
    return this.request(`/subsequences/${id}`);
  }

  async updateSubsequence(id: string, data: any) {
    return this.request(`/subsequences/${id}`, 'PATCH', data);
  }

  async deleteSubsequence(id: string) {
    return this.request(`/subsequences/${id}`, 'DELETE');
  }

  // Audit Log endpoints
  async listAuditLogs(params?: any) {
    return this.request('/audit-logs', 'GET', params);
  }
}

// Create server with proper name
const server = new Server(
  {
    name: 'instantly-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      logging: {},
    },
  }
);

// Define tool schemas
const toolSchemas = {
  // Analytics tools
  get_warmup_analytics: {
    description: 'Get warmup analytics for email accounts',
    inputSchema: {
      type: 'object',
      properties: {
        emails: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of email addresses to get warmup analytics for',
        },
      },
      required: ['emails'],
    },
  },
  test_account_vitals: {
    description: 'Test account vitals and connection status',
    inputSchema: {
      type: 'object',
      properties: {
        accounts: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of email accounts to test',
        },
      },
    },
  },
  get_campaign_analytics: {
    description: 'Get analytics for campaigns',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Campaign ID' },
        ids: { type: 'array', items: { type: 'string' } },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
      },
    },
  },
  get_campaign_analytics_overview: {
    description: 'Get campaign analytics overview',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        ids: { type: 'array', items: { type: 'string' } },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
      },
    },
  },
  get_daily_campaign_analytics: {
    description: 'Get daily campaign analytics',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
      },
    },
  },
  get_campaign_steps_analytics: {
    description: 'Get campaign steps analytics',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
      },
    },
  },
  
  // Account tools
  create_account: {
    description: 'Create a new email account',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        provider_code: { type: 'number' },
        imap_username: { type: 'string' },
        imap_password: { type: 'string' },
        imap_host: { type: 'string' },
        imap_port: { type: 'number' },
        smtp_username: { type: 'string' },
        smtp_password: { type: 'string' },
        smtp_host: { type: 'string' },
        smtp_port: { type: 'number' },
      },
      required: ['email', 'first_name', 'last_name'],
    },
  },
  list_accounts: {
    description: 'List all email accounts',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
        search: { type: 'string' },
      },
    },
  },
  get_account: {
    description: 'Get email account details',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
      },
      required: ['email'],
    },
  },
  update_account: {
    description: 'Update email account',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        daily_limit: { type: 'number' },
      },
      required: ['email'],
    },
  },
  delete_account: {
    description: 'Delete an email account',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
      },
      required: ['email'],
    },
  },
  pause_account: {
    description: 'Pause an email account',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
      },
      required: ['email'],
    },
  },
  resume_account: {
    description: 'Resume a paused email account',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
      },
      required: ['email'],
    },
  },
  mark_account_fixed: {
    description: 'Mark an account as fixed',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
      },
      required: ['email'],
    },
  },
  get_tracking_domain_status: {
    description: 'Get custom tracking domain status',
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string' },
      },
      required: ['host'],
    },
  },
  
  // Campaign tools
  create_campaign: {
    description: 'Create a new campaign',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        campaign_schedule: { type: 'object' },
        sequences: { type: 'array' },
      },
      required: ['name'],
    },
  },
  list_campaigns: {
    description: 'List all campaigns',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
        search: { type: 'string' },
      },
    },
  },
  activate_campaign: {
    description: 'Activate or resume a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  pause_campaign: {
    description: 'Pause a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  get_campaign: {
    description: 'Get campaign details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  update_campaign: {
    description: 'Update campaign settings',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        daily_limit: { type: 'number' },
      },
      required: ['id'],
    },
  },
  delete_campaign: {
    description: 'Delete a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  share_campaign: {
    description: 'Share a campaign for 7 days',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  
  // Email tools
  reply_to_email: {
    description: 'Send a reply to an email',
    inputSchema: {
      type: 'object',
      properties: {
        reply_to_uuid: { type: 'string' },
        eaccount: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'object' },
      },
      required: ['reply_to_uuid', 'eaccount', 'subject', 'body'],
    },
  },
  list_emails: {
    description: 'List emails with filters',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
        search: { type: 'string' },
        campaign_id: { type: 'string' },
      },
    },
  },
  get_email: {
    description: 'Get email details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  update_email: {
    description: 'Update email properties',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        is_unread: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  delete_email: {
    description: 'Delete an email',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  count_unread_emails: {
    description: 'Get count of unread emails',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  mark_thread_as_read: {
    description: 'Mark email thread as read',
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string' },
      },
      required: ['thread_id'],
    },
  },
  
  // Email verification tools
  verify_email: {
    description: 'Verify an email address',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
      },
      required: ['email'],
    },
  },
  get_email_verification: {
    description: 'Get email verification status',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
      },
      required: ['email'],
    },
  },
  
  // Lead tools
  create_lead: {
    description: 'Create a new lead',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        company: { type: 'string' },
      },
      required: ['email'],
    },
  },
  list_leads: {
    description: 'List leads with filters',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        list_id: { type: 'string' },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
    },
  },
  get_lead: {
    description: 'Get lead details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  update_lead: {
    description: 'Update lead information',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        company: { type: 'string' },
      },
      required: ['id'],
    },
  },
  delete_lead: {
    description: 'Delete a lead',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  merge_leads: {
    description: 'Merge duplicate leads',
    inputSchema: {
      type: 'object',
      properties: {
        primary_lead_id: { type: 'string' },
        lead_ids_to_merge: { type: 'array', items: { type: 'string' } },
      },
      required: ['primary_lead_id', 'lead_ids_to_merge'],
    },
  },
  update_lead_interest_status: {
    description: 'Update lead interest status',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        interest_status: { type: 'string' },
      },
      required: ['lead_id', 'interest_status'],
    },
  },
  
  // Lead list tools
  create_lead_list: {
    description: 'Create a new lead list',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['name'],
    },
  },
  list_lead_lists: {
    description: 'List all lead lists',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
      },
    },
  },
  get_lead_list: {
    description: 'Get lead list details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  update_lead_list: {
    description: 'Update lead list information',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['id'],
    },
  },
  delete_lead_list: {
    description: 'Delete a lead list',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },

  // NEW TOOL SCHEMAS ADDED BELOW THIS LINE
  remove_lead_from_subsequence: {
    description: 'Remove a lead from a subsequence',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        subsequence_id: { type: 'string' },
      },
      required: ['lead_id', 'subsequence_id'],
    },
  },

  // Additional Campaign tools from original file
  get_campaign_schedules: {
    description: 'Get campaign schedules',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
      },
      required: ['campaign_id'],
    },
  },
  update_campaign_schedule: {
    description: 'Update campaign schedule settings',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        days_of_the_week: { type: 'array', items: { type: 'number' }, description: 'Days to send (0-6, where 0 is Sunday)' },
        start_hour: { type: 'string', description: 'Start time (e.g., 09:00)' },
        end_hour: { type: 'string', description: 'End time (e.g., 17:00)' },
        timezone: { type: 'string', description: 'Timezone (e.g., America/Los_Angeles)' },
        schedule_start_time: { type: 'string', description: 'Schedule start time (ISO format)' },
        max_new_leads_per_day: { type: 'number', description: 'Max new leads per day' },
        min_time_btw_emails: { type: 'number', description: 'Minutes between emails' },
      },
      required: ['campaign_id'],
    },
  },
  update_campaign_settings: {
    description: 'Update campaign general settings',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        client_id: { type: 'number', description: 'Client ID' },
        enable_ai_esp_matching: { type: 'boolean', description: 'Enable AI ESP matching' },
        send_as_plain_text: { type: 'boolean', description: 'Send as plain text' },
        follow_up_percentage: { type: 'number', description: 'Follow up percentage (0-100)' },
        stop_lead_settings: { type: 'string', enum: ['REPLY_TO_AN_EMAIL', 'CLICK_ON_A_LINK', 'OPEN_AN_EMAIL'], description: 'When to stop sending to lead' },
        track_settings: { type: 'array', items: { type: 'string', enum: ['DONT_TRACK_EMAIL_OPEN', 'DONT_TRACK_LINK_CLICK', 'DONT_TRACK_REPLY_TO_AN_EMAIL'] }, description: 'Tracking settings' },
        unsubscribe_text: { type: 'string', description: 'Unsubscribe link text' },
      },
      required: ['campaign_id'],
    },
  },
  update_campaign_status: {
    description: 'Start, pause, or stop a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        status: { type: 'string', enum: ['START', 'PAUSED', 'STOPPED'], description: 'New campaign status' },
      },
      required: ['campaign_id', 'status'],
    },
  },
  save_campaign_sequence: {
    description: 'Save email sequence for a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        sequences: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              seq_number: { type: 'number', description: 'Sequence number' },
              subject: { type: 'string', description: 'Email subject (blank for follow-up in thread)' },
              email_body: { type: 'string', description: 'Email body HTML' },
              seq_delay_details: {
                type: 'object',
                properties: {
                  delay_in_days: { type: 'number', description: 'Days to wait' },
                },
                required: ['delay_in_days'],
              },
              seq_variants: {
                type: 'array',
                description: 'A/B test variants',
                items: {
                  type: 'object',
                  properties: {
                    variant_label: { type: 'string' },
                    subject: { type: 'string' },
                    email_body: { type: 'string' },
                  },
                },
              },
            },
            required: ['seq_number', 'seq_delay_details'],
          },
        },
      },
      required: ['campaign_id', 'sequences'],
    },
  },
  get_campaign_sequence: {
    description: 'Get email sequence for a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
      },
      required: ['campaign_id'],
    },
  },
  get_campaigns_by_lead: {
    description: 'Get all campaigns a specific lead belongs to',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string', description: 'Lead ID' },
      },
      required: ['lead_id'],
    },
  },
  export_campaign_data: {
    description: 'Export all campaign data as CSV',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
      },
      required: ['campaign_id'],
    },
  },
  get_campaign_analytics_by_date: {
    description: 'Get campaign analytics for a specific date range',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['campaign_id', 'start_date', 'end_date'],
    },
  },
  get_campaign_statistics: {
    description: 'Get detailed campaign statistics with filtering options',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        email_status: { type: 'string', enum: ['opened', 'clicked', 'replied', 'unsubscribed', 'bounced'], description: 'Filter by email status' },
        email_sequence_number: { type: 'number', description: 'Filter by sequence number' },
        limit: { type: 'number', description: 'Number of results' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
      required: ['campaign_id'],
    },
  },
  add_leads_to_campaign: {
    description: 'Add leads to a campaign (max 100 per call)',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        leads: {
          type: 'array',
          description: 'Array of lead objects',
          items: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              first_name: { type: 'string' },
              last_name: { type: 'string' },
              company_name: { type: 'string' },
              company_url: { type: 'string' },
              location: { type: 'string' },
              phone_number: { type: 'string' },
              website: { type: 'string' },
              linkedin_profile: { type: 'string' },
              custom_fields: { type: 'object', description: 'Max 20 custom fields' },
            },
            required: ['email'],
          },
        },
        settings: {
          type: 'object',
          properties: {
            ignore_global_block_list: { type: 'boolean' },
            ignore_unsubscribe_list: { type: 'boolean' },
            ignore_community_bounce_list: { type: 'boolean' },
            ignore_duplicate_leads_in_other_campaign: { type: 'boolean' },
          },
        },
      },
      required: ['campaign_id', 'leads'],
    },
  },
  get_leads_from_campaign: {
    description: 'Get leads from a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        limit: { type: 'number', description: 'Number of leads to retrieve' },
        offset: { type: 'number', description: 'Offset for pagination' },
      },
      required: ['campaign_id'],
    },
  },
  update_lead_in_campaign: {
    description: 'Update a lead in a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        lead_id: { type: 'string', description: 'Lead ID' },
        email: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        company_name: { type: 'string' },
        company_url: { type: 'string' },
        location: { type: 'string' },
        phone_number: { type: 'string' },
        website: { type: 'string' },
        linkedin_profile: { type: 'string' },
        custom_fields: { type: 'object' },
      },
      required: ['campaign_id', 'lead_id'],
    },
  },
  delete_lead_from_campaign: {
    description: 'Delete a lead from a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        lead_id: { type: 'string', description: 'Lead ID' },
      },
      required: ['campaign_id', 'lead_id'],
    },
  },
  get_lead_by_email: {
    description: 'Find a lead by email address across all campaigns',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address to search' },
      },
      required: ['email'],
    },
  },
  get_lead_categories: {
    description: 'Get all available lead categories',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  update_lead_category: {
    description: "Update a lead's category in a campaign",
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        lead_id: { type: 'string', description: 'Lead ID' },
        category_id: { type: 'string', description: 'Category ID' },
        pause_lead: { type: 'boolean', description: 'Pause lead after category update' },
      },
      required: ['campaign_id', 'lead_id', 'category_id'],
    },
  },
  pause_lead: {
    description: 'Pause a lead in a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        lead_id: { type: 'string', description: 'Lead ID' },
      },
      required: ['campaign_id', 'lead_id'],
    },
  },
  resume_lead: {
    description: 'Resume a paused lead in a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        lead_id: { type: 'string', description: 'Lead ID' },
        resume_lead_with_delay_days: { type: 'number', description: 'Days to wait before resuming' },
      },
      required: ['campaign_id', 'lead_id'],
    },
  },
  unsubscribe_lead_from_campaign: {
    description: 'Unsubscribe a lead from a specific campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        lead_id: { type: 'string', description: 'Lead ID' },
      },
      required: ['campaign_id', 'lead_id'],
    },
  },
  unsubscribe_lead_global: {
    description: 'Unsubscribe a lead from all campaigns globally',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string', description: 'Lead ID' },
      },
      required: ['lead_id'],
    },
  },
  get_all_leads: {
    description: 'Fetch all leads from entire account with pagination',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of results (max 100)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
  },
  get_blocklist: {
    description: 'Get all leads/domains in global blocklist',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of results' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
  },
  add_to_blocklist: {
    description: 'Add emails or domains to global blocklist',
    inputSchema: {
      type: 'object',
      properties: {
        domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email addresses or domains to block',
        },
        client_id: { type: 'string', description: 'Client ID (optional, for client-specific blocking)' },
      },
      required: ['domains'],
    },
  },
  get_message_history: {
    description: 'Get the complete message history for a lead in a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        lead_id: { type: 'string', description: 'Lead ID' },
      },
      required: ['campaign_id', 'lead_id'],
    },
  },
  reply_to_lead: {
    description: 'Reply to a lead in a campaign thread',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        email_stats_id: { type: 'string', description: 'Email stats ID from message history' },
        email_body: { type: 'string', description: 'Reply message body' },
        reply_message_id: { type: 'string', description: 'Message ID to reply to' },
        reply_email_time: { type: 'string', description: 'Time of the email being replied to' },
        reply_email_body: { type: 'string', description: 'Body of the email being replied to' },
        cc: { type: 'string', description: 'CC email addresses (optional)' },
        bcc: { type: 'string', description: 'BCC email addresses (optional)' },
        add_signature: { type: 'boolean', description: 'Add signature to reply (optional)' },
      },
      required: ['campaign_id', 'email_stats_id', 'email_body', 'reply_message_id', 'reply_email_time', 'reply_email_body'],
    },
  },
  get_campaign_analytics: {
    description: 'Get analytics for a specific campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
      },
      required: ['campaign_id'],
    },
  },
  get_email_account_analytics: {
    description: 'Get analytics for all email accounts',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  get_master_inbox_stats: {
    description: 'Get master inbox statistics',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // Email Account Management tools
  get_email_accounts: {
    description: 'Get all email accounts with warmup details',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of results (max 100)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
  },
  get_email_account: {
    description: 'Get specific email account details',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Email account ID' },
      },
      required: ['account_id'],
    },
  },
  create_email_account: {
    description: 'Create a new email account',
    inputSchema: {
      type: 'object',
      properties: {
        from_name: { type: 'string', description: 'Sender name' },
        from_email: { type: 'string', description: 'Sender email' },
        user_name: { type: 'string', description: 'SMTP username' },
        password: { type: 'string', description: 'SMTP password' },
        smtp_host: { type: 'string', description: 'SMTP host' },
        smtp_port: { type: 'number', description: 'SMTP port' },
        imap_host: { type: 'string', description: 'IMAP host' },
        imap_port: { type: 'number', description: 'IMAP port' },
        max_email_per_day: { type: 'number', description: 'Daily sending limit' },
        warmup_enabled: { type: 'boolean', description: 'Enable warmup' },
      },
      required: ['from_name', 'from_email', 'user_name', 'password', 'smtp_host', 'smtp_port'],
    },
  },
  update_email_account: {
    description: 'Update email account settings',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Email account ID' },
        max_email_per_day: { type: 'number', description: 'Daily sending limit' },
        time_to_wait_in_mins: { type: 'number', description: 'Minimum wait between sends' },
        signature: { type: 'string', description: 'Email signature HTML' },
        custom_tracking_url: { type: 'string', description: 'Custom tracking domain' },
        bcc: { type: 'string', description: 'BCC email address' },
        client_id: { type: 'string', description: 'Assign to client' },
      },
      required: ['account_id'],
    },
  },
  get_campaign_email_accounts: {
    description: 'List all email accounts used in a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
      },
      required: ['campaign_id'],
    },
  },
  add_email_to_campaign: {
    description: 'Add email accounts to a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        email_account_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Email account IDs to add',
        },
      },
      required: ['campaign_id', 'email_account_ids'],
    },
  },
  remove_email_from_campaign: {
    description: 'Remove email accounts from a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        email_account_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Email account IDs to remove',
        },
      },
      required: ['campaign_id', 'email_account_ids'],
    },
  },
  update_warmup: {
    description: 'Configure email warmup settings',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Email account ID' },
        warmup_enabled: { type: 'boolean', description: 'Enable/disable warmup' },
        total_warmup_per_day: { type: 'number', description: 'Daily warmup emails' },
        daily_rampup: { type: 'number', description: 'Daily increase amount' },
        reply_rate_percentage: { type: 'number', description: 'Target reply rate %' },
      },
      required: ['account_id', 'warmup_enabled'],
    },
  },
  get_warmup_stats: {
    description: 'Get email warmup statistics for last 7 days',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'string', description: 'Email account ID' },
      },
      required: ['account_id'],
    },
  },
  reconnect_failed_accounts: {
    description: 'Bulk reconnect all failed email accounts (max 3 times per day)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // Additional tools
  send_reply: {
    description: 'Send a reply to a lead',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        lead_email: { type: 'string', description: 'Lead email' },
        message: { type: 'string', description: 'Reply message' },
      },
      required: ['campaign_id', 'lead_email', 'message'],
    },
  },
  get_conversations: {
    description: 'Get conversations, optionally filtered by campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID (optional)' },
      },
    },
  },

  // Webhook tools
  list_webhooks: {
    description: 'List all webhooks for a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
      },
      required: ['campaign_id'],
    },
  },
  create_webhook: {
    description: 'Create a new webhook for a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        name: { type: 'string', description: 'Webhook name' },
        webhook_url: { type: 'string', description: 'Webhook URL' },
        event_types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['EMAIL_SENT', 'EMAIL_OPEN', 'EMAIL_LINK_CLICK', 'EMAIL_REPLY', 'LEAD_UNSUBSCRIBED', 'LEAD_CATEGORY_UPDATED'],
          },
          description: 'Events to subscribe to',
        },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Categories to filter (for LEAD_CATEGORY_UPDATED)',
        },
      },
      required: ['campaign_id', 'name', 'webhook_url', 'event_types'],
    },
  },
  delete_webhook: {
    description: 'Delete a webhook from a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID' },
        webhook_id: { type: 'string', description: 'Webhook ID' },
      },
      required: ['campaign_id', 'webhook_id'],
    },
  },

  // Client/Whitelabel tools
  create_client: {
    description: 'Add a new client to your whitelabel system',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Client name' },
        email: { type: 'string', description: 'Client email' },
        password: { type: 'string', description: 'Client password' },
        permission: {
          type: 'array',
          items: { type: 'string' },
          description: 'Permissions (e.g., ["reply_master_inbox"] or ["full_access"])',
        },
        logo: { type: 'string', description: 'Company name for branding' },
        logo_url: { type: 'string', description: 'Logo URL' },
      },
      required: ['name', 'email', 'password', 'permission'],
    },
  },
  list_clients: {
    description: 'Get all clients in your whitelabel system',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // Additional Lead tools
  bulk_assign_leads: {
    description: 'Bulk assign leads to users',
    inputSchema: {
      type: 'object',
      properties: {
        lead_ids: { type: 'array', items: { type: 'string' } },
        user_id: { type: 'string' },
      },
      required: ['lead_ids', 'user_id'],
    },
  },
  move_leads: {
    description: 'Move leads between campaigns or lists',
    inputSchema: {
      type: 'object',
      properties: {
        lead_ids: { type: 'array', items: { type: 'string' } },
        from_campaign_id: { type: 'string' },
        to_campaign_id: { type: 'string' },
        from_list_id: { type: 'string' },
        to_list_id: { type: 'string' },
      },
      required: ['lead_ids'],
    },
  },
  export_leads: {
    description: 'Export leads to external app',
    inputSchema: {
      type: 'object',
      properties: {
        lead_ids: { type: 'array', items: { type: 'string' } },
        app_id: { type: 'string' },
        format: { type: 'string', enum: ['csv', 'json'] },
      },
      required: ['lead_ids', 'app_id'],
    },
  },
  move_lead_to_subsequence: {
    description: 'Move a lead to a subsequence',
    inputSchema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        subsequence_id: { type: 'string' },
      },
      required: ['lead_id', 'subsequence_id'],
    },
  },

  // Inbox Placement Test tools
  create_inbox_placement_test: {
    description: 'Create a new inbox placement test',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'number', enum: [1, 2] },
        delivery_mode: { type: 'number', enum: [1, 2] },
        description: { type: 'string' },
        schedule: { type: 'object' },
        sending_method: { type: 'number', enum: [1, 2] },
        campaign_id: { type: 'string' },
        email_subject: { type: 'string' },
        email_body: { type: 'string' },
        emails: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        text_only: { type: 'boolean' },
        recipients_labels: { type: 'array' },
        automations: { type: 'array' },
      },
      required: ['name', 'type'],
    },
  },
  list_inbox_placement_tests: {
    description: 'List all inbox placement tests',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
      },
    },
  },
  get_inbox_placement_test: {
    description: 'Get inbox placement test details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  delete_inbox_placement_test: {
    description: 'Delete an inbox placement test',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  update_inbox_placement_test: {
    description: 'Update an inbox placement test',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'number' },
      },
      required: ['id'],
    },
  },
  get_email_service_provider_options: {
    description: 'Get available email service provider options for inbox placement tests',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // Inbox Placement Analytics tools
  list_inbox_placement_analytics: {
    description: 'List inbox placement analytics',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
        test_id: { type: 'string' },
      },
    },
  },
  get_inbox_placement_analytic: {
    description: 'Get specific inbox placement analytic',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  get_inbox_placement_stats_by_test_id: {
    description: 'Get inbox placement statistics by test ID',
    inputSchema: {
      type: 'object',
      properties: {
        test_ids: { type: 'array', items: { type: 'string' } },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
      },
      required: ['test_ids'],
    },
  },
  get_deliverability_insights: {
    description: 'Get deliverability insights',
    inputSchema: {
      type: 'object',
      properties: {
        test_ids: { type: 'array', items: { type: 'string' } },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
      },
    },
  },
  get_inbox_placement_stats_by_date: {
    description: 'Get inbox placement statistics by date',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        test_ids: { type: 'array', items: { type: 'string' } },
      },
      required: ['start_date', 'end_date'],
    },
  },

  // Inbox Placement Reports tools
  list_inbox_placement_reports: {
    description: 'List inbox placement reports',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
        test_id: { type: 'string' },
      },
    },
  },
  get_inbox_placement_report: {
    description: 'Get specific inbox placement report',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },

  // API Key tools
  create_api_key: {
    description: 'Create a new API key',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        scopes: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'scopes'],
    },
  },
  list_api_keys: {
    description: 'List all API keys',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
      },
    },
  },
  delete_api_key: {
    description: 'Delete an API key',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },

  // Account Campaign Mapping tools
  get_account_campaign_mappings: {
    description: 'Get campaign mappings for a specific email account',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
      },
      required: ['email'],
    },
  },

  // Background Job tools
  list_background_jobs: {
    description: 'List background jobs',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
        status: { type: 'string' },
        type: { type: 'string' },
      },
    },
  },
  get_background_job: {
    description: 'Get background job details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },

  // Custom Tag tools
  create_custom_tag: {
    description: 'Create a new custom tag',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        color: { type: 'string' },
      },
      required: ['name'],
    },
  },
  list_custom_tags: {
    description: 'List all custom tags',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
      },
    },
  },
  get_custom_tag: {
    description: 'Get custom tag details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  update_custom_tag: {
    description: 'Update a custom tag',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        color: { type: 'string' },
      },
      required: ['id'],
    },
  },
  delete_custom_tag: {
    description: 'Delete a custom tag',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  toggle_custom_tag_resource: {
    description: 'Toggle custom tag on a resource',
    inputSchema: {
      type: 'object',
      properties: {
        tag_id: { type: 'string' },
        resource_id: { type: 'string' },
        resource_type: { type: 'string', enum: ['account', 'campaign'] },
      },
      required: ['tag_id', 'resource_id', 'resource_type'],
    },
  },

  // Block List Entry tools
  create_block_list_entry: {
    description: 'Add email or domain to block list',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'string' },
        type: { type: 'string', enum: ['email', 'domain'] },
        reason: { type: 'string' },
      },
      required: ['value', 'type'],
    },
  },
  list_block_list_entries: {
    description: 'List block list entries',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
        search: { type: 'string' },
      },
    },
  },
  get_block_list_entry: {
    description: 'Get block list entry details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  update_block_list_entry: {
    description: 'Update a block list entry',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['id'],
    },
  },
  delete_block_list_entry: {
    description: 'Delete a block list entry',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },

  // Lead Label tools
  create_lead_label: {
    description: 'Create a new lead label',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        color: { type: 'string' },
        ai_enabled: { type: 'boolean' },
      },
      required: ['name'],
    },
  },
  list_lead_labels: {
    description: 'List all lead labels',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
      },
    },
  },
  get_lead_label: {
    description: 'Get lead label details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  update_lead_label: {
    description: 'Update a lead label',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        color: { type: 'string' },
        ai_enabled: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  delete_lead_label: {
    description: 'Delete a lead label',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },

  // Workspace tools
  get_current_workspace: {
    description: 'Get current workspace details',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  update_current_workspace: {
    description: 'Update current workspace settings',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        settings: { type: 'object' },
      },
    },
  },

  // Workspace Group Member tools
  create_workspace_group_member: {
    description: 'Add member to workspace group',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'member'] },
      },
      required: ['email', 'role'],
    },
  },
  list_workspace_group_members: {
    description: 'List workspace group members',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
      },
    },
  },
  get_workspace_group_member: {
    description: 'Get workspace group member details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  delete_workspace_group_member: {
    description: 'Remove member from workspace group',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  get_admin_workspace_group_members: {
    description: 'Get all admin workspace group members',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // Workspace Member tools
  create_workspace_member: {
    description: 'Add member to workspace',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'editor', 'view'] },
      },
      required: ['email', 'role'],
    },
  },
  list_workspace_members: {
    description: 'List workspace members',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
      },
    },
  },
  get_workspace_member: {
    description: 'Get workspace member details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  update_workspace_member: {
    description: 'Update workspace member role',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'editor', 'view'] },
      },
      required: ['id', 'role'],
    },
  },
  delete_workspace_member: {
    description: 'Remove member from workspace',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },

  // Campaign Subsequence tools
  create_subsequence: {
    description: 'Create a new subsequence',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        campaign_id: { type: 'string' },
        trigger_conditions: { type: 'array' },
        sequences: { type: 'array' },
      },
      required: ['name', 'campaign_id'],
    },
  },
  list_subsequences: {
    description: 'List all subsequences',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
        campaign_id: { type: 'string' },
      },
    },
  },
  duplicate_subsequence: {
    description: 'Duplicate an existing subsequence',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  pause_subsequence: {
    description: 'Pause a subsequence',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  resume_subsequence: {
    description: 'Resume a paused subsequence',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  get_subsequence: {
    description: 'Get subsequence details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  update_subsequence: {
    description: 'Update subsequence settings',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        trigger_conditions: { type: 'array' },
      },
      required: ['id'],
    },
  },
  delete_subsequence: {
    description: 'Delete a subsequence',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },

  // Audit Log tools
  list_audit_logs: {
    description: 'List audit log entries',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        starting_after: { type: 'string' },
        user_id: { type: 'string' },
        action: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
      },
    },
  },
} as const;

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.entries(toolSchemas).map(([name, schema]) => ({
      name,
      description: schema.description,
      inputSchema: schema.inputSchema,
    })),
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const client = new InstantlyClient(INSTANTLY_API_KEY);
  const { name, arguments: args } = request.params;

  try {
    let result;
    
    // Type guard to ensure args is defined
    if (!args) {
      throw new Error('No arguments provided');
    }
    
    // Cast args to any to bypass TypeScript strict checking
    const params = args as any;
    
    switch (name) {
      // Analytics tools
      case 'get_warmup_analytics':
        result = await client.getWarmupAnalytics(params.emails);
        break;
      case 'test_account_vitals':
        result = await client.testAccountVitals(params.accounts);
        break;
      case 'get_campaign_analytics':
        result = await client.getCampaignAnalytics(params);
        break;
      case 'get_campaign_analytics_overview':
        result = await client.getCampaignAnalyticsOverview(params);
        break;
      case 'get_daily_campaign_analytics':
        result = await client.getDailyCampaignAnalytics(params);
        break;
      case 'get_campaign_steps_analytics':
        result = await client.getCampaignStepsAnalytics(params);
        break;
      
      // Account tools
      case 'create_account':
        result = await client.createAccount(params);
        break;
      case 'list_accounts':
        result = await client.listAccounts(params);
        break;
      case 'get_account':
        result = await client.getAccount(params.email);
        break;
      case 'update_account':
        const { email: updateEmail, ...updateData } = params;
        result = await client.updateAccount(updateEmail, updateData);
        break;
      case 'delete_account':
        result = await client.deleteAccount(params.email);
        break;
      case 'pause_account':
        result = await client.pauseAccount(params.email);
        break;
      case 'resume_account':
        result = await client.resumeAccount(params.email);
        break;
      case 'mark_account_fixed':
        result = await client.markAccountFixed(params.email);
        break;
      case 'get_tracking_domain_status':
        result = await client.getCustomTrackingDomainStatus(params.host);
        break;
      
      // Campaign tools
      case 'create_campaign':
        result = await client.createCampaign(params);
        break;
      case 'list_campaigns':
        result = await client.listCampaigns(params);
        break;
      case 'activate_campaign':
        result = await client.activateCampaign(params.id);
        break;
      case 'pause_campaign':
        result = await client.pauseCampaign(params.id);
        break;
      case 'get_campaign':
        result = await client.getCampaign(params.id);
        break;
      case 'update_campaign':
        const { id: campaignId, ...campaignData } = params;
        result = await client.updateCampaign(campaignId, campaignData);
        break;
      case 'delete_campaign':
        result = await client.deleteCampaign(params.id);
        break;
      case 'share_campaign':
        result = await client.shareCampaign(params.id);
        break;
      
      // Email tools
      case 'reply_to_email':
        result = await client.replyToEmail(params);
        break;
      case 'list_emails':
        result = await client.listEmails(params);
        break;
      case 'get_email':
        result = await client.getEmail(params.id);
        break;
      case 'update_email':
        const { id: emailId, ...emailData } = params;
        result = await client.updateEmail(emailId, emailData);
        break;
      case 'delete_email':
        result = await client.deleteEmail(params.id);
        break;
      case 'count_unread_emails':
        result = await client.countUnreadEmails();
        break;
      case 'mark_thread_as_read':
        result = await client.markThreadAsRead(params.thread_id);
        break;
      
      // Email verification tools
      case 'verify_email':
        result = await client.verifyEmail(params.email);
        break;
      case 'get_email_verification':
        result = await client.getEmailVerification(params.email);
        break;
      
      // Lead tools
      case 'create_lead':
        result = await client.createLead(params);
        break;
      case 'list_leads':
        result = await client.listLeads(params);
        break;
      case 'get_lead':
        result = await client.getLead(params.id);
        break;
      case 'update_lead':
        const { id: leadId, ...leadData } = params;
        result = await client.updateLead(leadId, leadData);
        break;
      case 'delete_lead':
        result = await client.deleteLead(params.id);
        break;
      case 'merge_leads':
        result = await client.mergeLeads(params);
        break;
      case 'update_lead_interest_status':
        result = await client.updateLeadInterestStatus(params);
        break;
      
      // Lead list tools
      case 'create_lead_list':
        result = await client.createLeadList(params);
        break;
      case 'list_lead_lists':
        result = await client.listLeadLists(params);
        break;
      case 'get_lead_list':
        result = await client.getLeadList(params.id);
        break;
      case 'update_lead_list':
        const { id: listId, ...listData } = params;
        result = await client.updateLeadList(listId, listData);
        break;
      case 'delete_lead_list':
        result = await client.deleteLeadList(params.id);
        break;

      // NEW CASE STATEMENTS ADDED BELOW THIS LINE
      case 'remove_lead_from_subsequence':
        result = await client.removeLeadFromSubsequence(params);
        break;

      // Additional Campaign tools
      case 'get_campaign_schedules':
        result = await client.getCampaignSchedules(params.campaign_id);
        break;
      case 'update_campaign_schedule':
        result = await client.updateCampaignSchedule(params.campaign_id, params);
        break;
      case 'update_campaign_settings':
        result = await client.updateCampaignSettings(params.campaign_id, params);
        break;
      case 'update_campaign_status':
        result = await client.updateCampaignStatus(params.campaign_id, params.status);
        break;
      case 'save_campaign_sequence':
        result = await client.saveCampaignSequence(params.campaign_id, params.sequences);
        break;
      case 'get_campaign_sequence':
        result = await client.getCampaignSequence(params.campaign_id);
        break;
      case 'get_campaigns_by_lead':
        result = await client.getCampaignsByLead(params.lead_id);
        break;
      case 'export_campaign_data':
        result = await client.exportCampaignData(params.campaign_id);
        break;
      case 'get_campaign_analytics_by_date':
        result = await client.getCampaignAnalyticsByDate(params.campaign_id, params.start_date, params.end_date);
        break;
      case 'get_campaign_statistics':
        result = await client.getCampaignStatistics(params);
        break;
      case 'add_leads_to_campaign':
        result = await client.addLeadsToCampaign(params.campaign_id, params);
        break;
      case 'get_leads_from_campaign':
        result = await client.getLeadsFromCampaign(params.campaign_id, params);
        break;
      case 'update_lead_in_campaign':
        result = await client.updateLeadInCampaign(params.campaign_id, params.lead_id, params);
        break;
      case 'delete_lead_from_campaign':
        result = await client.deleteLeadFromCampaign(params.campaign_id, params.lead_id);
        break;
      case 'get_lead_by_email':
        result = await client.getLeadByEmail(params.email);
        break;
      case 'get_lead_categories':
        result = await client.getLeadCategories();
        break;
      case 'update_lead_category':
        result = await client.updateLeadCategory(params);
        break;
      case 'pause_lead':
        result = await client.pauseLead(params.campaign_id, params.lead_id);
        break;
      case 'resume_lead':
        result = await client.resumeLead(params.campaign_id, params.lead_id, params);
        break;
      case 'unsubscribe_lead_from_campaign':
        result = await client.unsubscribeLeadFromCampaign(params.campaign_id, params.lead_id);
        break;
      case 'unsubscribe_lead_global':
        result = await client.unsubscribeLeadGlobal(params.lead_id);
        break;
      case 'get_all_leads':
        result = await client.getAllLeads(params);
        break;
      case 'get_blocklist':
        result = await client.getBlocklist(params);
        break;
      case 'add_to_blocklist':
        result = await client.addToBlocklist(params);
        break;
      case 'get_message_history':
        result = await client.getMessageHistory(params.campaign_id, params.lead_id);
        break;
      case 'reply_to_lead':
        result = await client.replyToLead(params);
        break;
      case 'get_campaign_analytics':
        result = await client.getCampaignAnalytics(params.campaign_id);
        break;
      case 'get_email_account_analytics':
        result = await client.getEmailAccountAnalytics();
        break;
      case 'get_master_inbox_stats':
        result = await client.getMasterInboxStats();
        break;
      
      // Email Account Management tools
      case 'get_email_accounts':
        result = await client.getEmailAccounts(params);
        break;
      case 'get_email_account':
        result = await client.getEmailAccount(params.account_id);
        break;
      case 'create_email_account':
        result = await client.createEmailAccount(params);
        break;
      case 'update_email_account':
        result = await client.updateEmailAccount(params.account_id, params);
        break;
      case 'get_campaign_email_accounts':
        result = await client.getCampaignEmailAccounts(params.campaign_id);
        break;
      case 'add_email_to_campaign':
        result = await client.addEmailToCampaign(params.campaign_id, params.email_account_ids);
        break;
      case 'remove_email_from_campaign':
        result = await client.removeEmailFromCampaign(params.campaign_id, params.email_account_ids);
        break;
      case 'update_warmup':
        result = await client.updateWarmup(params.account_id, params);
        break;
      case 'get_warmup_stats':
        result = await client.getWarmupStats(params.account_id);
        break;
      case 'reconnect_failed_accounts':
        result = await client.reconnectFailedAccounts();
        break;
      
      // Additional tools
      case 'send_reply':
        result = await client.sendReply(params);
        break;
      case 'get_conversations':
        result = await client.getConversations(params.campaign_id);
        break;
      
      // Webhook tools
      case 'list_webhooks':
        result = await client.listWebhooks(params.campaign_id);
        break;
      case 'create_webhook':
        result = await client.createWebhook(params);
        break;
      case 'delete_webhook':
        result = await client.deleteWebhook(params.campaign_id, params.webhook_id);
        break;
      
      // Client/Whitelabel tools
      case 'create_client':
        result = await client.createClient(params);
        break;
      case 'list_clients':
        result = await client.listClients();
        break;

      // Additional Lead tools
      case 'bulk_assign_leads':
        result = await client.bulkAssignLeads(params);
        break;
      case 'move_leads':
        result = await client.moveLeads(params);
        break;
      case 'export_leads':
        result = await client.exportLeads(params);
        break;
      case 'move_lead_to_subsequence':
        result = await client.moveLeadToSubsequence(params);
        break;

      // Inbox Placement Test tools
      case 'create_inbox_placement_test':
        result = await client.createInboxPlacementTest(params);
        break;
      case 'list_inbox_placement_tests':
        result = await client.listInboxPlacementTests(params);
        break;
      case 'get_inbox_placement_test':
        result = await client.getInboxPlacementTest(params.id);
        break;
      case 'delete_inbox_placement_test':
        result = await client.deleteInboxPlacementTest(params.id);
        break;
      case 'update_inbox_placement_test':
        result = await client.updateInboxPlacementTest(params.id, params);
        break;
      case 'get_email_service_provider_options':
        result = await client.getEmailServiceProviderOptions();
        break;
      
      // Inbox Placement Analytics tools
      case 'list_inbox_placement_analytics':
        result = await client.listInboxPlacementAnalytics(params);
        break;
      case 'get_inbox_placement_analytic':
        result = await client.getInboxPlacementAnalytic(params.id);
        break;
      case 'get_inbox_placement_stats_by_test_id':
        result = await client.getInboxPlacementStatsByTestId(params);
        break;
      case 'get_deliverability_insights':
        result = await client.getDeliverabilityInsights(params);
        break;
      case 'get_inbox_placement_stats_by_date':
        result = await client.getInboxPlacementStatsByDate(params);
        break;
      
      // Inbox Placement Reports tools
      case 'list_inbox_placement_reports':
        result = await client.listInboxPlacementReports(params);
        break;
      case 'get_inbox_placement_report':
        result = await client.getInboxPlacementReport(params.id);
        break;
      
      // API Key tools
      case 'create_api_key':
        result = await client.createApiKey(params);
        break;
      case 'list_api_keys':
        result = await client.listApiKeys(params);
        break;
      case 'delete_api_key':
        result = await client.deleteApiKey(params.id);
        break;
      
      // Account Campaign Mapping tools
      case 'get_account_campaign_mappings':
        result = await client.getAccountCampaignMappings(params.email);
        break;
      
      // Background Job tools
      case 'list_background_jobs':
        result = await client.listBackgroundJobs(params);
        break;
      case 'get_background_job':
        result = await client.getBackgroundJob(params.id);
        break;
      
      // Custom Tag tools
      case 'create_custom_tag':
        result = await client.createCustomTag(params);
        break;
      case 'list_custom_tags':
        result = await client.listCustomTags(params);
        break;
      case 'get_custom_tag':
        result = await client.getCustomTag(params.id);
        break;
      case 'update_custom_tag':
        result = await client.updateCustomTag(params.id, params);
        break;
      case 'delete_custom_tag':
        result = await client.deleteCustomTag(params.id);
        break;
      case 'toggle_custom_tag_resource':
        result = await client.toggleCustomTagResource(params);
        break;
      
      // Block List Entry tools
      case 'create_block_list_entry':
        result = await client.createBlockListEntry(params);
        break;
      case 'list_block_list_entries':
        result = await client.listBlockListEntries(params);
        break;
      case 'get_block_list_entry':
        result = await client.getBlockListEntry(params.id);
        break;
      case 'update_block_list_entry':
        result = await client.updateBlockListEntry(params.id, params);
        break;
      case 'delete_block_list_entry':
        result = await client.deleteBlockListEntry(params.id);
        break;
      
      // Lead Label tools
      case 'create_lead_label':
        result = await client.createLeadLabel(params);
        break;
      case 'list_lead_labels':
        result = await client.listLeadLabels(params);
        break;
      case 'get_lead_label':
        result = await client.getLeadLabel(params.id);
        break;
      case 'update_lead_label':
        result = await client.updateLeadLabel(params.id, params);
        break;
      case 'delete_lead_label':
        result = await client.deleteLeadLabel(params.id);
        break;
      
      // Workspace tools
      case 'get_current_workspace':
        result = await client.getCurrentWorkspace();
        break;
      case 'update_current_workspace':
        result = await client.updateCurrentWorkspace(params);
        break;
      
      // Workspace Group Member tools
      case 'create_workspace_group_member':
        result = await client.createWorkspaceGroupMember(params);
        break;
      case 'list_workspace_group_members':
        result = await client.listWorkspaceGroupMembers(params);
        break;
      case 'get_workspace_group_member':
        result = await client.getWorkspaceGroupMember(params.id);
        break;
      case 'delete_workspace_group_member':
        result = await client.deleteWorkspaceGroupMember(params.id);
        break;
      case 'get_admin_workspace_group_members':
        result = await client.getAdminWorkspaceGroupMembers();
        break;
      
      // Workspace Member tools
      case 'create_workspace_member':
        result = await client.createWorkspaceMember(params);
        break;
      case 'list_workspace_members':
        result = await client.listWorkspaceMembers(params);
        break;
      case 'get_workspace_member':
        result = await client.getWorkspaceMember(params.id);
        break;
      case 'update_workspace_member':
        result = await client.updateWorkspaceMember(params.id, params);
        break;
      case 'delete_workspace_member':
        result = await client.deleteWorkspaceMember(params.id);
        break;
      
      // Campaign Subsequence tools
      case 'create_subsequence':
        result = await client.createSubsequence(params);
        break;
      case 'list_subsequences':
        result = await client.listSubsequences(params);
        break;
      case 'duplicate_subsequence':
        result = await client.duplicateSubsequence(params.id);
        break;
      case 'pause_subsequence':
        result = await client.pauseSubsequence(params.id);
        break;
      case 'resume_subsequence':
        result = await client.resumeSubsequence(params.id);
        break;
      case 'get_subsequence':
        result = await client.getSubsequence(params.id);
        break;
      case 'update_subsequence':
        result = await client.updateSubsequence(params.id, params);
        break;
      case 'delete_subsequence':
        result = await client.deleteSubsequence(params.id);
        break;
      
      // Audit Log tools
      case 'list_audit_logs':
        result = await client.listAuditLogs(params);
        break;
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Instantly MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
