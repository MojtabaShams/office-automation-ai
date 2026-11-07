"""Graph assembly (compiled once, stateless per turn)."""

from __future__ import annotations

from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from .nodes import (
    advisor,
    confirmation_gate,
    form_presenter,
    intent_router,
    retrieve,
    route_after_advisor,
    route_after_intent,
    tool_executor,
)
from .state import AgentState


@lru_cache(maxsize=1)
def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("intent_router", intent_router)
    graph.add_node("retrieve", retrieve)
    graph.add_node("advisor", advisor)
    graph.add_node("tools", tool_executor)
    graph.add_node("confirmation_gate", confirmation_gate)
    graph.add_node("presenter", form_presenter)

    graph.add_edge(START, "intent_router")
    graph.add_conditional_edges(
        "intent_router",
        route_after_intent,
        {"retrieve": "retrieve", "confirmation_gate": "confirmation_gate"},
    )
    graph.add_edge("retrieve", "advisor")
    graph.add_conditional_edges(
        "advisor",
        route_after_advisor,
        {"tools": "tools", "confirmation_gate": "confirmation_gate"},
    )
    graph.add_edge("tools", "advisor")
    graph.add_edge("confirmation_gate", "presenter")
    graph.add_edge("presenter", END)

    return graph.compile()


def graph_diagram() -> str:
    """Mermaid source for docs/debugging."""
    return build_graph().get_graph().draw_mermaid()
