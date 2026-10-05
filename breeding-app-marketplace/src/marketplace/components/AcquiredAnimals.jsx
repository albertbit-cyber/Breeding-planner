import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { acquiredAnimals as fetchAcquired } from "../api";
import { money, shortDate } from "../format";
import { provenanceText, zygosityText } from "../genetics";
import Button from "../ui/Button";
import { GeneTag } from "../ui/GeneTags";
import Icon from "../ui/Icon";
import { EmptyState, ErrorPanel, Spinner } from "../ui/States";

/**
 * Animals this account bought here, with the record that came with them.
 *
 * A buyer with the breeder app finds the same animal there after the next
 * sync. A buyer without it needs somewhere to read the record and, above all,
 * the certificate codes, so they can check them at /verify without taking the
 * seller's word for anything.
 */
function AcquiredCard({ animal, t, locale }) {
  const from = animal.acquiredFrom || {};
  const counts = animal.counts || {};
  return (
    <article className="mk-card mk-acquired">
      <header className="mk-acquired__head">
        <span>
          <b className="mk-h3">{animal.name}</b>{" "}
          <span className="mk-xs mk-subtle mk-mono">{animal.appAnimalId}</span>
          <br />
          <span className="mk-xs mk-muted">
            {t("acquired.from", {
              defaultValue: "Acquired from {{seller}} on {{date}}",
              seller: from.sellerName || t("seller.fallback", { defaultValue: "Breeder" }),
              date: shortDate(from.acquiredAt, locale) || "",
            })}
            {from.price !== null && from.price !== undefined ? ` · ${money(from.price, from.currency, locale)}` : ""}
          </span>
        </span>
        {from.sellerUserId ? (
          <Button variant="quiet" size="sm" to={`/s/${from.sellerUserId}`} iconAfter="chevronRight">
            {t("acquired.store", { defaultValue: "Seller's store" })}
          </Button>
        ) : null}
      </header>

      <section aria-label={t("genes.title", { defaultValue: "Genetics, and where each claim comes from" })}>
        {animal.geneticClaims?.length ? (
          <ul className="mk-claims">
            {animal.geneticClaims.map((claim, index) => (
              <li className="mk-claim" key={`${claim.label}-${index}`}>
                <span className="mk-claim__what">
                  <GeneTag
                    label={claim.label}
                    het={claim.zygosity !== "visual"}
                    provenance={claim.provenance}
                    disputed={claim.labDisagrees}
                  />
                </span>
                <span className="mk-claim__how">
                  <b>{zygosityText(claim, t)}</b> · {provenanceText(claim, t)}
                </span>
                {claim.labDisagrees && claim.lab ? (
                  <span className="mk-claim__lab mk-claim__lab--disputed">
                    {t("acquired.labDisagrees", {
                      defaultValue: "The seller recorded this, but the certificate reads “{{result}}”.",
                      result: claim.lab.result,
                    })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mk-muted mk-sm" style={{ margin: 0 }}>
            {t("acquired.noGenetics", { defaultValue: "No genetics were recorded for this animal." })}
          </p>
        )}
      </section>

      {animal.certificates?.length ? (
        <section className="mk-acquired__certs" aria-label={t("acquired.certificates", { defaultValue: "Lab certificates" })}>
          <h3 className="mk-label" style={{ margin: "0 0 8px" }}>
            {t("acquired.certificates", { defaultValue: "Lab certificates" })}
          </h3>
          {animal.certificates.map((certificate) => (
            <div className="mk-acquired__cert" key={certificate.certificateNumber}>
              <span>
                <b className="mk-sm">{certificate.certificateNumber}</b>
                <span className="mk-xs mk-muted">
                  {" "}
                  · {[certificate.labName, shortDate(certificate.issuedAt, locale)].filter(Boolean).join(" · ")}
                </span>
                <br />
                <span className="mk-xs mk-muted">{t("acquired.code", { defaultValue: "Verification code" })}: </span>
                <span className="mk-mono mk-xs">{certificate.verificationCode}</span>
              </span>
              {certificate.verifyUrl ? (
                <a className="mk-sm" href={certificate.verifyUrl} target="_blank" rel="noreferrer">
                  {t("record.checkCertificate", { defaultValue: "Check this certificate" })}
                </a>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <p className="mk-xs mk-muted mk-acquired__facts">
        <Icon name="scale" size={13} />{" "}
        {t("acquired.counts", {
          defaultValue: "{{weights}} weights · {{feeds}} feeds · {{sheds}} sheds · {{meds}} health entries",
          weights: counts.weights || 0,
          feeds: counts.feeds || 0,
          sheds: counts.sheds || 0,
          meds: counts.meds || 0,
        })}
        {animal.lineage?.parents?.length
          ? ` · ${animal.lineage.parents.map((parent) => `${parent.role}: ${parent.label}`).join(", ")}`
          : ""}
      </p>
    </article>
  );
}

export default function AcquiredAnimals({ hideWhenEmpty = false }) {
  const { t, i18n } = useTranslation("marketplace");
  const [state, setState] = useState({ status: "loading", animals: [] });

  const load = () => {
    setState((current) => ({ ...current, status: "loading" }));
    fetchAcquired()
      .then((animals) => setState({ status: "ready", animals }))
      .catch((error) => setState({ status: "error", error, animals: [] }));
  };
  useEffect(load, []);

  if (state.status === "loading") return hideWhenEmpty ? null : <Spinner />;
  if (state.status === "error") return hideWhenEmpty ? null : <ErrorPanel error={state.error} onRetry={load} />;
  if (!state.animals.length) {
    if (hideWhenEmpty) return null;
    return (
      <EmptyState
        icon="tag"
        title={t("acquired.emptyTitle", { defaultValue: "No animals bought here yet" })}
        body={t("acquired.emptyBody", {
          defaultValue: "When a seller marks an animal sold to you, it arrives here with its record and certificates.",
        })}
        action={
          <Button variant="outline" to="/">
            {t("gate.backToBrowse", { defaultValue: "Back to browsing" })}
          </Button>
        }
      />
    );
  }

  return (
    <section className="mk-col" style={{ gap: 12 }} aria-labelledby="mk-acquired-title">
      <h2 id="mk-acquired-title" className="mk-h3" style={{ margin: 0 }}>
        {t("acquired.title", { defaultValue: "Animals you bought here" })}
      </h2>
      <p className="mk-hint" style={{ margin: 0 }}>
        {t("acquired.breederAppNote", {
          defaultValue: "With a breeder account, the same animals appear in your collection in the Serpentora app after it syncs.",
        })}
      </p>
      {state.animals.map((animal) => (
        <AcquiredCard key={animal.id} animal={animal} t={t} locale={i18n.language} />
      ))}
    </section>
  );
}
