export function transformSpotifyCsv(rows: Record<string, string>[]) {
  return rows.map((row, index) => {
    const values = Object.values(row);

    return {
      Date: row["publish_date"] || row["Date"] || values[2],
      Followers: Number(row["followers"] || row["Followers"] || 0),
      "New Followers": Number(row["new_followers"] || 0),
      Listeners: Number(row["listeners"] || 0),
      Streams: Number(row["total_streams"] || row["Streams"] || values[1] || 0),
      "Retention %": Number(row["retention"] || 0),
      "Top Episode": row["episode_name"] || row["Episode Name"] || values[0],
      "Top Episode Streams": Number(row["top_episode_streams"] || 0),
      source: "spotify"
    };
  });
}
