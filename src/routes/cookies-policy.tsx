import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/cookies-policy")({
  head: () => ({
    meta: [
      { title: "Cookies Policy — Biomed Family" },
      {
        name: "description",
        content:
          "Cookies Policy for the Biomed Family mobile app and My Prize Point website. Learn what cookies we use, why we use them, and how you can control them.",
      },
      { property: "og:title", content: "Cookies Policy — Biomed Family" },
      {
        property: "og:description",
        content:
          "How Biomed Family and My Prize Point use cookies and similar technologies to keep you signed in and to understand how the Service is used.",
      },
      { property: "og:url", content: "https://myprizepoint.com/cookies-policy" },
      { property: "og:type", content: "article" },
      { name: "twitter:title", content: "Cookies Policy — Biomed Family" },
      {
        name: "twitter:description",
        content:
          "How Biomed Family and My Prize Point use cookies and similar technologies to keep you signed in and to understand how the Service is used.",
      },
    ],
    links: [{ rel: "canonical", href: "https://myprizepoint.com/cookies-policy" }],
  }),
  component: CookiesPolicyPage,
});

const LAST_UPDATED = "November 2, 2026";

function CookiesPolicyPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ambient background matching auth pages */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-gradient-primary opacity-20 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-[32rem] w-[32rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,hsl(var(--background))_85%)]" />
      </div>

      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-primary shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Biomed Family</span>
        </Link>
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background/60 px-3 py-1.5 text-sm font-medium backdrop-blur transition hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-3xl border border-border bg-card/60 p-8 shadow-elegant backdrop-blur md:p-12">
          <h1 className="text-4xl font-bold tracking-tight text-gradient">Cookies Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

          <div className="prose-content mt-8 space-y-8 text-[15px] leading-relaxed text-foreground/90">
            <section>
              <p>
                This Cookies Policy explains how <strong>Biomed Family</strong> (“we,” “us,” or
                “our”) uses cookies and similar technologies when you use the Biomed Family mobile
                application and the My Prize Point website at{" "}
                <a href="https://myprizepoint.com" className="text-primary hover:underline">
                  myprizepoint.com
                </a>{" "}
                (together, the “Service”). It works together with our{" "}
                <Link to="/privacy-policy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </section>

            <Section title="1. What Cookies and Similar Technologies Are">
              <p>
                Cookies are small text files placed on your device when you visit a website. They
                help a site remember your actions and preferences over time. Similar technologies —
                such as local storage, session storage, and similar browser identifiers — serve the
                same purpose and are covered by this policy.
              </p>
            </Section>

            <Section title="2. How We Use Cookies">
              <p>
                We use cookies and similar technologies to keep you signed in, to keep your account
                secure, and to understand how the Service is used so we can make it better and
                faster. We do <strong>not</strong> use cookies for advertising, and we do not sell
                information collected through cookies.
              </p>
            </Section>

            <Section title="3. Types of Cookies We Use">
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong>Strictly necessary</strong> — required for the Service to work. These
                  keep you signed in, remember which pharmacy team you belong to, protect your
                  account against fraud, and remember your display preferences (such as light or
                  dark mode). Without them, you would be signed out after every page.
                </li>
                <li>
                  <strong>Analytics and performance</strong> — help us understand which pages and
                  features are used, how long pages take to load, and where the Service breaks or
                  slows down. This information is used only to operate and improve the Service.
                </li>
                <li>
                  <strong>Sign-in assistance</strong> — used when you sign in with Google or Apple
                  to complete the sign-in safely. These are set by the sign-in provider during the
                  process.
                </li>
              </ul>
              <p className="mt-3">
                We do <strong>not</strong> use advertising, marketing, or cross-site tracking
                cookies.
              </p>
            </Section>

            <Section title="4. Third-Party Services">
              <p>
                Some cookies are set by trusted providers we rely on to run the Service:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong>PostHog</strong> — product analytics used to measure usage, page speed,
                  and errors. PostHog’s cookies help us count visits and understand how the Service
                  is used. You can opt out of PostHog tracking at any time at{" "}
                  <a
                    href="https://us.i.posthog.com/opt-out"
                    className="text-primary hover:underline"
                  >
                    us.i.posthog.com/opt-out
                  </a>
                  .
                </li>
                <li>
                  <strong>Google and Apple</strong> — used only when you choose to sign in with
                  them. Their cookies are used to verify your identity during sign-in.
                </li>
                <li>
                  <strong>Cloud hosting and database providers</strong> — used to host the
                  application, database, and email delivery.
                </li>
              </ul>
              <p className="mt-3">
                These providers process information only as needed to deliver the Service and are
                bound by their own privacy and security commitments.
              </p>
            </Section>

            <Section title="5. How Long Cookies Last">
              <p>
                Some cookies last only while your browser session is open and are deleted when you
                close your browser. Others remain on your device for longer so you stay signed in
                between visits. Sign-in credentials are kept on your device until you sign out or
                your session expires.
              </p>
            </Section>

            <Section title="6. Managing Cookies">
              <p>
                Most browsers let you refuse or delete cookies through their settings. You can
                usually find these options under “Privacy” or “Security” in your browser menu.
                Blocking cookies does not prevent you from creating an account, but it can stop
                parts of the Service from working — for example, you may be signed out frequently
                or be unable to redeem prizes.
              </p>
              <p className="mt-3">
                You can also clear cookies for our site at any time from your browser settings, and
                opt out of PostHog analytics using the link above.
              </p>
            </Section>

            <Section title="7. Do Not Track">
              <p>
                Some browsers offer a “Do Not Track” setting. Because there is no common standard
                for how websites should respond to these signals, the Service does not change its
                behavior when it receives one. The controls described in this policy are the way to
                manage tracking on the Service.
              </p>
            </Section>

            <Section title="8. Changes to This Policy">
              <p>
                We may update this Cookies Policy from time to time. When we make material changes,
                we will update the “Last updated” date above and, when appropriate, notify you
                inside the app or by email. Your continued use of the Service after a change means
                you accept the updated policy.
              </p>
            </Section>

            <Section title="9. Contact Us">
              <p>
                If you have questions about this Cookies Policy, please contact us:
              </p>
              <ul className="list-none space-y-1 pl-0">
                <li>
                  <strong>Biomed Family</strong>
                </li>
                <li>
                  Email:{"\u00a0"}
                  <a
                    href="mailto:jamesgonzalez174@gmail.com"
                    className="text-primary hover:underline"
                  >
                    jamesgonzalez174@gmail.com
                  </a>
                </li>
                <li>
                  Website:{" "}
                  <a href="https://myprizepoint.com" className="text-primary hover:underline">
                    myprizepoint.com
                  </a>
                </li>
              </ul>
              <p className="mt-3">
                For support questions, visit our{" "}
                <Link to="/support" className="text-primary hover:underline">
                  Support page
                </Link>
                .
              </p>
            </Section>
          </div>
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Biomed Family</span>
          <span aria-hidden>·</span>
          <Link to="/login" className="hover:text-foreground hover:underline">Sign in</Link>
          <span aria-hidden>·</span>
          <Link to="/support" className="hover:text-foreground hover:underline">Support</Link>
          <span aria-hidden>·</span>
          <Link to="/privacy-policy" className="hover:text-foreground hover:underline">Privacy Policy</Link>
          <span aria-hidden>·</span>
          <Link to="/cookies-policy" className="hover:text-foreground hover:underline">Cookies Policy</Link>
        </footer>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-foreground/85">{children}</div>
    </section>
  );
}
