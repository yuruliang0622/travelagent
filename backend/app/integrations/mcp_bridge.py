"""MongoDB MCP server bridge.

Manages a long-lived `npx mongodb-mcp-server` subprocess and exposes
MCP tool calls over its stdio JSON-RPC transport.

Usage:
    from app.integrations.mcp_bridge import mcp_bridge
    mcp_bridge.start(mongodb_uri)          # called once at app startup
    result = mcp_bridge.call_tool("find", {...})
    mcp_bridge.stop()                      # called at app shutdown
"""

import json
import os
import subprocess
import threading
import time
from typing import Any


class MongoDBMCPBridge:
    """Subprocess wrapper for the mongodb-mcp-server MCP stdio server."""

    _MCP_PROTOCOL_VERSION = "2024-11-05"
    _STARTUP_WAIT = 3.0
    _RESPONSE_TIMEOUT = 10.0

    def __init__(self) -> None:
        self._process: subprocess.Popen | None = None
        self._lock = threading.RLock()
        self._next_id = 1
        self._initialized = False
        self._available_tools: list[dict[str, Any]] = []
        self._database = "trip_agent"

    # ── Public API ──────────────────────────────────────────────────────────

    @property
    def is_running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    @property
    def is_initialized(self) -> bool:
        return self.is_running and self._initialized

    @property
    def available_tools(self) -> list[dict[str, Any]]:
        return self._available_tools

    def start(self, mongodb_uri: str, database: str = "trip_agent") -> bool:
        """Start the MCP server subprocess and complete the handshake.

        Returns True if the bridge is ready to accept tool calls.
        """
        with self._lock:
            if self.is_initialized:
                return True

            self._database = database
            env = {**os.environ, "MONGODB_URI": mongodb_uri}
            try:
                self._process = subprocess.Popen(
                    ["npx", "-y", "mongodb-mcp-server"],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    env=env,
                    text=True,
                    bufsize=1,
                )
            except (OSError, FileNotFoundError) as exc:
                self._process = None
                return False

            time.sleep(self._STARTUP_WAIT)

            if not self.is_running:
                self._process = None
                return False

            self._initialized = self._do_initialize()
            if self._initialized:
                self._available_tools = self._do_list_tools()
                self._do_connect(mongodb_uri)
            return self._initialized

    def stop(self) -> None:
        with self._lock:
            if self._process and self._process.poll() is None:
                try:
                    self._process.terminate()
                    self._process.wait(timeout=5)
                except (OSError, subprocess.TimeoutExpired):
                    self._process.kill()
            self._process = None
            self._initialized = False

    def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Call a named tool on the MCP server. Returns the result dict or an error dict."""
        if not self.is_initialized:
            return {"error": "MCP bridge not running", "source": "mcp-bridge"}

        with self._lock:
            req_id = self._next_id
            self._next_id += 1
            request = {
                "jsonrpc": "2.0",
                "id": req_id,
                "method": "tools/call",
                "params": {"name": tool_name, "arguments": arguments},
            }
            return self._send_and_receive(request, req_id)

    # ── MCP handshake helpers ────────────────────────────────────────────────

    def _do_initialize(self) -> bool:
        req_id = self._next_id
        self._next_id += 1
        request = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "initialize",
            "params": {
                "protocolVersion": self._MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "trip-agent", "version": "1.0.0"},
            },
        }
        response = self._send_and_receive(request, req_id)
        if "error" in response or "result" not in response:
            return False
        # Send the required initialized notification
        self._send_notification({"jsonrpc": "2.0", "method": "notifications/initialized"})
        return True

    def _do_list_tools(self) -> list[dict[str, Any]]:
        req_id = self._next_id
        self._next_id += 1
        request = {"jsonrpc": "2.0", "id": req_id, "method": "tools/list", "params": {}}
        response = self._send_and_receive(request, req_id)
        return response.get("result", {}).get("tools", [])

    def _do_connect(self, mongodb_uri: str) -> None:
        """Connect the MCP server to the MongoDB instance."""
        req_id = self._next_id
        self._next_id += 1
        self.call_tool("connect", {"connectionString": mongodb_uri})

    # ── I/O helpers ──────────────────────────────────────────────────────────

    def _send_and_receive(self, request: dict, req_id: int) -> dict[str, Any]:
        try:
            self._process.stdin.write(json.dumps(request) + "\n")
            self._process.stdin.flush()

            deadline = time.time() + self._RESPONSE_TIMEOUT
            while time.time() < deadline:
                line = self._process.stdout.readline()
                if not line:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                    if msg.get("id") == req_id:
                        return msg
                except json.JSONDecodeError:
                    continue

            return {"error": "timeout waiting for MCP response"}
        except (OSError, BrokenPipeError) as exc:
            self._initialized = False
            return {"error": f"MCP process I/O error: {exc}"}

    def _send_notification(self, notification: dict) -> None:
        try:
            self._process.stdin.write(json.dumps(notification) + "\n")
            self._process.stdin.flush()
        except (OSError, BrokenPipeError):
            pass

    # ── Convenience wrappers used by planner ────────────────────────────────

    def find(
        self,
        collection: str,
        filter: dict | None = None,
        projection: dict | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Wrapper around the MCP `find` tool."""
        args: dict[str, Any] = {
            "database": self._database,
            "collection": collection,
            "filter": filter or {},
            "limit": limit,
        }
        if projection:
            args["projection"] = projection
        result = self.call_tool("find", args)
        return self._extract_documents(result)

    def aggregate(self, collection: str, pipeline: list[dict]) -> list[dict[str, Any]]:
        """Wrapper around the MCP `aggregate` tool."""
        result = self.call_tool("aggregate", {
            "database": self._database,
            "collection": collection,
            "pipeline": pipeline,
        })
        return self._extract_documents(result)

    def insert_many(self, collection: str, documents: list[dict]) -> bool:
        """Wrapper around the MCP `insert-many` tool."""
        result = self.call_tool("insert-many", {
            "database": self._database,
            "collection": collection,
            "documents": documents,
        })
        return "error" not in result

    def upsert(self, collection: str, doc_id: str, document: dict) -> bool:
        """Insert or replace a document by _id via MCP `update-many` with upsert."""
        document["_id"] = doc_id
        # _id is immutable — exclude it from $set, MongoDB derives it from the filter
        update_fields = {k: v for k, v in document.items() if k != "_id"}
        result = self.call_tool("update-many", {
            "database": self._database,
            "collection": collection,
            "filter": {"_id": doc_id},
            "update": {"$set": update_fields},
            "upsert": True,
        })
        return "error" not in result

    def _extract_documents(self, mcp_result: dict) -> list[dict[str, Any]]:
        """Pull documents out of the MCP tool response envelope."""
        if "error" in mcp_result:
            return []
        content = mcp_result.get("result", {}).get("content", [])
        if isinstance(content, list):
            docs = []
            for item in content:
                if isinstance(item, dict):
                    if item.get("type") == "text":
                        text = item["text"]
                        try:
                            parsed = json.loads(text)
                            if isinstance(parsed, list):
                                docs.extend(parsed)
                            elif isinstance(parsed, dict):
                                docs.append(parsed)
                        except (json.JSONDecodeError, KeyError):
                            # mongodb-mcp-server wraps data in <untrusted-user-data-*> tags
                            import re
                            match = re.search(
                                r'<untrusted-user-data-[^>]+>\s*(\[.*?\]|\{.*?\})\s*</untrusted-user-data-',
                                text, re.DOTALL,
                            )
                            if match:
                                try:
                                    parsed = json.loads(match.group(1))
                                    if isinstance(parsed, list):
                                        docs.extend(parsed)
                                    elif isinstance(parsed, dict):
                                        docs.append(parsed)
                                except (json.JSONDecodeError, KeyError):
                                    pass
                    else:
                        docs.append(item)
            return docs
        return []


    def search_text(self, collection: str, query: str, fields: list[str] | None = None, limit: int = 5) -> list[dict[str, Any]]:
        """Search documents by text across named fields using $or + $regex.

        Falls back to a plain find if query is empty.
        """
        if not query.strip():
            return self.find(collection, limit=limit)

        search_fields = fields or ["title", "subtitle", "summary", "dates", "country"]
        terms = [term for term in query.strip().split() if len(term) >= 2]
        if not terms:
            return self.find(collection, limit=limit)

        # Build regex patterns for each term — match either as plain string or
        # inside a JSON string/value (handles nested summary objects).
        conditions = []
        for field in search_fields:
            for term in terms:
                escaped = term.replace("\\", "\\\\").replace("\"", "\\\"")
                conditions.append({field: {"$regex": escaped, "$options": "i"}})

        return self.find(collection, filter={"$or": conditions}, limit=limit) if conditions else []


mcp_bridge = MongoDBMCPBridge()
