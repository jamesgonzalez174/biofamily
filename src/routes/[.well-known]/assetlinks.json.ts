import { createFileRoute } from "@tanstack/react-router";

const ASSETLINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.myprizepoint.twa",
      sha256_cert_fingerprints: [
        "57:36:37:60:D1:2A:AD:A2:CD:FA:01:9C:E3:19:63:28:75:93:EC:1C:2D:CF:DC:B4:5D:9D:EA:E3:C9:08:4E:68",
      ],
    },
  },
];

export const Route = createFileRoute("/.well-known/assetlinks/json")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(ASSETLINKS), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
