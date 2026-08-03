import React from 'react';
import LegalLayout from '../components/LegalLayout.jsx';

const Fill = ({ children }) => <span className="legal-fill">{children}</span>;

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="2 August 2026"
      summary="In short: we collect the account details you give us, the breeding records you create, and the technical logs needed to keep the service secure and working. We do not sell your data, and we do not use your breeding records to advertise to you. Your records are yours, and you can export or delete them."
    >
      <h2>1. Who is responsible for your data</h2>
      <p>
        Serpentora (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides breeding-management software for reptile
        keepers and breeders. For the purposes of the EU General Data Protection Regulation (GDPR),
        the data controller is:
      </p>
      <p>
        <Fill>[Legal entity name]</Fill><br />
        <Fill>[Registered address]</Fill><br />
        <Fill>[Company registration number, if applicable]</Fill>
      </p>
      <p>
        For any privacy question, or to exercise the rights described in section 7, contact{' '}
        <Fill>[privacy contact email]</Fill>.
      </p>

      <h2>2. What we collect</h2>

      <h3>Information you give us</h3>
      <ul>
        <li>
          <strong>Account details</strong> — your email address, name, and a password. We never store
          your password itself, only a one-way hash of it.
        </li>
        <li>
          <strong>Profile details (optional)</strong> — breeder or business name, location, country,
          city, language, biography, website, social handles, logo or profile image, and a public
          contact email or phone number. These are optional. Some are shown publicly only if you
          choose to make your profile public.
        </li>
        <li>
          <strong>Your breeding records</strong> — animals, pairings, clutches, incubation and health
          logs, notes, photographs, and related records you create in the app.
        </li>
        <li>
          <strong>Lab testing</strong> — orders you place for genetic testing, the samples they
          relate to, and the results returned by the testing laboratory.
        </li>
        <li>
          <strong>Support and correspondence</strong> — messages you send us.
        </li>
      </ul>

      <h3>Information collected automatically</h3>
      <ul>
        <li>
          <strong>Security and session records</strong> — sign-in events, device and session records,
          a hashed form of your IP address, and browser user-agent. We keep these to detect
          unauthorised access to your account and to let you review and revoke your own sessions.
        </li>
        <li>
          <strong>Email delivery events</strong> — whether an email we sent you was delivered,
          bounced, or was marked as spam, so we can stop sending to addresses that fail.
        </li>
        <li>
          <strong>Error diagnostics</strong> — when something breaks, we record the technical details
          of the error (what failed, where, and on what kind of device) so we can fix it.
        </li>
      </ul>

      <h3>A note on animal records</h3>
      <p>
        The great majority of what you store in Serpentora — animal genetics, morphs, pairings,
        clutch and health records — is information about <strong>animals, not people</strong>. It is
        not personal data about you in its own right, and genetic information about animals is not
        &ldquo;special category&rdquo; data under the GDPR, which concerns human genetic data. We
        nevertheless treat your records as confidential and belonging to you, and we handle them
        under this policy because they are linked to your account.
      </p>

      <h2>3. Why we use it, and our legal basis</h2>
      <div className="legal-scroll">
        <table>
          <thead>
            <tr>
              <th>Purpose</th>
              <th>Legal basis (GDPR Art. 6)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Providing the service — storing your records, running genetics calculations, syncing your devices</td>
              <td>Performance of a contract</td>
            </tr>
            <tr>
              <td>Creating and securing your account, verifying your email address, resetting passwords</td>
              <td>Performance of a contract</td>
            </tr>
            <tr>
              <td>Passing a lab order and the relevant sample details to the testing laboratory you selected</td>
              <td>Performance of a contract</td>
            </tr>
            <tr>
              <td>Fraud prevention, abuse detection, and keeping the service secure</td>
              <td>Legitimate interests</td>
            </tr>
            <tr>
              <td>Diagnosing errors and improving reliability</td>
              <td>Legitimate interests</td>
            </tr>
            <tr>
              <td>Service messages you cannot opt out of (security alerts, billing notices)</td>
              <td>Performance of a contract</td>
            </tr>
            <tr>
              <td>Optional product news or marketing email</td>
              <td>Consent — withdrawable at any time</td>
            </tr>
            <tr>
              <td>Optional Google Calendar integration</td>
              <td>Consent — withdrawable at any time</td>
            </tr>
            <tr>
              <td>Meeting legal, tax, and accounting obligations</td>
              <td>Legal obligation</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        We do <strong>not</strong> sell your personal data, and we do not use your breeding records
        to profile you or target advertising at you.
      </p>

      <h2>4. Who we share it with</h2>
      <p>
        We share data only with service providers who process it on our behalf under contract, and
        only as far as each needs to do its job:
      </p>
      <div className="legal-scroll">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Railway</td>
              <td>Application hosting and the main database</td>
            </tr>
            <tr>
              <td>Netlify</td>
              <td>Hosting and delivery of the web applications</td>
            </tr>
            <tr>
              <td>Resend</td>
              <td>Sending transactional email and reporting delivery outcomes</td>
            </tr>
            <tr>
              <td>Sentry</td>
              <td>Error and crash diagnostics</td>
            </tr>
            <tr>
              <td>Google</td>
              <td>Calendar integration — only if you explicitly connect it</td>
            </tr>
            <tr>
              <td>Payment provider</td>
              <td>
                Processing subscription payments when paid plans launch. Card details are handled by
                the payment provider and never reach our servers.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>Testing laboratories.</strong> When you place a lab order, the details necessary to
        fulfil it are shared with the laboratory you selected. Those laboratories are independent
        organisations and act as their own controllers for the testing work they perform.
      </p>
      <p>
        We may also disclose data where we are legally required to, or to establish or defend legal
        claims. If our business is ever transferred, your data may transfer with it, and we will tell
        you before that happens.
      </p>

      <h2>5. International transfers</h2>
      <p>
        Some of the providers above are based outside the European Economic Area, principally in the
        United States. Where data is transferred outside the EEA, we rely on the European
        Commission&rsquo;s Standard Contractual Clauses or an equivalent lawful transfer mechanism.
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>
          <strong>Your account and records</strong> — for as long as your account is open. If you
          delete your account, we delete or irreversibly anonymise your data within{' '}
          <Fill>[retention period, e.g. 30 days]</Fill>, except where we must keep something longer
          by law.
        </li>
        <li>
          <strong>Security and sign-in records</strong> — kept for a limited period for security
          investigation, then deleted.
        </li>
        <li>
          <strong>Billing and tax records</strong> — kept for the period required by applicable tax
          law, typically several years, even after account closure.
        </li>
        <li>
          <strong>Suppressed email addresses</strong> — kept indefinitely in a minimal form, because
          forgetting that an address bounced or unsubscribed would cause us to email it again.
        </li>
      </ul>

      <h2>7. Your rights</h2>
      <p>If you are in the EEA or the UK, you have the right to:</p>
      <ul>
        <li>ask what personal data we hold about you, and get a copy of it;</li>
        <li>have inaccurate data corrected;</li>
        <li>have your data deleted;</li>
        <li>receive your data in a portable, machine-readable format;</li>
        <li>restrict or object to certain processing, including processing based on legitimate interests;</li>
        <li>withdraw consent at any time, where we rely on consent;</li>
        <li>
          complain to your national data protection authority if you think we have handled your data
          wrongly.
        </li>
      </ul>
      <p>
        To exercise any of these, contact <Fill>[privacy contact email]</Fill>. We respond within one
        month. We may ask you to confirm your identity first, so that nobody else can make a request
        about your data.
      </p>

      <h2>8. Security</h2>
      <p>
        Passwords are hashed and never stored in readable form. Traffic is encrypted in transit.
        Sessions can be reviewed and revoked from your account, and sign-in activity is logged so
        unusual access can be spotted. No system is perfectly secure, but if a breach ever affects
        your data and poses a risk to you, we will notify you and the relevant authority as the law
        requires.
      </p>

      <h2>9. Children</h2>
      <p>
        Serpentora is not intended for children. You must be at least{' '}
        <Fill>[16 / the age of digital consent in your country]</Fill> to create an account. If we
        learn that we hold data about a child below that age, we will delete it.
      </p>

      <h2>10. Cookies and similar technologies</h2>
      <p>
        We use storage on your device for things the service cannot work without: keeping you signed
        in, protecting forms against cross-site request forgery, and remembering your preferences. We
        do not use advertising or cross-site tracking cookies.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        If we make a material change, we will tell you by email or in the app before it takes effect.
        The &ldquo;last updated&rdquo; date at the top always reflects the current version.
      </p>
    </LegalLayout>
  );
}
