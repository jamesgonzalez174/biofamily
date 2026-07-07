import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "myprizepoint-mcp",
  title: "MyPrizePoint MCP",
  version: "0.1.0",
  instructions:
    "MCP server for the MyPrizePoint app. Use `echo` to verify connectivity. More tools can be added under src/lib/mcp/tools/.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool],
});
