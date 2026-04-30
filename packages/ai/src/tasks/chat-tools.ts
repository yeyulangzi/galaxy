import { eq, like, and, or, sql as drizzleSql } from 'drizzle-orm'
import { getDb } from '@galaxy/db'
import { nodes, edges, aspects, suggestions } from '@galaxy/db/schema'
import { generateId, nowIso } from '@galaxy/shared'
import type { ToolDefinition, ToolCall } from '../providers/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolExecResult {
  name: string
  arguments: Record<string, unknown>
  result: Record<string, unknown>
  isWrite: boolean
  suggestionId?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simpleSlugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const WRITE_TOOLS = new Set([
  'create_node',
  'update_node',
  'delete_node',
  'create_edge',
  'update_edge',
  'delete_edge',
  'create_aspect',
  'update_aspect',
  'delete_aspect',
  'batch_update_nodes',
])

export function isWriteTool(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName)
}

// ---------------------------------------------------------------------------
// Tool Definitions (14 tools)
// ---------------------------------------------------------------------------

const searchNodesTool: ToolDefinition = {
  name: 'search_nodes',
  description:
    'Search knowledge graph nodes by keyword. Supports filtering by domain, node_type, channel, and internalization_status.',
  parameters: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        description: 'Search keyword to match against node title and summary',
      },
      domain: {
        type: 'string',
        description: 'Filter by domain (fuzzy match)',
      },
      node_type: {
        type: 'string',
        enum: ['concept', 'claim', 'case', 'resource'],
        description: 'Filter by node type (exact match)',
      },
      channel: {
        type: 'string',
        enum: ['core', 'light'],
        description: 'Filter by channel (exact match)',
      },
      internalization_status: {
        type: 'string',
        enum: ['draft', 'linked', 'dialogued', 'mastered'],
        description: 'Filter by internalization status (exact match)',
      },
    },
    required: ['keyword'],
  },
}

const getNodeDetailTool: ToolDefinition = {
  name: 'get_node_detail',
  description:
    'Get full details of a single node including all its aspects (dimension cards).',
  parameters: {
    type: 'object',
    properties: {
      node_id: {
        type: 'string',
        description: 'The ID of the node to retrieve',
      },
    },
    required: ['node_id'],
  },
}

const listNodeEdgesTool: ToolDefinition = {
  name: 'list_node_edges',
  description:
    'List all edges connected to a node, including the other node information and direction.',
  parameters: {
    type: 'object',
    properties: {
      node_id: {
        type: 'string',
        description: 'The ID of the node whose edges to list',
      },
    },
    required: ['node_id'],
  },
}

const getGraphStatsTool: ToolDefinition = {
  name: 'get_graph_stats',
  description:
    'Get overall statistics of the knowledge graph: total nodes, edges, breakdown by domain, channel, and internalization status.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
}

const createNodeTool: ToolDefinition = {
  name: 'create_node',
  description:
    'Create a new knowledge node. This creates a pending suggestion that the user must confirm.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Node title' },
      summary: { type: 'string', description: 'Node summary' },
      domain: { type: 'string', description: 'Knowledge domain' },
      node_type: {
        type: 'string',
        enum: ['concept', 'claim', 'case', 'resource'],
        description: 'Type of the node',
      },
      channel: {
        type: 'string',
        enum: ['core', 'light'],
        description: 'Channel classification',
      },
      suggested_edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            target_node_id: { type: 'string' },
            relation_type: { type: 'string' },
          },
        },
        description: 'Optional edges to create along with the node',
      },
    },
    required: ['title', 'node_type'],
  },
}

const updateNodeTool: ToolDefinition = {
  name: 'update_node',
  description:
    'Update fields of an existing node. Creates a pending suggestion for user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      node_id: { type: 'string', description: 'ID of the node to update' },
      title: { type: 'string', description: 'New title' },
      summary: { type: 'string', description: 'New summary' },
      domain: { type: 'string', description: 'New domain' },
      node_type: {
        type: 'string',
        enum: ['concept', 'claim', 'case', 'resource'],
      },
      channel: { type: 'string', enum: ['core', 'light'] },
      internalization_status: {
        type: 'string',
        enum: ['draft', 'linked', 'dialogued', 'mastered'],
      },
      my_thoughts: { type: 'string', description: 'Personal thoughts' },
    },
    required: ['node_id'],
  },
}

const deleteNodeTool: ToolDefinition = {
  name: 'delete_node',
  description:
    'Delete a node from the graph. Creates a pending suggestion for user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      node_id: { type: 'string', description: 'ID of the node to delete' },
      reason: { type: 'string', description: 'Reason for deletion' },
    },
    required: ['node_id'],
  },
}

const createEdgeTool: ToolDefinition = {
  name: 'create_edge',
  description:
    'Create a new edge (relationship) between two nodes. Creates a pending suggestion for user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      source_node_id: { type: 'string', description: 'Source node ID' },
      target_node_id: { type: 'string', description: 'Target node ID' },
      relation_type: {
        type: 'string',
        enum: [
          'contains',
          'related',
          'opposes',
          'instance_of',
          'evolved_from',
          'cites',
          'evidence_for',
          'evidence_against',
          'refines',
        ],
        description: 'Type of relationship',
      },
      weight: {
        type: 'number',
        description: 'Edge weight (default 1.0)',
      },
      description: {
        type: 'string',
        description: 'Description of the relationship',
      },
    },
    required: ['source_node_id', 'target_node_id', 'relation_type'],
  },
}

const updateEdgeTool: ToolDefinition = {
  name: 'update_edge',
  description:
    'Update properties of an existing edge. Creates a pending suggestion for user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      edge_id: { type: 'string', description: 'ID of the edge to update' },
      relation_type: {
        type: 'string',
        enum: [
          'contains',
          'related',
          'opposes',
          'instance_of',
          'evolved_from',
          'cites',
          'evidence_for',
          'evidence_against',
          'refines',
        ],
      },
      weight: { type: 'number' },
      description: { type: 'string' },
    },
    required: ['edge_id'],
  },
}

const deleteEdgeTool: ToolDefinition = {
  name: 'delete_edge',
  description:
    'Delete an edge from the graph. Creates a pending suggestion for user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      edge_id: { type: 'string', description: 'ID of the edge to delete' },
      reason: { type: 'string', description: 'Reason for deletion' },
    },
    required: ['edge_id'],
  },
}

const createAspectTool: ToolDefinition = {
  name: 'create_aspect',
  description:
    'Create a new aspect (dimension card) for a node. Creates a pending suggestion for user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      node_id: {
        type: 'string',
        description: 'ID of the node to add the aspect to',
      },
      title: { type: 'string', description: 'Aspect title' },
      content: { type: 'string', description: 'Aspect content' },
    },
    required: ['node_id', 'title', 'content'],
  },
}

const updateAspectTool: ToolDefinition = {
  name: 'update_aspect',
  description:
    'Update an existing aspect. Creates a pending suggestion for user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      aspect_id: {
        type: 'string',
        description: 'ID of the aspect to update',
      },
      title: { type: 'string', description: 'New title' },
      content: { type: 'string', description: 'New content' },
    },
    required: ['aspect_id'],
  },
}

const deleteAspectTool: ToolDefinition = {
  name: 'delete_aspect',
  description:
    'Delete an aspect from a node. Creates a pending suggestion for user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      aspect_id: {
        type: 'string',
        description: 'ID of the aspect to delete',
      },
      reason: { type: 'string', description: 'Reason for deletion' },
    },
    required: ['aspect_id'],
  },
}

const batchUpdateNodesTool: ToolDefinition = {
  name: 'batch_update_nodes',
  description:
    'Batch update multiple nodes matching a filter. Creates a pending suggestion for user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      filter: {
        type: 'object',
        properties: {
          domain: { type: 'string' },
          channel: { type: 'string', enum: ['core', 'light'] },
          node_type: {
            type: 'string',
            enum: ['concept', 'claim', 'case', 'resource'],
          },
        },
        description: 'Filter criteria to select nodes',
      },
      updates: {
        type: 'object',
        properties: {
          channel: { type: 'string', enum: ['core', 'light'] },
          internalization_status: {
            type: 'string',
            enum: ['draft', 'linked', 'dialogued', 'mastered'],
          },
          domain: { type: 'string' },
        },
        description: 'Fields to update on matching nodes',
      },
    },
    required: ['filter', 'updates'],
  },
}

// ---------------------------------------------------------------------------
// Exported tool list
// ---------------------------------------------------------------------------

export const CHAT_TOOLS: ToolDefinition[] = [
  searchNodesTool,
  getNodeDetailTool,
  listNodeEdgesTool,
  getGraphStatsTool,
  createNodeTool,
  updateNodeTool,
  deleteNodeTool,
  createEdgeTool,
  updateEdgeTool,
  deleteEdgeTool,
  createAspectTool,
  updateAspectTool,
  deleteAspectTool,
  batchUpdateNodesTool,
]

// ---------------------------------------------------------------------------
// Read operation executors
// ---------------------------------------------------------------------------

function executeSearchNodes(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const db = getDb()
  const keyword = args.keyword as string
  const pattern = `%${keyword}%`

  const conditions = [
    or(like(nodes.title, pattern), like(nodes.summary, pattern)),
  ]

  if (args.domain) {
    conditions.push(like(nodes.domain, `%${args.domain as string}%`))
  }
  if (args.node_type) {
    conditions.push(eq(nodes.node_type, args.node_type as string))
  }
  if (args.channel) {
    conditions.push(eq(nodes.channel, args.channel as string))
  }
  if (args.internalization_status) {
    conditions.push(
      eq(
        nodes.internalization_status,
        args.internalization_status as string,
      ),
    )
  }

  const rows = db
    .select({
      id: nodes.id,
      title: nodes.title,
      domain: nodes.domain,
      summary: nodes.summary,
      node_type: nodes.node_type,
      channel: nodes.channel,
      internalization_status: nodes.internalization_status,
    })
    .from(nodes)
    .where(and(...conditions))
    .limit(20)
    .all()

  return { count: rows.length, nodes: rows }
}

function executeGetNodeDetail(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const db = getDb()
  const nodeId = args.node_id as string

  const node = db.select().from(nodes).where(eq(nodes.id, nodeId)).get()
  if (!node) {
    return { error: `Node not found: ${nodeId}` }
  }

  const nodeAspects = db
    .select({
      id: aspects.id,
      title: aspects.title,
      content: aspects.content,
      source_type: aspects.source_type,
    })
    .from(aspects)
    .where(eq(aspects.node_id, nodeId))
    .all()

  return { node, aspects: nodeAspects }
}

function executeListNodeEdges(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const db = getDb()
  const nodeId = args.node_id as string

  const allEdges = db
    .select()
    .from(edges)
    .where(
      or(
        eq(edges.source_node_id, nodeId),
        eq(edges.target_node_id, nodeId),
      ),
    )
    .all()

  const edgeResults = allEdges.map((edge) => {
    const isOutgoing = edge.source_node_id === nodeId
    const otherNodeId = isOutgoing
      ? edge.target_node_id
      : edge.source_node_id
    const otherNode = db
      .select({ id: nodes.id, title: nodes.title })
      .from(nodes)
      .where(eq(nodes.id, otherNodeId))
      .get()

    return {
      id: edge.id,
      relation_type: edge.relation_type,
      weight: edge.weight,
      description: edge.description,
      direction: isOutgoing ? 'outgoing' : 'incoming',
      other_node: otherNode ?? { id: otherNodeId, title: '(unknown)' },
    }
  })

  return { count: edgeResults.length, edges: edgeResults }
}

function executeGetGraphStats(): Record<string, unknown> {
  const db = getDb()

  const totalNodesResult = db
    .select({ count: drizzleSql<number>`count(*)` })
    .from(nodes)
    .get()
  const totalNodes = totalNodesResult?.count ?? 0

  const totalEdgesResult = db
    .select({ count: drizzleSql<number>`count(*)` })
    .from(edges)
    .get()
  const totalEdges = totalEdgesResult?.count ?? 0

  const domainRows = db
    .select({
      domain: nodes.domain,
      count: drizzleSql<number>`count(*)`,
    })
    .from(nodes)
    .groupBy(nodes.domain)
    .limit(10)
    .all()

  const channelRows = db
    .select({
      channel: nodes.channel,
      count: drizzleSql<number>`count(*)`,
    })
    .from(nodes)
    .groupBy(nodes.channel)
    .all()

  const statusRows = db
    .select({
      status: nodes.internalization_status,
      count: drizzleSql<number>`count(*)`,
    })
    .from(nodes)
    .groupBy(nodes.internalization_status)
    .all()

  return {
    total_nodes: totalNodes,
    total_edges: totalEdges,
    domains: domainRows,
    channels: channelRows,
    statuses: statusRows,
  }
}

// ---------------------------------------------------------------------------
// Write operation executors (create suggestions)
// ---------------------------------------------------------------------------

interface WriteSuggestionParams {
  type: string
  payload: Record<string, unknown>
  rationale: string
  sessionId: string
  providerId: string
  model: string
}

function createSuggestion(params: WriteSuggestionParams): string {
  const db = getDb()
  const suggestionId = generateId('s')
  const now = nowIso()

  db.insert(suggestions)
    .values({
      id: suggestionId,
      type: params.type,
      source: 'chat',
      source_ref_id: params.sessionId,
      payload: JSON.stringify(params.payload),
      rationale: params.rationale,
      confidence: 0.9,
      status: 'pending',
      created_at: now,
      provider_id: params.providerId,
      model: params.model,
    })
    .run()

  return suggestionId
}

function executeCreateNode(
  args: Record<string, unknown>,
  sessionId: string,
  providerId: string,
  model: string,
): Record<string, unknown> {
  const title = args.title as string
  const payload = {
    title,
    summary: args.summary ?? null,
    domain: args.domain ?? null,
    node_type: args.node_type as string,
    channel: args.channel ?? 'light',
    suggested_edges: args.suggested_edges ?? [],
  }

  const suggestionId = createSuggestion({
    type: 'new_node',
    payload,
    rationale: `Chat assistant: create node "${title}"`,
    sessionId,
    providerId,
    model,
  })

  return {
    suggestion_id: suggestionId,
    message: `Created suggestion to add node "${title}". Awaiting user confirmation.`,
  }
}

function executeUpdateNode(
  args: Record<string, unknown>,
  sessionId: string,
  providerId: string,
  model: string,
): Record<string, unknown> {
  const nodeId = args.node_id as string
  const { node_id: _, ...fieldUpdates } = args
  const payload = { node_id: nodeId, fields: fieldUpdates }

  const suggestionId = createSuggestion({
    type: 'update_node',
    payload,
    rationale: `Chat assistant: update node "${nodeId}"`,
    sessionId,
    providerId,
    model,
  })

  return {
    suggestion_id: suggestionId,
    message: `Created suggestion to update node "${nodeId}". Awaiting user confirmation.`,
  }
}

function executeDeleteNode(
  args: Record<string, unknown>,
  sessionId: string,
  providerId: string,
  model: string,
): Record<string, unknown> {
  const nodeId = args.node_id as string
  const payload = {
    node_id: nodeId,
    reason: (args.reason as string) ?? '',
  }

  const suggestionId = createSuggestion({
    type: 'delete_node',
    payload,
    rationale: `Chat assistant: delete node "${nodeId}"`,
    sessionId,
    providerId,
    model,
  })

  return {
    suggestion_id: suggestionId,
    message: `Created suggestion to delete node "${nodeId}". Awaiting user confirmation.`,
  }
}

function executeCreateEdge(
  args: Record<string, unknown>,
  sessionId: string,
  providerId: string,
  model: string,
): Record<string, unknown> {
  const payload = {
    source_node_id: args.source_node_id as string,
    target_node_id: args.target_node_id as string,
    relation_type: args.relation_type as string,
    weight: (args.weight as number) ?? 1.0,
    description: (args.description as string) ?? '',
  }

  const suggestionId = createSuggestion({
    type: 'new_edge',
    payload,
    rationale: `Chat assistant: create edge ${payload.relation_type} from "${payload.source_node_id}" to "${payload.target_node_id}"`,
    sessionId,
    providerId,
    model,
  })

  return {
    suggestion_id: suggestionId,
    message: `Created suggestion to add edge (${payload.relation_type}). Awaiting user confirmation.`,
  }
}

function executeUpdateEdge(
  args: Record<string, unknown>,
  sessionId: string,
  providerId: string,
  model: string,
): Record<string, unknown> {
  const edgeId = args.edge_id as string
  const { edge_id: _, ...fieldUpdates } = args
  const payload = { edge_id: edgeId, fields: fieldUpdates }

  const suggestionId = createSuggestion({
    type: 'update_edge',
    payload,
    rationale: `Chat assistant: update edge "${edgeId}"`,
    sessionId,
    providerId,
    model,
  })

  return {
    suggestion_id: suggestionId,
    message: `Created suggestion to update edge "${edgeId}". Awaiting user confirmation.`,
  }
}

function executeDeleteEdge(
  args: Record<string, unknown>,
  sessionId: string,
  providerId: string,
  model: string,
): Record<string, unknown> {
  const edgeId = args.edge_id as string
  const payload = {
    edge_id: edgeId,
    reason: (args.reason as string) ?? '',
  }

  const suggestionId = createSuggestion({
    type: 'delete_edge',
    payload,
    rationale: `Chat assistant: delete edge "${edgeId}"`,
    sessionId,
    providerId,
    model,
  })

  return {
    suggestion_id: suggestionId,
    message: `Created suggestion to delete edge "${edgeId}". Awaiting user confirmation.`,
  }
}

function executeCreateAspect(
  args: Record<string, unknown>,
  sessionId: string,
  providerId: string,
  model: string,
): Record<string, unknown> {
  const nodeId = args.node_id as string
  const title = args.title as string
  const payload = {
    node_id: nodeId,
    title,
    content: args.content as string,
    source_type: 'manual',
  }

  const suggestionId = createSuggestion({
    type: 'fill_aspect',
    payload,
    rationale: `Chat assistant: create aspect "${title}" on node "${nodeId}"`,
    sessionId,
    providerId,
    model,
  })

  return {
    suggestion_id: suggestionId,
    message: `Created suggestion to add aspect "${title}". Awaiting user confirmation.`,
  }
}

function executeUpdateAspect(
  args: Record<string, unknown>,
  sessionId: string,
  providerId: string,
  model: string,
): Record<string, unknown> {
  const aspectId = args.aspect_id as string
  const { aspect_id: _, ...fieldUpdates } = args
  const payload = { aspect_id: aspectId, fields: fieldUpdates }

  const suggestionId = createSuggestion({
    type: 'update_aspect',
    payload,
    rationale: `Chat assistant: update aspect "${aspectId}"`,
    sessionId,
    providerId,
    model,
  })

  return {
    suggestion_id: suggestionId,
    message: `Created suggestion to update aspect "${aspectId}". Awaiting user confirmation.`,
  }
}

function executeDeleteAspect(
  args: Record<string, unknown>,
  sessionId: string,
  providerId: string,
  model: string,
): Record<string, unknown> {
  const aspectId = args.aspect_id as string
  const payload = {
    aspect_id: aspectId,
    reason: (args.reason as string) ?? '',
  }

  const suggestionId = createSuggestion({
    type: 'delete_aspect',
    payload,
    rationale: `Chat assistant: delete aspect "${aspectId}"`,
    sessionId,
    providerId,
    model,
  })

  return {
    suggestion_id: suggestionId,
    message: `Created suggestion to delete aspect "${aspectId}". Awaiting user confirmation.`,
  }
}

function executeBatchUpdateNodes(
  args: Record<string, unknown>,
  sessionId: string,
  providerId: string,
  model: string,
): Record<string, unknown> {
  const db = getDb()
  const filter = args.filter as Record<string, unknown>
  const updates = args.updates as Record<string, unknown>

  const conditions: ReturnType<typeof eq>[] = []
  if (filter.domain) {
    conditions.push(like(nodes.domain, `%${filter.domain as string}%`))
  }
  if (filter.channel) {
    conditions.push(eq(nodes.channel, filter.channel as string))
  }
  if (filter.node_type) {
    conditions.push(eq(nodes.node_type, filter.node_type as string))
  }

  const countResult = db
    .select({ count: drizzleSql<number>`count(*)` })
    .from(nodes)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .get()
  const affectedCount = countResult?.count ?? 0

  const payload = {
    filter,
    updates,
    affected_count: affectedCount,
  }

  const suggestionId = createSuggestion({
    type: 'batch_update',
    payload,
    rationale: `Chat assistant: batch update ${affectedCount} nodes`,
    sessionId,
    providerId,
    model,
  })

  return {
    suggestion_id: suggestionId,
    message: `Created suggestion to batch update ${affectedCount} nodes. Awaiting user confirmation.`,
  }
}

// ---------------------------------------------------------------------------
// Core execution function
// ---------------------------------------------------------------------------

const TOOL_EXECUTORS: Record<
  string,
  (
    args: Record<string, unknown>,
    sessionId: string,
    providerId: string,
    model: string,
  ) => Record<string, unknown>
> = {
  search_nodes: (args) => executeSearchNodes(args),
  get_node_detail: (args) => executeGetNodeDetail(args),
  list_node_edges: (args) => executeListNodeEdges(args),
  get_graph_stats: () => executeGetGraphStats(),
  create_node: executeCreateNode,
  update_node: executeUpdateNode,
  delete_node: executeDeleteNode,
  create_edge: executeCreateEdge,
  update_edge: executeUpdateEdge,
  delete_edge: executeDeleteEdge,
  create_aspect: executeCreateAspect,
  update_aspect: executeUpdateAspect,
  delete_aspect: executeDeleteAspect,
  batch_update_nodes: executeBatchUpdateNodes,
}

export function executeToolCall(
  toolCall: ToolCall,
  sessionId: string,
  providerId: string,
  model: string,
): ToolExecResult {
  const executor = TOOL_EXECUTORS[toolCall.name]
  if (!executor) {
    return {
      name: toolCall.name,
      arguments: toolCall.arguments,
      result: { error: `Unknown tool: ${toolCall.name}` },
      isWrite: false,
    }
  }

  const result = executor(toolCall.arguments, sessionId, providerId, model)
  const isWrite = isWriteTool(toolCall.name)

  return {
    name: toolCall.name,
    arguments: toolCall.arguments,
    result,
    isWrite,
    suggestionId: isWrite
      ? (result.suggestion_id as string | undefined)
      : undefined,
  }
}
