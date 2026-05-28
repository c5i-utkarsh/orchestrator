"""Build an interactive pyvis HTML visualization from the saved graph."""

from __future__ import annotations

import json
from pathlib import Path


def visualize(
    graph_json: str = "data/graph/graph.json",
    output_html: str = "output/graph_viz.html",
) -> None:
    try:
        from pyvis.network import Network
    except ImportError as exc:
        raise ImportError("pyvis is required: pip install pyvis") from exc

    src = Path(graph_json)
    if not src.exists():
        raise FileNotFoundError(f"Graph data not found: {src.resolve()}")

    data = json.loads(src.read_text(encoding="utf-8"))
    nodes = data.get("nodes", [])
    edges = data.get("edges", [])

    net = Network(
        height="820px",
        width="100%",
        bgcolor="#0e0e14",
        font_color="#9390b0",
        directed=False,
    )
    net.barnes_hut(gravity=-8000, central_gravity=0.3, spring_length=120)

    # Community → colour palette
    palette = [
        "#7c6af8", "#2dd4a0", "#fb7185", "#fbbf24",
        "#60a5fa", "#a78bfa", "#34d399", "#f97316",
        "#e879f9", "#38bdf8",
    ]

    for node in nodes:
        nid  = str(node["id"])
        pr   = node.get("pagerank", 0.0)
        size = max(8, min(40, int(pr * 800 + 8)))
        comm = node.get("community_id", 0) or 0
        color = palette[int(comm) % len(palette)]
        net.add_node(nid, label=nid, size=size, color=color,
                     title=f"{nid}\nPageRank: {pr:.4f}\nCommunity: {comm}")

    for edge in edges:
        src_id  = str(edge.get("source", edge.get("from", "")))
        tgt_id  = str(edge.get("target", edge.get("to", "")))
        weight  = edge.get("weight", 1)
        net.add_edge(src_id, tgt_id, value=weight,
                     title=f"co-occurrence: {weight}")

    out = Path(output_html)
    out.parent.mkdir(parents=True, exist_ok=True)
    net.save_graph(str(out))


if __name__ == "__main__":
    visualize()
    print("Graph saved to output/graph_viz.html")
