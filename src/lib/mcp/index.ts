import { defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";

export default defineMcp({
  name: "myprizepoint-mcp",
  title: "MyPrizePoint MCP",
  version: "0.1.0",
  instructions:
    "MCP server for the MyPrizePoint app. Use `echo` to verify connectivity. More tools can be added under src/lib/mcp/tools/.",
  tools: [echoTool],
});
