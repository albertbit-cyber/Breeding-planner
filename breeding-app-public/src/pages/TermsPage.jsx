import React from 'react';
import LegalLayout from '../components/LegalLayout.jsx';

const Fill = ({ children }) => <span className="legal-fill">{children}</span>;

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      updated="2 August 2026"
      summary="In short: your records belong to you, genetics predictions are probabilities rather than guarantees, lab results come from independent laboratories, and you are responsible for the animals in your care and for how you describe them to buyers."
    >
      <h2>1. Who these terms are with</h2>
      <p>
        These terms are an agreement between you and <Fill>[Legal entity name]</Fill>{' '}
        (&ldquo;Serpentora&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), and they govern your use of
        the Serpentora applications and services. By creating an account you accept them. If you do
        not accept them, do not use the service.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>
          You must be at least <Fill>[minimum age]</Fill> and able to enter a binding contract.
        </li>
        <li>The details you register with must be accurate, and you must keep them up to date.</li>
        <li>
          You are responsible for what happens under your account and for keeping your password
          secure. Tell us promptly if you think someone else has access to it.
        </li>
        <li>
          Accounts are for you or your organisation. Do not share one login among people who should
          each have their own.
        </li>
      </ul>

      <h2>3. Your content stays yours</h2>
      <p>
        You keep all rights to the records you create — your animals, pairings, clutches, notes,
        photographs, and lab results. We claim no ownership of them.
      </p>
      <p>
        You grant us only the permission we need to run the service: to store your content, process
        it, display it back to you and to people you have shared it with, and back it up. That
        permission ends when you delete the content or close your account, apart from backups that
        age out on their normal cycle.
      </p>
      <p>
        You are responsible for having the right to upload what you upload — photographs in
        particular.
      </p>

      <h2>4. Genetics predictions are probabilities, not guarantees</h2>
      <p>
        This matters more in this product than most, so we want to be unambiguous about it.
      </p>
      <p>
        Serpentora&rsquo;s genetics calculator, breeding advisor, and related tools produce{' '}
        <strong>statistical predictions</strong> based on the information you enter and on published
        models of morph inheritance. They describe what is likely across a clutch. They do not
        determine what any individual animal actually is.
      </p>
      <ul>
        <li>
          A predicted heterozygous (&ldquo;het&rdquo;) status is a probability, not a proven fact.
          Only appropriate genetic testing can establish it.
        </li>
        <li>
          Predictions are only as good as the lineage data entered. Incorrect or incomplete parentage
          produces confident-looking output that is wrong.
        </li>
        <li>
          Inheritance models can be incomplete or contested, particularly for newer or less-studied
          morphs.
        </li>
      </ul>
      <p>
        <strong>
          You must not present a Serpentora prediction to a buyer as proof of an animal&rsquo;s
          genetics.
        </strong>{' '}
        You are solely responsible for how you describe, advertise, price, and sell your animals, and
        for any claim you make about them. We are not liable for breeding outcomes, valuations, or
        disputes with buyers arising from reliance on a prediction.
      </p>

      <h2>5. Laboratory testing</h2>
      <p>
        Genetic testing is carried out by independent laboratories, not by us. When you place an
        order, we pass it and the relevant sample details to the laboratory you chose.
      </p>
      <ul>
        <li>
          The laboratory is responsible for the testing it performs and for the accuracy of the
          results it returns.
        </li>
        <li>
          We provide the ordering and record-keeping layer. We do not verify, endorse, or
          independently confirm results.
        </li>
        <li>
          Turnaround times, pricing, and testing scope are set by the laboratory and can change.
        </li>
      </ul>
      <p>
        Access to the Lab Portal is granted by invitation only, at our discretion, and may be
        suspended or withdrawn.
      </p>

      <h2>6. Animal welfare and lawful use</h2>
      <p>
        Serpentora is a record-keeping and planning tool. It is not veterinary advice, and it does not
        replace the judgement of a qualified veterinarian.
      </p>
      <p>
        You are responsible for the welfare of the animals in your care and for complying with every
        law that applies to you — including permits, licensing, protected-species rules, CITES, import
        and export controls, and any restrictions on keeping, breeding, or selling particular species
        in your jurisdiction. You must not use Serpentora to record or facilitate activity that is
        unlawful where you are.
      </p>

      <h2>7. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>break the law, or infringe anyone&rsquo;s rights, through your use of the service;</li>
        <li>
          attempt to access another user&rsquo;s account, organisation, or records, or to probe or
          circumvent our security;
        </li>
        <li>
          scrape, bulk-extract, or resell data from the service, or use it to build a competing
          product;
        </li>
        <li>upload malware, or deliberately disrupt or overload the service;</li>
        <li>
          misrepresent an animal&rsquo;s genetics, provenance, or health to another user or buyer;
        </li>
        <li>harass or abuse other users.</li>
      </ul>
      <p>We may suspend or close accounts that breach this section.</p>

      <h2>8. Plans, billing, and trials</h2>
      <p>
        Serpentora offers a free tier and paid subscription plans. Where a plan is paid:
      </p>
      <ul>
        <li>Fees and inclusions are those shown on our pricing page when you subscribe.</li>
        <li>
          Subscriptions renew automatically for the same period until cancelled. You can cancel at any
          time, effective at the end of the period you have already paid for.
        </li>
        <li>
          Except where the law gives you a refund right, payments already made are not refundable. If
          you are a consumer in the EU or UK, your statutory withdrawal rights are unaffected.
        </li>
        <li>
          We may change prices, but not during a period you have already paid for. We will give you at
          least <Fill>[notice period, e.g. 30 days]</Fill> notice before a change takes effect.
        </li>
        <li>
          If a payment fails, we may suspend access to paid features. Your data is not deleted for
          non-payment without notice and a reasonable chance to put it right.
        </li>
      </ul>
      <p>
        Lab Portal access for invited testing laboratories is provided free of charge and carries no
        subscription.
      </p>

      <h2>9. Availability</h2>
      <p>
        We work to keep Serpentora available and reliable, but we do not promise uninterrupted
        service. We may need to take it down for maintenance, and we may change or discontinue
        features. If we discontinue something you depend on, or shut the service down entirely, we
        will give you reasonable notice and a way to export your data first.
      </p>

      <h2>10. Your data, export, and deletion</h2>
      <p>
        You can export your records and close your account. On closure we delete your data as
        described in our <a href="/privacy">Privacy Policy</a>. Export your records before closing —
        deletion cannot be reversed.
      </p>

      <h2>11. Third-party services</h2>
      <p>
        Optional integrations — such as connecting a Google Calendar, or publishing a listing to an
        external marketplace — are governed by those services&rsquo; own terms. We are not responsible
        for them, and connecting them is your choice.
      </p>

      <h2>12. Warranties and liability</h2>
      <p>
        The service is provided &ldquo;as is&rdquo;. To the extent the law allows, we exclude implied
        warranties of merchantability, fitness for a particular purpose, and non-infringement.
      </p>
      <p>To the extent the law allows, we are not liable for:</p>
      <ul>
        <li>lost profits, lost sales, lost animals, or lost breeding seasons;</li>
        <li>breeding outcomes that differ from a prediction;</li>
        <li>the accuracy of results produced by a testing laboratory;</li>
        <li>indirect or consequential loss of any kind.</li>
      </ul>
      <p>
        Where liability cannot lawfully be excluded, our total liability for any claim is limited to
        the greater of the amount you paid us in the twelve months before the claim, or{' '}
        <Fill>[minimum liability floor, e.g. EUR 100]</Fill>.
      </p>
      <p>
        Nothing here limits liability for death or personal injury caused by negligence, for fraud, or
        for anything else that cannot lawfully be limited. If you are a consumer, your statutory
        rights are unaffected.
      </p>

      <h2>13. Suspension and termination</h2>
      <p>
        You may stop using Serpentora and close your account at any time. We may suspend or terminate
        your access if you materially breach these terms, if we are required to by law, or if your use
        poses a security risk to the service or to other users. Where circumstances allow, we will
        warn you first and give you a chance to fix the problem.
      </p>

      <h2>14. Changes to these terms</h2>
      <p>
        We may update these terms. If a change materially affects your rights, we will give you notice
        by email or in the app before it takes effect. Continuing to use the service after that means
        you accept the updated terms. If you do not accept them, you may close your account.
      </p>

      <h2>15. Governing law</h2>
      <p>
        These terms are governed by the law of <Fill>[governing jurisdiction]</Fill>, and the courts
        of <Fill>[jurisdiction]</Fill> have non-exclusive jurisdiction. If you are a consumer, you keep
        the protection of the mandatory law of the country you live in, and may bring proceedings
        there.
      </p>

      <h2>16. Contact</h2>
      <p>
        Questions about these terms: <Fill>[contact email]</Fill>.
      </p>
    </LegalLayout>
  );
}
