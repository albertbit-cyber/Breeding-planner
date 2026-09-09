import React from "react";
import { useTranslation } from "react-i18next";
import Button from "../ui/Button";
import { EmptyState } from "../ui/States";

export default function NotFoundPage() {
  const { t } = useTranslation("marketplace");
  return (
    <div className="mk-wrap">
      <EmptyState
        icon="search"
        title={t("notFound.title", { defaultValue: "That page isn't here" })}
        body={t("notFound.body", {
          defaultValue: "The listing may have been sold and archived, or the link may be out of date.",
        })}
        action={
          <Button variant="ink" to="/">
            {t("gate.backToBrowse", { defaultValue: "Back to browsing" })}
          </Button>
        }
      />
    </div>
  );
}
