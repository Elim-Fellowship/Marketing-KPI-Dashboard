import { CastosConnector } from "./castosConnector.js";
import { MailchimpConnector } from "./mailchimpConnector.js";
import { SpotifyConnector } from "./spotifyConnector.js";
import type { CommunicationsConnector, ConnectorMetadata } from "./types.js";
import { WebsiteConnector } from "./websiteConnector.js";
import { YouTubeConnector } from "./youtubeConnector.js";

export function createIngestionConnectors(): CommunicationsConnector[] {
  return [
    new MailchimpConnector(),
    new CastosConnector(),
    new YouTubeConnector(),
    new WebsiteConnector(),
    new SpotifyConnector()
  ];
}

export const futureConnectorPlaceholders: ConnectorMetadata[] = [
  {
    id: "facebook",
    name: "Facebook Connector",
    sourceName: "Facebook",
    category: "social",
    mode: "future",
    enabled: false,
    description: "Future connector for Facebook page and post analytics."
  },
  {
    id: "instagram",
    name: "Instagram Connector",
    sourceName: "Instagram",
    category: "social",
    mode: "future",
    enabled: false,
    description: "Future connector for Instagram post, reel, and audience analytics."
  }
];
