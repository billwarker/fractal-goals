import asyncio
import json
import socket
import threading
import time

import pytest

try:
    import uvicorn
    from httpx2 import AsyncClient
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client
except ImportError:
    pytest.skip("The MCP protocol test requires the pinned adapter SDK", allow_module_level=True)

from agent_adapter import server as adapter


def test_streamable_http_authenticates_lists_tools_and_exchanges_backend_token(monkeypatch):
    calls = []

    def fake_post_json(path, body, **kwargs):
        calls.append((path, body, kwargs))
        if path == "/agent/internal/verify":
            return {
                "active": True,
                "client_id": "host-test-client",
                "user_id": "host-test-user",
                "scopes": ["goals:read"],
                "expires_at": int(time.time()) + 60,
            }
        if path == "/agent/internal/exchange":
            return {"access_token": "short-lived-internal-token"}
        if path == "/agent/internal/fractals":
            assert kwargs["bearer"] == "short-lived-internal-token"
            return {"items": [{"id": "root-1", "name": "Test fractal"}]}
        raise AssertionError(f"Unexpected adapter backend path: {path}")

    monkeypatch.setattr(adapter, "_post_json", fake_post_json)
    app = adapter.server.streamable_http_app()
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_level="critical"))
    server_thread = threading.Thread(
        target=lambda: asyncio.run(server.serve(sockets=[listener])),
        daemon=True,
    )
    server_thread.start()

    async def exercise_protocol():
        async with AsyncClient(
            base_url=f"http://127.0.0.1:{port}",
            headers={"Accept": "text/event-stream"},
        ) as anonymous_client:
            response = await anonymous_client.get("/mcp")
            assert response.status_code == 401
            challenge = response.headers.get("www-authenticate", "")
            assert "resource_metadata" in challenge

        async with AsyncClient(
            base_url=f"http://127.0.0.1:{port}",
            headers={"Authorization": "Bearer host-token"},
        ) as http_client:
            async with streamable_http_client(
                f"http://127.0.0.1:{port}/mcp",
                http_client=http_client,
            ) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    tools = await session.list_tools()
                    tools_by_name = {tool.name: tool for tool in tools.tools}
                    read_tool_names = {
                        "list_fractals",
                        "get_goal_context",
                        "list_activities",
                        "get_program_context",
                        "list_templates",
                        "get_task",
                        "get_proposal",
                        "get_run",
                    }
                    assert set(tools_by_name) == read_tool_names | {
                        "propose_changes",
                        "apply_proposal",
                    }
                    assert all(tool.title for tool in tools_by_name.values())
                    for name in read_tool_names:
                        annotations = tools_by_name[name].annotations
                        assert annotations.read_only_hint is True
                        assert annotations.open_world_hint is False
                    assert tools_by_name["list_fractals"].title == "List accessible fractals"
                    assert tools_by_name["propose_changes"].annotations.read_only_hint is False
                    assert tools_by_name["propose_changes"].annotations.destructive_hint is False
                    assert tools_by_name["apply_proposal"].annotations.read_only_hint is False
                    assert tools_by_name["apply_proposal"].annotations.destructive_hint is True
                    assert tools_by_name["apply_proposal"].annotations.idempotent_hint is True

                    result = await session.call_tool("list_fractals")
                    payload = result.structured_content
                    if payload is None:
                        payload = json.loads(result.content[0].text)
                    assert payload["items"] == [{"id": "root-1", "name": "Test fractal"}]

    try:
        deadline = time.monotonic() + 5
        while not server.started and server_thread.is_alive() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert server.started, "MCP Streamable HTTP server did not start"
        asyncio.run(exercise_protocol())
    finally:
        server.should_exit = True
        server_thread.join(timeout=5)
        listener.close()

    assert any(
        path == "/agent/internal/verify" and body == {"access_token": "host-token"}
        for path, body, _kwargs in calls
    )
    assert any(
        path == "/agent/internal/exchange" and body == {"access_token": "host-token"}
        for path, body, _kwargs in calls
    )
    assert any(
        path == "/agent/internal/fractals"
        and kwargs == {"bearer": "short-lived-internal-token"}
        for path, _body, kwargs in calls
    )
