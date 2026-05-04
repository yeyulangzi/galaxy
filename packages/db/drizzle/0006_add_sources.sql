CREATE TABLE sources (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  url TEXT,
  feed_item_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
CREATE INDEX sources_type_idx ON sources (type);
--> statement-breakpoint
CREATE INDEX sources_feed_item_idx ON sources (feed_item_id);
--> statement-breakpoint
CREATE TABLE source_node_links (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  excerpt TEXT,
  position INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
CREATE INDEX source_node_links_source_idx ON source_node_links (source_id);
--> statement-breakpoint
CREATE INDEX source_node_links_node_idx ON source_node_links (node_id);
--> statement-breakpoint
CREATE UNIQUE INDEX source_node_links_unique ON source_node_links (source_id, node_id);
