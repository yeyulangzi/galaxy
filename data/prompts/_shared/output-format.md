请严格按以下 JSON 格式输出结果，不要输出任何其他内容：

{
  "new_nodes": [
    {
      "title": "概念名称",
      "summary": "一句话概要",
      "domain": "所属领域",
      "confidence": 0.85,
      "rationale": "推荐理由",
      "suggested_edges": [
        {
          "target_node_title": "已有或新建节点的标题",
          "relation_type": "related"
        }
      ]
    }
  ],
  "new_edges": [
    {
      "source_title": "节点A标题",
      "target_title": "节点B标题",
      "relation_type": "related",
      "confidence": 0.8,
      "rationale": "推荐理由"
    }
  ]
}
