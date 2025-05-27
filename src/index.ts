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

// Define tool schemas - Analytics
const analyticsToolSchemas = {
  get_warmup_analytics: {
    description: 'Get warmup analytics for email accounts',
    inputSchema: {
      type: 'object',
      properties: {
        emails: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of email addresses to get warmup analytics for',
          minItems: 1,
          maxItems: 100,
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
    description: 'Get analytics for one or multiple campaigns',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Campaign ID (leave empty for all campaigns)' },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Multiple campaign IDs',
        },
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        exclude_total_leads_count: { type: 'boolean', description: 'Exclude total leads count' },
      },
    },
  },
  get_campaign_analytics_overview: {
    description: 'Get analytics overview for campaigns',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Campaign ID (leave empty for all campaigns)' },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Multiple campaign IDs',
        },
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        campaign_status: {
          type: 'number',
          description: 'Filter by campaign status',
          enum: [0, 1, 2, 3, 4, -99, -1, -2],
        },
      },
    },
  },
  get_daily_campaign_analytics: {
    description: 'Get daily campaign analytics',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID (optional)' },
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        campaign_status: {
          type: 'number',
          description: 'Filter by campaign status',
          enum: [0, 1, 2, 3, 4, -99, -1, -2],
        },
      },
    },
  },
  get_campaign_steps_analytics: {
    description: 'Get campaign steps analytics',
    inputSchema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'Campaign ID (optional)' },
        start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
    },
  },
};

// Account tool schemas
const accountToolSchemas = {
  create_account: {
    description: 'Create a new email account',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email', description: 'Email address' },
        first_name: { type: 'string', description: 'First name' },
        last_name: { type: 'string', description: 'Last name' },
        provider_code: {
          type: 'number',
          description: 'Provider code (1=Custom, 2=Google, 3=Microsoft, 4=AWS)',
          enum: [1, 2, 3, 4],
        },
        imap_username: { type: 'string' },
        imap_password: { type: 'string' },
        imap_host: { type: 'string' },
        imap_port: { type: 'number' },
        smtp_username: { type: 'string' },
        smtp_password: { type: 'string' },
        smtp_host: { type: 'string' },
        smtp_port: { type: 'number' },
        warmup: { type: 'object' },
        daily_limit: { type: 'number' },
        tracking_domain_name: { type: 'string' },
        sending_gap: { type: 'number', minimum: 0, maximum: 1440 },
      },
      required: ['email', 'first_name', 'last_name', 'provider_code', 'imap_username', 
                 'imap_password', 'imap_host', 'imap_port', 'smtp_username', 
                 'smtp_password', 'smtp_host', 'smtp_port'],
    },
  },
  list_accounts: {
    description: 'List all email accounts',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        starting_after: { type: 'string' },
        search: { type: 'string' },
        status: { type: 'number', enum: [1, 2, -1, -2, -3] },
        provider_code: { type: 'number', enum: [1, 2, 3, 4] },
        tag_ids: { type: 'string' },
      },
    },
  },
  get_account: {
    description: 'Get email account details',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address of the account' },
      },
      required: ['email'],
    },
  },
  update_account: {
    description: 'Update email account settings',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address of the account' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        warmup: { type: 'object' },
        daily_limit: { type: 'number' },
        tracking_domain_name: { type: 'string' },
        enable_slow_ramp: { type: 'boolean' },
        sending_gap: { type: 'number', minimum: 0, maximum: 1440 },
      },
      required: ['email'],
    },
  },
  delete_account: {
    description: 'Delete an email account',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address of the account' },
      },
      required: ['email'],
    },
  },
  pause_account: {
    description: 'Pause an email account',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address of the account' },
      },
      required: ['email'],
    },
  },
  resume_account: {
    description: 'Resume a paused email account',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address of the account' },
      },
      required: ['email'],
    },
  },
  mark_account_fixed: {
    description: 'Mark an account as fixed',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Email address of the account' },
      },
      required: ['email'],
    },
  },
  get_tracking_domain_status: {
    description: 'Get custom tracking domain status',
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Custom tracking domain host' },
      },
      required: ['host'],
    },
  },
};

// Campaign tool schemas
const campaignToolSchemas = {
  create_campaign: {
    description: 'Create a new campaign',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Campaign name' },
        campaign_schedule: {
          type: 'object',
          description: 'Campaign schedule settings',
          properties: {
            schedules: { type: 'array' },
            start_date: { type: 'string' },
            end_date: { type: 'string' },
          },
          required: ['schedules'],
        },
        pl_value: { type: 'number', description: 'Value of every positive lead' },
        is_evergreen: { type: 'boolean' },
        sequences: { type: 'array', description: 'Email sequences' },
        email_gap: { type: 'number' },
        random_wait_max: { type: 'number' },
        text_only: { type: 'boolean' },
        email_list: { type: 'array', items: { type: 'string' } },
        daily_limit: { type: 'number' },
        stop_on_reply: { type: 'boolean' },
        link_tracking: { type: 'boolean' },
        open_tracking: { type: 'boolean' },
      },
      required: ['name', 'campaign_schedule'],
    },
  },
  list_campaigns: {
    description: 'List all campaigns',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        starting_after: { type: 'string' },
        search: { type: 'string' },
        tag_ids: { type: 'string' },
      },
    },
  },
  activate_campaign: {
    description: 'Activate (start) or resume a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Campaign ID' },
      },
      required: ['id'],
    },
  },
  pause_campaign: {
    description: 'Stop (pause) a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Campaign ID' },
      },
      required: ['id'],
    },
  },
  get_campaign: {
    description: 'Get campaign details',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Campaign ID' },
      },
      required: ['id'],
    },
  },
  update_campaign: {
    description: 'Update campaign settings',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Campaign ID' },
        name: { type: 'string' },
        pl_value: { type: 'number' },
        is_evergreen: { type: 'boolean' },
        campaign_schedule: { type: 'object' },
        sequences: { type: 'array' },
        email_gap: { type: 'number' },
        daily_limit: { type: 'number' },
        stop_on_reply: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  delete_campaign: {
    description: 'Delete a campaign',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Campaign ID' },
      },
      required: ['id'],
    },
  },
  share_campaign: {
    description: 'Share a campaign for 7 days',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Campaign ID' },
      },
      required: ['id'],
    },
  },
};

// Email tool schemas
const emailToolSchemas = {
  reply_to_email: {
    description: 'Send a reply to an email',
    inputSchema: {
      type: 'object',
      properties: {
        reply_to_uuid: { type: 'string', description: 'ID of the email to reply to' },
        eaccount: { type: 'string', description: 'Email account to send from' },
        subject: { type: 'string', description: 'Email subject' },
        body: {
          type: 'object',
          properties: {
            html: { type: 'string' },
            text: { type: 'string' },
          },
        },
