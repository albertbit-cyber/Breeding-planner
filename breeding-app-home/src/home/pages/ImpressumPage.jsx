import React from 'react';
import LegalLayout from '../components/LegalLayout.jsx';

const Fill = ({ children }) => <span className="legal-fill">{children}</span>;

/**
 * Impressum / legal notice, required by section 5 DDG (the successor to section 5 TMG)
 * for any commercial website operated from Germany.
 *
 * This is a separate obligation from the Privacy Policy and is not satisfied by it. It
 * must be reachable from every page in no more than two clicks, and labelled in a way a
 * German visitor recognises — which is why the footer link says "Impressum" rather than a
 * translation.
 *
 * Germany enforces this through competitor Abmahnungen (formal cease-and-desist letters
 * carrying the other side's legal costs) rather than regulators, so an incomplete notice
 * has a direct financial cost. The remaining Fill placeholders are the operator's identity
 * details, which cannot be written until the entity question is settled.
 */
export default function ImpressumPage() {
  return (
    <LegalLayout title="Impressum" updated="5 August 2026">
      <h2>Angaben gemäß § 5 DDG / Information pursuant to § 5 DDG</h2>
      <p>
        <Fill>[Name — of the company, or of the individual operating the service]</Fill>
        <br />
        <Fill>[Legal form, if a company — e.g. UG (haftungsbeschränkt), GmbH]</Fill>
        <br />
        <Fill>[Street and number]</Fill>
        <br />
        <Fill>[Postcode and town]</Fill>
        <br />
        Deutschland
      </p>

      <h2>Vertreten durch / Represented by</h2>
      <p>
        <Fill>[Name of the managing director, or of the sole trader]</Fill>
      </p>

      <h2>Kontakt / Contact</h2>
      <p>
        E-Mail: <a href="mailto:info@serpentora.com">info@serpentora.com</a>
        <br />
        Telefon: <Fill>[telephone number, or delete this line if using a contact form instead]</Fill>
      </p>

      <h2>Registereintrag / Register entry</h2>
      <p>
        <Fill>
          [If registered: registering court and register number, e.g. Amtsgericht München HRB 123456.
          If operating as a sole trader with no register entry, this section is deleted.]
        </Fill>
      </p>

      <h2>Umsatzsteuer-ID / VAT identification number</h2>
      <p>
        Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:
        <br />
        <Fill>[VAT ID, or delete this section if you do not have one]</Fill>
      </p>

      <h2>Verbraucherstreitbeilegung / Consumer dispute resolution</h2>
      <p>
        Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>
      <p>
        We are neither obliged nor willing to participate in dispute resolution proceedings before a
        consumer arbitration board.
      </p>

      <h2>Haftung für Inhalte / Liability for content</h2>
      <p>
        Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen
        Gesetzen verantwortlich. Wir sind jedoch nicht verpflichtet, übermittelte oder gespeicherte
        fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine
        rechtswidrige Tätigkeit hinweisen.
      </p>
      <p>
        Nutzergenerierte Inhalte — insbesondere Marktplatz-Anzeigen, Nachrichten und Bewertungen —
        geben nicht unsere Auffassung wieder. Bei Kenntnis von Rechtsverletzungen entfernen wir
        entsprechende Inhalte umgehend.
      </p>

      <h2>Haftung für Links / Liability for links</h2>
      <p>
        Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen
        Einfluss haben. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter
        verantwortlich.
      </p>

      <h2>Datenschutz / Data protection</h2>
      <p>
        Wie wir personenbezogene Daten verarbeiten, steht in unserer{' '}
        <a href="/privacy">Datenschutzerklärung</a>. Die Nutzungsbedingungen finden Sie unter{' '}
        <a href="/terms">Terms of Service</a>.
      </p>
    </LegalLayout>
  );
}
