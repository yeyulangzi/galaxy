请严格按以下 JSON 格式输出结果，不要输出任何其他内容。

注意：节点标题必须是精炼的概念名/术语/名词（2-10个字），不是描述性语句。

{
  "new_nodes": [
    {
      "title": "官僚制",
      "summary": "韦伯提出的概念，指以规则、层级、专业化分工为特征的理性化组织形式",
      "domain": "社会学/组织理论",
      "confidence": 0.85,
      "rationale": "推荐理由",
      "suggested_edges": [
        {
          "target_node_title": "理性化",
          "relation_type": "related"
        }
      ]
    }
  ],
  "new_edges": [
    {
      "source_title": "官僚制",
      "target_title": "科层制",
      "relation_type": "related",
      "confidence": 0.8,
      "rationale": "推荐理由"
    }
  ]
}
