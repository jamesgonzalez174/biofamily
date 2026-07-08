import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ArrowLeft, HelpCircle, Mail, Phone } from "lucide-react";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Biomed Family" },
      {
        name: "description",
        content:
          "Get help with your Biomed Family account, points, rewards, and the My Prize Point website. Contact support, browse FAQs, and troubleshoot common issues.",
      },
      { property: "og:title", content: "Support — Biomed Family" },
      {
        property: "og:description",
        content:
          "Support center for the Biomed Family mobile app and My Prize Point website. Find answers and contact options for account and reward questions.",
      },
      { property: "og:url", content: "https://myprizepoint.com/support" },
      { property: "og:type", content: "article" },
      { name: "twitter:title", content: "Support — Biomed Family" },
      {
        name: "twitter:description",
        content:
          "Support center for the Biomed Family mobile app and My Prize Point website.",
      },
    ],
    links: [{ rel: "canonical", href: "https://myprizepoint.com/support" }],
  }),
  component: SupportPage,
});

const LAST_UPDATED = "July 8, 2026";

function SupportPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ambient background matching auth / privacy pages */}
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
          <h1 className="text-4xl font-bold tracking-tight text-gradient">Support Center</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

          <div className="prose-content mt-8 space-y-8 text-[15px] leading-relaxed text-foreground/90">
            <section>
              <p>
                Welcome to the Biomed Family support center. We’re here to help you get the most
                out of the Biomed Family mobile app and the My Prize Point website at{" "}
                <a href="https://myprizepoint.com" className="text-primary hover:underline">
                  myprizepepoint.com
                </a>
                . If you can’t find what you need below, please reach out and we’ll get back to
                you as soon as possible.
              </p>
            </section>

            <Section title="Contact Us">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-background/60 p-4">
                  <div className="flex items-center gap-2 text-foreground">
                    <Mail className="h-4 w-4 text-primary" />
                    <strong>Email</strong>
                  </div>
                  <p className="mt-1">
                    <a
                      href="mailto:support@myprizepoint.com"
                      className="text-primary hover:underline"
                    >
                      support@myprizepoint.com
                    </a>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Best for account, points, and general questions.
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-background/60 p-4">
                  <div className="flex items-center gap-2 text-foreground">
                    <Phone className="h-4 w-4 text-primary" />
                    <strong>Phone</strong>
                  </div>
                  <p className="mt-1">
                    <a href="tel:+14085551234" className="text-primary hover:underline">
                      (408) 555-1234
                    </a>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Monday–Friday, 9 AM – 5 PM Pacific Time.
                  </p>
                </div>
              </div>
            </Section>

            <Section title="Response Times">
              <p>
                We aim to respond to all support emails within one business day. During busy
                periods or holidays it may take up to two business days. Phone support is
                available during the hours listed above. If you leave a voicemail, please include
                your name, pharmacy name, and the email address associated with your account so we
                can follow up quickly.
              </p>
            </Section>

            <Section title="Frequently Asked Questions">
              <div className="space-y-6">
                <FAQ
                  question="How do I create an account?"
                  answer="Download the Biomed Family mobile app or visit myprizepoint.com and choose Sign Up. You can register with your email address or sign in with Google. If your pharmacy is already enrolled, make sure to join the correct pharmacy team so your points are credited properly."
                />
                <FAQ
                  question="Why didn’t my points update after a purchase?"
                  answer="Points are calculated from qualifying pharmacy purchases synced from our accounting integration. It may take a short time for new transactions to appear. If your points have not updated within 24 hours, check with your pharmacy manager that the purchase was recorded under the correct team, then contact support with the approximate date and amount."
                />
                <FAQ
                  question="How are points shared between pharmacy team members?"
                  answer="When a qualifying purchase is made, the loyalty points are divided equally among all registered members of that pharmacy team. Points are then added to each member’s personal balance. Points have no cash value and can only be redeemed for prizes offered inside the Service."
                />
                <FAQ
                  question="I forgot my password. What should I do?"
                  answer="Go to the sign-in page and tap Forgot Password. Enter the email address on your account and we’ll send you a secure reset link. If you signed up with Google, use the Google Sign-In button instead."
                />
                <FAQ
                  question="How do I redeem my points for a prize?"
                  answer="Open the catalog inside the app or website, browse available prizes, and select the item you want. If you have enough points, follow the prompts to redeem it. Redemption requests are processed by our fulfillment team, and you’ll receive updates by email."
                />
                <FAQ
                  question="How do I delete my account?"
                  answer="Email us at support@myprizepoint.com from the address associated with your account and request deletion. Once we verify your identity, we will delete your profile information and personal identifiers. Any unredeemed points will be forfeited and deleted accounts cannot be recovered."
                />
              </div>
            </Section>

            <Section title="Account Access Help">
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  Make sure you are using the same email address or Google account you signed up
                  with.
                </li>
                <li>Check your spam or junk folder for password-reset or verification emails.</li>
                <li>
                  If you see a message that your pharmacy team is not found, ask your pharmacy
                  manager to confirm the team name or invite you again.
                </li>
                <li>
                  For repeated sign-in problems, try clearing your browser cache or reinstalling
                  the mobile app.
                </li>
              </ul>
            </Section>

            <Section title="Points & Rewards Issues">
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  Points are credited from the <strong>Loyalty Points</strong> balance, not the
                  history total, and are divided equally among registered pharmacy members.
                </li>
                <li>
                  If your balance looks wrong, compare the date of the missing transaction with
                  the pharmacy’s recent qualifying purchases.
                </li>
                <li>
                  Redemption requests cannot be reversed once processed. Make sure you want the
                  prize before confirming.
                </li>
                <li>
                  Contact support with your pharmacy name, account email, and the transaction date
                  if you believe a credit is missing.
                </li>
              </ul>
            </Section>

            <Section title="Report a Problem">
              <p>
                When reporting a bug or technical issue, please include as much detail as possible:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>The email address associated with your account.</li>
                <li>Whether you are using the mobile app or the website.</li>
                <li>Your device or browser type and version.</li>
                <li>A clear description of what happened and what you expected.</li>
                <li>Screenshots, if possible and safe to share.</li>
              </ul>
            </Section>

            <Section title="Privacy & Security">
              <p>
                For questions about how we handle your personal information, review our{" "}
                <Link to="/privacy-policy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                . If you believe your account has been compromised or you notice suspicious
                activity, contact us immediately at{" "}
                <a href="mailto:support@myprizepoint.com" className="text-primary hover:underline">
                  support@myprizepoint.com
                </a>
                .
              </p>
            </Section>

            <Section title="Status & Maintenance">
              <p>
                We occasionally perform maintenance to keep the Service secure and reliable. When
                planned maintenance is scheduled, we will notify users in advance when possible.
                If the app or website seems unavailable, check your internet connection and try
                again in a few minutes.
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

function FAQ({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/50 p-4">
      <h3 className="flex items-start gap-2 font-semibold text-foreground">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        {question}
      </h3>
      <p className="mt-2 text-foreground/85">{answer}</p>
    </div>
  );
}
