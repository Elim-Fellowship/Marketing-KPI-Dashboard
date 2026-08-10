import { BaseConnector } from "./baseConnector.js";
import type {
  RawConnectorMetric,
  ConnectorAuthResult,
  ConnectorRunContext
} from "./types.js";

interface BufferChannel {
  id: string;
  name: string;
  service: string;
}

interface BufferOrganization {
  id: string;
  name: string;
}

export class BufferConnector extends BaseConnector {
  readonly metadata = {
    id: "buffer" as const,
    name: "Buffer",
    sourceName: "Buffer",
    description: "Imports social media metrics from Buffer",
    category: "social" as const,
    mode: "api" as const,
    enabled: true
  };

  async authenticate(
    context: ConnectorRunContext
  ): Promise<ConnectorAuthResult> {
    if (!context.config.buffer.accessToken) {
      return {
        ok: false,
        status: "Needs Setup",
        message: "Missing BUFFER_ACCESS_TOKEN"
      };
    }

    if (!context.config.buffer.organizationId) {
      return {
        ok: false,
        status: "Needs Setup",
        message: "Missing BUFFER_ORGANIZATION_ID"
      };
    }

    try {
      const data = await this.request<{
        account: {
          organizations: BufferOrganization[];
        };
      }>(
        `
        query GetOrganizations {
          account {
            organizations {
              id
              name
            }
          }
        }
        `,
        {},
        context
      );

      const organizations = data.account?.organizations ?? [];
      const organizationAccessible = organizations.some(
        (organization) => organization.id === context.config.buffer.organizationId
      );

      if (!organizationAccessible) {
        const accessibleOrganization = organizations.length === 1 ? organizations[0] : undefined;
        return {
          ok: false,
          status: "Error",
          message: accessibleOrganization
            ? `Configured BUFFER_ORGANIZATION_ID is not accessible to this Buffer API key. Accessible organization: ${accessibleOrganization.name} (${accessibleOrganization.id}).`
            : `Configured BUFFER_ORGANIZATION_ID is not accessible to this Buffer API key (${organizations.length} organization(s) accessible).`
        };
      }

      return {
        ok: true,
        status: "Connected",
        message: "Buffer API key authenticated and configured organization is accessible."
      };
    } catch (error) {
      return {
        ok: false,
        status: "Error",
        message: `Buffer authentication/organization check failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }


  async getMockMetrics(
    context: ConnectorRunContext
  ): Promise<RawConnectorMetric[]> {
    return [
      {
        sourceRecordId: "buffer-test-post",
        metricName: "impressions",
        value: 100,
        unit: "count",
        date: new Date().toISOString(),
        targetTableKey: "bufferPostMetrics",
        platform: "Buffer",
        channel: "instagram",
        contentTitle: "Buffer test post",
        contentType: "Social Post",
        activityVolume: 1
      }
    ];
  }


  private async request<T>(
    query: string,
    variables: Record<string, unknown>,
    context: ConnectorRunContext
  ): Promise<T> {

    const response = await fetch(
      "https://api.buffer.com/graphql",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.config.buffer.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          variables
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        `Buffer API request failed (${response.status})`
      );
    }

    const json = await response.json() as {
      data?: T;
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      throw new Error(
        `Buffer GraphQL error: ${JSON.stringify(json.errors)}`
      );
    }

    return json.data as T;
  }


  async fetchMetrics(
    context: ConnectorRunContext
  ): Promise<RawConnectorMetric[]> {

    context.logger.info("Buffer config debug", {
      hasToken: Boolean(context.config.buffer.accessToken),
      organizationId: context.config.buffer.organizationId
    });


    const channels = await this.request<{
      channels: BufferChannel[];
    }>(
      `
      query GetChannels($organizationId: OrganizationId!) {
        channels(
          input: {
            organizationId: $organizationId
          }
        ) {
          id
          name
          service
        }
      }
      `,
      {
        organizationId: context.config.buffer.organizationId
      },
      context
    );


    context.logger.info("Buffer channels loaded", {
      count: channels.channels.length
    });


    const posts = await this.request<{
      posts: {
        edges: Array<{
          node: {
            id: string;
            text: string;
            sentAt: string;
            channelId: string;
            channelService: string;
            metrics: Array<{
              type: string;
              name: string;
              value: number;
              unit: string;
            }> | null;
          };
        }>;
      };
    }>(
      `
      query GetPosts($organizationId: OrganizationId!) {
        posts(
          input: {
            organizationId: $organizationId
            filter: {
              status: [sent]
            }
          }
        ) {
          edges {
            node {
              id
              text
              sentAt
              channelId
              channelService
              metrics {
                type
                name
                value
                unit
              }
            }
          }
        }
      }
      `,
      {
        organizationId: context.config.buffer.organizationId
      },
      context
    );


    context.logger.info("Buffer posts loaded", {
      count: posts.posts.edges.length
    });


    const metrics: RawConnectorMetric[] = [];


    for (const edge of posts.posts.edges) {

      const post = edge.node;


      if (!post.metrics) {
        continue;
      }


      for (const metric of post.metrics) {

        metrics.push({
          sourceRecordId: post.id,
          metricName: metric.name,
          value: metric.value,
          unit: metric.unit,
          date: post.sentAt,
          targetTableKey: "bufferPostMetrics",
          platform: "Buffer",
          channel: post.channelService,
          contentTitle: post.text.slice(0, 100),
          contentType: "Social Post",
          activityVolume: 1,
          dimensions: {
            metricType: metric.type,
            channelId: post.channelId
          }
        });

      }
    }


    context.logger.info("Buffer metrics transformed", {
      count: metrics.length
    });

   context.logger.info("Buffer final metric sample", {
      sample: metrics.slice(0, 5)
    });

    return metrics;
  }
}
