import { downloadTicketsPdf } from "./tickets-pdf-check";
await downloadTicketsPdf([
  { id: "abc123def456", full_name: "James Gonzalez", email: "j@x.com", tickets: 17, pharmacy_name: "Farmacia Central" },
  { id: "def456abc123", full_name: "Maria Lopez", email: "m@x.com", tickets: 5, pharmacy_name: "Farmacia Norte" },
], { raffleDate: "December 18", filename: "/tmp/browser/tickets-check.pdf" });
console.log("done");
