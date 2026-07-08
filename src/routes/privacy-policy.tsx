import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Biomed Family" },
      {
        name: "description",
        content:
          "Privacy Policy for the Biomed Family mobile app and My Prize Point website. Learn how we collect, use, store, and protect your information.",
      },
      { property: "og:title", content: "Privacy Policy — Biomed Family" },
      {
        property: "og:description",
        content:
          "How Biomed Family and My Prize Point handle your account, points, rewards, and personal information.",
      },
      { property: "og:url", content: "https://myprizepoint.com/privacy-policy" },
      { property: "og:type", content: "article" },
      { name: "twitter:title", content: "Privacy Policy — Biomed Family" },
      {
        name: "twitter:description",
        content:
          "How Biomed Family and My Prize Point handle your account, points, rewards, and personal information.",
      },
    ],
    links: [{ rel: "canonical", href: "https://myprizepoint.com/privacy-policy" }],
  }),
  component: PrivacyPolicyPage,
});

const LAST_UPDATED = "July 8, 2026";

function PrivacyPolicyPage() {
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
          <h1 className="text-4xl font-bold tracking-tight text-gradient">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

          <div className="prose-content mt-8 space-y-8 text-[15px] leading-relaxed text-foreground/90">
            <section>
              <p>
                This Privacy Policy explains how <strong>Biomed Family</strong> (“we,” “us,” or
                “our”) collects, uses, stores, and protects your information when you use the
                Biomed Family mobile application and the My Prize Point website at{" "}
                <a href="https://myprizepoint.com" className="text-primary hover:underline">
                  myprizepoint.com
                </a>{" "}
                (together, the “Service”). By creating an account or using the Service, you agree
                to the practices described in this policy.
              </p>
            </section>

            <Section title="1. Account Registration">
              <p>
                To use the Service you must create an account. During registration we collect the
                information you provide so we can identify you, associate your activity with your
                pharmacy team, and credit points to the correct account. You are responsible for
                keeping your login credentials confidential and for all activity that happens under
                your account.
              </p>
            </Section>

            <Section title="2. Information We Collect">
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong>Name</strong> — used to personalize your experience and to identify you
                  when prizes are fulfilled.
                </li>
                <li>
                  <strong>Email address</strong> — used to sign you in, send transactional messages
                  (such as points earned notifications, password resets, and reward updates), and
                  contact you about your account.
                </li>
                <li>
                  <strong>Pharmacy affiliation</strong> — the pharmacy team you belong to, so
                  points earned from qualifying purchases can be split among team members.
                </li>
                <li>
                  <strong>Points balance, history, and redemption activity</strong> — the record of
                  points you have earned and prizes you have claimed.
                </li>
                <li>
                  <strong>Purchase activity linked to your pharmacy</strong> — provided through our
                  accounting integration (Zoho Books) so we can calculate earned points.
                </li>
                <li>
                  <strong>Technical data</strong> — basic information such as device type, browser
                  type, and app version to keep the Service secure and reliable.
                </li>
              </ul>
            </Section>

            <Section title="3. Google Sign-In">
              <p>
                If you choose to sign in with Google, we receive your name, email address, and a
                unique Google account identifier from Google to create or match your Biomed Family
                account. We do <strong>not</strong> receive your Google password, and we do not
                access your Google contacts, Drive files, or any other Google data. You can revoke
                Google’s access at any time from your Google Account settings.
              </p>
            </Section>

            <Section title="4. How We Use Your Information">
              <ul className="list-disc space-y-2 pl-6">
                <li>To create, secure, and operate your account.</li>
                <li>
                  To calculate, credit, and display loyalty points based on qualifying pharmacy
                  purchase activity.
                </li>
                <li>To fulfill prize redemptions and communicate about their delivery status.</li>
                <li>
                  To send service-related emails (points earned, password recovery, account
                  changes).
                </li>
                <li>To detect, prevent, and address fraud, abuse, or security issues.</li>
                <li>To improve the Service and troubleshoot problems.</li>
              </ul>
              <p className="mt-3">
                We do <strong>not</strong> sell your personal information, and we do not use it for
                advertising.
              </p>
            </Section>

            <Section title="5. Points, Rewards, and Purchase Activity">
              <p>
                Loyalty points are earned based on qualifying purchases made by your pharmacy and
                are distributed among registered pharmacy team members. Points balances, earning
                history, and redemption history are stored with your account so you can review them
                at any time. Points have no cash value and can only be redeemed for prizes offered
                inside the Service.
              </p>
            </Section>

            <Section title="6. Data Storage and Security">
              <p>
                Your data is stored on secure, industry-standard cloud infrastructure. Traffic
                between your device and the Service is encrypted in transit using HTTPS/TLS.
                Passwords are never stored in plain text. Access to production data is limited to
                authorized personnel who need it to operate and support the Service.
              </p>
              <p className="mt-3">
                No system is 100% secure. While we take reasonable measures to protect your
                information, we cannot guarantee absolute security. If you believe your account has
                been compromised, please contact us immediately.
              </p>
            </Section>

            <Section title="7. Third-Party Services">
              <p>We rely on trusted third-party providers to run the Service:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong>Google</strong> — optional Google Sign-In for authentication.
                </li>
                <li>
                  <strong>Zoho Books</strong> — accounting integration used to identify qualifying
                  pharmacy purchases and calculate points.
                </li>
                <li>
                  <strong>Cloud hosting and database providers</strong> — used to host the
                  application, database, and email delivery.
                </li>
              </ul>
              <p className="mt-3">
                These providers process your information only as needed to deliver the Service and
                are bound by their own privacy and security commitments.
              </p>
            </Section>

            <Section title="8. Your Rights">
              <p>
                You may request to access, correct, or export the personal information associated
                with your account. Depending on where you live, you may also have the right to
                object to certain processing or request restriction of processing. To exercise any
                of these rights, contact us using the details in the Contact section below.
              </p>
            </Section>

            <Section title="9. Account Deletion">
              <p>
                You can request deletion of your account at any time by emailing us at the address
                listed in the Contact section. Once verified, we will delete your profile
                information and personal identifiers. Some records (such as anonymized transaction
                history required for accounting or fraud-prevention purposes) may be retained for a
                limited period as required by law. Deleted accounts cannot be recovered and any
                unredeemed points will be forfeited.
              </p>
            </Section>

            <Section title="10. Children’s Privacy">
              <p>
                The Service is intended for pharmacy professionals and is not directed to children
                under 13 (or the equivalent minimum age in your jurisdiction). We do not knowingly
                collect personal information from children. If you believe a child has provided us
                with personal information, please contact us and we will delete it.
              </p>
            </Section>

            <Section title="11. Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. When we make material changes,
                we will update the “Last updated” date above and, when appropriate, notify you
                inside the app or by email. Your continued use of the Service after a change means
                you accept the updated policy.
              </p>
            </Section>

            <Section title="12. Contact Us">
              <p>
                If you have questions about this Privacy Policy or want to exercise any of your
                rights, please contact us:
              </p>
              <ul className="list-none space-y-1 pl-0">
                <li>
                  <strong>Biomed Family</strong>
                </li>
                <li>
                  Email:{" "}
                  <a href="mailto:privacy@myprizepoint.com" className="text-primary hover:underline">
                    privacy@myprizepoint.com
                  </a>
                </li>
                <li>
                  Website:{" "}
                  <a href="https://myprizepoint.com" className="text-primary hover:underline">
                    myprizepoint.com
                  </a>
                </li>
              </ul>
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
