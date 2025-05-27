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
