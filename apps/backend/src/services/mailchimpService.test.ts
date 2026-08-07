import assert from "node:assert/strict";
import test from "node:test";

import type { AirtableClient } from "../airtable/client.js";
import type { AppConfig } from "../config/env.js";
import { Logger } from "../logging/logger.js";
import { MailchimpService } from "./mailchimpService.js";

function createService(): MailchimpService {
  const config = {
    mailchimp: {
      apiKey: "test-key-us1",
      serverPrefix: "us1",
      audienceId: "audience",
      configured: true
    },
    airtable: {
      tables: {
        kpiHistory: "KPI_History"
      }
    }
  } as AppConfig;

  return new MailchimpService(
    config,
    {} as AirtableClient,
    new Logger("mailchimp-test", "error")
  );
}

test("Mailchimp report requests stay below the API simultaneous connection limit", async () => {
  const service = createService();
  const internal = service as unknown as {
    findMissingKpiHistoryFields: () => Promise<string[]>;
    writeKpiHistory: () => Promise<{ created: number; updated: number }>;
  };

  internal.findMissingKpiHistoryFields = async () => [];
  internal.writeKpiHistory = async () => ({ created: 0, updated: 0 });
  service.fetchAudienceInfo = async () => ({ stats: { member_count: 100 } });
  service.fetchAudienceActivity = async () => [];
  service.fetchCampaigns = async () =>
    Array.from({ length: 12 }, (_, index) => ({
      id: `campaign-${index}`,
      status: "sent",
      send_time: "2026-07-15T12:00:00Z"
    }));

  let activeRequests = 0;
  let maxActiveRequests = 0;
  service.fetchCampaignReport = async (campaignId) => {
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

    await new Promise((resolve) => setTimeout(resolve, 5));

    activeRequests -= 1;
    return { id: campaignId };
  };

  const result = await service.sync({ periodType: "monthly" });

  assert.equal(result.success, true);
  assert.equal(result.campaignsProcessed, 12);
  assert.ok(maxActiveRequests > 1, "expected report fetching to retain useful concurrency");
  assert.ok(maxActiveRequests <= 5, `expected at most 5 concurrent report requests, saw ${maxActiveRequests}`);
});
